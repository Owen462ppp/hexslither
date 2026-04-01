class HexGrid {
  constructor() {
    this.R = 42;
    this.GAP = 5;
    this.INNER_R = this.R - this.GAP;
    this.COL_STEP = this.R * 1.5;
    this.ROW_STEP = Math.sqrt(3) * this.R;
    this.OUTER_V = this._buildVerts(this.R);
    this.INNER_V = this._buildVerts(this.INNER_R);

    // Offscreen cache
    this._cache = document.createElement('canvas');
    this._cacheCtx = this._cache.getContext('2d');
    this._cacheWorldX = null;
    this._cacheWorldY = null;
    this._cacheScale  = null;
    this._REDRAW_THRESHOLD = 80; // redraw when camera moves >80 world units
  }

  _buildVerts(r) {
    const v = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      v.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
    return v;
  }

  _hexPath(ctx, verts, cx, cy) {
    ctx.beginPath();
    ctx.moveTo(cx + verts[0].x, cy + verts[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(cx + verts[i].x, cy + verts[i].y);
    ctx.closePath();
  }

  _drawOne(ctx, cx, cy) {
    const { OUTER_V: OV, INNER_V: IV, INNER_R, GAP } = this;

    this._hexPath(ctx, OV, cx, cy);
    ctx.fillStyle = '#03080f';
    ctx.fill();

    this._hexPath(ctx, IV, cx, cy);
    ctx.fillStyle = '#0b1929';
    ctx.fill();

    const gx = cx - INNER_R * 0.3, gy = cy - INNER_R * 0.3;
    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, INNER_R * 1.6);
    grad.addColorStop(0,    'rgba(25,65,110,0.85)');
    grad.addColorStop(0.45, 'rgba(12,28,55,0.6)');
    grad.addColorStop(1,    'rgba(0,0,0,0.75)');
    this._hexPath(ctx, IV, cx, cy);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.save();
    this._hexPath(ctx, IV, cx, cy);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(cx+IV[1].x, cy+IV[1].y); ctx.lineTo(cx+IV[2].x, cy+IV[2].y);
    ctx.lineTo(cx+IV[3].x, cy+IV[3].y); ctx.lineTo(cx+IV[4].x, cy+IV[4].y);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = GAP * 2; ctx.stroke();
    ctx.restore();

    ctx.save();
    this._hexPath(ctx, IV, cx, cy);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(cx+IV[4].x, cy+IV[4].y); ctx.lineTo(cx+IV[5].x, cy+IV[5].y);
    ctx.lineTo(cx+IV[0].x, cy+IV[0].y); ctx.lineTo(cx+IV[1].x, cy+IV[1].y);
    ctx.strokeStyle = 'rgba(80,140,220,0.13)'; ctx.lineWidth = GAP * 2; ctx.stroke();
    ctx.restore();
  }

  _rebuildCache(worldCX, worldCY, scale, screenW, screenH, worldRadius) {
    const cc = this._cache;
    const ctx = this._cacheCtx;
    // Cache is 2x screen size so we can pan without redrawing
    cc.width  = screenW  * 2;
    cc.height = screenH * 2;

    ctx.fillStyle = '#03080f';
    ctx.fillRect(0, 0, cc.width, cc.height);

    // Apply camera transform centered in the cache canvas
    ctx.setTransform(scale, 0, 0, scale, cc.width/2 - worldCX * scale, cc.height/2 - worldCY * scale);

    const halfW = cc.width  / (2 * scale);
    const halfH = cc.height / (2 * scale);
    const left   = worldCX - halfW, right  = worldCX + halfW;
    const top    = worldCY - halfH, bottom = worldCY + halfH;

    const colStart = Math.floor(left   / this.COL_STEP) - 1;
    const colEnd   = Math.ceil (right  / this.COL_STEP) + 1;
    const rowStart = Math.floor(top    / this.ROW_STEP) - 1;
    const rowEnd   = Math.ceil (bottom / this.ROW_STEP) + 1;

    for (let col = colStart; col <= colEnd; col++) {
      for (let row = rowStart; row <= rowEnd; row++) {
        const cx = col * this.COL_STEP;
        const cy = row * this.ROW_STEP + (col % 2 === 0 ? 0 : this.ROW_STEP / 2);
        if (Math.sqrt(cx*cx + cy*cy) > worldRadius + this.R * 2) continue;
        this._drawOne(ctx, cx, cy);
      }
    }
    ctx.setTransform(1,0,0,1,0,0);

    this._cacheWorldX = worldCX;
    this._cacheWorldY = worldCY;
    this._cacheScale  = scale;
  }

  draw(ctx, camera, worldRadius) {
    const { x: camX, y: camY, scale } = camera;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const worldCX = (W/2 - camX) / scale;
    const worldCY = (H/2 - camY) / scale;

    // Rebuild cache if camera moved too far or scale changed
    const needsRebuild = this._cacheWorldX === null
      || Math.abs(worldCX - this._cacheWorldX) > this._REDRAW_THRESHOLD
      || Math.abs(worldCY - this._cacheWorldY) > this._REDRAW_THRESHOLD
      || Math.abs(scale   - this._cacheScale)  > 0.05;

    if (needsRebuild) {
      this._rebuildCache(worldCX, worldCY, scale, W, H, worldRadius);
    }

    // Blit the cached canvas: offset it by how much the camera has panned since last rebuild
    const dx = (worldCX - this._cacheWorldX) * scale;
    const dy = (worldCY - this._cacheWorldY) * scale;
    const cc = this._cache;

    // Reset transform to draw the cache image directly to screen
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.drawImage(cc, -cc.width/2 + W/2 - dx, -cc.height/2 + H/2 - dy);
    ctx.restore();
  }
}
