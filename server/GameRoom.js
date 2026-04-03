const C = require('../shared/constants');
const Snake = require('./Snake');
const FoodManager = require('./Food');
const { v4: uuidv4 } = require('uuid');

class GameRoom {
  constructor(io) {
    this.io = io;
    this.roomId = uuidv4();
    this.snakes = new Map();      // socketId -> Snake
    this.players = new Map();     // socketId -> { socket, name, walletAddress }
    this.foodManager = new FoodManager();
    this.worldRadius = C.BASE_WORLD_RADIUS;
    this.tickInterval = null;
    this.leaderboard = [];
  }

  get playerCount() { return this.players.size; }

  start() {
    this.foodManager.spawnInitial(this.worldRadius);
    this.tickInterval = setInterval(() => this.tick(), 1000 / C.TICK_RATE);
  }

  stop() {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  addPlayer(socket, name, walletAddress, color) {
    this.players.set(socket.id, { socket, name, walletAddress });
    this.adjustBorder(true);

    const { x, y } = this.safeSpawnPoint();
    const snake = new Snake(socket.id, name, x, y, color);
    this.snakes.set(socket.id, snake);

    socket.emit(C.EVENTS.GAME_JOINED, {
      playerId: socket.id,
      worldRadius: this.worldRadius,
      snakeColor: snake.color,
      food: this.foodManager.getAll(),
    });

    return snake;
  }

  removePlayer(socketId) {
    const snake = this.snakes.get(socketId);
    if (snake && snake.alive) {
      const drops = snake.die();
      drops.forEach(d => this.foodManager.spawnOne(this.worldRadius, d.x, d.y));
    }
    this.snakes.delete(socketId);
    this.players.delete(socketId);
    this.adjustBorder(false);
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

  tick() {
    // Update snakes
    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      snake.update();

      // Border collision
      const headDist = Math.hypot(snake.head.x, snake.head.y);
      if (headDist >= this.worldRadius) {
        this.killSnake(snake, null);
        continue;
      }

      // Food collision
      for (const food of this.foodManager.getAll()) {
        const d = Math.hypot(snake.head.x - food.x, snake.head.y - food.y);
        if (d < C.FOOD_EAT_RADIUS) {
          snake.grow(food.value);
          this.foodManager.remove(food.id);
        }
      }
    }

    // Body collision — only kill when hitting another player's body, never self
    const snakeList = Array.from(this.snakes.values()).filter(s => s.alive);
    for (const snake of snakeList) {
      if (!snake.alive) continue;
      for (const other of snakeList) {
        if (!other.alive) continue;
        if (other.id === snake.id) continue; // no self-collision
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
    const drops = snake.die();
    drops.forEach(d => this.foodManager.spawnOne(this.worldRadius, d.x, d.y));
    this.adjustBorder(false);

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
    this.adjustBorder(true);

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
      .map((s, i) => ({ rank: i + 1, name: s.name, score: s.score, length: s.length }));
  }

  broadcastSnapshot() {
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

    this.io.emit(C.EVENTS.SNAPSHOT, snapshot);
  }
}

module.exports = GameRoom;
