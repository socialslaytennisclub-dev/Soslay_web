import * as THREE from "three";

/**
 * Karakter 3D Slay Tennis, dibangun dari bentuk dasar three.js (tanpa file model):
 *  · Minslay   — maskot Slay: rambut navy, visor putih berpita lime, baju putih, sepatu navy,
 *                raket lime. Gaya kartun dengan garis tepi tebal seperti ilustrasi 2D-nya.
 *  · Ghostslay — hantu Slaymericano: badan krem melayang, topi oranye, raket krem. Tanpa bola.
 *
 * Keduanya menghadap +z, berdiri di y = 0, dan punya gerakan yang sama (lihat Motion). Gerakan
 * dihitung dari rumus pose per frame lalu dihaluskan, jadi pergantian gerak tidak patah.
 */

export type Motion = "idle" | "shuffle" | "run" | "forehand" | "backhand" | "serve" | "win" | "lose";
/** Gerakan sekali jalan → setelah selesai kembali ke gerakan dasar (idle / run / …). */
const ONE_SHOT: Partial<Record<Motion, number>> = { forehand: 0.6, backhand: 0.6, serve: 0.95 };

export type Character = {
  root: THREE.Group;
  /** Mainkan gerakan. Gerakan berulang (idle, run, win, lose) menjadi gerakan dasar. */
  play: (motion: Motion) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

const COLORS = {
  ink: 0x0a084a,
  navy: 0x0d0f4f,
  skin: 0xf7c9a0,
  white: 0xffffff,
  lime: 0xd7ff00,
  mouth: 0xd9455f,
  cream: 0xf5f0e3,
  orange: 0xe4571b,
  capBand: 0x5a2a12,
  grip: 0x2b2b33,
  black: 0x15151c,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Tekstur senar raket: kisi garis di atas latar transparan. */
function stringsTexture(color: string) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  for (let i = 8; i < size; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Pembuat bagian tubuh. `outline` > 0 menambah garis tepi (kulit terbalik sedikit lebih besar). */
function makeKit(toon: boolean, outline: number) {
  const disposables: { dispose: () => void }[] = [];
  const materials = new Map<number, THREE.Material>();
  const material = (color: number) => {
    let mat = materials.get(color);
    if (!mat) {
      mat = toon ? new THREE.MeshToonMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0 });
      materials.set(color, mat);
      disposables.push(mat);
    }
    return mat;
  };
  const inkMaterial = new THREE.MeshBasicMaterial({ color: COLORS.ink, side: THREE.BackSide });
  disposables.push(inkMaterial);

  const part = (geometry: THREE.BufferGeometry, color: number, edge = outline) => {
    disposables.push(geometry);
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.castShadow = true;
    group.add(mesh);
    if (edge > 0) {
      const shell = new THREE.Mesh(geometry, inkMaterial);
      shell.scale.setScalar(1 + edge);
      group.add(shell);
    }
    return group;
  };

  /**
   * Raket tenis (bukan bulu tangkis): gagang tebal & pendek, leher bercabang dua (V) yang langsung
   * menyambung ke kepala oval besar berbingkai tebal — tanpa batang panjang yang tipis.
   */
  const racket = (frame: number, grip: number, strings: string) => {
    const group = new THREE.Group();
    const handle = part(new THREE.CylinderGeometry(0.036, 0.04, 0.2, 14), grip, outline * 1.4);
    handle.position.y = -0.1;
    const cap = part(new THREE.CylinderGeometry(0.047, 0.047, 0.025, 14), grip, outline);
    cap.position.y = 0.005;
    group.add(cap);
    // Leher V: dua batang dari ujung gagang ke sisi bawah kepala raket.
    for (const side of [1, -1]) {
      const bar = part(new THREE.CylinderGeometry(0.02, 0.022, 0.185, 10), frame, outline * 1.6);
      bar.position.set(side * 0.048, -0.275, 0);
      bar.rotation.z = side * 0.52;
      group.add(bar);
    }
    const head = part(new THREE.TorusGeometry(0.155, 0.03, 12, 40), frame, outline * 0.45);
    head.scale.set(1, 1.3, 1);
    head.position.y = -0.53;
    const texture = stringsTexture(strings);
    const netMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const netGeometry = new THREE.CircleGeometry(0.15, 28);
    disposables.push(texture, netMaterial, netGeometry);
    const net = new THREE.Mesh(netGeometry, netMaterial);
    net.scale.set(1, 1.3, 1);
    net.position.y = -0.53;
    group.add(handle, head, net);
    return group;
  };

  return { part, racket, dispose: () => disposables.forEach((d) => d.dispose()) };
}

/** Putar gerakan: pose target dari rumus, pose tampil mengejar dengan halus. */
function makePlayer<P extends Record<string, number>>(rest: P, solve: (motion: Motion, t: number, pose: P) => void, apply: (pose: P, time: number) => void) {
  const pose = { ...rest };
  const target = { ...rest };
  let motion: Motion = "idle";
  let base: Motion = "idle";
  let t = 0;
  let clock = 0;
  return {
    play(next: Motion) {
      if (!(next in ONE_SHOT)) {
        base = next;
        // Pukulan yang sedang berjalan diselesaikan dulu, baru kembali ke gerakan dasar yang baru.
        if (motion in ONE_SHOT || next === motion) return;
      }
      motion = next;
      t = 0;
    },
    update(dt: number) {
      t += dt;
      clock += dt;
      const length = ONE_SHOT[motion];
      if (length !== undefined && t >= length) {
        motion = base;
        t = 0;
      }
      Object.assign(target, rest);
      solve(motion, t, target);
      const k = 1 - Math.exp(-dt * 22);
      for (const key in pose) pose[key] = lerp(pose[key], target[key], k) as P[typeof key];
      apply(pose, clock);
    },
  };
}

// ── Minslay ───────────────────────────────────────────────────────

/** Tinggi pinggul Minslay dari lantai (paha + betis/sepatu). */
const HIP_Y = 0.575;
const KNEE_Y = -0.2;
const ELBOW_Y = -0.17;

/**
 * Pose Minslay. Sudut dalam radian; sumbu x = tekuk depan/belakang, z = buka ke samping.
 * `twist` memutar badan atas saja (bahu), `yaw` memutar seluruh badan termasuk pinggul.
 */
const MINSLAY_REST = {
  y: 0, yaw: 0, twist: 0, lean: 0, head: 0,
  armRx: 0, armRz: -0.12, elbowR: -0.15, armLx: 0, armLz: 0.12, elbowL: -0.15,
  legRx: 0, legLx: 0, kneeR: 0, kneeL: 0, spread: 0.06, racket: 0,
};
type MinslayPose = typeof MINSLAY_REST;

/** Posisi siap: kaki lebar, lutut ditekuk, raket di depan dipegang dua tangan. */
function readyPose(p: MinslayPose) {
  p.y = -0.085;
  p.lean = 0.28;
  p.spread = 0.3;
  p.legRx = p.legLx = -0.5;
  p.kneeR = p.kneeL = 0.85;
  p.armRx = -0.75;
  p.armRz = 0.28;
  p.elbowR = -1.15;
  p.armLx = -0.75;
  p.armLz = -0.38;
  p.elbowL = -1.25;
  p.racket = 0.35;
}

export function createMinslay(): Character {
  const kit = makeKit(true, 0.045);
  const { part } = kit;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = HIP_Y;
  root.add(body);

  // Kaki: paha kulit → lutut → sepatu boot navy. Kanan karakter = −x.
  const leg = (side: 1 | -1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.14, 0, 0);
    const thigh = part(new THREE.CapsuleGeometry(0.09, 0.1, 6, 14), COLORS.skin);
    thigh.position.y = -0.1;
    const knee = new THREE.Group();
    knee.position.y = KNEE_Y;
    const boot = part(new THREE.CapsuleGeometry(0.135, 0.1, 6, 16), COLORS.navy);
    boot.position.y = -0.17;
    const foot = part(new THREE.SphereGeometry(0.15, 18, 14), COLORS.navy);
    foot.scale.set(1, 0.7, 1.55);
    foot.position.set(0, -0.27, 0.08);
    knee.add(boot, foot);
    hip.add(thigh, knee);
    body.add(hip);
    return { hip, knee };
  };
  const legL = leg(1);
  const legR = leg(-1);

  const shorts = part(new THREE.SphereGeometry(0.24, 22, 16), COLORS.white);
  shorts.scale.set(1.14, 0.66, 1);
  shorts.position.y = 0.08;
  body.add(shorts);

  const torso = new THREE.Group();
  torso.position.y = 0.1;
  body.add(torso);
  const shirt = part(new THREE.CapsuleGeometry(0.215, 0.13, 8, 20), COLORS.white);
  shirt.position.y = 0.17;
  torso.add(shirt);

  // Kepala besar gaya chibi.
  const head = new THREE.Group();
  head.position.y = 0.64;
  torso.add(head);
  const face = part(new THREE.SphereGeometry(0.34, 30, 22), COLORS.skin);
  const hair = part(new THREE.SphereGeometry(0.368, 30, 22), COLORS.navy);
  hair.position.set(0, 0.035, -0.06);
  // Rambut bagian atas-depan (di atas visor) — hanya tudung atas, supaya dahi tidak terlihat botak
  // tapi mata tidak tertutup.
  const hairTop = part(new THREE.SphereGeometry(0.362, 30, 14, 0, Math.PI * 2, 0, 1.26), COLORS.navy);
  hairTop.position.set(0, 0.03, -0.01);
  head.add(face, hair, hairTop);
  for (const side of [1, -1]) {
    const lock = part(new THREE.SphereGeometry(0.13, 16, 12), COLORS.navy);
    lock.scale.set(0.75, 1.35, 0.9);
    lock.position.set(side * 0.28, -0.1, 0.1);
    const ear = part(new THREE.SphereGeometry(0.065, 12, 10), COLORS.skin);
    ear.position.set(side * 0.335, -0.06, 0.02);
    const eye = part(new THREE.SphereGeometry(0.042, 14, 12), COLORS.ink, 0);
    eye.scale.set(1, 1.4, 0.5);
    eye.position.set(side * 0.12, -0.03, 0.317);
    head.add(ear, lock, eye);
  }
  const mouth = part(new THREE.SphereGeometry(0.05, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), COLORS.mouth, 0);
  mouth.scale.set(1.3, 1, 0.5);
  mouth.position.set(0, -0.13, 0.312);
  head.add(mouth);
  // Visor (bukan topi penuh, seperti di ilustrasi): pita putih melingkari kepala dengan garis lime
  // di tengahnya, dan lidah topi setengah lingkaran di depan. Rambut tetap terlihat di atasnya.
  const visor = new THREE.Group();
  visor.position.set(0, 0.135, -0.04);
  visor.rotation.x = -0.1;
  const band = part(new THREE.CylinderGeometry(0.4, 0.405, 0.12, 48), COLORS.white, 0.03);
  const stripe = part(new THREE.CylinderGeometry(0.41, 0.412, 0.042, 48), COLORS.lime, 0);
  // Setengah cakram menghadap depan (theta 0 = +z pada CylinderGeometry).
  const brim = part(new THREE.CylinderGeometry(0.29, 0.29, 0.04, 32, 1, false, -Math.PI / 2, Math.PI), COLORS.white, 0.04);
  brim.scale.z = 1.05;
  // Miring ke bawah supaya permukaan atasnya terlihat dari depan.
  brim.rotation.x = 0.24;
  brim.position.set(0, -0.04, 0.3);
  visor.add(band, stripe, brim);
  head.add(visor);

  // Lengan: bahu (lengan baju putih) → siku → lengan bawah & tangan. Tangan kanan memegang raket.
  const arm = (side: 1 | -1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.25, 0.27, 0);
    const sleeve = part(new THREE.SphereGeometry(0.1, 16, 12), COLORS.white);
    const upper = part(new THREE.CapsuleGeometry(0.058, 0.07, 6, 12), COLORS.skin);
    upper.position.y = -0.1;
    const elbow = new THREE.Group();
    elbow.position.y = ELBOW_Y;
    const fore = part(new THREE.CapsuleGeometry(0.055, 0.07, 6, 12), COLORS.skin);
    fore.position.y = -0.07;
    const hand = part(new THREE.SphereGeometry(0.075, 14, 12), COLORS.skin);
    hand.position.y = -0.16;
    elbow.add(fore, hand);
    shoulder.add(sleeve, upper, elbow);
    torso.add(shoulder);
    return { shoulder, elbow };
  };
  const armL = arm(1);
  const armR = arm(-1);
  const racket = kit.racket(COLORS.lime, COLORS.navy, "#0a084a");
  racket.position.y = -0.16;
  armR.elbow.add(racket);

  const player = makePlayer(
    MINSLAY_REST,
    (motion, t, p) => {
      switch (motion) {
        case "idle": {
          // Ready stance: memantul ringan dari kaki ke kaki.
          readyPose(p);
          const bounce = Math.sin(t * 6.5);
          p.y += Math.abs(bounce) * 0.03;
          p.yaw = Math.sin(t * 3.25) * 0.06;
          p.kneeR += bounce * 0.12;
          p.kneeL -= bounce * 0.12;
          break;
        }
        case "shuffle": {
          // Langkah samping: kaki membuka-menutup sambil tetap menghadap net.
          readyPose(p);
          const step = Math.sin(t * 11);
          p.spread = 0.3 + step * 0.2;
          p.y = -0.09 + Math.abs(Math.cos(t * 11)) * 0.06;
          p.kneeR = 0.7 + step * 0.25;
          p.kneeL = 0.7 - step * 0.25;
          p.lean = 0.24;
          break;
        }
        case "run": {
          const phase = t * 13;
          const swing = Math.sin(phase);
          p.y = Math.abs(swing) * 0.06;
          p.lean = 0.36;
          p.legLx = swing * 0.95 - 0.1;
          p.legRx = -swing * 0.95 - 0.1;
          // Lutut menekuk saat kaki terayun ke belakang.
          p.kneeL = 0.25 + Math.max(0, swing) * 1.3;
          p.kneeR = 0.25 + Math.max(0, -swing) * 1.3;
          p.armLx = -swing * 0.9;
          p.elbowL = -1.4;
          p.armRx = swing * 0.7 - 0.2;
          p.elbowR = -1.3;
          p.armRz = -0.3;
          p.head = -0.12;
          break;
        }
        case "forehand": {
          // Putar bahu, raket ke belakang, ayun menembus bola, lalu selesai di atas bahu kiri.
          const k = t / 0.6;
          const prep = ease(k / 0.3);
          const hit = ease((k - 0.32) / 0.3);
          const follow = ease((k - 0.55) / 0.4);
          p.y = -0.1 + hit * 0.04;
          p.spread = 0.32;
          p.yaw = lerp(-0.35 * prep, 0.35, hit);
          p.twist = lerp(-1.05 * prep, 0.95, hit);
          p.lean = 0.2;
          p.legLx = -0.45;
          p.kneeL = 0.6;
          p.legRx = lerp(0.15, -0.25, hit);
          p.kneeR = 0.7;
          p.armRz = lerp(lerp(-0.12, -1.25, prep), 0.35, follow);
          p.armRx = lerp(lerp(0, 0.7, prep), lerp(-1.5, -2.0, follow), hit);
          p.elbowR = lerp(lerp(-0.6, -0.15, hit), -1.7, follow);
          p.armLx = lerp(-1.3 * prep, -0.4, hit);
          p.armLz = lerp(-0.2 * prep, 0.5, hit);
          p.elbowL = -0.5;
          p.racket = lerp(-0.5, 0.6, hit);
          break;
        }
        case "backhand": {
          // Raket melintang di depan badan (tangan kiri ikut memegang), lalu disapu ke luar.
          const k = t / 0.6;
          const prep = ease(k / 0.3);
          const hit = ease((k - 0.32) / 0.3);
          const follow = ease((k - 0.55) / 0.4);
          p.y = -0.1 + hit * 0.04;
          p.spread = 0.32;
          p.yaw = lerp(0.35 * prep, -0.3, hit);
          p.twist = lerp(1.1 * prep, -0.9, hit);
          p.lean = 0.22;
          p.legRx = -0.45;
          p.kneeR = 0.6;
          p.legLx = lerp(0.15, -0.25, hit);
          p.kneeL = 0.7;
          p.armRx = lerp(-0.95, -1.35, hit);
          p.armRz = lerp(lerp(-0.12, 0.95, prep), lerp(-1.2, -1.5, follow), hit);
          p.elbowR = lerp(lerp(-0.2, -1.2, prep), -0.15, hit);
          p.armLx = lerp(-0.95 * prep, 0.35, hit);
          p.armLz = lerp(-0.6 * prep, 0.7, hit);
          p.elbowL = lerp(-1.1, -0.3, hit);
          p.racket = lerp(0.4, -0.3, hit);
          break;
        }
        case "serve": {
          // Lempar bola (tangan kiri naik), raket jatuh di belakang punggung, lompat & pukul di titik
          // tertinggi, lalu ayunan turun melintang badan.
          const k = t / 0.95;
          const toss = ease(k / 0.32);
          const load = ease((k - 0.15) / 0.3);
          const hit = ease((k - 0.5) / 0.16);
          const follow = ease((k - 0.66) / 0.3);
          p.y = -0.13 * load * (1 - hit) + Math.sin(Math.PI * clamp01((k - 0.45) / 0.45)) * 0.26;
          p.kneeR = p.kneeL = lerp(0.95 * load, 0.15, hit) + follow * 0.5;
          p.legRx = p.legLx = lerp(-0.5 * load, 0, hit) - follow * 0.25;
          p.twist = lerp(-0.7 * load, 0.6, hit);
          p.lean = lerp(-0.22 * load, 0.4, follow);
          p.head = lerp(-0.35 * toss, 0.1, follow);
          p.armLx = lerp(-3.0 * toss, -0.7, hit);
          p.elbowL = lerp(-0.05, -1.5, hit);
          p.armLz = 0.15;
          p.armRz = lerp(-0.45, 0.35, follow);
          p.armRx = lerp(lerp(-2.5 * load, -3.05, hit), -0.7, follow);
          p.elbowR = lerp(lerp(-1.9 * load, -0.08, hit), -0.5, follow);
          break;
        }
        case "win": {
          const hop = Math.abs(Math.sin(t * 7));
          p.y = hop * 0.2 - 0.03;
          p.kneeR = p.kneeL = 0.5 * (1 - hop);
          p.legRx = p.legLx = -0.25 * (1 - hop);
          p.armLx = p.armRx = -2.85;
          p.elbowL = p.elbowR = -0.35;
          p.armLz = 0.35 + Math.sin(t * 14) * 0.15;
          p.armRz = -0.35 - Math.sin(t * 14) * 0.15;
          p.head = -0.18;
          p.spread = 0.2;
          break;
        }
        case "lose": {
          // Bahu turun dan kepala menunduk — tidak terlalu dalam supaya wajahnya masih terlihat.
          p.y = -0.04;
          p.lean = 0.3;
          p.head = 0.34;
          p.yaw = Math.sin(t * 1.5) * 0.05;
          p.kneeR = p.kneeL = 0.3;
          p.legRx = p.legLx = -0.15;
          p.armRz = -0.05;
          p.armLz = 0.05;
          p.armRx = p.armLx = 0.15;
          p.elbowR = p.elbowL = -0.1;
          break;
        }
      }
    },
    (p) => {
      body.position.y = HIP_Y + p.y;
      body.rotation.y = p.yaw;
      torso.rotation.set(p.lean, p.twist, 0);
      head.rotation.set(p.head - p.lean * 0.6, -p.twist * 0.55, 0);
      armR.shoulder.rotation.set(p.armRx, 0, p.armRz);
      armL.shoulder.rotation.set(p.armLx, 0, p.armLz);
      armR.elbow.rotation.x = p.elbowR;
      armL.elbow.rotation.x = p.elbowL;
      legR.hip.rotation.set(p.legRx, 0, -p.spread);
      legL.hip.rotation.set(p.legLx, 0, p.spread);
      legR.knee.rotation.x = p.kneeR;
      legL.knee.rotation.x = p.kneeL;
      racket.rotation.y = p.racket;
    },
  );

  return { root, play: player.play, update: player.update, dispose: kit.dispose };
}

// ── Ghostslay ─────────────────────────────────────────────────────

const GHOST_REST = { y: 0, yaw: 0, tiltX: 0, tiltZ: 0, squash: 1, armRx: 0, armRz: -2.2, armLx: 0, armLz: 0.7, wave: 1 };

export function createGhostslay(): Character {
  const kit = makeKit(false, 0);
  const { part } = kit;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Badan: profil diputar (lathe) — kepala bulat, pinggang, lalu rok kain yang melebar.
  const profile = [
    [0.001, 1.08], [0.12, 1.06], [0.22, 1.0], [0.29, 0.91], [0.32, 0.8], [0.325, 0.68],
    [0.33, 0.55], [0.35, 0.42], [0.39, 0.3], [0.44, 0.18], [0.49, 0.08], [0.5, 0.0],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const sheetGeometry = new THREE.LatheGeometry(new THREE.SplineCurve(profile).getPoints(40), 72);
  const sheet = part(sheetGeometry, COLORS.cream);
  const sheetMaterial = (sheet.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
  sheetMaterial.side = THREE.DoubleSide;
  body.add(sheet);
  const basePositions = (sheetGeometry.attributes.position.array as Float32Array).slice();

  for (const side of [1, -1]) {
    const eye = part(new THREE.SphereGeometry(0.052, 16, 12), COLORS.black);
    eye.scale.set(1, 1.55, 0.5);
    eye.position.set(side * 0.115, 0.83, 0.29);
    body.add(eye);
  }
  const mouth = part(new THREE.SphereGeometry(0.085, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), COLORS.black);
  mouth.scale.set(1.25, 1.1, 0.45);
  mouth.position.set(0, 0.72, 0.3);
  body.add(mouth);

  // Topi oranye, sedikit miring.
  const cap = new THREE.Group();
  cap.position.set(0, 0.93, 0);
  cap.rotation.set(-0.2, 0, 0.12);
  const crown = part(new THREE.SphereGeometry(0.3, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2), COLORS.orange);
  crown.scale.y = 0.85;
  const band = part(new THREE.TorusGeometry(0.3, 0.018, 8, 36), COLORS.capBand);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.012;
  const brim = part(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 26), COLORS.orange);
  brim.scale.z = 0.85;
  brim.position.set(0, 0.0, 0.27);
  brim.rotation.x = 0.1;
  cap.add(crown, band, brim);
  body.add(cap);

  // Lengan kain pendek. Kanan (−x) memegang raket krem — tangan kiri kosong (tanpa bola).
  const arm = (side: 1 | -1) => {
    const group = new THREE.Group();
    group.position.set(side * 0.29, 0.6, 0.04);
    const limb = part(new THREE.CapsuleGeometry(0.075, 0.2, 6, 14), COLORS.cream);
    limb.position.y = -0.14;
    group.add(limb);
    body.add(group);
    return group;
  };
  const armL = arm(1);
  const armR = arm(-1);
  const racket = kit.racket(COLORS.cream, COLORS.grip, "#e9e2cf");
  racket.position.y = -0.27;
  armR.add(racket);

  const player = makePlayer(
    GHOST_REST,
    (motion, t, p) => {
      switch (motion) {
        case "idle":
          p.y = Math.sin(t * 3) * 0.06;
          p.tiltZ = Math.sin(t * 1.6) * 0.06;
          p.armRz = -2.25 + Math.sin(t * 3) * 0.1;
          break;
        case "shuffle":
          // Bergeser ke samping: badan miring bergantian, kain berkibar.
          p.y = Math.abs(Math.sin(t * 11)) * 0.06;
          p.tiltZ = Math.sin(t * 11) * 0.22;
          p.wave = 2;
          break;
        case "run":
          p.y = Math.sin(t * 9) * 0.04;
          p.tiltX = 0.38;
          p.wave = 2.4;
          p.armRz = -1.9;
          p.armLz = 1.5;
          break;
        case "forehand": {
          const s = ease((t / 0.6 - 0.25) / 0.45);
          p.yaw = lerp(-1.0, 1.25, s);
          p.tiltZ = lerp(-0.15, 0.2, s);
          p.armRz = -1.5;
          p.armRx = lerp(0.8, -1.2, s);
          p.wave = 2;
          break;
        }
        case "backhand": {
          const s = ease((t / 0.6 - 0.25) / 0.45);
          p.yaw = lerp(1.0, -1.1, s);
          p.tiltZ = lerp(0.15, -0.2, s);
          p.armRx = -1.2;
          p.armRz = lerp(0.9, -1.4, s);
          p.wave = 2;
          break;
        }
        case "serve": {
          const p01 = t / 0.95;
          const swing = ease((p01 - 0.5) / 0.22);
          p.y = Math.sin(Math.PI * clamp01((p01 - 0.2) / 0.65)) * 0.35;
          p.squash = 1 + Math.sin(Math.PI * clamp01(p01 / 0.5)) * 0.12;
          p.tiltX = lerp(-0.25, 0.4, swing);
          p.armRz = -0.4;
          p.armRx = lerp(-3.5, -0.4, swing);
          p.armLz = 2.4 * (1 - swing);
          break;
        }
        case "win":
          p.yaw = t * 7;
          p.y = 0.12 + Math.abs(Math.sin(t * 6)) * 0.18;
          p.armRz = -2.7;
          p.armLz = 2.7;
          p.wave = 2.2;
          break;
        case "lose":
          p.y = -0.16;
          p.squash = 0.8;
          p.tiltX = 0.35;
          p.armRz = -0.5;
          p.armLz = 0.5;
          p.wave = 0.4;
          break;
      }
    },
    (p, time) => {
      body.position.y = 0.3 + p.y;
      body.rotation.set(p.tiltX, p.yaw, p.tiltZ);
      body.scale.set(1 / Math.sqrt(p.squash), p.squash, 1 / Math.sqrt(p.squash));
      armR.rotation.set(p.armRx, 0, p.armRz);
      armL.rotation.set(p.armLx, 0, p.armLz);
      // Ujung kain bergelombang: makin ke bawah makin besar ayunannya.
      const position = sheetGeometry.attributes.position;
      const array = position.array as Float32Array;
      for (let i = 0; i < array.length; i += 3) {
        const y = basePositions[i + 1];
        if (y > 0.45) continue;
        const x = basePositions[i];
        const z = basePositions[i + 2];
        const amount = (1 - y / 0.45) ** 1.6;
        const angle = Math.atan2(z, x);
        const ripple = 1 + Math.sin(angle * 6 + time * 4 * p.wave) * 0.11 * amount;
        array[i] = x * ripple;
        array[i + 2] = z * ripple;
        array[i + 1] = y + Math.cos(angle * 6 + time * 4 * p.wave) * 0.035 * amount;
      }
      position.needsUpdate = true;
      sheetGeometry.computeVertexNormals();
    },
  );

  return { root, play: player.play, update: player.update, dispose: kit.dispose };
}
