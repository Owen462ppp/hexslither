const {
  Connection, PublicKey, Keypair,
  Transaction, SystemProgram, LAMPORTS_PER_SOL,
} = require('@solana/web3.js');

const NETWORK = process.env.SOLANA_NETWORK || 'mainnet-beta';
const RPC_URL = process.env.RPC_URL || (
  NETWORK === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com'
);

const connection = new Connection(RPC_URL, 'confirmed');

function getEscrowKeypair() {
  const b64 = process.env.ESCROW_PRIVATE_KEY;
  if (!b64) throw new Error('ESCROW_PRIVATE_KEY not set');
  return Keypair.fromSecretKey(Buffer.from(b64, 'base64'));
}

function getEscrowPublicKey() {
  return process.env.ESCROW_PUBLIC_KEY || getEscrowKeypair().publicKey.toString();
}

// Track credited signatures to prevent double-crediting
const usedSignatures = new Set();

// Retry wrapper for rate-limited RPC calls
async function withRetry(fn, retries = 4, delay = 1500) {
  try {
    return await fn();
  } catch (e) {
    const is429 = e.message && (e.message.includes('429') || e.message.includes('Too many'));
    if (retries > 0 && is429) {
      await new Promise(r => setTimeout(r, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw e;
  }
}

// Find the most recent unclaimed deposit to the escrow
// Returns { amount, fromAddress } or null if none found
async function findLatestDeposit() {
  const escrowPubkey = getEscrowPublicKey();
  const escrow = new PublicKey(escrowPubkey);

  const sigs = await withRetry(() =>
    connection.getSignaturesForAddress(escrow, { limit: 10 })
  );

  for (const sigInfo of sigs) {
    if (usedSignatures.has(sigInfo.signature)) continue;
    if (sigInfo.err) { usedSignatures.add(sigInfo.signature); continue; }

    const tx = await withRetry(() =>
      connection.getTransaction(sigInfo.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      })
    );
    if (!tx || tx.meta.err) { usedSignatures.add(sigInfo.signature); continue; }

    const accountKeys = tx.transaction.message.staticAccountKeys ||
      tx.transaction.message.accountKeys;
    const escrowIndex = accountKeys.findIndex(k => k.toString() === escrowPubkey);
    if (escrowIndex === -1) { usedSignatures.add(sigInfo.signature); continue; }

    const lamports = tx.meta.postBalances[escrowIndex] - tx.meta.preBalances[escrowIndex];
    if (lamports <= 0) { usedSignatures.add(sigInfo.signature); continue; }

    usedSignatures.add(sigInfo.signature);
    const fromAddress = accountKeys[0].toString(); // sender is fee payer (index 0)
    return { amount: lamports / LAMPORTS_PER_SOL, fromAddress };
  }

  return null; // no new deposit yet
}

// Send SOL from escrow to a user wallet
async function withdraw(toAddress, amountSol) {
  const escrow = getEscrowKeypair();
  const toPubkey = new PublicKey(toAddress);
  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: escrow.publicKey,
      toPubkey,
      lamports,
    })
  );
  tx.recentBlockhash = blockhash;
  tx.feePayer = escrow.publicKey;
  tx.sign(escrow);

  const signature = await withRetry(() => connection.sendRawTransaction(tx.serialize()));
  await withRetry(() => connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }));
  return signature;
}

async function getEscrowBalance() {
  const bal = await connection.getBalance(new PublicKey(getEscrowPublicKey()));
  return bal / LAMPORTS_PER_SOL;
}

module.exports = { getEscrowPublicKey, findLatestDeposit, withdraw, getEscrowBalance, NETWORK };
