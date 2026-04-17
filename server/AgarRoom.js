'use strict';

const TICK_RATE      = 30;
const WORLD_BASE     = 6000;
const WORLD_PER_PLAYER = 800;
const WORLD_MAX      = 18000;
const FOOD_TARGET    = 1200;
const FOOD_RADIUS    = 8;
const FOOD_MASS      = 1;
const MIN_SPLIT_MASS = 36;
const MAX_CELLS      = 16;
const SPLIT_SPEED    = 650;
const MERGE_DELAY    = 12000;
const SPEED_BASE     = 1000; // divided by sqrt(maxCellMass)
const EAT_RATIO      = 1.25;

const FOOD_COLORS = [
  '#f87171','#fb923c','#fbbf24','#4ade80',
  '#34d399','#60a5fa','#a78bfa','#f472b6',
  '#2dd4bf','#e879f9','#f97316','#84cc16',
];

let _foodIdSeq = 1;

class AgarRoom {
  constructor(io, roomName) {
    this.io        = io;
    this.roomName  = roomName;
    this.players   = new Map(); // socketId → player
    this.foods     = new Map(); // foodId → food
    this.worldSize = WORLD_BASE;
    this._addedFoods   = [];
    this._removedFoods = [];
    this._interval     = null;
    this._lastTick     = Date.now();
  }

  get playerCount() { return this.players.size; }

  start() {
    this._spawnFoods(FOOD_TARGET);
    this._interval = setInterval(() => this._tick(), 1000 / TICK_RATE);
    console.log(`[AgarRoom] ${this.roomName} started`);
  }

  stop() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  addPlayer(socket, name, color) {
    const ws = this.worldSize;
    const x  = ws * 0.15 + Math.random() * ws * 0.7;
    const y  = ws * 0.15 + Math.random() * ws * 0.7;
    const player = {
      id:         socket.id,
      name:       (name || 'Player').slice(0, 20),
      color:      color || '#6366f1',
      cells:      [this._makeCell(0, x, y, 20, 0, 0)],
      nextCellId: 1,
      mouseX:     x,
      mouseY:     y,
      alive:      true,
      score:      0,
    };
    this.players.set(socket.id, player);
    socket.join(this.roomName);
    this._updateWorldSize();

    socket.emit('cell:joined', {
      playerId:  socket.id,
      worldSize: this.worldSize,
      foods:     [...this.foods.values()],
      players:   this._serializePlayers(),
    });
    socket.to(this.roomName).emit('cell:playerJoined', {
      id: socket.id, name: player.name, color: player.color, cells: player.cells,
    });
    console.log(`[AgarRoom] ${player.name} joined (${this.players.size} players)`);
  }

  removePlayer(socketId) {
    if (!this.players.has(socketId)) return;
    const name = this.players.get(socketId).name;
    this.players.delete(socketId);
    this.io.to(this.roomName).emit('cell:playerLeft', { id: socketId });
    this._updateWorldSize();
    console.log(`[AgarRoom] ${name} left (${this.players.size} players)`);
  }

  handleInput(socketId, mouseX, mouseY) {
    const p = this.players.get(socketId);
    if (p && p.alive) { p.mouseX = mouseX; p.mouseY = mouseY; }
  }

  handleSplit(socketId) {
    const p = this.players.get(socketId);
    if (!p || !p.alive) return;
    const toAdd = [];
    for (const cell of p.cells) {
      if (p.cells.length + toAdd.length >= MAX_CELLS) break;
      if (cell.mass < MIN_SPLIT_MASS) continue;
      const dx  = p.mouseX - cell.x, dy = p.mouseY - cell.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx  = dx / len, ny = dy / len;
      const half = cell.mass / 2;
      cell.mass = half;
      cell.mergeTimer = MERGE_DELAY;
      const r = Math.sqrt(half) * 10;
      toAdd.push(this._makeCell(p.nextCellId++,
        cell.x + nx * r * 1.1,
        cell.y + ny * r * 1.1,
        half, nx * SPLIT_SPEED, ny * SPLIT_SPEED
      ));
      toAdd[toAdd.length - 1].mergeTimer = MERGE_DELAY;
    }
    p.cells.push(...toAdd);
  }

  respawnPlayer(socketId) {
    const p = this.players.get(socketId);
    if (!p) return;
    const ws = this.worldSize;
    const x = ws * 0.15 + Math.random() * ws * 0.7;
    const y = ws * 0.15 + Math.random() * ws * 0.7;
    p.cells = [this._makeCell(0, x, y, 20, 0, 0)];
    p.nextCellId = 1;
    p.mouseX = x; p.mouseY = y;
    p.alive = true; p.score = 0;
  }

  // ── Tick ─────────────────────────────────────────────────────────────────

  _tick() {
    const now = Date.now();
    const dt  = Math.min((now - this._lastTick) / 1000, 0.05);
    this._lastTick = now;

    for (const p of this.players.values()) {
      if (p.alive) this._updatePlayer(p, dt);
    }
    this._checkFoodEating();
    this._checkPlayerEating();
    this._refillFood();
    this._broadcast();
  }

  _updatePlayer(p, dt) {
    const maxMass = p.cells.reduce((m, c) => Math.max(m, c.mass), 0);
    const speed   = SPEED_BASE / Math.sqrt(maxMass);

    for (const cell of p.cells) {
      cell.vx *= Math.pow(0.15, dt);
      cell.vy *= Math.pow(0.15, dt);

      const dx   = p.mouseX - cell.x;
      const dy   = p.mouseY - cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const r    = Math.sqrt(cell.mass) * 10;

      if (dist > r * 0.5) {
        const nx = dx / dist, ny = dy / dist;
        cell.x += (nx * speed + cell.vx) * dt;
        cell.y += (ny * speed + cell.vy) * dt;
      } else {
        cell.x += cell.vx * dt;
        cell.y += cell.vy * dt;
      }

      const ws = this.worldSize;
      cell.x = Math.max(r, Math.min(ws - r, cell.x));
      cell.y = Math.max(r, Math.min(ws - r, cell.y));
      if (cell.mergeTimer > 0) cell.mergeTimer -= dt * 1000;
    }

    this._separateCells(p.cells);
    this._mergeCells(p.cells);
    p.score = Math.floor(p.cells.reduce((s, c) => s + c.mass, 0));
  }

  _separateCells(cells) {
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i], b = cells[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d  = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const minD = Math.sqrt(a.mass) * 10 + Math.sqrt(b.mass) * 10;
        if (d < minD) {
          const push = (minD - d) / 2 * 0.3;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }

  _mergeCells(cells) {
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i], b = cells[j];
        if (a.mergeTimer > 0 || b.mergeTimer > 0) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        if (Math.sqrt(dx * dx + dy * dy) < Math.sqrt(a.mass) * 10 * 0.6) {
          const tm = a.mass + b.mass;
          a.x  = (a.x * a.mass + b.x * b.mass) / tm;
          a.y  = (a.y * a.mass + b.y * b.mass) / tm;
          a.vx = (a.vx * a.mass + b.vx * b.mass) / tm;
          a.vy = (a.vy * a.mass + b.vy * b.mass) / tm;
          a.mass = tm;
          cells.splice(j, 1);
          j--;
        }
      }
    }
  }

  _checkFoodEating() {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      for (const cell of p.cells) {
        const r = Math.sqrt(cell.mass) * 10;
        const rMin = r - FOOD_RADIUS * 0.4;
        const rMin2 = rMin * rMin;
        for (const [fid, food] of this.foods) {
          const dx = cell.x - food.x, dy = cell.y - food.y;
          if (dx * dx + dy * dy < rMin2) {
            cell.mass += FOOD_MASS;
            this.foods.delete(fid);
            this._removedFoods.push(fid);
          }
        }
      }
    }
  }

  _checkPlayerEating() {
    const list = [...this.players.values()];
    for (const eater of list) {
      if (!eater.alive) continue;
      for (const target of list) {
        if (eater === target || !target.alive) continue;
        for (const ec of eater.cells) {
          const er = Math.sqrt(ec.mass) * 10;
          for (let k = target.cells.length - 1; k >= 0; k--) {
            const tc = target.cells[k];
            if (ec.mass < tc.mass * EAT_RATIO) continue;
            const dx = ec.x - tc.x, dy = ec.y - tc.y;
            const tr = Math.sqrt(tc.mass) * 10;
            if (dx * dx + dy * dy < (er - tr * 0.4) ** 2) {
              ec.mass += tc.mass;
              target.cells.splice(k, 1);
              if (target.cells.length === 0) {
                target.alive = false;
                const sock = this.io.sockets.sockets.get(target.id);
                if (sock) sock.emit('cell:died', { killedBy: eater.name, score: target.score });
              }
            }
          }
        }
      }
    }
  }

  _refillFood() {
    const need = FOOD_TARGET - this.foods.size;
    if (need > 0) this._spawnFoods(Math.min(need, 8));
  }

  _spawnFoods(count) {
    const ws = this.worldSize;
    for (let i = 0; i < count; i++) {
      const id   = _foodIdSeq++;
      const food = {
        id, x: Math.random() * ws, y: Math.random() * ws,
        color: FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)],
      };
      this.foods.set(id, food);
      this._addedFoods.push(food);
    }
  }

  _broadcast() {
    this.io.to(this.roomName).emit('cell:state', {
      players:      this._serializePlayers(),
      removedFoods: this._removedFoods,
      addedFoods:   this._addedFoods,
    });
    this._removedFoods = [];
    this._addedFoods   = [];
  }

  _serializePlayers() {
    const arr = [];
    for (const p of this.players.values()) {
      arr.push({
        id: p.id, name: p.name, color: p.color, alive: p.alive, score: p.score,
        cells: p.cells.map(c => ({ x: c.x, y: c.y, mass: c.mass })),
      });
    }
    return arr;
  }

  _updateWorldSize() {
    const n       = this.players.size;
    const newSize = Math.min(WORLD_MAX, Math.max(WORLD_BASE, WORLD_BASE + n * WORLD_PER_PLAYER));
    if (newSize !== this.worldSize) {
      this.worldSize = newSize;
      this.io.to(this.roomName).emit('cell:worldSize', { size: this.worldSize });
    }
  }

  _makeCell(id, x, y, mass, vx, vy) {
    return { id, x, y, mass, vx, vy, mergeTimer: 0 };
  }
}

module.exports = AgarRoom;
