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

// Track already-credited signatures to prevent double-crediting
const usedSignatures = new Set();

// On startup, mark existing transactions as already seen so we don't re-credit them
async function initUsedSignatures() {
  try {
    const escrow = new PublicKey(getEscrowPublicKey());
    const sigs = await connection.getSignaturesForAddress(escrow, { limit: 100 });
    for (const s of sigs) usedSignatures.add(s.signature);
    console.log(`[WALLET] Initialized with ${usedSignatures.size} existing signatures`);
  } catch (e) {
    console.error('[WALLET] Init error:', e.message);
  }
}

// Poll every 10s for new deposits; call onDeposit(fromAddress, amountSol) for each new one
async function startPolling(onDeposit) {
  await initUsedSignatures();

  setInterval(async () => {
    try {
      const escrowPubkey = getEscrowPublicKey();
      const escrow = new PublicKey(escrowPubkey);
      const sigs = await connection.getSignaturesForAddress(escrow, { limit: 10 });

      // Process oldest first so credits happen in order
      for (const sigInfo of [...sigs].reverse()) {
        if (usedSignatures.has(sigInfo.signature)) continue;
        if (sigInfo.err) { usedSignatures.add(sigInfo.signature); continue; }

        const tx = await connection.getTransaction(sigInfo.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        usedSignatures.add(sigInfo.signature);
        if (!tx || tx.meta.err) continue;

        const accountKeys = tx.transaction.message.staticAccountKeys ||
          tx.transaction.message.accountKeys;
        const escrowIndex = accountKeys.findIndex(k => k.toString() === escrowPubkey);
        if (escrowIndex === -1) continue;

        const lamports = tx.meta.postBalances[escrowIndex] - tx.meta.preBalances[escrowIndex];
        if (lamports <= 0) continue;

        // Sender is the fee payer (index 0)
        const fromAddress = accountKeys[0].toString();
        const amountSol = lamports / LAMPORTS_PER_SOL;
        onDeposit(fromAddress, amountSol);
      }
    } catch (e) {
      console.error('[WALLET] Poll error:', e.message);
    }
  }, 10000);
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

module.exports = { getEscrowPublicKey, startPolling, withdraw, getEscrowBalance, NETWORK };
