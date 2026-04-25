class Camera {
  constructor() {
    this.x = 0;      // canvas translation x (pixels)
    this.y = 0;      // canvas translation y (pixels)
    this.scale = 1;
    this.targetX = 0;
    this.targetY = 0;
    this.targetScale = 1;
    this.LERP = 0.5;
  }

  follow(worldX, worldY, canvasW, canvasH) {
    this.targetX = canvasW / 2 - worldX * this.scale;
    this.targetY = canvasH / 2 - worldY * this.scale;
  }

  setScale(worldRadius, canvasW, canvasH, snakeLength) {
    // Start very zoomed in, zoom out as snake grows
    const base = Math.min(canvasW, canvasH) / (worldRadius * 0.22);
    const lengthFactor = 1 - Math.min(0.75, (snakeLength || 0) / 600);
    this.targetScale = Math.max(0.15, Math.min(2.5, base * lengthFactor));
  }

  update() {
    this.scale += (this.targetScale - this.scale) * 0.02;
    this.x += (this.targetX - this.x) * this.LERP;
    this.y += (this.targetY - this.y) * this.LERP;
  }

  apply(ctx) {
    ctx.setTransform(this.scale, 0, 0, this.scale, this.x, this.y);
  }

  reset(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Convert screen coords to world coords
  screenToWorld(sx, sy, canvasW, canvasH) {
    return {
      x: (sx - this.x) / this.scale,
      y: (sy - this.y) / this.scale,
    };
  }
}
