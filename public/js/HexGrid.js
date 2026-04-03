class HexGrid {
  constructor() {
    this.R = 42;
    this.GAP = 3;
    this.INNER_R = this.R - this.GAP;
    this.COL_STEP = this.R * 1.5;
    this.ROW_STEP = Math.sqrt(3) * this.R;
    this.OUTER_V = this._buildVerts(this.R);
    this.INNER_V = this._buildVerts(this.INNER_R);

    this._cache        = document.createElement('canvas');
    this._cacheCtx     = this._cache.getContext('2d');
    this._cacheWorldX  = null;
    this._cacheWorldY  = null;
    this._cacheScale   = null;
    this._MOVE_THRESH  = 120;
  }

  _buildVerts(r) {
    const v = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      v.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
    return v;
  }

  // Draw one hex — no save/restore/clip, just paths
  _drawOne(ctx, cx, cy) {
    const IV = this.INNER_V;

    // Gap fill (background colour)
    ctx.beginPath();
    ctx.moveTo(cx + this.OUTER_V[0].x, cy + this.OUTER_V[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(cx + this.OUTER_V[i].x, cy + this.OUTER_V[i].y);
    ctx.closePath();
    ctx.fillStyle = '#03080f';
    ctx.fill();

    // Hex face — flat dark colour, no gradient
    ctx.beginPath();
    ctx.moveTo(cx + IV[0].x, cy + IV[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(cx + IV[i].x, cy + IV[i].y);
    ctx.closePath();
    ctx.fillStyle = '#0b1a2e';
    ctx.fill();

    // Single top-left highlight stroke (no clip needed)
    ctx.beginPath();
    ctx.moveTo(cx + IV[4].x, cy + IV[4].y);
    ctx.lineTo(cx + IV[5].x, cy + IV[5].y);
    ctx.lineTo(cx + IV[0].x, cy + IV[0].y);
    ctx.lineTo(cx + IV[1].x, cy + IV[1].y);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Bottom-right shadow stroke
    ctx.beginPath();
    ctx.moveTo(cx + IV[1].x, cy + IV[1].y);
    ctx.lineTo(cx + IV[2].x, cy + IV[2].y);
    ctx.lineTo(cx + IV[3].x, cy + IV[3].y);
    ctx.lineTo(cx + IV[4].x, cy + IV[4].y);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  _rebuildCache(worldCX, worldCY, scale, screenW, screenH, worldRadius) {
    const cc = this._cache;
    const ctx = this._cacheCtx;
    cc.width  = screenW  * 2;
    cc.height = screenH * 2;

    ctx.fillStyle = '#03080f';
    ctx.fillRect(0, 0, cc.width, cc.height);

    ctx.setTransform(scale, 0, 0, scale,
      cc.width  / 2 - worldCX * scale,
      cc.height / 2 - worldCY * scale);

    const halfW = cc.width  / (2 * scale);
    const halfH = cc.height / (2 * scale);

    const colStart = Math.floor((worldCX - halfW) / this.COL_STEP) - 1;
    const colEnd   = Math.ceil ((worldCX + halfW) / this.COL_STEP) + 1;
    const rowStart = Math.floor((worldCY - halfH) / this.ROW_STEP) - 1;
    const rowEnd   = Math.ceil ((worldCY + halfH) / this.ROW_STEP) + 1;

    for (let col = colStart; col <= colEnd; col++) {
      for (let row = rowStart; row <= rowEnd; row++) {
        const cx = col * this.COL_STEP;
        const cy = row * this.ROW_STEP + (col % 2 === 0 ? 0 : this.ROW_STEP / 2);
        this._drawOne(ctx, cx, cy);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    this._cacheWorldX = worldCX;
    this._cacheWorldY = worldCY;
    this._cacheScale  = scale;
  }

  draw(ctx, camera, worldRadius) {
    const { x: camX, y: camY, scale } = camera;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const worldCX = (W / 2 - camX) / scale;
    const worldCY = (H / 2 - camY) / scale;

    const needsRebuild =
      this._cacheWorldX === null ||
      Math.abs(worldCX - this._cacheWorldX) > this._MOVE_THRESH ||
      Math.abs(worldCY - this._cacheWorldY) > this._MOVE_THRESH ||
      Math.abs(scale   - this._cacheScale)  > 0.05;

    if (needsRebuild) this._rebuildCache(worldCX, worldCY, scale, W, H, worldRadius);

    const dx = (worldCX - this._cacheWorldX) * scale;
    const dy = (worldCY - this._cacheWorldY) * scale;
    const cc = this._cache;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cc, -cc.width / 2 + W / 2 - dx, -cc.height / 2 + H / 2 - dy);
    ctx.restore();
  }
}
