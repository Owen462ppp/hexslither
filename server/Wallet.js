const {
  Connection, PublicKey, Keypair,
  Transaction, SystemProgram, LAMPORTS_PER_SOL,
} = require('@solana/web3.js');

const NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const RPC_URL = NETWORK === 'mainnet-beta'
  ? 'https://api.mainnet-beta.solana.com'
  : 'https://api.devnet.solana.com';

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

// Find the most recent unclaimed deposit to the escrow and return its amount
async function findLatestDeposit() {
  const escrowPubkey = getEscrowPublicKey();
  const escrow = new PublicKey(escrowPubkey);
  const sigs = await connection.getSignaturesForAddress(escrow, { limit: 20 });

  for (const sigInfo of sigs) {
    if (usedSignatures.has(sigInfo.signature)) continue;
    if (sigInfo.err) { usedSignatures.add(sigInfo.signature); continue; }

    const tx = await connection.getTransaction(sigInfo.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (!tx || tx.meta.err) { usedSignatures.add(sigInfo.signature); continue; }

    const accountKeys = tx.transaction.message.staticAccountKeys ||
      tx.transaction.message.accountKeys;
    const escrowIndex = accountKeys.findIndex(k => k.toString() === escrowPubkey);
    if (escrowIndex === -1) { usedSignatures.add(sigInfo.signature); continue; }

    const lamports = tx.meta.postBalances[escrowIndex] - tx.meta.preBalances[escrowIndex];
    if (lamports <= 0) { usedSignatures.add(sigInfo.signature); continue; }

    usedSignatures.add(sigInfo.signature);
    return lamports / LAMPORTS_PER_SOL;
  }

  throw new Error('No recent deposit found. Make sure your transaction confirmed, then try again.');
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

  const signature = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });
  return signature;
}

async function getEscrowBalance() {
  const bal = await connection.getBalance(new PublicKey(getEscrowPublicKey()));
  return bal / LAMPORTS_PER_SOL;
}

module.exports = { getEscrowPublicKey, findLatestDeposit, withdraw, getEscrowBalance, NETWORK };
