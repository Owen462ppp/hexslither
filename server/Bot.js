const Snake = require('./Snake');

const BOT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98FB98', '#F0E68C', '#FFB347', '#87CEEB',
];

const BOT_NAMES = [
  'aidan6969', 'jacobtheweiner78', 'quantum', 'Mr-1221z', 'slitherkinggg',
  'xX_snake_Xx', 'noodleman', 'cobrakai99', 'bigworm42', 'snek_lord',
  'viper0011', 'hisssss', 'eaturdust', 'n00bslayer', 'wormhole_',
  'slurpmaster', 'gg_no_re', 'tryhard99', 'just_a_worm', 'toxic_snek',
  'GigaWorm', 'boostgang', 'curvy_boi', 'nomnom_snek', 'ieatbots',
  'deathcoil', 'zoomzoom22', 'slimy_steve', 'wiggleking', 'ouroboros_',
  'snekattack', 'longneck', 'ratboi420', 'fastaf_boii', 'lmaosnek',
  'noobmaster_', 'slitherio_pro', 'wormy_mcworm', 'danger_noodle', 'mr_slithers',
];

const usedNames = new Set();

function pickBotName() {
  const available = BOT_NAMES.filter(n => !usedNames.has(n));
  const pool = available.length > 0 ? available : BOT_NAMES;
  const name = pool[Math.floor(Math.random() * pool.length)];
  usedNames.add(name);
  return name;
}

class Bot extends Snake {
  constructor(id, x, y) {
    const color = BOT_COLORS[Math.floor(Math.random() * BOT_COLORS.length)];
    super(id, pickBotName(), x, y, color);
    this.isBot = true;
    this._turnDir  = (Math.random() < 0.5 ? 1 : -1);
    this._turnTimer = 80 + Math.random() * 120;
  }

  updateAI(foodList, worldRadius) {
    if (!this.alive) return;

    // Always steer back if near border
    const distFromCenter = Math.hypot(this.head.x, this.head.y);
    if (distFromCenter > worldRadius * 0.82) {
      this.targetAngle = Math.atan2(-this.head.y, -this.head.x);
      return;
    }

    // Seek nearest food within sight range
    let nearestFood = null, nearestDist = 280;
    for (const f of foodList) {
      const d = Math.hypot(this.head.x - f.x, this.head.y - f.y);
      if (d < nearestDist) { nearestDist = d; nearestFood = f; }
    }

    if (nearestFood) {
      this.targetAngle = Math.atan2(
        nearestFood.y - this.head.y,
        nearestFood.x - this.head.x
      );
    } else {
      // Gentle wander
      this._turnTimer--;
      if (this._turnTimer <= 0) {
        this._turnDir   = -this._turnDir;
        this._turnTimer = 80 + Math.random() * 120;
      }
      this.targetAngle += this._turnDir * 0.018;
    }
  }
}

module.exports = Bot;
