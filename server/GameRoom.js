const C = require('../shared/constants');
const Snake = require('./Snake');
const Bot   = require('./Bot');
const FoodManager = require('./Food');
const { v4: uuidv4 } = require('uuid');
const allTimeLb = require('./leaderboard');

class GameRoom {
  constructor(io) {
    this.io = io;
    this.roomId = uuidv4();
    this.socketRoomName = 'game_' + this.roomId;
    this.snakes = new Map();      // socketId -> Snake
    this.players = new Map();     // socketId -> { socket, name, walletAddress }
    this.foodManager = new FoodManager();
    this.worldRadius = C.BASE_WORLD_RADIUS;
    this.borderDrift = 0;  // positive = expanded, negative = contracted
    this.tickInterval = null;
    this.leaderboard = [];
  }

  get playerCount() { return this.players.size; }
  get botCount() {
    let n = 0;
    for (const s of this.snakes.values()) if (s.isBot && s.alive) n++;
    return n;
  }

  start() {
    this.foodManager.spawnInitial(this.worldRadius);
    this.tickInterval = setInterval(() => this.tick(), 1000 / C.TICK_RATE);
  }

  stop() {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  addPlayer(socket, name, walletAddress, color) {
    socket.join(this.socketRoomName);
    this.players.set(socket.id, { socket, name, walletAddress });

    const { x, y } = this.safeSpawnPoint();
    const snake = new Snake(socket.id, name, x, y, color);
    this.snakes.set(socket.id, snake);

    socket.emit(C.EVENTS.GAME_JOINED, {
      playerId: socket.id,
      worldRadius: this.worldRadius,
      snakeColor: snake.color,
      food: this.foodManager.getAll(),
    });

    // Each player joining expands the border
    this.borderDrift = Math.min(this.borderDrift + 200, 1200);

    return snake;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player) player.socket.leave(this.socketRoomName);
    const snake = this.snakes.get(socketId);
    if (snake && snake.alive) {
      const gid = player?.socket?._googleId;
      allTimeLb.record(gid || snake.name, snake.name, snake.score);
      // Player leaving counts as a death — shrink the border
      this.borderDrift = Math.max(this.borderDrift - 120, -1000);
      const drops = snake.die();
      const safeR = this.worldRadius * 0.95;
      drops.forEach(d => {
        const dist = Math.hypot(d.x, d.y);
        if (dist > safeR) { const sc = safeR / dist; d.x *= sc; d.y *= sc; }
        this.foodManager.spawnOne(this.worldRadius, d.x, d.y);
      });
    }
    this.snakes.delete(socketId);
    this.players.delete(socketId);
  }

  handleInput(socketId, targetAngle, boosting) {
    const snake = this.snakes.get(socketId);
    if (snake && snake.alive) {
      snake.setInput(targetAngle, boosting);
    }
  }

  adjustBorder(playerJoined) {
    if (playerJoined) {
      this.worldRadius = Math.min(C.MAX_WORLD_RADIUS,
        this.worldRadius + C.BORDER_GROW_PER_JOIN);
    } else {
      this.worldRadius = Math.max(C.MIN_WORLD_RADIUS,
        this.worldRadius - C.BORDER_SHRINK_PER_DEATH);
    }
  }

  safeSpawnPoint() {
    const maxR = this.worldRadius * 0.7;
    for (let attempt = 0; attempt < 20; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 100 + Math.random() * (maxR - 100);
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      let safe = true;
      for (const snake of this.snakes.values()) {
        if (!snake.alive) continue;
        const d = Math.hypot(snake.head.x - x, snake.head.y - y);
        if (d < 150) { safe = false; break; }
      }
      if (safe) return { x, y };
    }
    return { x: 0, y: 0 };
  }

  addBot() {
    const id = 'bot_' + uuidv4();
    const { x, y } = this.safeSpawnPoint();
    const bot = new Bot(id, x, y);
    this.snakes.set(id, bot);
    // Bot joining expands the border
    this.borderDrift = Math.min(this.borderDrift + 120, 1200);
    return bot;
  }

  tick() {
    // Border drifts outward on deaths, inward on joins, gradually fading back to base
    this.borderDrift *= 0.995; // half-life ≈ 2.3 seconds — smooth fade back to base
    const targetRadius = Math.max(C.MIN_WORLD_RADIUS,
      Math.min(C.MAX_WORLD_RADIUS, C.BASE_WORLD_RADIUS + this.borderDrift));
    this.worldRadius += (targetRadius - this.worldRadius) * 0.015; // ~2.5s to fully settle

    const foodList  = this.foodManager.getAll();
    const allSnakes = Array.from(this.snakes.values());
    // Update snakes
    for (const snake of allSnakes) {
      if (!snake.alive) continue;
      if (snake.isBot) snake.updateAI(foodList, this.worldRadius, allSnakes);
      snake.update();

      // Border collision
      const headDist = Math.hypot(snake.head.x, snake.head.y);
      if (headDist >= this.worldRadius) {
        this.killSnake(snake, null);
        continue;
      }

      // Food magnetism + collision
      const PULL_RADIUS = 90;
      const PULL_SPEED  = 4.5;
      for (const food of this.foodManager.getAll()) {
        const dx = snake.head.x - food.x;
        const dy = snake.head.y - food.y;
        const d  = Math.hypot(dx, dy);
        if (d < C.FOOD_EAT_RADIUS) {
          snake.grow(food.value);
          this.foodManager.remove(food.id);
        } else if (d < PULL_RADIUS) {
          // Pull food toward head proportionally — faster when closer
          const strength = (1 - d / PULL_RADIUS) * PULL_SPEED;
          food.x += (dx / d) * strength;
          food.y += (dy / d) * strength;
        }
      }
    }

    // Body collision — only kill when hitting another player's body, never self
    const BODY_BROAD_R2 = 600 * 600; // skip pairs whose heads are far apart
    for (const snake of allSnakes) {
      if (!snake.alive) continue;
      for (const other of allSnakes) {
        if (!other.alive) continue;
        if (other.id === snake.id) continue; // no self-collision
        // Broad-phase: skip if heads are far apart (body can't possibly be near)
        const bhx = snake.head.x - other.head.x;
        const bhy = snake.head.y - other.head.y;
        if (bhx * bhx + bhy * bhy > BODY_BROAD_R2) continue;
        for (let i = 0; i < other.segments.length; i += 2) {
          const seg = other.segments[i];
          const d = Math.hypot(snake.head.x - seg.x, snake.head.y - seg.y);
          if (d < C.SNAKE_HEAD_RADIUS + 6) {
            this.killSnake(snake, other.id);
            break;
          }
        }
        if (!snake.alive) break;
      }
    }

    // Refill food
    this.foodManager.refill(this.worldRadius);

    // Build and broadcast snapshot
    this.broadcastSnapshot();
  }

  killSnake(snake, killerId) {
    if (!snake.alive) return;
    const kPlayer = this.players.get(snake.id);
    const kGid = kPlayer?.socket?._googleId;
    allTimeLb.record(kGid || snake.name, snake.name, snake.score);
    // Each death shrinks the border
    this.borderDrift = Math.max(this.borderDrift - 120, -1000);
    const drops = snake.die();
    const safeR = this.worldRadius * 0.95;
    drops.forEach(d => {
      const dist = Math.hypot(d.x, d.y);
      if (dist > safeR) {
        const scale = safeR / dist;
        d.x *= scale;
        d.y *= scale;
      }
      this.foodManager.spawnOne(this.worldRadius, d.x, d.y);
    });

    const player = this.players.get(snake.id);
    if (player) {
      player.socket.emit(C.EVENTS.PLAYER_DIED, {
        score: snake.score,
        length: snake.length,
        killerId,
      });
    }

    if (killerId) {
      const killerPlayer = this.players.get(killerId);
      if (killerPlayer) {
        killerPlayer.socket.emit(C.EVENTS.PLAYER_KILLED, {
          victimId: snake.id,
          victimName: snake.name,
        });
      }
    }
  }

  respawnPlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;
    const { x, y } = this.safeSpawnPoint();
    const snake = new Snake(socketId, player.name, x, y);
    this.snakes.set(socketId, snake);

    player.socket.emit(C.EVENTS.GAME_JOINED, {
      playerId: socketId,
      worldRadius: this.worldRadius,
      snakeColor: snake.color,
      food: this.foodManager.getAll(),
    });
  }

  buildLeaderboard() {
    return Array.from(this.snakes.values())
      .filter(s => s.alive)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((s, i) => ({ rank: i + 1, id: s.id, name: s.name, score: s.score, length: s.length }));
  }

  broadcastSnapshot() {
    if (this.players.size === 0) return;

    const snakeData = [];
    for (const snake of this.snakes.values()) {
      if (snake.alive) snakeData.push(snake.serialize());
    }

    const snapshot = {
      t: Date.now(),
      worldRadius: this.worldRadius,
      snakes: snakeData,
      food: this.foodManager.getAll(),
      leaderboard: this.buildLeaderboard(),
    };

    // Emit directly to each player socket — guaranteed to stay within this room
    for (const player of this.players.values()) {
      player.socket.emit(C.EVENTS.SNAPSHOT, snapshot);
    }
  }
}

module.exports = GameRoom;
