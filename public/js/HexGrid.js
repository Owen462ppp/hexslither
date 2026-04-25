class HexGrid {
  constructor() {
    this.SIZE      = 28;
    this.GAP       = 14.6;
    this.FACE_R    = this.SIZE - this.GAP / 2;          // ~40.7
    this.COL_STEP  = Math.sqrt(3) * this.SIZE + this.GAP; // ~97.7
    this.ROW_STEP  = 1.5 * this.SIZE + Math.sqrt(3) / 2 * this.GAP; // ~84.6

    this._cache        = document.createElement('canvas');
    this._cacheCtx     = this._cache.getContext('2d');
    this._cacheWorldX  = null;
    this._cacheWorldY  = null;
    this._cacheScale   = null;
    this._MOVE_THRESH  = 200;
  }

  _hexPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + Math.PI / 6;
      ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
    ctx.closePath();
  }

  _drawOne(ctx, cx, cy) {
    const s = this.SIZE, fr = this.FACE_R;

    // Main face — dark gradient
    this._hexPath(ctx, cx, cy, fr);
    const face = ctx.createLinearGradient(
      cx + s * 0.65, cy - s * 0.65,
      cx - s * 0.65, cy + s * 0.65
    );
    face.addColorStop(0,    '#181818');
    face.addColorStop(0.25, '#101010');
    face.addColorStop(0.6,  '#0b0b0b');
    face.addColorStop(1,    '#050505');
    ctx.fillStyle = face;
    ctx.fill();

    // Rim shading
    this._hexPath(ctx, cx, cy, fr);
    const rim = ctx.createLinearGradient(
      cx + s * 0.55, cy - s * 0.55,
      cx - s * 0.55, cy + s * 0.55
    );
    rim.addColorStop(0,    'rgba(45,45,45,0.15)');
    rim.addColorStop(0.45, 'rgba(0,0,0,0)');
    rim.addColorStop(1,    'rgba(0,0,0,0.55)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = s * 0.055;
    ctx.stroke();

    // Outline
    this._hexPath(ctx, cx, cy, fr);
    ctx.strokeStyle = 'rgba(1,1,1,0.95)';
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  _rebuildCache(worldCX, worldCY, scale, screenW, screenH) {
    const cc  = this._cache;
    const ctx = this._cacheCtx;
    cc.width  = screenW  * 2;
    cc.height = screenH * 2;

    ctx.fillStyle = '#070707';
    ctx.fillRect(0, 0, cc.width, cc.height);

    const TILT = -0.285;
    const cosT = Math.cos(TILT), sinT = Math.sin(TILT);
    ctx.setTransform(
      scale * cosT,  scale * sinT,
      -scale * sinT, scale * cosT,
      cc.width  / 2 - worldCX * scale,
      cc.height / 2 - worldCY * scale
    );

    const halfW = cc.width  / (2 * scale);
    const halfH = cc.height / (2 * scale);

    const rowStart = Math.floor((worldCY - halfH) / this.ROW_STEP) - 4;
    const rowEnd   = Math.ceil ((worldCY + halfH) / this.ROW_STEP) + 4;
    const colStart = Math.floor((worldCX - halfW) / this.COL_STEP) - 4;
    const colEnd   = Math.ceil ((worldCX + halfW) / this.COL_STEP) + 4;

    for (let row = rowStart; row <= rowEnd; row++) {
      for (let col = colStart; col <= colEnd; col++) {
        const cx = col * this.COL_STEP + (Math.abs(row % 2) === 1 ? this.COL_STEP / 2 : 0);
        const cy = row * this.ROW_STEP;
        this._drawOne(ctx, cx, cy);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    this._cacheWorldX = worldCX;
    this._cacheWorldY = worldCY;
    this._cacheScale  = scale;
  }

  draw(ctx, camera) {
    const { x: camX, y: camY, scale } = camera;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const worldCX = (W / 2 - camX) / scale;
    const worldCY = (H / 2 - camY) / scale;

    const needsRebuild =
      this._cacheWorldX === null ||
      Math.abs(worldCX - this._cacheWorldX) > this._MOVE_THRESH ||
      Math.abs(worldCY - this._cacheWorldY) > this._MOVE_THRESH ||
      Math.abs(scale   - this._cacheScale)  > 0.1;

    if (needsRebuild) this._rebuildCache(worldCX, worldCY, scale, W, H);

    const dx = (worldCX - this._cacheWorldX) * scale;
    const dy = (worldCY - this._cacheWorldY) * scale;
    const cc = this._cache;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070707';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(cc, -cc.width / 2 + W / 2 - dx, -cc.height / 2 + H / 2 - dy);
    ctx.restore();
  }
}
