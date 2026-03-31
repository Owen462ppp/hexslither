class HexGrid {
  constructor(hexRadius) {
    this.hexRadius = hexRadius || CONSTANTS.HEX_RADIUS;
    // Flat-top hexagons, tightly packed with tiny gap
    this.gap = 2;
    this.drawRadius = this.hexRadius - this.gap;
    this.colSpacing = this.hexRadius * 1.5;
    this.rowSpacing = this.hexRadius * Math.sqrt(3);
    this._verts = this._buildVerts(this.drawRadius);
  }

  _buildVerts(r) {
    const v = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      v.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
    return v;
  }

  _hexPath(ctx, hx, hy) {
    const v = this._verts;
    ctx.beginPath();
    ctx.moveTo(hx + v[0].x, hy + v[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(hx + v[i].x, hy + v[i].y);
    ctx.closePath();
  }

  draw(ctx, camera, worldRadius) {
    const { x: cx, y: cy, scale } = camera;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;

    const left   = -cx / scale - W / (2 * scale);
    const right  = -cx / scale + W / (2 * scale);
    const top    = -cy / scale - H / (2 * scale);
    const bottom = -cy / scale + H / (2 * scale);

    const colStart = Math.floor(left  / (this.colSpacing * 2)) - 1;
    const colEnd   = Math.ceil (right / (this.colSpacing * 2)) + 1;
    const rowStart = Math.floor(top    / this.rowSpacing) - 1;
    const rowEnd   = Math.ceil (bottom / this.rowSpacing) + 1;

    for (let c = colStart; c <= colEnd; c++) {
      for (let r = rowStart; r <= rowEnd; r++) {
        const hx = c * this.colSpacing * 2;
        const hy = r * this.rowSpacing + (c % 2) * this.rowSpacing / 2;

        const dist = Math.sqrt(hx * hx + hy * hy);
        if (dist > worldRadius + this.hexRadius * 2) continue;

        this._drawStyledHex(ctx, hx, hy, scale);
      }
    }
  }

  _drawStyledHex(ctx, hx, hy, scale) {
    const r = this.drawRadius;
    const v = this._verts;

    ctx.save();
    this._hexPath(ctx, hx, hy);

    // Base fill — dark navy
    ctx.fillStyle = '#0d1e35';
    ctx.fill();

    // Top-left highlight bevel (lighter edge on top 3 vertices)
    ctx.beginPath();
    ctx.moveTo(hx + v[5].x, hy + v[5].y); // top-right of top-left edge
    ctx.lineTo(hx + v[0].x, hy + v[0].y); // right
    ctx.lineTo(hx + v[1].x, hy + v[1].y); // bottom-right
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2 / (scale || 1);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(hx + v[2].x, hy + v[2].y);
    ctx.lineTo(hx + v[3].x, hy + v[3].y);
    ctx.lineTo(hx + v[4].x, hy + v[4].y);
    ctx.lineTo(hx + v[5].x, hy + v[5].y);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2 / (scale || 1);
    ctx.stroke();

    // Inner shadow — radial gradient for depth
    const grad = ctx.createRadialGradient(
      hx - r * 0.25, hy - r * 0.25, 0,
      hx, hy, r * 1.1
    );
    grad.addColorStop(0,   'rgba(30, 60, 100, 0.18)');
    grad.addColorStop(0.6, 'rgba(0,  0,  0,   0)');
    grad.addColorStop(1,   'rgba(0,  0,  0,   0.45)');

    this._hexPath(ctx, hx, hy);
    ctx.fillStyle = grad;
    ctx.fill();

    // Outer gap stroke (background colour — creates the separation)
    this._hexPath(ctx, hx, hy);
    ctx.strokeStyle = '#070f1c';
    ctx.lineWidth = this.gap * 2 / (scale || 1);
    ctx.stroke();

    ctx.restore();
  }

  // Static version for lobby canvas (no camera/world needed)
  drawStatic(ctx, W, H) {
    ctx.fillStyle = '#070f1c';
    ctx.fillRect(0, 0, W, H);

    const colSpacing = this.colSpacing * 2;
    const cols = Math.ceil(W / colSpacing) + 2;
    const rows = Math.ceil(H / this.rowSpacing) + 2;

    for (let c = -1; c < cols; c++) {
      for (let r = -1; r < rows; r++) {
        const hx = c * colSpacing;
        const hy = r * this.rowSpacing + (c % 2) * this.rowSpacing / 2;
        this._drawStyledHex(ctx, hx, hy, 1);
      }
    }
  }
}
