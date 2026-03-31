class HexGrid {
  constructor() {
    this.R = 42;
    this.GAP = 5;
    this.INNER_R = this.R - this.GAP;
    this.COL_STEP = this.R * 1.5;
    this.ROW_STEP = Math.sqrt(3) * this.R;
    this.OUTER_V = this._buildVerts(this.R, 0);
    this.INNER_V = this._buildVerts(this.INNER_R, 0);
  }

  _buildVerts(r, offset) {
    const v = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + offset;
      v.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
    return v;
  }

  _path(ctx, verts, cx, cy) {
    ctx.beginPath();
    ctx.moveTo(cx + verts[0].x, cy + verts[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(cx + verts[i].x, cy + verts[i].y);
    ctx.closePath();
  }

  _drawOne(ctx, cx, cy) {
    const { OUTER_V, INNER_V, INNER_R, GAP } = this;

    // Gap fill
    this._path(ctx, OUTER_V, cx, cy);
    ctx.fillStyle = '#03080f';
    ctx.fill();

    // Base face
    this._path(ctx, INNER_V, cx, cy);
    ctx.fillStyle = '#0b1929';
    ctx.fill();

    // Radial gradient
    const gx = cx - INNER_R * 0.3;
    const gy = cy - INNER_R * 0.3;
    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, INNER_R * 1.6);
    grad.addColorStop(0,    'rgba(25, 65, 110, 0.85)');
    grad.addColorStop(0.45, 'rgba(12, 28,  55, 0.6)');
    grad.addColorStop(1,    'rgba(0,   0,   0, 0.75)');
    this._path(ctx, INNER_V, cx, cy);
    ctx.fillStyle = grad;
    ctx.fill();

    // Bottom-right shadow
    ctx.save();
    this._path(ctx, INNER_V, cx, cy);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(cx + INNER_V[1].x, cy + INNER_V[1].y);
    ctx.lineTo(cx + INNER_V[2].x, cy + INNER_V[2].y);
    ctx.lineTo(cx + INNER_V[3].x, cy + INNER_V[3].y);
    ctx.lineTo(cx + INNER_V[4].x, cy + INNER_V[4].y);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = GAP * 2;
    ctx.stroke();
    ctx.restore();

    // Top-left highlight
    ctx.save();
    this._path(ctx, INNER_V, cx, cy);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(cx + INNER_V[4].x, cy + INNER_V[4].y);
    ctx.lineTo(cx + INNER_V[5].x, cy + INNER_V[5].y);
    ctx.lineTo(cx + INNER_V[0].x, cy + INNER_V[0].y);
    ctx.lineTo(cx + INNER_V[1].x, cy + INNER_V[1].y);
    ctx.strokeStyle = 'rgba(80, 140, 220, 0.13)';
    ctx.lineWidth = GAP * 2;
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx, camera, worldRadius) {
    const { COL_STEP, ROW_STEP } = this;
    const { x: camX, y: camY, scale } = camera;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;

    // Camera transform is already applied to ctx, so we work in world space.
    // Convert screen corners to world coords to find which tiles are visible.
    const halfW = W / (2 * scale);
    const halfH = H / (2 * scale);
    // World-space center of screen
    const worldCX = (W / 2 - camX) / scale;
    const worldCY = (H / 2 - camY) / scale;

    const left   = worldCX - halfW;
    const right  = worldCX + halfW;
    const top    = worldCY - halfH;
    const bottom = worldCY + halfH;

    const colStart = Math.floor(left   / COL_STEP) - 1;
    const colEnd   = Math.ceil (right  / COL_STEP) + 1;
    const rowStart = Math.floor(top    / ROW_STEP) - 1;
    const rowEnd   = Math.ceil (bottom / ROW_STEP) + 1;

    for (let col = colStart; col <= colEnd; col++) {
      for (let row = rowStart; row <= rowEnd; row++) {
        const cx = col * COL_STEP;
        const cy = row * ROW_STEP + (col % 2 === 0 ? 0 : ROW_STEP / 2);
        const dist = Math.sqrt(cx * cx + cy * cy);
        if (dist > worldRadius + this.R * 2) continue;
        this._drawOne(ctx, cx, cy);
      }
    }
  }
}
