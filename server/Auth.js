// Account store (in-memory — persists until server restarts)
// For permanent storage you'd swap this for a database
const accounts = new Map(); // googleId -> account

function getOrCreateAccount({ googleId, email, name, avatar }) {
  if (accounts.has(googleId)) {
    const acc = accounts.get(googleId);
    // Update name/avatar in case they changed
    acc.name   = name;
    acc.avatar = avatar;
    return acc;
  }
  const acc = {
    googleId,
    email,
    name,
    avatar,
    highScore:   0,
    gamesPlayed: 0,
    createdAt:   Date.now(),
  };
  accounts.set(googleId, acc);
  return acc;
}

function getAccountByGoogleId(googleId) {
  return accounts.get(googleId) || null;
}

function saveAccount(googleId, updates) {
  const acc = accounts.get(googleId);
  if (!acc) return null;
  Object.assign(acc, updates);
  return acc;
}

function recordGameResult(googleId, score) {
  const acc = accounts.get(googleId);
  if (!acc) return;
  acc.gamesPlayed++;
  if (score > acc.highScore) acc.highScore = score;
}

module.exports = { getOrCreateAccount, getAccountByGoogleId, saveAccount, recordGameResult };
