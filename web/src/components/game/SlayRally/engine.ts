/**
 * Mesin game Slay Rally — brick-breaker bertema lapangan tenis, digambar 3D oleh court3d.ts.
 * Murni logika; tanpa React maupun three.js. UI (HUD, overlay) ada di SlayRally.tsx dan
 * menerima kabar lewat callback `GameEvents`.
 *
 * Koordinat memakai ukuran logis W×H; renderer yang memetakannya ke ruang 3D.
 */

export const W = 440;
export const H = 660;

export type BonusId = "net" | "multi" | "smash" | "big" | "wide" | "double";

export const BONUSES: {
  id: BonusId;
  label: string;
  hint: string;
  glyph: string;
}[] = [
  { id: "net", label: "Safety Net", hint: "Saves one missed ball", glyph: "N" },
  {
    id: "multi",
    label: "Triple Serve",
    hint: "Splits into three balls",
    glyph: "3",
  },
  {
    id: "smash",
    label: "Slay Smash",
    hint: "Ball cuts through blocks",
    glyph: "S",
  },
  { id: "big", label: "Big Ball", hint: "A bigger, easier ball", glyph: "B" },
  { id: "wide", label: "Wide Racket", hint: "A longer racket", glyph: "W" },
  {
    id: "double",
    label: "Double Points",
    hint: "Every block counts twice",
    glyph: "x2",
  },
];

export type SoundKind =
  | "racket"
  | "wall"
  | "brick"
  | "break"
  | "net"
  | "bonus"
  | "lose"
  | "level"
  | "over";

export type GameEvents = {
  /** Pemicu efek suara (opsional — simulasi tanpa audio tidak perlu mengisinya). */
  onSound?: (kind: SoundKind) => void;
  onScore: (score: number) => void;
  onLives: (lives: number) => void;
  onLevel: (level: number) => void;
  onBonus: (id: BonusId) => void;
  onGameOver: (score: number) => void;
};

export type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  stuck: boolean;
};
export type Brick = { x: number; y: number; w: number; h: number; hp: number };
export type Drop = { x: number; y: number; id: BonusId };
export type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
};

/** Formasi blok: "1" blok biasa, "2" blok keras (dua pukulan), "." kosong. 9 kolom. */
const LEVELS: string[][] = [
  [
    ".........",
    "..11111..",
    ".1111111.",
    ".11.1.11.",
    ".1111111.",
    "..11111..",
  ],
  ["1.1.1.1.1", ".1.1.1.1.", "222222222", ".1.1.1.1.", "1.1.1.1.1"],
  [
    "....1....",
    "...121...",
    "..12221..",
    ".1222221.",
    "..12221..",
    "...121...",
    "....1....",
  ],
  [
    "11.....11",
    "121...121",
    "1221.1221",
    "122212221",
    "1221.1221",
    "121...121",
    "11.....11",
  ],
  [
    "222222222",
    "1.1.1.1.1",
    "111111111",
    "1.1.1.1.1",
    "222222222",
    ".1.1.1.1.",
    "111111111",
  ],
];

const COLS = 9;
const SIDE = 14;
const GAP = 4;
export const BRICK_W = (W - SIDE * 2 - GAP * (COLS - 1)) / COLS;
export const BRICK_H = 30;
const BRICK_TOP = 56;

export const RACKET_Y = H - 40;
export const RACKET_H = 10;
export const RACKET_W = 96;
const RACKET_W_WIDE = 150;
const KEY_SPEED = 480; // px/detik saat raket digerakkan dengan keyboard
/** Jumlah bola maksimum di lapangan (sama dengan jumlah bola yang disiapkan renderer). */
export const MAX_BALLS = 12;
const BALL_R = 6;
const BALL_R_BIG = 10;
export const NET_Y = H - 16;
const DROP_SPEED = 130;
const DROP_R = 11;
const DROP_CHANCE = 0.16;
export const START_LIVES = 3;
/** Umur satu percikan, dalam detik (renderer memakainya untuk memudarkan). */
export const SPARK_LIFE = 0.45;

const noEffects = () => ({ smash: 0, big: 0, wide: 0, double: 0 });
const EFFECT_SECONDS = 9;

export class Game {
  private events: GameEvents;

  private balls: Ball[] = [];
  private bricks: Brick[] = [];
  private drops: Drop[] = [];
  private sparks: Spark[] = [];

  private racketX = W / 2;
  private targetX = W / 2;
  private keyDir = 0;

  private score = 0;
  private lives = START_LIVES;
  private level = 1;
  private serveTimer = 0;
  private over = false;

  private effects = noEffects();
  private net = false;

  constructor(events: GameEvents) {
    this.events = events;
    this.reset();
  }

  /** Mulai ulang dari level 1. */
  reset() {
    this.score = 0;
    this.lives = START_LIVES;
    this.level = 1;
    this.over = false;
    this.racketX = this.targetX = W / 2;
    this.events.onScore(0);
    this.events.onLives(this.lives);
    this.events.onLevel(1);
    this.loadLevel();
  }

  /** Posisi raket mengikuti pointer (x dalam koordinat logis). */
  pointTo(x: number) {
    this.targetX = x;
  }

  /** Keyboard: -1 kiri, 1 kanan, 0 berhenti. */
  steer(dir: number) {
    this.keyDir = dir;
  }

  private get racketW() {
    return this.effects.wide > 0 ? RACKET_W_WIDE : RACKET_W;
  }

  private get ballR() {
    return this.effects.big > 0 ? BALL_R_BIG : BALL_R;
  }

  private get speed() {
    return Math.min(340 + (this.level - 1) * 24, 540);
  }

  private loadLevel() {
    const map = LEVELS[(this.level - 1) % LEVELS.length];
    this.bricks = [];
    map.forEach((row, r) => {
      [...row].forEach((cell, c) => {
        if (cell === ".") return;
        this.bricks.push({
          x: SIDE + c * (BRICK_W + GAP),
          y: BRICK_TOP + r * (BRICK_H + GAP),
          w: BRICK_W,
          h: BRICK_H,
          hp: cell === "2" ? 2 : 1,
        });
      });
    });
    this.drops = [];
    this.effects = noEffects();
    this.net = false;
    this.serve();
  }

  /** Bola baru menempel di raket, lalu meluncur sendiri setelah jeda singkat. */
  private serve() {
    this.balls = [
      { x: this.racketX, y: RACKET_Y - this.ballR, vx: 0, vy: 0, stuck: true },
    ];
    this.serveTimer = 0.9;
  }

  private launch(ball: Ball) {
    const angle = (Math.random() * 0.5 - 0.25) * Math.PI * 0.5;
    ball.vx = Math.sin(angle) * this.speed;
    ball.vy = -Math.cos(angle) * this.speed;
    ball.stuck = false;
    this.events.onSound?.("racket");
  }

  private applyBonus(id: BonusId) {
    if (id === "net") this.net = true;
    else if (id === "multi") {
      const source = this.balls.find((b) => !b.stuck) ?? this.balls[0];
      if (source) {
        if (source.stuck) this.launch(source);
        for (const turn of [-0.5, 0.5]) {
          // Renderer hanya punya MAX_BALLS bola; lebih dari itu akan jadi bola tak terlihat.
          if (this.balls.length >= MAX_BALLS) break;
          const cos = Math.cos(turn);
          const sin = Math.sin(turn);
          this.balls.push({
            x: source.x,
            y: source.y,
            vx: source.vx * cos - source.vy * sin,
            vy: source.vx * sin + source.vy * cos,
            stuck: false,
          });
        }
      }
    } else this.effects[id] = EFFECT_SECONDS;
    this.events.onBonus(id);
    this.events.onSound?.("bonus");
  }

  private burst(x: number, y: number) {
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 90;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: SPARK_LIFE,
      });
    }
  }

  private hitBrick(brick: Brick) {
    const smash = this.effects.smash > 0;
    brick.hp = smash ? 0 : brick.hp - 1;
    if (brick.hp > 0) {
      this.events.onSound?.("brick");
      return;
    }
    this.events.onSound?.("break");
    this.bricks.splice(this.bricks.indexOf(brick), 1);
    this.score += this.effects.double > 0 ? 2 : 1;
    this.events.onScore(this.score);
    const cx = brick.x + brick.w / 2;
    const cy = brick.y + brick.h / 2;
    this.burst(cx, cy);
    if (Math.random() < DROP_CHANCE && this.drops.length < 3) {
      const pick = BONUSES[Math.floor(Math.random() * BONUSES.length)];
      this.drops.push({ x: cx, y: cy, id: pick.id });
    }
  }

  /** Geser satu bola sejauh `dist` px dan selesaikan tabrakan. Mengembalikan false bila bola hilang. */
  private stepBall(ball: Ball, dist: number): boolean {
    const r = this.ballR;
    const len = Math.hypot(ball.vx, ball.vy) || 1;
    ball.x += (ball.vx / len) * dist;
    ball.y += (ball.vy / len) * dist;

    // Dinding
    if (ball.x < r) {
      ball.x = r;
      ball.vx = Math.abs(ball.vx);
      this.events.onSound?.("wall");
    } else if (ball.x > W - r) {
      ball.x = W - r;
      ball.vx = -Math.abs(ball.vx);
      this.events.onSound?.("wall");
    }
    if (ball.y < r) {
      ball.y = r;
      ball.vy = Math.abs(ball.vy);
      this.events.onSound?.("wall");
    }

    // Raket — sudut pantul ditentukan titik kena, seperti pukulan tenis.
    const half = this.racketW / 2;
    if (
      ball.vy > 0 &&
      ball.y + r >= RACKET_Y &&
      ball.y - r <= RACKET_Y + RACKET_H &&
      ball.x >= this.racketX - half - r &&
      ball.x <= this.racketX + half + r
    ) {
      const offset = Math.max(-1, Math.min(1, (ball.x - this.racketX) / half));
      const angle = offset * (Math.PI / 3);
      ball.vx = Math.sin(angle) * this.speed;
      ball.vy = -Math.cos(angle) * this.speed;
      ball.y = RACKET_Y - r;
      this.events.onSound?.("racket");
    }

    // Safety net: menyelamatkan satu bola, lalu hilang.
    if (this.net && ball.vy > 0 && ball.y + r >= NET_Y) {
      ball.vy = -Math.abs(ball.vy);
      ball.y = NET_Y - r;
      this.net = false;
      this.events.onSound?.("net");
    }

    // Blok
    for (const brick of this.bricks) {
      const nx = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w));
      const ny = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h));
      const dx = ball.x - nx;
      const dy = ball.y - ny;
      if (dx * dx + dy * dy > r * r) continue;
      if (this.effects.smash <= 0) {
        // Pantul di sumbu dengan penetrasi terkecil.
        const overlapX = r - Math.abs(dx);
        const overlapY = r - Math.abs(dy);
        if (dx === 0 && dy === 0) ball.vy = -ball.vy;
        else if (overlapX < overlapY) {
          ball.vx = Math.sign(dx) * Math.abs(ball.vx);
          ball.x += Math.sign(dx) * overlapX;
        } else {
          ball.vy = Math.sign(dy) * Math.abs(ball.vy);
          ball.y += Math.sign(dy) * overlapY;
        }
      }
      this.hitBrick(brick);
      break;
    }

    // Hindari lintasan nyaris mendatar yang membuat bola tak pernah turun.
    const minVy = this.speed * 0.18;
    if (Math.abs(ball.vy) < minVy) {
      ball.vy = (ball.vy < 0 ? -1 : 1) * minVy;
      const vx = Math.sqrt(Math.max(this.speed ** 2 - minVy ** 2, 0));
      ball.vx = (ball.vx < 0 ? -1 : 1) * vx;
    }

    return ball.y - r <= H;
  }

  update(dt: number) {
    if (this.over) return;

    // Raket
    const half = this.racketW / 2;
    const clamp = (x: number) => Math.max(half, Math.min(W - half, x));
    if (this.keyDir !== 0) {
      // Keyboard: kecepatan tetap dalam px/detik, tidak bergantung pada frame rate.
      this.racketX = clamp(this.racketX + this.keyDir * KEY_SPEED * dt);
      this.targetX = this.racketX;
    }
    this.targetX = clamp(this.targetX);
    // Pointer: mengejar target dengan redaman eksponensial (sama di 60 Hz maupun 120 Hz).
    this.racketX += (this.targetX - this.racketX) * (1 - Math.exp(-dt * 28));

    for (const key of Object.keys(
      this.effects,
    ) as (keyof typeof this.effects)[]) {
      if (this.effects[key] > 0)
        this.effects[key] = Math.max(0, this.effects[key] - dt);
    }

    // Bola
    if (this.serveTimer > 0) this.serveTimer -= dt;
    this.balls = this.balls.filter((ball) => {
      if (ball.stuck) {
        ball.x = this.racketX;
        ball.y = RACKET_Y - this.ballR;
        if (this.serveTimer <= 0) this.launch(ball);
        return true;
      }
      let remaining = Math.hypot(ball.vx, ball.vy) * dt;
      while (remaining > 0) {
        const step = Math.min(remaining, 3);
        if (!this.stepBall(ball, step)) return false;
        remaining -= step;
      }
      return true;
    });

    // Bonus yang jatuh
    this.drops = this.drops.filter((drop) => {
      drop.y += DROP_SPEED * dt;
      const caught =
        drop.y + DROP_R >= RACKET_Y &&
        drop.y - DROP_R <= RACKET_Y + RACKET_H &&
        Math.abs(drop.x - this.racketX) <= half + DROP_R;
      if (caught) {
        this.applyBonus(drop.id);
        return false;
      }
      return drop.y - DROP_R < H;
    });

    this.sparks = this.sparks.filter((s) => {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      return s.life > 0;
    });

    if (this.balls.length === 0) {
      this.lives -= 1;
      this.events.onLives(this.lives);
      if (this.lives <= 0) {
        this.over = true;
        this.events.onSound?.("over");
        this.events.onGameOver(this.score);
        return;
      }
      this.events.onSound?.("lose");
      this.effects = noEffects();
      this.drops = [];
      this.serve();
    } else if (this.bricks.length === 0) {
      this.level += 1;
      this.score += 10;
      this.events.onScore(this.score);
      this.events.onLevel(this.level);
      this.events.onSound?.("level");
      this.loadLevel();
    }
  }

  /** Keadaan saat ini untuk digambar (referensi langsung, jangan diubah dari luar). */
  get view() {
    return {
      balls: this.balls,
      bricks: this.bricks,
      drops: this.drops,
      sparks: this.sparks,
      racketX: this.racketX,
      racketW: this.racketW,
      ballR: this.ballR,
      net: this.net,
      smash: this.effects.smash > 0,
    };
  }
}
