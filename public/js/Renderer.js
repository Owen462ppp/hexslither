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
    const BW = R * 2;
    const HR = R * 1.15;

    // Blend helper — mix hex color toward black or white
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

    const dark1 = blend(color, '#000000', 0.55); // deep shadow
    const dark2 = blend(color, '#000000', 0.30); // mid shadow
    const light1 = blend(color, '#ffffff', 0.30); // upper light
    const light2 = blend(color, '#ffffff', 0.70); // bright highlight
    const spec   = blend(color, '#ffffff', 0.90); // specular

    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    function strokeBody(lw, style, alpha) {
      ctx.globalAlpha = alpha !== undefined ? alpha : 1;
      ctx.beginPath();
      ctx.moveTo(segs[0], segs[1]);
      for (let i = 2; i < segs.length; i += 2) ctx.lineTo(segs[i], segs[i + 1]);
      ctx.strokeStyle = style;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── Body layers — bottom to top ──────────────────────────────────────────
    if (boosting) strokeBody(BW * 1.22, 'rgba(255,255,255,0.13)');
    strokeBody(BW,        dark1);          // 1. dark outer shadow
    strokeBody(BW * 0.90, color);          // 2. base color
    strokeBody(BW * 0.68, dark2);          // 3. lower-half shadow
    strokeBody(BW * 0.48, color);          // 4. restore mid color
    strokeBody(BW * 0.34, light1);         // 5. upper-half light
    strokeBody(BW * 0.20, light2);         // 6. highlight stripe
    strokeBody(BW * 0.08, spec, 0.75);     // 7. specular

    // ── Segment creases ──────────────────────────────────────────────────────
    const ringSpacing = BW * 0.95;
    let dist = 0;
    for (let i = 2; i < segs.length - 2; i += 2) {
      const dx = segs[i] - segs[i-2], dy = segs[i+1] - segs[i-1];
      dist += Math.sqrt(dx*dx + dy*dy);
      if (dist >= ringSpacing) {
        dist -= ringSpacing;
        const ax = segs[i+2] - segs[i-2], ay = segs[i+3] - segs[i-1];
        const al = Math.sqrt(ax*ax + ay*ay) || 1;
        const px = -ay/al, py = ax/al;
        const hw = BW * 0.46;
        // Dark crease line
        ctx.beginPath();
        ctx.moveTo(segs[i] + px*hw, segs[i+1] + py*hw);
        ctx.lineTo(segs[i] - px*hw, segs[i+1] - py*hw);
        ctx.strokeStyle = dark1;
        ctx.lineWidth = BW * 0.14;
        ctx.globalAlpha = 0.60;
        ctx.stroke();
        // Thin light rim just below crease — gives depth
        ctx.beginPath();
        ctx.moveTo(segs[i] + px*hw*0.85, segs[i+1] + py*hw*0.85);
        ctx.lineTo(segs[i] - px*hw*0.85, segs[i+1] - py*hw*0.85);
        ctx.strokeStyle = light1;
        ctx.lineWidth = BW * 0.05;
        ctx.globalAlpha = 0.30;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // ── Head ─────────────────────────────────────────────────────────────────
    const hx = segs[0], hy = segs[1];
    const angle = snake.angle || 0;
    const fwdX = Math.cos(angle), fwdY = Math.sin(angle);
    const perpX = -Math.sin(angle), perpY = Math.cos(angle);

    // Shadow base
    ctx.beginPath(); ctx.arc(hx, hy, HR, 0, Math.PI*2);
    ctx.fillStyle = dark1; ctx.fill();
    // Main color
    ctx.beginPath(); ctx.arc(hx, hy, HR*0.93, 0, Math.PI*2);
    ctx.fillStyle = color; ctx.fill();
    // Lower shadow
    ctx.beginPath(); ctx.arc(hx, hy, HR*0.93, 0, Math.PI*2);
    ctx.fillStyle = dark2; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
    // Upper light blob
    ctx.beginPath(); ctx.arc(hx - fwdX*HR*0.08 - perpX*HR*0.05, hy - fwdY*HR*0.08 - perpY*HR*0.05, HR*0.60, 0, Math.PI*2);
    ctx.fillStyle = light1; ctx.globalAlpha = 0.60; ctx.fill(); ctx.globalAlpha = 1;
    // Highlight
    ctx.beginPath(); ctx.arc(hx - fwdX*HR*0.12, hy - fwdY*HR*0.12, HR*0.35, 0, Math.PI*2);
    ctx.fillStyle = light2; ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1;
    // Specular
    ctx.beginPath(); ctx.arc(hx - fwdX*HR*0.16, hy - fwdY*HR*0.16, HR*0.14, 0, Math.PI*2);
    ctx.fillStyle = spec; ctx.globalAlpha = 0.65; ctx.fill(); ctx.globalAlpha = 1;

    if (boosting) {
      ctx.beginPath(); ctx.arc(hx, hy, HR+4, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2.5; ctx.stroke();
    }

    // ── Eyes ─────────────────────────────────────────────────────────────────
    const eyeSep = HR * 0.36;
    const eyeFwd = HR * 0.52;
    const eyeR   = HR * 0.40;

    for (const side of [-1, 1]) {
      const ex = hx + perpX*eyeSep*side + fwdX*eyeFwd;
      const ey = hy + perpY*eyeSep*side + fwdY*eyeFwd;

      // White sclera with slight shadow ring
      ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI*2);
      ctx.fillStyle = '#e8e8e8'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = eyeR*0.12; ctx.stroke();

      // Black pupil — slightly forward-biased
      ctx.beginPath(); ctx.arc(ex + fwdX*eyeR*0.18, ey + fwdY*eyeR*0.18, eyeR*0.52, 0, Math.PI*2);
      ctx.fillStyle = '#111'; ctx.fill();

      // Glint
      ctx.beginPath(); ctx.arc(ex - eyeR*0.14, ey - eyeR*0.18, eyeR*0.20, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
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
