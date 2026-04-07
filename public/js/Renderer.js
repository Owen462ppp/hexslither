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

  _drawSnake(ctx, snake, isMe) {
    if (!snake.segs || snake.segs.length < 4) return;
    const { segs, color, boosting, name } = snake;

    const growthScale = 1 + Math.min(1.5, (snake.length || 20) / 200);
    const R  = CONSTANTS.SNAKE_HEAD_RADIUS * growthScale; // body half-width
    const BW = R * 2;   // full body stroke width
    const HR = R * 1.1; // head radius — just barely bigger than body

    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    function strokeBody(lw, style, alpha) {
      if (alpha !== undefined) ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(segs[0], segs[1]);
      for (let i = 2; i < segs.length; i += 2) ctx.lineTo(segs[i], segs[i + 1]);
      ctx.strokeStyle = style;
      ctx.lineWidth   = lw;
      ctx.stroke();
      if (alpha !== undefined) ctx.globalAlpha = 1;
    }

    // 1. Base body color
    strokeBody(BW, color);

    // 2. Boost outer glow
    if (boosting) strokeBody(BW * 1.14, 'rgba(255,255,255,0.15)');

    // 3. Bottom shadow — gives the lower-half its dark depth
    strokeBody(BW * 0.68, 'rgba(0,0,0,0.48)');

    // 4. Mid-shadow — softens the transition for a rounder look
    strokeBody(BW * 0.38, 'rgba(0,0,0,0.22)');

    // 5. Top highlight — bright center stripe, the main 3D effect
    strokeBody(BW * 0.28, 'rgba(255,255,255,0.60)');

    // 6. Segment rings — dark perpendicular lines, clearly spaced
    const segSpacing = BW * 1.1;
    let dist = 0;
    for (let i = 2; i < segs.length - 2; i += 2) {
      const dx = segs[i] - segs[i - 2], dy = segs[i + 1] - segs[i - 1];
      dist += Math.sqrt(dx * dx + dy * dy);
      if (dist >= segSpacing) {
        dist -= segSpacing;
        const ax = segs[i + 2] - segs[i - 2], ay = segs[i + 3] - segs[i - 1];
        const al = Math.sqrt(ax * ax + ay * ay) || 1;
        const px = -ay / al, py = ax / al;
        const hw = BW * 0.50;
        ctx.beginPath();
        ctx.moveTo(segs[i] + px * hw, segs[i + 1] + py * hw);
        ctx.lineTo(segs[i] - px * hw, segs[i + 1] - py * hw);
        ctx.strokeStyle = 'rgba(0,0,0,0.38)';
        ctx.lineWidth   = BW * 0.13;
        ctx.stroke();
      }
    }

    // 7. Head — round cap, same shading layers as body
    const hx = segs[0], hy = segs[1];

    // Base
    ctx.beginPath(); ctx.arc(hx, hy, HR, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();

    // Shadow overlay (lower area darker)
    ctx.beginPath(); ctx.arc(hx, hy, HR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill();

    // Highlight blob (upper-center, same as body stripe)
    ctx.beginPath(); ctx.arc(hx, hy - HR * 0.15, HR * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.52)'; ctx.fill();

    // Boost head ring
    if (boosting) {
      ctx.beginPath(); ctx.arc(hx, hy, HR + 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2.5; ctx.stroke();
    }

    // 8. Eyes — large, forward-facing, centered pupils, bright glint
    const angle = snake.angle || 0;
    const perpX = -Math.sin(angle), perpY =  Math.cos(angle);
    const fwdX  =  Math.cos(angle), fwdY  =  Math.sin(angle);
    const eyeSep = HR * 0.42; // left/right distance from centerline
    const eyeFwd = HR * 0.60; // how far forward on the head
    const eyeR   = HR * 0.44; // eye radius

    for (const side of [-1, 1]) {
      const ex = hx + perpX * eyeSep * side + fwdX * eyeFwd;
      const ey = hy + perpY * eyeSep * side + fwdY * eyeFwd;

      // White sclera
      ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();

      // Black pupil — centered, large
      ctx.beginPath(); ctx.arc(ex, ey, eyeR * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = '#111111'; ctx.fill();

      // White glint — upper portion of pupil
      ctx.beginPath(); ctx.arc(ex - eyeR * 0.12, ey - eyeR * 0.20, eyeR * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    }

    // 9. Name label
    if (name) {
      ctx.font      = `bold ${Math.round(R * 1.1)}px Segoe UI`;
      ctx.textAlign = 'center';
      ctx.fillStyle = isMe ? '#ffe066' : '#fff';
      ctx.fillText(name, hx, hy - HR * 2.6);
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
