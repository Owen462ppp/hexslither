// Persistent all-time leaderboard — survives server restarts via JSON file.
// On Render.com, add a persistent disk mounted at /data and set DATA_DIR=/data
// to keep scores across deploys; otherwise scores persist until the container restarts.
const fs   = require('fs');
const path = require('path');

const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'leaderboard.json');

class PersistentLeaderboard {
  constructor() {
    this.entries = []; // [{ name, score, playedAt }]
    this._dirty = false;
    this._load();
    // Flush to disk every 30s if dirty — avoids hammering fs on every death
    setInterval(() => this._flush(), 30_000);
  }

  _load() {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      this.entries = JSON.parse(raw);
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

  // Record a score — keeps each name's all-time best only
  record(name, score) {
    if (!name || typeof score !== 'number' || score <= 0) return;
    const key = name.trim();
    const idx = this.entries.findIndex(e => e.name === key);
    if (idx >= 0) {
      if (score <= this.entries[idx].score) return; // not a new best
      this.entries[idx].score    = score;
      this.entries[idx].playedAt = Date.now();
    } else {
      this.entries.push({ name: key, score, playedAt: Date.now() });
    }
    // Keep sorted, cap at 1000 entries
    this.entries.sort((a, b) => b.score - a.score);
    if (this.entries.length > 1000) this.entries.length = 1000;
    this._dirty = true;
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
