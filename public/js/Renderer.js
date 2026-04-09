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
    const R = CONSTANTS.SNAKE_HEAD_RADIUS * growthScale;

    // Build spine: spine[0]=head, spine[SN-1]=tail
    const spine = [];
    for (let i = 0; i < segs.length; i += 2) spine.push({ x: segs[i], y: segs[i+1] });
    const SN = spine.length;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    function buildPath() {
      ctx.beginPath();
      ctx.moveTo(spine[0].x, spine[0].y);
      for (let i = 1; i < SN-1; i++) {
        const mx = (spine[i].x + spine[i+1].x) / 2;
        const my = (spine[i].y + spine[i+1].y) / 2;
        ctx.quadraticCurveTo(spine[i].x, spine[i].y, mx, my);
      }
      ctx.lineTo(spine[SN-1].x, spine[SN-1].y);
    }

    // Tapered arc: draws a back-facing semicircle that fades to 0 at both tips
    function taperedArc(cx, cy, r, baseAlpha, lw, angle) {
      const SEGS = 8;
      for (let s = 0; s < SEGS; s++) {
        const t0 = s/SEGS, t1 = (s+1)/SEGS;
        const taper = Math.sin((t0+t1)/2 * Math.PI);
        ctx.beginPath();
        ctx.arc(cx, cy, r,
          angle + Math.PI*0.5 + t0*Math.PI,
          angle + Math.PI*0.5 + t1*Math.PI, false);
        ctx.strokeStyle = `rgba(0,0,0,${baseAlpha * taper})`;
        ctx.lineWidth = lw;
        ctx.lineCap = 'butt';
        ctx.stroke();
      }
    }

    // Viewport bounds in world space for crease culling
    const { camera } = this;
    const _W = ctx.canvas.width, _H = ctx.canvas.height;
    const _m = R * 4;
    const vpL = -camera.x / camera.scale - _m;
    const vpR = (_W - camera.x) / camera.scale + _m;
    const vpT = -camera.y / camera.scale - _m;
    const vpB = (_H - camera.y) / camera.scale + _m;

    // ── Body ─────────────────────────────────────────────────────────────────
    buildPath();
    ctx.lineWidth = boosting ? R * 2.4 : R * 2;
    ctx.strokeStyle = boosting ? 'rgba(255,255,255,0.18)' : color;
    ctx.stroke();
    if (boosting) {
      buildPath();
      ctx.lineWidth = R * 2;
      ctx.strokeStyle = color;
      ctx.stroke();
    }

    // ── Crease lines (near-head → tail, viewport-culled) ─────────────────────
    const CREASE_SPACING = R * 0.88;
    const PASSES = 10;
    let dist = -R * 0.35;
    for (let i = 1; i < SN-1; i++) {
      const dx = spine[i].x - spine[i-1].x, dy = spine[i].y - spine[i-1].y;
      dist += Math.sqrt(dx*dx + dy*dy);
      if (dist < CREASE_SPACING) continue;
      dist -= CREASE_SPACING;
      // Skip drawing if off-screen (still track dist for even spacing)
      const sx = spine[i].x, sy = spine[i].y;
      if (sx < vpL || sx > vpR || sy < vpT || sy > vpB) continue;
      // Forward angle toward head (lower index)
      const ax = spine[Math.max(i-2,0)].x - spine[Math.min(i+2,SN-1)].x;
      const ay = spine[Math.max(i-2,0)].y - spine[Math.min(i+2,SN-1)].y;
      const fwdAngle = Math.atan2(ay, ax);
      for (let p = 0; p < PASSES; p++) {
        const t = p / (PASSES - 1);
        taperedArc(sx, sy,
          R * (0.88 + t * 0.12),
          0.0003 + Math.pow(t, 2.5) * 0.012,
          R * (0.50 * Math.pow(1-t, 1.5) + 0.035),
          fwdAngle);
      }
    }

    // ── Head ─────────────────────────────────────────────────────────────────
    const hx = spine[0].x, hy = spine[0].y;
    const angle = snake.angle || 0;
    const fwdX = Math.cos(angle), fwdY = Math.sin(angle);
    const perpX = -Math.sin(angle), perpY = Math.cos(angle);

    ctx.beginPath(); ctx.arc(hx, hy, R, 0, Math.PI*2);
    ctx.fillStyle = color; ctx.fill();

    if (hx >= vpL && hx <= vpR && hy >= vpT && hy <= vpB) {
      for (let p = 0; p < PASSES; p++) {
        const t = p / (PASSES - 1);
        taperedArc(hx, hy,
          R * (0.88 + t * 0.12),
          0.0003 + Math.pow(t, 2.5) * 0.012,
          R * (0.50 * Math.pow(1-t, 1.5) + 0.035),
          angle);
      }
    }

    // ── Eyes ─────────────────────────────────────────────────────────────────
    const eyeR   = R * 0.40;
    const pupilR = eyeR * 0.54;
    for (const side of [-1, 1]) {
      const ex = hx + fwdX*R*0.38 + perpX*R*0.46*side;
      const ey = hy + fwdY*R*0.38 + perpY*R*0.46*side;
      ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI*2);
      ctx.fillStyle = '#FFFFFF'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex + fwdX*(eyeR-pupilR), ey + fwdY*(eyeR-pupilR), pupilR, 0, Math.PI*2);
      ctx.fillStyle = '#060606'; ctx.fill();
    }

    // ── Labels ───────────────────────────────────────────────────────────────
    ctx.textAlign = 'center';
    if (name) {
      const fs = Math.round(R * 1.1);
      ctx.font = `bold ${fs}px Segoe UI`;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = fs * 0.18;
      ctx.strokeText(name, hx, hy - R*2.5);
      ctx.fillStyle = isMe ? '#ffe066' : '#fff';
      ctx.fillText(name, hx, hy - R*2.5);
    }
    if (snake.worth > 0) {
      const rate = typeof solCadRate !== 'undefined' ? solCadRate : 200;
      const cadVal = (snake.worth * rate).toFixed(2);
      const wfs = Math.round(R * 1.0);
      ctx.font = `bold ${wfs}px Segoe UI`;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = wfs * 0.18;
      ctx.strokeText(`C$${cadVal}`, hx, hy - R*(name ? 3.8 : 2.5));
      ctx.fillStyle = '#14F195';
      ctx.fillText(`C$${cadVal}`, hx, hy - R*(name ? 3.8 : 2.5));
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
