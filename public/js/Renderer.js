class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hexGrid = new HexGrid();
    this.camera = new Camera();
    // Pre-render a single food glow sprite to an offscreen canvas
    this._foodSprites = new Map(); // color -> offscreen canvas
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // Build a small offscreen canvas for a glowing food orb of a given color
  _getFoodSprite(color) {
    if (this._foodSprites.has(color)) return this._foodSprites.get(color);
    const R = CONSTANTS.FOOD_RADIUS;
    const size = R * 6;
    const oc = document.createElement('canvas');
    oc.width = oc.height = size;
    const ox = size / 2, oy = size / 2;
    const c = oc.getContext('2d');
    // Glow
    const grd = c.createRadialGradient(ox, oy, 0, ox, oy, R * 3);
    grd.addColorStop(0, color + 'cc');
    grd.addColorStop(1, color + '00');
    c.beginPath(); c.arc(ox, oy, R * 3, 0, Math.PI * 2);
    c.fillStyle = grd; c.fill();
    // Core
    c.beginPath(); c.arc(ox, oy, R, 0, Math.PI * 2);
    c.fillStyle = color; c.fill();
    // Highlight
    c.beginPath();
    c.arc(ox - R * 0.3, oy - R * 0.3, R * 0.4, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill();
    this._foodSprites.set(color, oc);
    return oc;
  }

  render(state, myId, mousePos) {
    const { ctx, canvas, camera } = this;
    const W = canvas.width, H = canvas.height;

    const mySnake = state.snakes.find(s => s.id === myId);

    if (mySnake) {
      camera.setScale(state.worldRadius, W, H, mySnake.length);
      camera.follow(mySnake.segs[0], mySnake.segs[1], W, H);
    }
    camera.update();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#03080f';
    ctx.fillRect(0, 0, W, H);

    camera.apply(ctx);

    // Hex grid
    this.hexGrid.draw(ctx, camera, state.worldRadius);

    // Clip to world circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, state.worldRadius, 0, Math.PI * 2);
    ctx.clip();

    this._drawFood(ctx, state.food, camera);
    for (const snake of state.snakes) {
      if (snake.id !== myId) this._drawSnake(ctx, snake, false);
    }
    if (mySnake) this._drawSnake(ctx, mySnake, true);

    ctx.restore();

    this._drawBorder(ctx, state.worldRadius);

    if (mousePos && mySnake) {
      camera.reset(ctx);
      this._drawCursor(ctx, mousePos.x, mousePos.y);
    }
    camera.reset(ctx);
  }

  _drawFood(ctx, food, camera) {
    const R = CONSTANTS.FOOD_RADIUS;
    const spriteSize = R * 6;
    const half = spriteSize / 2;

    // Viewport cull in world space
    const { x: camX, y: camY, scale } = camera;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const worldCX = (W / 2 - camX) / scale;
    const worldCY = (H / 2 - camY) / scale;
    const halfW = W / (2 * scale) + spriteSize;
    const halfH = H / (2 * scale) + spriteSize;

    for (const f of food) {
      // Skip offscreen food
      if (Math.abs(f.x - worldCX) > halfW || Math.abs(f.y - worldCY) > halfH) continue;
      const sprite = this._getFoodSprite(f.color);
      ctx.drawImage(sprite, f.x - half, f.y - half, spriteSize, spriteSize);
    }
  }

  _drawSnake(ctx, snake, isMe) {
    if (!snake.segs || snake.segs.length < 4) return;
    const { segs, color, boosting, name } = snake;

    const growthScale = 1 + Math.min(1.5, (snake.length || 20) / 200);
    const headRadius = CONSTANTS.SNAKE_HEAD_RADIUS * growthScale;
    const bodyWidth = headRadius * 1.6;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Body — single pass, no shadow
    ctx.beginPath();
    ctx.moveTo(segs[0], segs[1]);
    for (let i = 2; i < segs.length; i += 2) ctx.lineTo(segs[i], segs[i + 1]);
    ctx.strokeStyle = isMe ? this._lighten(color, 40) : color;
    ctx.lineWidth = bodyWidth;
    ctx.stroke();

    // Head
    const hx = segs[0], hy = segs[1];
    ctx.beginPath();
    ctx.arc(hx, hy, headRadius, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? this._lighten(color, 60) : this._lighten(color, 20);
    ctx.fill();

    // Boosting ring instead of expensive shadowBlur
    if (boosting) {
      ctx.beginPath();
      ctx.arc(hx, hy, headRadius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Eyes
    const angle = snake.angle || 0;
    const eyeOffset = headRadius * 0.5;
    const eyeR = headRadius * 0.28;
    const perpX = -Math.sin(angle), perpY = Math.cos(angle);
    const fwdX  =  Math.cos(angle), fwdY  = Math.sin(angle);

    for (const side of [-1, 1]) {
      const ex = hx + perpX * eyeOffset * side + fwdX * headRadius * 0.35;
      const ey = hy + perpY * eyeOffset * side + fwdY * headRadius * 0.35;
      ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex + fwdX * eyeR * 0.3, ey + fwdY * eyeR * 0.3, eyeR * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#111'; ctx.fill();
    }

    // Name
    if (name) {
      ctx.font = `bold ${Math.round(headRadius * 1.1)}px Segoe UI`;
      ctx.textAlign = 'center';
      ctx.fillStyle = isMe ? '#ffe066' : '#fff';
      ctx.fillText(name, hx, hy - headRadius * 2.2);
    }

    ctx.restore();
  }

  _drawBorder(ctx, worldRadius) {
    ctx.save();
    // Dark mask outside border — no shadow
    ctx.beginPath();
    ctx.arc(0, 0, worldRadius + 300, 0, Math.PI * 2);
    ctx.arc(0, 0, worldRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fill();
    // Red border ring — no shadowBlur
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, worldRadius, 0, Math.PI * 2);
    ctx.stroke();
    // Second softer ring
    ctx.strokeStyle = 'rgba(255,60,60,0.3)';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(0, 0, worldRadius - 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawCursor(ctx, sx, sy) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx - 10, sy); ctx.lineTo(sx + 10, sy);
    ctx.moveTo(sx, sy - 10); ctx.lineTo(sx, sy + 10);
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
    const cx = SIZE / 2, cy = SIZE / 2;

    mc.beginPath();
    mc.arc(cx, cy, state.worldRadius * scale, 0, Math.PI * 2);
    mc.fillStyle = 'rgba(10,14,40,0.8)'; mc.fill();
    mc.strokeStyle = '#ff3333'; mc.lineWidth = 2; mc.stroke();

    mc.fillStyle = 'rgba(100,255,100,0.5)';
    for (const f of state.food) {
      mc.fillRect(cx + f.x * scale - 1, cy + f.y * scale - 1, 2, 2);
    }
    for (const snake of state.snakes) {
      if (!snake.segs || snake.segs.length < 2) continue;
      mc.beginPath();
      mc.arc(cx + snake.segs[0] * scale, cy + snake.segs[1] * scale,
        snake.id === myId ? 4 : 2.5, 0, Math.PI * 2);
      mc.fillStyle = snake.id === myId ? '#ffe066' : snake.color;
      mc.fill();
    }
  }
}
