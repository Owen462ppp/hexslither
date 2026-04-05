// Persistent all-time leaderboard — survives server restarts via JSON file.
// On Render.com, add a persistent disk mounted at /data and set DATA_DIR=/data
// to keep scores across deploys; otherwise scores persist until the container restarts.
const fs   = require('fs');
const path = require('path');

const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'leaderboard.json');

class PersistentLeaderboard {
  constructor() {
    // entries: [{ id, name, score, playedAt }]
    // id = googleId for real players, name for bots
    this.entries = [];
    this._dirty = false;
    this._load();
    // Flush to disk every 30s — avoids hammering fs on every death
    setInterval(() => this._flush(), 30_000);
  }

  _load() {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      // Migrate old format (no id field) — use name as id
      this.entries = parsed.map(e => ({ id: e.id || e.name, name: e.name, score: e.score, playedAt: e.playedAt }));
    } catch {
      this.entries = [];
    }
  }

  _flush() {
    if (!this._dirty) return;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.entries));
      this._dirty = false;
    } catch (e) {
      console.error('[Leaderboard] save failed:', e.message);
    }
  }

  // Record a score — keyed by id (googleId for players, name for bots).
  // Updates the display name automatically so name changes are reflected.
  record(id, name, score) {
    if (!id || !name || typeof score !== 'number' || score <= 0) return;
    const idx = this.entries.findIndex(e => e.id === id);
    if (idx >= 0) {
      this.entries[idx].name = name; // always sync latest display name
      if (score <= this.entries[idx].score) return; // not a new best — name update was enough
      this.entries[idx].score    = score;
      this.entries[idx].playedAt = Date.now();
    } else {
      this.entries.push({ id, name, score, playedAt: Date.now() });
    }
    this.entries.sort((a, b) => b.score - a.score);
    if (this.entries.length > 1000) this.entries.length = 1000;
    this._dirty = true;
  }

  // Called when a player renames — updates their display name without touching their score
  rename(googleId, newName) {
    const entry = this.entries.find(e => e.id === googleId);
    if (entry && entry.name !== newName) {
      entry.name = newName;
      this._dirty = true;
    }
  }

  getTop(n) {
    return this.entries.slice(0, n).map((e, i) => ({
      rank: i + 1,
      name: e.name,
      score: e.score,
    }));
  }
}

// Flush on clean shutdown
const lb = new PersistentLeaderboard();
process.on('SIGTERM', () => lb._flush());
process.on('SIGINT',  () => lb._flush());

module.exports = lb;
