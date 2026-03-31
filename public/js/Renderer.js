class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hexGrid = new HexGrid(CONSTANTS.HEX_RADIUS);
    this.camera = new Camera();
    this._glowCache = new Map();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  render(state, myId, mousePos) {
    const { ctx, canvas, camera } = this;
    const W = canvas.width;
    const H = canvas.height;

    // Find my snake
    const mySnake = state.snakes.find(s => s.id === myId);

    // Update camera
    if (mySnake) {
      const headX = mySnake.segs[0];
      const headY = mySnake.segs[1];
      camera.setScale(state.worldRadius, W, H, mySnake.length);
      camera.follow(headX, headY, W, H);
    }
    camera.update();

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07101e';
    ctx.fillRect(0, 0, W, H);

    // Apply camera
    camera.apply(ctx);

    // Hex grid background
    this.hexGrid.draw(ctx, camera, state.worldRadius);

    // World circle (dark area inside border)
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, state.worldRadius, 0, Math.PI * 2);
    ctx.clip();

    // Draw food
    this._drawFood(ctx, state.food);

    // Draw snakes (others first, then me on top)
    const others = state.snakes.filter(s => s.id !== myId);
    const mine = state.snakes.filter(s => s.id === myId);
    for (const snake of [...others, ...mine]) {
      this._drawSnake(ctx, snake, snake.id === myId);
    }

    ctx.restore();

    // Red border ring
    this._drawBorder(ctx, state.worldRadius);

    // Draw cursor crosshair
    if (mousePos && mySnake) {
      camera.reset(ctx);
      this._drawCursor(ctx, mousePos.x, mousePos.y);
    }

    camera.reset(ctx);
  }

  _drawFood(ctx, food) {
    for (const f of food) {
      // Glow
      const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, CONSTANTS.FOOD_RADIUS * 3);
      grd.addColorStop(0, f.color + 'cc');
      grd.addColorStop(1, f.color + '00');
      ctx.beginPath();
      ctx.arc(f.x, f.y, CONSTANTS.FOOD_RADIUS * 3, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(f.x, f.y, CONSTANTS.FOOD_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = f.color;
      ctx.fill();

      // Highlight
      ctx.beginPath();
      ctx.arc(f.x - CONSTANTS.FOOD_RADIUS * 0.3, f.y - CONSTANTS.FOOD_RADIUS * 0.3,
        CONSTANTS.FOOD_RADIUS * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fill();
    }
  }

  _drawSnake(ctx, snake, isMe) {
    if (!snake.segs || snake.segs.length < 4) return;
    const { segs, color, boosting, name } = snake;

    // Scale head and body with snake length (caps at 2.5x original size)
    const growthScale = 1 + Math.min(1.5, (snake.length || 20) / 200);
    const headRadius = CONSTANTS.SNAKE_HEAD_RADIUS * growthScale;
    const bodyWidth = headRadius * 1.6;

    // Body path
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Glow when boosting
    if (boosting) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    }

    // Body (draw thicker outer then thinner inner)
    ctx.beginPath();
    ctx.moveTo(segs[0], segs[1]);
    for (let i = 2; i < segs.length; i += 2) {
      ctx.lineTo(segs[i], segs[i + 1]);
    }
    ctx.strokeStyle = isMe ? this._lighten(color, 40) : color;
    ctx.lineWidth = bodyWidth;
    ctx.stroke();

    // Inner highlight stripe
    ctx.beginPath();
    ctx.moveTo(segs[0], segs[1]);
    for (let i = 2; i < segs.length; i += 2) {
      ctx.lineTo(segs[i], segs[i + 1]);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = bodyWidth * 0.35;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Head
    const hx = segs[0];
    const hy = segs[1];

    ctx.beginPath();
    ctx.arc(hx, hy, headRadius, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? this._lighten(color, 60) : this._lighten(color, 20);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Eyes
    const angle = snake.angle || 0;
    const eyeOffset = headRadius * 0.5;
    const eyeR = headRadius * 0.28;
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);
    const fwdX = Math.cos(angle);
    const fwdY = Math.sin(angle);

    for (const side of [-1, 1]) {
      const ex = hx + perpX * eyeOffset * side + fwdX * headRadius * 0.35;
      const ey = hy + perpY * eyeOffset * side + fwdY * headRadius * 0.35;
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + fwdX * eyeR * 0.3, ey + fwdY * eyeR * 0.3, eyeR * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
    }

    // Name label
    if (name) {
      ctx.font = `bold ${headRadius * 1.1}px Segoe UI`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(name, hx, hy - headRadius * 2.2);
      ctx.fillStyle = isMe ? '#ffe066' : '#fff';
      ctx.fillText(name, hx, hy - headRadius * 2.4);
    }

    ctx.restore();
  }

  _drawBorder(ctx, worldRadius) {
    ctx.save();
    // Outer dark mask
    ctx.beginPath();
    ctx.arc(0, 0, worldRadius + 200, 0, Math.PI * 2);
    ctx.arc(0, 0, worldRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();

    // Red glowing ring
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 30;
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, worldRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner ring glow
    ctx.shadowBlur = 15;
    ctx.strokeStyle = 'rgba(255,80,80,0.4)';
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.arc(0, 0, worldRadius - 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  _drawCursor(ctx, sx, sy) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    const s = 10;
    ctx.beginPath();
    ctx.moveTo(sx - s, sy); ctx.lineTo(sx + s, sy);
    ctx.moveTo(sx, sy - s); ctx.lineTo(sx, sy + s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _lighten(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0xff) + amount);
    const b = Math.min(255, (num & 0xff) + amount);
    return `rgb(${r},${g},${b})`;
  }

  drawMinimap(minimapCtx, state, myId) {
    const mc = minimapCtx;
    const SIZE = mc.canvas.width;
    mc.clearRect(0, 0, SIZE, SIZE);

    const scale = SIZE / (state.worldRadius * 2);
    const cx = SIZE / 2;
    const cy = SIZE / 2;

    // World circle
    mc.beginPath();
    mc.arc(cx, cy, state.worldRadius * scale, 0, Math.PI * 2);
    mc.fillStyle = 'rgba(10,14,40,0.8)';
    mc.fill();
    mc.strokeStyle = '#ff3333';
    mc.lineWidth = 2;
    mc.stroke();

    // Food dots
    mc.fillStyle = 'rgba(100,255,100,0.5)';
    for (const f of state.food) {
      mc.fillRect(cx + f.x * scale - 1, cy + f.y * scale - 1, 2, 2);
    }

    // Snakes
    for (const snake of state.snakes) {
      if (!snake.segs || snake.segs.length < 2) continue;
      const hx = cx + snake.segs[0] * scale;
      const hy = cy + snake.segs[1] * scale;
      mc.beginPath();
      mc.arc(hx, hy, snake.id === myId ? 4 : 2.5, 0, Math.PI * 2);
      mc.fillStyle = snake.id === myId ? '#ffe066' : snake.color;
      mc.fill();
    }
  }
}
