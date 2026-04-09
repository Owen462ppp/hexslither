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

  render(state, myId, mousePos, spectateSnake) {
    const { ctx, canvas, camera } = this;
    const W = canvas.width, H = canvas.height;

    const mySnake = state.snakes.find(s => s.id === myId);
    const followSnake = spectateSnake || mySnake;

    if (followSnake) {
      camera.setScale(state.worldRadius, W, H, followSnake.length);
      camera.follow(followSnake.segs[0], followSnake.segs[1], W, H);
    }
    camera.update();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070707';
    ctx.fillRect(0, 0, W, H);

    camera.apply(ctx);

    // Hex grid
    this.hexGrid.draw(ctx, camera, state.worldRadius);

    // Clip food to world circle only
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, state.worldRadius, 0, Math.PI * 2);
    ctx.clip();
    this._drawFood(ctx, state.food, camera);
    ctx.restore();

    // Snakes drawn outside the clip so bodies stay visible under the red border zone
    for (const snake of state.snakes) {
      if (snake.id !== myId) this._drawSnake(ctx, snake, false);
    }
    if (mySnake) this._drawSnake(ctx, mySnake, true);

    // Border overlay drawn last so red tint still appears on top of snakes
    this._drawBorder(ctx, state.worldRadius, camera);

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

    for (const f of food) {
      if (Math.abs(f.x - worldCX) > halfW || Math.abs(f.y - worldCY) > halfH) continue;

      const r = BASE_R * (f.size || 1);

      if (f.isGolden) {
        // Outer glow
        const glow = ctx.createRadialGradient(f.x, f.y, r * 0.4, f.x, f.y, r * 2.2);
        glow.addColorStop(0, 'rgba(255,215,0,0.35)');
        glow.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.beginPath();
        ctx.arc(f.x, f.y, r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Core golden orb
        const grad = ctx.createRadialGradient(f.x - r * 0.3, f.y - r * 0.3, r * 0.1, f.x, f.y, r);
        grad.addColorStop(0, '#FFFACD');
        grad.addColorStop(0.4, '#FFD700');
        grad.addColorStop(1, '#B8860B');
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Gold outline
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,165,0,0.9)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Glint
        ctx.beginPath();
        ctx.arc(f.x - r * 0.28, f.y - r * 0.28, r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fill();
      } else {
        // Core orb — solid base color
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
        ctx.fillStyle = f.color;
        ctx.fill();

        // Dark radial overlay: transparent center → dark edge
        const darkOverlay = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        darkOverlay.addColorStop(0, 'rgba(0,0,0,0)');
        darkOverlay.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
        ctx.fillStyle = darkOverlay;
        ctx.fill();

        // Thin black outline
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }
  }

  _drawSnake(ctx, snake, isMe) {
    if (!snake.segs || snake.segs.length < 4) return;
    const { segs, color, boosting, name } = snake;

    const growthScale = 1 + Math.min(1.5, (snake.length || 20) / 200);
    const R  = CONSTANTS.SNAKE_HEAD_RADIUS * growthScale;
    const HR = R * 1.15;

    // Blend hex color toward black or white
    function blend(hex, target, t) {
      let r1 = 150, g1 = 150, b1 = 150;
      if (hex && hex[0] === '#' && hex.length >= 7) {
        r1 = parseInt(hex.slice(1,3),16);
        g1 = parseInt(hex.slice(3,5),16);
        b1 = parseInt(hex.slice(5,7),16);
      }
      const r2 = parseInt(target.slice(1,3),16);
      const g2 = parseInt(target.slice(3,5),16);
      const b2 = parseInt(target.slice(5,7),16);
      return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
    }

    const cBright = blend(color, '#ffffff', 0.70);
    const cLight  = blend(color, '#ffffff', 0.20);
    const cDark   = blend(color, '#000000', 0.40);
    const cShadow = blend(color, '#000000', 0.75);

    // Draw a circle at every seg point tail→head so they densely overlap → flush tube
    // segs: [headX,headY, s1x,s1y, ..., tailX,tailY]
    function bodyGrad(x, y, r) {
      const hx = x - r * 0.55, hy = y - r * 0.60;
      const g = ctx.createRadialGradient(hx, hy, r * 0.05, x, y, r);
      g.addColorStop(0.00, cBright);
      g.addColorStop(0.30, cLight);
      g.addColorStop(0.60, color);
      g.addColorStop(0.82, cDark);
      g.addColorStop(1.00, cShadow);
      return g;
    }
    function glossGrad(x, y, r) {
      const hx = x - r * 0.30, hy = y - r * 0.36;
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.58);
      g.addColorStop(0.0, 'rgba(255,255,255,0.52)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.14)');
      g.addColorStop(1.0, 'rgba(255,255,255,0)');
      return g;
    }

    ctx.save();

    // ── Pass 1: base body circles (tail → head) ───────────────────────────────
    if (boosting) {
      for (let i = segs.length - 2; i >= 2; i -= 2) {
        ctx.beginPath(); ctx.arc(segs[i], segs[i+1], R * 1.18, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
      }
    }
    for (let i = segs.length - 2; i >= 2; i -= 2) {
      ctx.beginPath(); ctx.arc(segs[i], segs[i+1], R, 0, Math.PI*2);
      ctx.fillStyle = bodyGrad(segs[i], segs[i+1], R); ctx.fill();
    }

    // ── Pass 2: gloss overlay (tail → head) ──────────────────────────────────
    for (let i = segs.length - 2; i >= 2; i -= 2) {
      ctx.beginPath(); ctx.arc(segs[i], segs[i+1], R, 0, Math.PI*2);
      ctx.fillStyle = glossGrad(segs[i], segs[i+1], R); ctx.fill();
    }

    // ── Head ─────────────────────────────────────────────────────────────────
    const hx = segs[0], hy = segs[1];
    const angle = snake.angle || 0;
    const fwdX = Math.cos(angle), fwdY = Math.sin(angle);
    const perpX = -Math.sin(angle), perpY = Math.cos(angle);

    ctx.beginPath(); ctx.arc(hx, hy, HR, 0, Math.PI*2);
    ctx.fillStyle = bodyGrad(hx, hy, HR); ctx.fill();
    ctx.beginPath(); ctx.arc(hx, hy, HR, 0, Math.PI*2);
    ctx.fillStyle = glossGrad(hx, hy, HR); ctx.fill();

    if (boosting) {
      ctx.beginPath(); ctx.arc(hx, hy, HR + 4, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2.5; ctx.stroke();
    }

    // ── Eyes ─────────────────────────────────────────────────────────────────
    const eyeSide = HR * 0.38;
    const eyeFwd  = HR * 0.22;
    const eyeR    = HR * 0.33;
    const pupilR  = HR * 0.19;
    const pupilFwd = eyeR * 0.28;

    for (const side of [-1, 1]) {
      const ex = hx + fwdX * eyeFwd + perpX * eyeSide * side;
      const ey = hy + fwdY * eyeFwd + perpY * eyeSide * side;

      ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI*2);
      ctx.fillStyle = '#FFFFFF'; ctx.fill();

      ctx.beginPath(); ctx.arc(ex + fwdX*pupilFwd, ey + fwdY*pupilFwd, pupilR, 0, Math.PI*2);
      ctx.fillStyle = '#080808'; ctx.fill();

      ctx.beginPath(); ctx.arc(ex - eyeR*0.18, ey - eyeR*0.22, eyeR*0.22, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    }

    // ── Labels ───────────────────────────────────────────────────────────────
    ctx.textAlign = 'center';
    if (name) {
      const fs = Math.round(R * 1.1);
      ctx.font = `bold ${fs}px Segoe UI`;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = fs * 0.18;
      ctx.strokeText(name, hx, hy - HR*2.5);
      ctx.fillStyle = isMe ? '#ffe066' : '#fff';
      ctx.fillText(name, hx, hy - HR*2.5);
    }
    if (snake.worth > 0) {
      const rate = typeof solCadRate !== 'undefined' ? solCadRate : 200;
      const cadVal = (snake.worth * rate).toFixed(2);
      const wfs = Math.round(R * 1.0);
      ctx.font = `bold ${wfs}px Segoe UI`;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = wfs * 0.18;
      ctx.strokeText(`C$${cadVal}`, hx, hy - HR*(name ? 3.8 : 2.5));
      ctx.fillStyle = '#14F195';
      ctx.fillText(`C$${cadVal}`, hx, hy - HR*(name ? 3.8 : 2.5));
    }

    ctx.restore();
  }

  _drawBorder(ctx, worldRadius, camera) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    // World origin (0,0) projects to (camera.x, camera.y) on screen
    const cx = camera.x;
    const cy = camera.y;
    const screenR = worldRadius * camera.scale;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // work in screen space — no outer arc edge possible

    // Fill entire screen, punch out the world circle (nonzero winding: CW rect + CCW arc)
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy, screenR, 0, Math.PI * 2, true); // CCW cuts it out
    ctx.fillStyle = 'rgba(180,0,0,0.22)';
    ctx.fill();

    // Single red border ring
    ctx.beginPath();
    ctx.arc(cx, cy, screenR, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 3;
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
