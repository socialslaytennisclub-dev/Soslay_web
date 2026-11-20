/**
 * Mesin Slay Tennis — tenis arcade satu lawan satu, tanpa DOM (bisa disimulasikan di Node).
 *
 * Dunia dalam meter: x = lebar lapangan (−kiri … +kanan dilihat dari sisi 0), y = panjang
 * (sisi 0 di y < 0, sisi 1 di y > 0, net di y = 0), z = tinggi. Input pemain selalu dari sudut
 * pandangnya sendiri (mx: kanan +, my: maju ke net +) — mesin yang membaliknya untuk sisi 1.
 */

/**
 * Ukuran resmi lapangan tenis (meter): panjang 23,77; lebar tunggal 8,23 (batas bola masuk di
 * permainan satu lawan satu ini); lebar ganda 10,97 (lorong di kiri-kanan, hanya digambar);
 * garis servis 6,40 dari net; tinggi net ±1.
 */
export const COURT = { halfW: 4.115, doublesHalfW: 5.485, halfL: 11.885, netH: 1.0, serviceY: 6.4 };
/** Batas gerak pemain (sedikit di luar garis). */
const RUN = { x: 6.5, back: 14.5, front: 0.9 };
const GRAVITY = 14;
const PLAYER_SPEED = 7.2;
const REACH = { x: 1.8, y: 1.7, z: 2.9 };
const SWING_TIME = 0.32;
const POINT_PAUSE = 1.7;
/** Lama lemparan servis sampai bola dipukul, dan fisika lemparannya (puncak ±3,1 m di ±0,43 dtk). */
const TOSS_TIME = 0.56;
const TOSS_SPEED = 8.6;
const TOSS_GRAVITY = 20;
const POINT_NAMES = ["0", "15", "30", "40"];

export type Side = 0 | 1;
export type ShotKind = "flat" | "lob" | "drop";
export type Anim = "idle" | "run" | "swingR" | "swingL" | "serve";
export type Phase = "serve" | "rally" | "point" | "over";
export type TennisSound = "hit" | "bounce" | "point" | "lose" | "win" | "serve";

export type PlayerView = { x: number; y: number; anim: Anim; face: 1 | -1 };
export type Snapshot = {
  b: { x: number; y: number; z: number };
  p: [PlayerView, PlayerView];
  pts: [number, number];
  games: [number, number];
  server: Side;
  phase: Phase;
  /** Keterangan poin terakhir ("Out", "Net", …) selama jeda antar poin. */
  note: string | null;
  /** Pemenang poin terakhir / pertandingan. */
  won: Side | null;
  /** Titik pantul pertama bola yang sedang melayang (penanda di lapangan); null bila sudah memantul. */
  land: { x: number; y: number } | null;
  /** Servis kedua (servis pertama fault). */
  second: boolean;
};

export type MatchState = { games: [number, number]; server: Side };

export type TennisEvents = {
  onSound?: (kind: TennisSound) => void;
  onOver?: (winner: Side) => void;
  /**
   * Dipanggil sebelum game berikutnya dimulai (`game` = nomor game, mulai 2). `false` = pertandingan
   * ditahan (mis. tamu wajib masuk untuk game 2) sampai `continueMatch()` dipanggil.
   */
  canStartGame?: (game: number) => boolean;
  onHold?: (state: MatchState) => void;
};

export type TennisOptions = {
  /** Sisi yang dikendalikan komputer (null = dua pemain manusia). */
  ai: Side | null;
  gamesToWin: number;
};

type Player = {
  x: number;
  y: number;
  mx: number;
  my: number;
  swing: number;
  kind: ShotKind;
  anim: Anim;
  animTime: number;
  face: 1 | -1;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
/** +1 untuk sisi 1 (y positif), −1 untuk sisi 0. */
const sign = (side: Side) => (side === 0 ? -1 : 1);
const other = (side: Side): Side => (side === 0 ? 1 : 0);

/**
 * Skor poin dari sudut pandang `me`: "15 – 30", "Deuce", lalu setelah deuce "Advantage you (one in)"
 * bila kita tinggal satu poin lagi, "Advantage opponent (one out)" bila lawan. Deuce hanya sekali:
 * kalau skor kembali imbang, poin berikutnya langsung menentukan game ("Sudden death").
 */
export function pointLabel(pts: [number, number], me: Side): string {
  const [a, b] = [pts[me], pts[other(me)]];
  if (a >= 3 && b >= 3) {
    if (a === b) return a === 3 ? "Deuce" : "Sudden death · next point wins";
    return a > b ? "Advantage you (one in)" : "Advantage opponent (one out)";
  }
  return `${POINT_NAMES[Math.min(a, 3)]} – ${POINT_NAMES[Math.min(b, 3)]}`;
}

export class TennisGame {
  private events: TennisEvents;
  private opts: TennisOptions;

  private players: [Player, Player];
  private ball = { x: 0, y: 0, z: 1, vx: 0, vy: 0, vz: 0 };
  private lastHitter: Side = 0;
  private bounces = 0;
  private land: { x: number; y: number } | null = null;
  /** Pertandingan ditahan di antara dua game (lihat TennisEvents.canStartGame). */
  private held = false;
  /** > 0 selama bola servis sedang dilempar (belum dipukul). */
  private toss = 0;
  private tossKind: ShotKind = "flat";
  private tossFrom = { x: 0, y: 0 };
  /** Fault pada poin ini (0 atau 1; fault kedua = double fault → poin untuk penerima). */
  private faults = 0;
  /** Bola servis belum memantul: wajib jatuh di kotak servis diagonal & tidak boleh divoli. */
  private serveLive = false;

  private pts: [number, number] = [0, 0];
  private games: [number, number] = [0, 0];
  private server: Side = 0;
  private phase: Phase = "serve";
  private note: string | null = null;
  private won: Side | null = null;
  private timer = 0;

  // Komputer
  private aiServe = 0;
  private aiWhiff = false;
  private aiAim = 0;

  constructor(events: TennisEvents, opts: TennisOptions) {
    this.events = events;
    this.opts = opts;
    this.players = [this.newPlayer(), this.newPlayer()];
    this.reset();
  }

  private newPlayer(): Player {
    return { x: 0, y: 0, mx: 0, my: 0, swing: 0, kind: "flat", anim: "idle", animTime: 0, face: 1 };
  }

  reset() {
    this.faults = 0;
    this.held = false;
    this.pts = [0, 0];
    this.games = [0, 0];
    this.server = 0;
    this.won = null;
    this.startServe();
  }

  /** Lanjutkan pertandingan tersimpan (skor game & giliran servis) dari awal game berikutnya. */
  restore(state: MatchState) {
    this.reset();
    const clean = (n: number) => Math.max(0, Math.min(this.opts.gamesToWin - 1, Math.floor(Number(n) || 0)));
    this.games = [clean(state.games[0]), clean(state.games[1])];
    this.server = state.server === 1 ? 1 : 0;
    this.startServe();
  }

  /** Lepas tahanan → game berikutnya dimulai. */
  continueMatch() {
    if (!this.held) return;
    this.held = false;
    this.startServe();
  }

  /** Arah gerak / bidik pemain, dari sudut pandangnya sendiri (−1 … 1). */
  setInput(side: Side, mx: number, my: number) {
    if (side === this.opts.ai) return;
    const p = this.players[side];
    p.mx = clamp(mx || 0, -1, 1);
    p.my = clamp(my || 0, -1, 1);
  }

  /** Tombol pukul ditekan. */
  shot(side: Side, kind: ShotKind) {
    if (side === this.opts.ai) return;
    this.swing(side, kind);
  }

  private swing(side: Side, kind: ShotKind) {
    const p = this.players[side];
    if (this.phase === "serve") {
      if (side === this.server) this.serve(kind);
      return;
    }
    if (this.phase !== "rally" || p.swing > 0) return;
    p.swing = SWING_TIME;
    p.kind = kind;
    // Pose ayunan mengikuti sisi datangnya bola (dari sudut pandang pemain).
    const right = (this.ball.x - p.x) * -sign(side) >= 0;
    this.setAnim(p, this.ball.z > 2 ? "serve" : right ? "swingR" : "swingL", 0.42);
  }

  private setAnim(p: Player, anim: Anim, time: number) {
    p.anim = anim;
    p.animTime = time;
  }

  private startServe() {
    this.phase = "serve";
    this.note = null;
    this.bounces = 0;
    this.land = null;
    this.toss = 0;
    this.serveLive = false;
    // Server berdiri di sisi kanan (deuce) saat jumlah poin genap, kiri (ad) saat ganjil — di
    // seberang kotak servis sasarannya. Penerima menunggu di belakang kotak itu.
    const box = this.serveBoxSign();
    for (const side of [0, 1] as Side[]) {
      const p = this.players[side];
      p.x = side === this.server ? -box * 1.3 : box * 2.6;
      p.y = sign(side) * (side === this.server ? COURT.halfL + 0.4 : COURT.halfL - 0.6);
      p.swing = 0;
      p.anim = "idle";
      p.animTime = 0;
    }
    this.aiServe = rand(1.1, 1.8);
    this.holdBall();
  }

  /**
   * Tanda x (−1 / +1) kotak servis sasaran: selalu diagonal dari posisi server. Poin genap →
   * server di kanannya sendiri (deuce) dan menyasar kotak di kanan penerima.
   */
  private serveBoxSign(): 1 | -1 {
    const deuce = (this.pts[0] + this.pts[1]) % 2 === 0;
    const s = sign(this.server);
    return (deuce ? s : -s) as 1 | -1;
  }

  /** Bola di tangan kiri server (tangan yang tidak memegang raket), sedikit di depan badan. */
  private holdBall() {
    const p = this.players[this.server];
    const s = sign(this.server);
    this.ball = { x: p.x + s * 0.45, y: p.y - s * 0.25, z: 1.25, vx: 0, vy: 0, vz: 0 };
  }

  /**
   * Servis: bola dilempar ke atas dulu dari tangan kiri, lalu dipukul di dekat titik tertingginya
   * setelah TOSS_TIME — selaras dengan gerakan servis karakter (lempar → raket ke belakang → pukul).
   */
  private serve(kind: ShotKind) {
    const p = this.players[this.server];
    this.holdBall();
    this.phase = "rally";
    this.lastHitter = this.server;
    this.bounces = 0;
    this.toss = TOSS_TIME;
    this.tossKind = kind === "drop" ? "flat" : kind;
    this.tossFrom = { x: this.ball.x, y: this.ball.y };
    this.setAnim(p, "serve", 0.95);
    // Bunyi pukulan baru terdengar saat raket mengenai bola (di hit()).
  }

  /** Lintasan lemparan: naik dari tangan kiri ke atas kepala, bergeser ke sisi raket. */
  private updateToss(dt: number) {
    const p = this.players[this.server];
    const s = sign(this.server);
    this.toss -= dt;
    const t = TOSS_TIME - Math.max(this.toss, 0);
    const k = t / TOSS_TIME;
    this.ball.x = this.tossFrom.x + (p.x - s * 0.2 - this.tossFrom.x) * k;
    this.ball.y = this.tossFrom.y + (p.y - s * 0.45 - this.tossFrom.y) * k;
    this.ball.z = 1.25 + TOSS_SPEED * t - 0.5 * TOSS_GRAVITY * t * t;
    if (this.toss <= 0) this.hit(this.server, this.tossKind, 0.85, true);
  }

  /**
   * Pukul bola dari posisinya sekarang ke titik sasaran di sisi lawan. `quality` 0–1 = ketepatan
   * posisi/timing: makin rendah, makin melenceng (bisa keluar).
   */
  private hit(side: Side, kind: ShotKind, quality: number, serving = false) {
    const p = this.players[side];
    const b = this.ball;
    const toward = -sign(side); // arah y menuju lawan
    const aim = side === this.opts.ai ? this.aiAim : p.mx;
    const spread = (1 - quality) * 1.9;
    let tx = clamp(aim, -1, 1) * -sign(side) * 3.3 + rand(-spread, spread);
    let depth = kind === "drop" ? rand(2.2, 3.8) : kind === "lob" ? rand(9.2, 11.2) : rand(7.6, 10.9 + (1 - quality) * 1.6);
    if (serving) {
      // Servis menyasar kotak servis diagonal (lebar 4,1 m, dalam 6,4 m). Tahan arah untuk membidik
      // ke tepi kotak — makin ke tepi makin berisiko fault. Lob & servis kedua lebih aman.
      const safe = kind === "lob" || this.faults > 0;
      const wobble = safe ? 0.3 : 0.42;
      tx = this.serveBoxSign() * (COURT.halfW / 2) + clamp(aim, -1, 1) * -sign(side) * 1.9 + rand(-wobble, wobble);
      depth = safe ? rand(4.1, 5.7) : rand(4.9, 6.72);
      this.serveLive = true;
    }
    const ty = toward * depth;

    const dist = Math.hypot(tx - b.x, ty - b.y);
    const smash = kind === "flat" && b.z > 2.1 && !serving;
    let time = serving
      ? dist / (kind === "lob" || this.faults > 0 ? 16 : 21)
      : kind === "lob"
        ? 1.75
        : kind === "drop"
          ? 1.2
          : dist / (smash ? 27 : 18.5);
    time = Math.max(time, 0.45);
    // Naikkan lintasan sampai bola pasti melewati net.
    for (let i = 0; i < 14; i++) {
      const vy = (ty - b.y) / time;
      const vz = (0.5 * GRAVITY * time * time - b.z) / time;
      const tn = -b.y / vy;
      const zn = b.z + vz * tn - 0.5 * GRAVITY * tn * tn;
      if (tn <= 0 || tn >= time || zn >= COURT.netH + 0.3) break;
      time *= 1.09;
    }
    b.vx = (tx - b.x) / time;
    b.vy = (ty - b.y) / time;
    b.vz = (0.5 * GRAVITY * time * time - b.z) / time;
    this.lastHitter = side;
    this.bounces = 0;
    this.land = { x: tx, y: ty };
    // Komputer: tentukan sekali per bola yang datang apakah ia akan meleset, dan ke mana membidik.
    this.aiWhiff = Math.random() < 0.13;
    this.events.onSound?.("hit");
  }

  /** Servis gagal: fault pertama → servis kedua; fault kedua → double fault, poin untuk penerima. */
  private fault() {
    this.serveLive = false;
    if (this.faults >= 1) {
      this.award(other(this.server), "Double fault");
      return;
    }
    this.faults = 1;
    this.land = null;
    this.phase = "point";
    this.note = "Fault";
    this.won = null;
    this.timer = 1.1;
    this.events.onSound?.("bounce");
  }

  private award(to: Side, note: string) {
    this.faults = 0;
    this.serveLive = false;
    this.land = null;
    this.phase = "point";
    this.note = note;
    this.won = to;
    this.timer = POINT_PAUSE;
    this.pts[to] += 1;
    const lead = this.pts[to] - this.pts[other(to)];
    let gameWon = false;
    // Menang game: 4 poin dengan selisih 2, atau — karena deuce hanya sekali — poin pertama setelah
    // skor kembali imbang di 4–4 (sudden death).
    if ((this.pts[to] >= 4 && lead >= 2) || this.pts[to] >= 5) {
      this.games[to] += 1;
      gameWon = true;
    }
    if (gameWon && this.games[to] >= this.opts.gamesToWin) {
      this.phase = "over";
      this.note = "Match";
      this.events.onSound?.("win");
      this.events.onOver?.(to);
      return;
    }
    if (gameWon) {
      this.note = `${note} · Game`;
      this.pendingNewGame = true;
    }
    this.events.onSound?.("point");
  }
  private pendingNewGame = false;

  update(dt: number) {
    if (this.phase === "over" || this.held) return;
    if (this.opts.ai !== null) this.think(this.opts.ai, dt);

    for (const side of [0, 1] as Side[]) {
      const p = this.players[side];
      const s = sign(side);
      // Input dari sudut pandang pemain → dunia: kanan pemain sisi 0 = +x, maju = menuju net.
      // Server diam di tempat sampai bolanya dipukul.
      const serving = side === this.server && (this.phase === "serve" || this.toss > 0);
      const moving = Math.hypot(p.mx, p.my) > 0.15 && !serving;
      if (moving && this.phase !== "point") {
        const len = Math.max(1, Math.hypot(p.mx, p.my));
        p.x = clamp(p.x + (p.mx / len) * -s * PLAYER_SPEED * dt, -RUN.x, RUN.x);
        const ny = p.y + (p.my / len) * -s * PLAYER_SPEED * dt;
        p.y = side === 0 ? clamp(ny, -RUN.back, -RUN.front) : clamp(ny, RUN.front, RUN.back);
        if (Math.abs(p.mx) > 0.2) p.face = p.mx > 0 ? 1 : -1;
      }
      if (p.animTime > 0) p.animTime -= dt;
      if (p.animTime <= 0) p.anim = moving ? "run" : "idle";
      if (p.swing > 0) {
        p.swing -= dt;
        this.tryHit(side);
      }
    }

    if (this.phase === "serve") {
      this.holdBall();
      return;
    }
    if (this.toss > 0 && this.phase === "rally") {
      this.updateToss(dt);
      return;
    }
    if (this.phase === "point") {
      this.timer -= dt;
      this.moveBall(dt, false);
      if (this.timer <= 0) {
        if (this.pendingNewGame) {
          this.pendingNewGame = false;
          this.pts = [0, 0];
          this.server = other(this.server);
          const next = this.games[0] + this.games[1] + 1;
          if (this.events.canStartGame && !this.events.canStartGame(next)) {
            this.held = true;
            this.note = null;
            this.events.onHold?.({ games: [this.games[0], this.games[1]], server: this.server });
            return;
          }
        }
        this.startServe();
      }
      return;
    }
    this.moveBall(dt, true);
  }

  private tryHit(side: Side) {
    if (this.phase !== "rally" || this.lastHitter === side) return;
    const p = this.players[side];
    const b = this.ball;
    // Bola harus sudah di sisi pemain ini.
    if (b.y * sign(side) < 0) return;
    // Servis harus memantul dulu sebelum dikembalikan.
    if (this.serveLive) return;
    const dx = Math.abs(b.x - p.x);
    const dy = Math.abs(b.y - p.y);
    if (dx > REACH.x || dy > REACH.y || b.z > REACH.z) return;
    const quality = clamp(1 - Math.hypot(dx / REACH.x, dy / REACH.y) * 0.75, 0.15, 1);
    p.swing = 0;
    this.hit(side, p.kind, quality);
  }

  private moveBall(dt: number, live: boolean) {
    const b = this.ball;
    const prevY = b.y;
    b.vz -= GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;

    // Net: bola melintasi y = 0 di bawah tinggi net.
    if (live && prevY * b.y <= 0 && prevY !== b.y && b.z < COURT.netH) {
      b.y = prevY;
      b.vy *= -0.15;
      b.vx *= 0.3;
      if (this.serveLive) this.fault();
      else this.award(other(this.lastHitter), "Net");
      return;
    }

    if (b.z <= 0 && b.vz < 0) {
      b.z = 0;
      b.vz = -b.vz * 0.72;
      b.vx *= 0.82;
      b.vy *= 0.82;
      if (!live) return;
      this.events.onSound?.("bounce");
      this.bounces += 1;
      this.land = null;
      const receiver = other(this.lastHitter);
      if (this.serveLive) {
        // Pantulan pertama servis: harus di dalam kotak servis diagonal.
        const box = this.serveBoxSign();
        const along = b.y * sign(receiver);
        const across = b.x * box;
        this.serveLive = false;
        if (!(along > 0 && along <= COURT.serviceY + 0.08 && across >= -0.08 && across <= COURT.halfW + 0.08)) this.fault();
        return;
      }
      if (this.bounces === 1) {
        const inside =
          Math.abs(b.x) <= COURT.halfW + 0.08 && b.y * sign(receiver) > 0 && Math.abs(b.y) <= COURT.halfL + 0.08;
        if (!inside) this.award(receiver, "Out");
      } else {
        this.award(this.lastHitter, "Winner");
      }
      return;
    }
    // Bola terbang jauh tanpa memantul (lob keluar stadion).
    if (live && (Math.abs(b.y) > 30 || Math.abs(b.x) > 22)) {
      if (this.bounces >= 1) this.award(this.lastHitter, "Winner");
      else this.award(other(this.lastHitter), "Out");
    }
  }

  // ── Komputer ──────────────────────────────────────────────────

  private think(side: Side, dt: number) {
    const p = this.players[side];
    const s = sign(side);
    const b = this.ball;
    const rival = this.players[other(side)];

    if (this.phase === "serve") {
      p.mx = p.my = 0;
      if (this.server === side) {
        this.aiServe -= dt;
        if (this.aiServe <= 0) {
          this.aiAim = rand(-0.85, 0.85);
          this.swing(side, "flat");
        }
      }
      return;
    }
    if (this.phase !== "rally") {
      p.mx = p.my = 0;
      return;
    }

    let tx = 0;
    let ty = s * 10.2;
    const incoming = this.lastHitter !== side;
    if (incoming) {
      if (this.bounces === 0) {
        // Titik pantul pertama, lalu berdiri sedikit di belakangnya.
        const t = (b.vz + Math.sqrt(Math.max(0, b.vz * b.vz + 2 * GRAVITY * b.z))) / GRAVITY;
        const lx = b.x + b.vx * t;
        const ly = b.y + b.vy * t;
        if (ly * s > 0) {
          tx = lx + b.vx * 0.22;
          ty = ly + s * 1.9;
        }
      } else if (b.y * s > 0) {
        tx = b.x + b.vx * 0.12;
        ty = b.y + b.vy * 0.12;
      }
    }
    // Sasaran dunia → input dari sudut pandang komputer.
    const dx = tx - p.x;
    const dy = ty - p.y;
    const speed = 0.82;
    p.mx = Math.abs(dx) > 0.25 ? clamp(dx * -s, -1, 1) * speed : 0;
    p.my = Math.abs(dy) > 0.25 ? clamp(dy * -s, -1, 1) * speed : 0;

    if (incoming && !this.aiWhiff && p.swing <= 0 && b.y * s > 0) {
      const near = Math.abs(b.x - p.x) < 1.35 && Math.abs(b.y - p.y) < 1.3 && b.z < 2.5;
      if (near) {
        // Bidik menjauh dari lawan (dari sudut pandang komputer: kanan = −s·x).
        const rivalRight = rival.x * -s > 0;
        this.aiAim = (rivalRight ? -1 : 1) * rand(0.35, 0.95);
        const roll = Math.random();
        this.swing(side, roll < 0.68 ? "flat" : roll < 0.86 ? "lob" : "drop");
      }
    }
  }

  snapshot(): Snapshot {
    const view = (p: Player): PlayerView => ({ x: p.x, y: p.y, anim: p.anim, face: p.face });
    return {
      b: { x: this.ball.x, y: this.ball.y, z: this.ball.z },
      p: [view(this.players[0]), view(this.players[1])],
      pts: [this.pts[0], this.pts[1]],
      games: [this.games[0], this.games[1]],
      server: this.server,
      phase: this.phase,
      note: this.note,
      won: this.won,
      land: this.land,
      second: this.faults > 0 && (this.phase === "serve" || this.toss > 0),
    };
  }
}
