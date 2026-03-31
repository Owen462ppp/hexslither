class HexGrid {
  constructor(hexRadius) {
    this.hexRadius = hexRadius || CONSTANTS.HEX_RADIUS;
    this.colSpacing = this.hexRadius * 1.5;
    this.rowSpacing = this.hexRadius * Math.sqrt(3);
    this._path = this._buildHexPath();
  }

  _buildHexPath() {
    // Pre-compute unit hex vertices (centered at 0,0)
    const verts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      verts.push({ x: this.hexRadius * Math.cos(a), y: this.hexRadius * Math.sin(a) });
    }
    return verts;
  }

  draw(ctx, camera, worldRadius) {
    const verts = this._path;
    const { x: cx, y: cy, scale } = camera;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;

    // Viewport bounds in world space
    const left   = -cx / scale - W / (2 * scale);
    const right  = -cx / scale + W / (2 * scale);
    const top    = -cy / scale - H / (2 * scale);
    const bottom = -cy / scale + H / (2 * scale);

    const colStart = Math.floor(left / this.colSpacing) - 1;
    const colEnd   = Math.ceil(right / this.colSpacing) + 1;
    const rowStart = Math.floor(top / this.rowSpacing) - 1;
    const rowEnd   = Math.ceil(bottom / this.rowSpacing) + 1;

    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = 'rgba(40, 180, 255, 0.18)';
    ctx.fillStyle = 'rgba(10, 14, 40, 0.5)';

    for (let c = colStart; c <= colEnd; c++) {
      for (let r = rowStart; r <= rowEnd; r++) {
        const hx = c * this.colSpacing * 2;
        const hy = r * this.rowSpacing + (c % 2) * this.rowSpacing / 2;

        // Cull outside the world circle with a little padding
        const dist = Math.sqrt(hx * hx + hy * hy);
        if (dist > worldRadius + this.hexRadius * 2) continue;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const vx = hx + verts[i].x;
          const vy = hy + verts[i].y;
          i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }
}
