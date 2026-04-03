class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hexGrid = new HexGrid();
    this.camera = new Camera();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
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
    ctx.fillStyle = '#070707';
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
    const BASE_R = CONSTANTS.FOOD_RADIUS;
    const { x: camX, y: camY, scale } = camera;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const worldCX = (W / 2 - camX) / scale;
    const worldCY = (H / 2 - camY) / scale;
    const margin = BASE_R * 20;
    const halfW = W / (2 * scale) + margin;
    const halfH = H / (2 * scale) + margin;

    const t = Date.now() / 1000;

    for (const f of food) {
      // Visible hover drift using position as phase seed
      const phase = (f.x * 0.13 + f.y * 0.09) % (Math.PI * 2);
      const fx = f.x + Math.sin(t * 1.1 + phase) * 7;
      const fy = f.y + Math.cos(t * 0.85 + phase * 1.4) * 7;

      if (Math.abs(fx - worldCX) > halfW || Math.abs(fy - worldCY) > halfH) continue;

      const r = BASE_R * (f.size || 1);
      const glowR = r * 4.5;

      // Subtle glow
      const grd = ctx.createRadialGradient(fx, fy, 0, fx, fy, glowR);
      grd.addColorStop(0,   f.color + '40');
      grd.addColorStop(0.5, f.color + '18');
      grd.addColorStop(1,   f.color + '00');
      ctx.beginPath();
      ctx.arc(fx, fy, glowR, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Core orb — solid base color
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fillStyle = f.color;
      ctx.fill();

      // Dark radial overlay: transparent center → dark edge (gives darker-shade-toward-perimeter look)
      const darkOverlay = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
      darkOverlay.addColorStop(0, 'rgba(0,0,0,0)');
      darkOverlay.addColorStop(1, 'rgba(0,0,0,0.58)');
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fillStyle = darkOverlay;
      ctx.fill();

      // Thin black outline
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  }

  _drawSnake(ctx, snake, isMe) {
    if (!snake.segs || snake.segs.length < 4) return;
    const { segs, color, boosting, name } = snake;

    const growthScale = 1 + Math.min(1.5, (snake.length || 20) / 200);
    const headRadius  = CONSTANTS.SNAKE_HEAD_RADIUS * growthScale;
    const bodyWidth   = headRadius * 2.2;
    const bodyColor   = isMe ? this._lighten(color, 25) : color;

    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    // 1. Base body
    ctx.beginPath();
    ctx.moveTo(segs[0], segs[1]);
    for (let i = 2; i < segs.length; i += 2) ctx.lineTo(segs[i], segs[i + 1]);
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth   = bodyWidth;
    ctx.stroke();

    // 1b. White boost glow through body
    if (boosting) {
      ctx.beginPath();
      ctx.moveTo(segs[0], segs[1]);
      for (let i = 2; i < segs.length; i += 2) ctx.lineTo(segs[i], segs[i + 1]);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth   = bodyWidth * 1.1;
      ctx.globalAlpha = 1;
      ctx.stroke();
    }

    // 2. Bottom shadow → 3D tube
    ctx.beginPath();
    ctx.moveTo(segs[0], segs[1]);
    for (let i = 2; i < segs.length; i += 2) ctx.lineTo(segs[i], segs[i + 1]);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth   = bodyWidth * 0.6;
    ctx.stroke();

    // 3. Top highlight stripe
    ctx.beginPath();
    ctx.moveTo(segs[0], segs[1]);
    for (let i = 2; i < segs.length; i += 2) ctx.lineTo(segs[i], segs[i + 1]);
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth   = bodyWidth * 0.35;
    ctx.stroke();

    // 4. Segment rings — perpendicular lines like slither.io
    const segSpacing = bodyWidth * 1.1;
    let dist = 0;
    for (let i = 2; i < segs.length - 2; i += 2) {
      const dx = segs[i] - segs[i-2], dy = segs[i+1] - segs[i-1];
      dist += Math.sqrt(dx*dx + dy*dy);
      if (dist >= segSpacing) {
        dist -= segSpacing;
        const ax = segs[i+2] - segs[i-2], ay = segs[i+3] - segs[i-1];
        const al = Math.sqrt(ax*ax + ay*ay) || 1;
        const px = -ay/al, py = ax/al;
        const hw = bodyWidth * 0.48;
        ctx.beginPath();
        ctx.moveTo(segs[i] + px*hw, segs[i+1] + py*hw);
        ctx.lineTo(segs[i] - px*hw, segs[i+1] - py*hw);
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth   = bodyWidth * 0.12;
        ctx.stroke();
      }
    }

    // 5. Head — bigger dome
    const hx = segs[0], hy = segs[1];
    const HR = headRadius * 1.2;
    ctx.beginPath();
    ctx.arc(hx, hy, HR, 0, Math.PI * 2);
    ctx.fillStyle = bodyColor;
    ctx.fill();

    // Head bottom shadow
    ctx.beginPath();
    ctx.arc(hx, hy, HR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();

    // Head top highlight
    ctx.beginPath();
    ctx.arc(hx - HR * 0.18, hy - HR * 0.22, HR * 0.58, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.26)';
    ctx.fill();

    // Restore head color center
    ctx.beginPath();
    ctx.arc(hx, hy, HR * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = bodyColor;
    ctx.globalAlpha = 0.40;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Boosting ring
    if (boosting) {
      ctx.beginPath();
      ctx.arc(hx, hy, HR + 5, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth   = 3;
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 6. Eyes — large, close, slither.io style
    const angle = snake.angle || 0;
    const perpX = -Math.sin(angle), perpY = Math.cos(angle);
    const fwdX  =  Math.cos(angle), fwdY  = Math.sin(angle);
    const eyeSep = HR * 0.36;
    const eyeFwd = HR * 0.52;
    const eyeR   = HR * 0.42;

    for (const side of [-1, 1]) {
      const ex = hx + perpX * eyeSep * side + fwdX * eyeFwd;
      const ey = hy + perpY * eyeSep * side + fwdY * eyeFwd;
      ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = '#f2f2f2'; ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + fwdX * eyeR * 0.18, ey + fwdY * eyeR * 0.18, eyeR * 0.64, 0, Math.PI * 2);
      ctx.fillStyle = '#111'; ctx.fill();
      ctx.beginPath();
      ctx.arc(ex - eyeR * 0.18, ey - eyeR * 0.28, eyeR * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    }

    // Name
    if (name) {
      ctx.font      = `bold ${Math.round(headRadius * 1.1)}px Segoe UI`;
      ctx.textAlign = 'center';
      ctx.fillStyle = isMe ? '#ffe066' : '#fff';
      ctx.fillText(name, hx, hy - HR * 2.5);
    }

    ctx.restore();
  }

  _drawBorder(ctx, worldRadius) {
    ctx.save();
    // Subtle dark vignette outside border (hex tiles still visible through)
    ctx.beginPath();
    ctx.arc(0, 0, worldRadius + 600, 0, Math.PI * 2);
    ctx.arc(0, 0, worldRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    // Red border ring
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
