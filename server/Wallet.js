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

// Verify a deposit transaction on-chain and return the SOL amount sent to escrow
async function verifyDeposit(signature, expectedFromAddress) {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) throw new Error('Transaction not found');
  if (tx.meta.err) throw new Error('Transaction failed on-chain');

  const escrowPubkey = getEscrowPublicKey();
  const accountKeys = tx.transaction.message.staticAccountKeys ||
    tx.transaction.message.accountKeys;

  const escrowIndex = accountKeys.findIndex(k => k.toString() === escrowPubkey);
  if (escrowIndex === -1) throw new Error('Escrow not found in transaction');

  const preBal  = tx.meta.preBalances[escrowIndex];
  const postBal = tx.meta.postBalances[escrowIndex];
  const lamports = postBal - preBal;
  if (lamports <= 0) throw new Error('No SOL sent to escrow');

  return lamports / LAMPORTS_PER_SOL;
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

module.exports = { getEscrowPublicKey, verifyDeposit, withdraw, getEscrowBalance, NETWORK };
