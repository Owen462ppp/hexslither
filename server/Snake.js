const { v4: uuidv4 } = require('uuid');
const C = require('../shared/constants');

const COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
  '#3498db', '#9b59b6', '#e91e63', '#ff5722', '#00bcd4',
  '#8bc34a', '#ff9800', '#673ab7', '#009688', '#f44336',
];

class Snake {
  constructor(id, name, x, y) {
    this.id = id;
    this.name = name || 'Player';
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
    this.angle = Math.random() * Math.PI * 2;
    this.targetAngle = this.angle;
    this.boosting = false;
    this.alive = true;
    this.score = 0;
    this.foodStored = 10; // starting food reserve for boost

    // Build initial segment chain
    this.segments = [];
    for (let i = 0; i < C.SNAKE_MIN_SEGMENTS * 2; i++) {
      this.segments.push({
        x: x - Math.cos(this.angle) * i * C.SNAKE_SEGMENT_SPACING,
        y: y - Math.sin(this.angle) * i * C.SNAKE_SEGMENT_SPACING,
      });
    }
    this.pendingGrowth = 0;
  }

  get head() { return this.segments[0]; }
  get length() { return this.segments.length; }

  setInput(targetAngle, boosting) {
    this.targetAngle = targetAngle;
    // Can only boost if has food and long enough
    this.boosting = boosting && this.foodStored > 0 && this.length > C.BOOST_MIN_LENGTH;
  }

  update() {
    if (!this.alive) return;

    // Turn toward target angle (limited turn rate)
    let delta = this.targetAngle - this.angle;
    // Normalize delta to [-PI, PI]
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxTurn = C.MAX_TURN_RATE;
    if (Math.abs(delta) > maxTurn) {
      this.angle += Math.sign(delta) * maxTurn;
    } else {
      this.angle = this.targetAngle;
    }

    // Speed
    let speed = C.SNAKE_BASE_SPEED;
    if (this.boosting) {
      speed = C.SNAKE_BOOST_SPEED;
      this.foodStored -= C.BOOST_FOOD_COST;
      if (this.foodStored < 0) this.foodStored = 0;
      // Shrink snake while boosting (burn segments)
      if (this.length > C.SNAKE_MIN_SEGMENTS * 2) {
        this.segments.pop();
      }
    }

    // Move head
    const newHead = {
      x: this.segments[0].x + Math.cos(this.angle) * speed,
      y: this.segments[0].y + Math.sin(this.angle) * speed,
    };
    this.segments.unshift(newHead);

    // Handle growth vs trim
    if (this.pendingGrowth > 0) {
      this.pendingGrowth--;
    } else {
      this.segments.pop();
    }
  }

  grow(amount) {
    this.pendingGrowth += amount * C.SEGMENTS_PER_FOOD;
    this.foodStored += amount;
    this.score += amount;
  }

  die() {
    this.alive = false;
    // Return food orbs to drop
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
    // Send every other segment to reduce payload
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
      foodStored: Math.round(this.foodStored),
    };
  }
}

module.exports = Snake;
