const C = require('../shared/constants');

const COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
  '#3498db', '#9b59b6', '#e91e63', '#ff5722', '#00bcd4',
  '#8bc34a', '#ff9800', '#673ab7', '#009688', '#f44336',
];

const MIN_SEGMENTS = C.SNAKE_MIN_SEGMENTS * 2; // hard floor — can never shrink below this

class Snake {
  constructor(id, name, x, y, color) {
    this.id = id;
    this.name = name || 'Player';
    this.color = color || COLORS[Math.floor(Math.random() * COLORS.length)];
    this.angle = Math.random() * Math.PI * 2;
    this.targetAngle = this.angle;
    this.boosting = false;
    this.alive = true;
    this.score = 0;

    this.segments = [];
    for (let i = 0; i < MIN_SEGMENTS; i++) {
      this.segments.push({
        x: x - Math.cos(this.angle) * i * C.SNAKE_SEGMENT_SPACING,
        y: y - Math.sin(this.angle) * i * C.SNAKE_SEGMENT_SPACING,
      });
    }
    this.pendingGrowth = 0;
  }

  get head() { return this.segments[0]; }
  get length() { return this.segments.length; }

  // Boost fuel = how many segments above the minimum floor
  get boostFuel() { return Math.max(0, this.length - MIN_SEGMENTS); }
  // 0-1 ratio for the boost bar UI
  get boostRatio() {
    const max = Math.max(1, this.length - MIN_SEGMENTS + this.pendingGrowth);
    return Math.min(1, this.boostFuel / max);
  }

  setInput(targetAngle, boosting) {
    this.targetAngle = targetAngle;
    // Can only boost if there is size to burn
    this.boosting = boosting && this.boostFuel > 0;
  }

  update() {
    if (!this.alive) return;

    // Turn toward target (limited turn rate)
    let delta = this.targetAngle - this.angle;
    while (delta >  Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) > C.MAX_TURN_RATE) {
      this.angle += Math.sign(delta) * C.MAX_TURN_RATE;
    } else {
      this.angle = this.targetAngle;
    }

    // Speed & boost shrink
    let speed = C.SNAKE_BASE_SPEED;
    if (this.boosting) {
      if (this.boostFuel > 0) {
        speed = C.SNAKE_BOOST_SPEED;
        // Burn one tail segment per tick as fuel
        this.segments.pop();
      } else {
        // Out of fuel — stop boosting
        this.boosting = false;
      }
    }

    // Advance head
    const newHead = {
      x: this.segments[0].x + Math.cos(this.angle) * speed,
      y: this.segments[0].y + Math.sin(this.angle) * speed,
    };
    this.segments.unshift(newHead);

    // Grow or trim tail
    if (this.pendingGrowth > 0) {
      this.pendingGrowth--;
    } else {
      this.segments.pop();
    }
  }

  grow(amount) {
    this.pendingGrowth += amount * C.SEGMENTS_PER_FOOD;
    this.score += amount;
  }

  die() {
    this.alive = false;
    const drops = [];
    const dropCount = Math.floor(this.length / 4);
    for (let i = 0; i < dropCount; i++) {
      const seg = this.segments[Math.floor(Math.random() * this.segments.length)];
      drops.push({
        x: seg.x + (Math.random() - 0.5) * 20,
        y: seg.y + (Math.random() - 0.5) * 20,
        value: 2,
      });
    }
    return drops;
  }

  serialize() {
    const segs = [];
    for (let i = 0; i < this.segments.length; i += 2) {
      segs.push(this.segments[i].x, this.segments[i].y);
    }
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      segs,
      angle: this.angle,
      boosting: this.boosting,
      score: this.score,
      length: this.length,
      boostRatio: this.boostRatio,
    };
  }
}

module.exports = Snake;
