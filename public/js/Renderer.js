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
    this._mousePos = mousePos;
    this._canvasW = W;
    this._canvasH = H;

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
    // Viewport bounds in world space (with margin for snake body radius)
    const margin = 300;
    const visL = (-camera.x) / camera.scale - margin;
    const visR = (W - camera.x) / camera.scale + margin;
    const visT = (-camera.y) / camera.scale - margin;
    const visB = (H - camera.y) / camera.scale + margin;
    for (const snake of state.snakes) {
      if (snake.id === myId) continue;
      const hx = snake.segs && snake.segs[0], hy = snake.segs && snake.segs[1];
      if (hx < visL || hx > visR || hy < visT || hy > visB) continue; // off-screen
      this._drawSnake(ctx, snake, false);
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

    const t = Date.now() / 1000;
    for (const f of food) {
      if (Math.abs(f.x - worldCX) > halfW || Math.abs(f.y - worldCY) > halfH) continue;

      const r = BASE_R * (f.size || 1);
      // Hash string ID to a stable float so each orb floats at a unique phase
      const idStr = String(f.id);
      let hash = 0;
      for (let i = 0; i < idStr.length; i++) hash = (hash * 31 + idStr.charCodeAt(i)) & 0xffff;
      const phase = hash * 0.00038; // maps 0-65535 → 0-~25 radians
      const amp = hash % 100 < 80 ? 7 : 0; // 80% of orbs hover, 20% stay still
      const wx = f.x + Math.sin(t * 1.4 + phase) * amp;
      const wy = f.y + Math.cos(t * 1.1 + phase * 1.3) * amp;

      const isDeath = f.size >= 3;

      if (f.isGolden) {
        // Outer glow
        const glow = ctx.createRadialGradient(wx, wy, r * 0.4, wx, wy, r * 2.2);
        glow.addColorStop(0, 'rgba(255,215,0,0.35)');
        glow.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.beginPath();
        ctx.arc(wx, wy, r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Core golden orb
        const grad = ctx.createRadialGradient(wx - r * 0.3, wy - r * 0.3, r * 0.1, wx, wy, r);
        grad.addColorStop(0, '#FFFACD');
        grad.addColorStop(0.4, '#FFD700');
        grad.addColorStop(1, '#B8860B');
        ctx.beginPath();
        ctx.arc(wx, wy, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Gold outline
        ctx.beginPath();
        ctx.arc(wx, wy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,165,0,0.9)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Glint
        ctx.beginPath();
        ctx.arc(wx - r * 0.28, wy - r * 0.28, r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fill();
      } else {
        // Core orb — solid base color
        ctx.beginPath();
        ctx.arc(wx, wy, r, 0, Math.PI * 2);
        ctx.fillStyle = f.color;
        ctx.fill();

        // Dark radial overlay: transparent center → dark edge
        const darkOverlay = ctx.createRadialGradient(wx, wy, 0, wx, wy, r);
        darkOverlay.addColorStop(0, 'rgba(0,0,0,0)');
        darkOverlay.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.beginPath();
        ctx.arc(wx, wy, r, 0, Math.PI * 2);
        ctx.fillStyle = darkOverlay;
        ctx.fill();

        // Thin black outline
        ctx.beginPath();
        ctx.arc(wx, wy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      // Additive glow for death orbs — overlapping orbs naturally compound and light up
      if (isDeath) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glowR = r * 2.5;
        const glow = ctx.createRadialGradient(wx, wy, 0, wx, wy, glowR);
        glow.addColorStop(0, f.color + 'aa'); // semi-opaque centre
        glow.addColorStop(0.4, f.color + '44');
        glow.addColorStop(1, f.color + '00');
        ctx.beginPath();
        ctx.arc(wx, wy, glowR, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  _drawSnake(ctx, snake, isMe) {
    if (!snake.segs || snake.segs.length < 4) return;
    const { segs, color, boosting, name } = snake;

    const growthScale = 1 + Math.min(1.5, (snake.length || 20) / 200);
    const R  = CONSTANTS.SNAKE_HEAD_RADIUS * growthScale;
    const HR = R; // same radius as body so head is flush
    const SN = segs.length >> 1; // number of (x,y) pairs

    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    const STEPS = 4;
    const CHUNK = 4;
    const CREASE_SPACING = R * 1.76;
    const PASSES = 15;
    const ARC_SEGS = 8;

    function taperedArc(cx, cy, fwdAngle, r, baseAlpha, lw) {
      for (let s = 0; s < ARC_SEGS; s++) {
        const t0 = s / ARC_SEGS, t1 = (s + 1) / ARC_SEGS;
        const taper = Math.sin((t0 + t1) / 2 * Math.PI);
        ctx.beginPath();
        ctx.arc(cx, cy, r,
          fwdAngle + Math.PI * 0.5 + t0 * Math.PI,
          fwdAngle + Math.PI * 0.5 + t1 * Math.PI,
          false);
        ctx.strokeStyle = `rgba(0,0,0,${baseAlpha * taper})`;
        ctx.lineWidth   = lw;
        ctx.lineCap     = 'butt';
        ctx.stroke();
      }
    }

    // Pre-compute crease positions so we can draw them per-chunk
    const creaseAngles = new Array(SN).fill(null);
    let dist = -R * 0.35;
    for (let si = 1; si < SN - 1; si++) {
      const dx = segs[si*2] - segs[(si-1)*2];
      const dy = segs[si*2+1] - segs[(si-1)*2+1];
      dist += Math.sqrt(dx*dx + dy*dy);
      if (dist < CREASE_SPACING) continue;
      dist -= CREASE_SPACING;
      const pi = Math.max(0, si - 2);
      const ni = Math.min(SN - 1, si + 2);
      creaseAngles[si] = Math.atan2(segs[pi*2+1] - segs[ni*2+1], segs[pi*2] - segs[ni*2]);
    }

    // ── Draw chunks tail→head: body stroke THEN creases for each chunk ────────
    // Creases are drawn immediately after their chunk's body so head-side chunks
    // fully cover tail-side body+creases — no texture bleeding at crossings.
    for (let end = SN - 1; end > 0; end -= CHUNK) {
      const start = Math.max(0, end - CHUNK);

      // Body stroke for this chunk (reset lineCap — taperedArc sets it to 'butt')
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(segs[end * 2], segs[end * 2 + 1]);
      for (let j = end - 1; j >= start; j--) {
        const pi = Math.min(SN - 1, j + 2) * 2;
        const ai = (j + 1) * 2;
        const bi = j * 2;
        const ni = Math.max(0, j - 1) * 2;
        for (let s = 1; s <= STEPS; s++) {
          const t = s / STEPS, t2 = t * t, t3 = t2 * t;
          ctx.lineTo(
            0.5 * ((2*segs[ai])   + (-segs[pi]   + segs[bi])   * t + (2*segs[pi]   - 5*segs[ai]   + 4*segs[bi]   - segs[ni])   * t2 + (-segs[pi]   + 3*segs[ai]   - 3*segs[bi]   + segs[ni])   * t3),
            0.5 * ((2*segs[ai+1]) + (-segs[pi+1] + segs[bi+1]) * t + (2*segs[pi+1] - 5*segs[ai+1] + 4*segs[bi+1] - segs[ni+1]) * t2 + (-segs[pi+1] + 3*segs[ai+1] - 3*segs[bi+1] + segs[ni+1]) * t3)
          );
        }
      }
      ctx.lineWidth   = R * 2;
      ctx.strokeStyle = color;
      ctx.stroke();

      // Crease marks for segments in this chunk (drawn immediately after body)
      for (let si = end; si >= start; si--) {
        if (creaseAngles[si] === null) continue;
        const cx = segs[si*2], cy = segs[si*2+1];
        for (let p = 0; p < PASSES; p++) {
          const t  = p / (PASSES - 1);
          const r  = R * (0.88 + t * 0.12);
          const lw = R * (0.50 * Math.pow(1 - t, 1.5) + 0.035);
          const a  = 0.001 + Math.pow(t, 2.5) * 0.042;
          taperedArc(cx, cy, creaseAngles[si], r, a, lw);
        }
      }
    }

    // ── Head ──────────────────────────────────────────────────────────────────
    const hx    = segs[0], hy = segs[1];
    const angle = snake.angle || 0;
    const fwdX  = Math.cos(angle), fwdY  = Math.sin(angle);
    const perpX = -Math.sin(angle), perpY = Math.cos(angle);

    ctx.beginPath();
    ctx.arc(hx, hy, HR, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Head crease — same tapered arc centred on head, using snake.angle
    for (let p = 0; p < PASSES; p++) {
      const t  = p / (PASSES - 1);
      const r  = HR * (0.88 + t * 0.12);
      const lw = HR * (0.50 * Math.pow(1 - t, 1.5) + 0.035);
      const a  = 0.001 + Math.pow(t, 2.5) * 0.042;
      taperedArc(hx, hy, angle, r, a, lw);
    }

    // ── Eyes ──────────────────────────────────────────────────────────────────
    const eyeR    = HR * 0.40;
    const pupilR  = eyeR * 0.54;
    const eyeSide = HR * 0.46;
    const eyeFwd  = HR * 0.38;

    // Pupils follow mouse for local player, movement direction for others
    let pupilFwdX = fwdX, pupilFwdY = fwdY;
    if (isMe && this._mousePos) {
      const wm = this.camera.screenToWorld(this._mousePos.x, this._mousePos.y, this._canvasW, this._canvasH);
      const pa = Math.atan2(wm.y - hy, wm.x - hx);
      pupilFwdX = Math.cos(pa);
      pupilFwdY = Math.sin(pa);
    }

    for (const side of [-1, 1]) {
      const ex = hx + fwdX * eyeFwd + perpX * eyeSide * side;
      const ey = hy + fwdY * eyeFwd + perpY * eyeSide * side;
      ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF'; ctx.fill();
      const ps = eyeR - pupilR;
      ctx.beginPath(); ctx.arc(ex + pupilFwdX * ps, ey + pupilFwdY * ps, pupilR, 0, Math.PI * 2);
      ctx.fillStyle = '#060606'; ctx.fill();
    }

    // ── Labels ────────────────────────────────────────────────────────────────
    ctx.textAlign = 'center';
    if (name) {
      const fs = Math.round(R * 1.1);
      ctx.font = `bold ${fs}px Segoe UI`;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = fs * 0.18;
      ctx.strokeText(name, hx, hy - HR * 2.5);
      ctx.fillStyle = isMe ? '#ffe066' : '#fff';
      ctx.fillText(name, hx, hy - HR * 2.5);
    }
    if (snake.worth > 0) {
      const rate = typeof solCadRate !== 'undefined' ? solCadRate : 200;
      const cadVal = (snake.worth * rate).toFixed(2);
      const wfs = Math.round(R * 1.0);
      ctx.font = `bold ${wfs}px Segoe UI`;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = wfs * 0.18;
      ctx.strokeText(`C$${cadVal}`, hx, hy - HR * (name ? 3.8 : 2.5));
      ctx.fillStyle = '#14F195';
      ctx.fillText(`C$${cadVal}`, hx, hy - HR * (name ? 3.8 : 2.5));
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
