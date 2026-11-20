import * as THREE from "three";
import { createGhostslay, createMinslay, type Character, type Motion } from "./characters3d";
import { COURT, type PlayerView, type Side, type Snapshot } from "./engine";

/**
 * Lapangan 3D Slay Tennis (three.js): kamera di belakang baseline dekat, Minslay di sisi dekat
 * (pemain di layar ini) dan Ghostslay di sisi jauh (lawan). `me` = sisi yang tampil dekat — untuk
 * pemain sisi 1 dunia diputar 180° supaya ia tetap bermain dari bawah layar.
 *
 * Koordinat permainan (x lebar, y panjang, z tinggi) → three.js (x, tinggi, −y).
 */

export type TennisPalette = {
  sky: string;
  ground: string;
  court: string;
  courtAlt: string;
  line: string;
  ball: string;
  ink: string;
  post: string;
};

/**
 * Skala karakter. Layar tegak: sengaja besar supaya terbaca di lapangan yang tampil sempit.
 * Layar mendatar: lapangan tampil besar, jadi karakter diperkecil mendekati proporsi asli
 * (Minslay ±2,4 m di lapangan 23,8 m) supaya lapangan tidak terasa kecil.
 */
const MINSLAY_SCALE = 2.0;
const GHOST_SCALE = 2.4;
const LANDSCAPE_SCALE = 0.68;
const SHADOW_RADIUS = { near: 0.9, far: 1.0 };
const BALL_R = 0.24;

function netTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(6,6,40,0.35)";
  ctx.fillRect(0, 0, 512, 64);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= 512; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 64);
    ctx.stroke();
  }
  for (let y = 0; y <= 64; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

type Actor = {
  character: Character;
  shadow: THREE.Mesh;
  lastAnim: string;
  loop: Motion;
  x: number;
  y: number;
};

export class CourtView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.5, 200);
  private disposables: { dispose: () => void }[] = [];
  private near: Actor;
  private far: Actor;
  private ball: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private ring: THREE.Mesh;
  private time = 0;
  /** Skala bola (ikut ukuran karakter): lebih kecil di layar mendatar. */
  private ballScale = 1;
  /** Posisi tampil yang dihaluskan (snapshot jaringan datang ±15 kali per detik). */
  private smooth: Snapshot | null = null;

  constructor(canvas: HTMLCanvasElement, palette: TennisPalette) {
    // Melempar error bila WebGL tidak tersedia — ditangani pemanggil.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setClearColor(palette.sky);
    this.scene.fog = new THREE.Fog(palette.sky, 60, 130);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a70, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-6, 14, 10);
    this.scene.add(sun);

    const keep = <T extends { dispose: () => void }>(item: T) => {
      this.disposables.push(item);
      return item;
    };
    const flat = (color: string, opacity = 1) =>
      keep(new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
    /** Bidang datar di lantai: pusat (x, y permainan), ukuran w × l, sedikit di atas lantai. */
    const slab = (x: number, y: number, w: number, l: number, material: THREE.Material, lift: number) => {
      const mesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, l)), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, lift, -y);
      this.scene.add(mesh);
      return mesh;
    };

    const { halfW, doublesHalfW, halfL, serviceY, netH } = COURT;
    slab(0, 0, 400, 400, flat(palette.ground), -0.02);
    // Area lari di sekeliling lapangan (±3,7 m di samping, ±6,4 m di belakang baseline).
    slab(0, 0, (doublesHalfW + 3.7) * 2, (halfL + 6.4) * 2, flat(palette.courtAlt), 0);
    slab(0, 0, doublesHalfW * 2, halfL * 2, flat(palette.court), 0.005);
    // Garis lapangan tenis lengkap: baseline & garis samping ganda, garis samping tunggal,
    // garis servis, garis servis tengah, dan tanda tengah di tiap baseline.
    const line = flat(palette.line);
    const lw = 0.1;
    for (const end of [-1, 1]) {
      slab(0, end * halfL, doublesHalfW * 2 + lw, lw * 1.6, line, 0.01);
      slab(0, end * serviceY, halfW * 2 + lw, lw, line, 0.01);
      slab(0, end * (halfL - 0.2), lw, 0.4, line, 0.01);
    }
    for (const side of [-1, 1]) {
      slab(side * doublesHalfW, 0, lw, halfL * 2, line, 0.01);
      slab(side * halfW, 0, lw, halfL * 2, line, 0.01);
    }
    slab(0, 0, lw, serviceY * 2, line, 0.01);

    // Net: jaring tembus pandang, pita putih di atas, tiang lime.
    // Net membentang selebar lapangan ganda, tiang 0,91 m di luar garis samping.
    const netW = (doublesHalfW + 0.91) * 2;
    const mesh = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(netW, netH)),
      keep(new THREE.MeshBasicMaterial({ map: keep(netTexture()), transparent: true, side: THREE.DoubleSide, depthWrite: false })),
    );
    mesh.position.set(0, netH / 2, 0);
    this.scene.add(mesh);
    const tape = new THREE.Mesh(keep(new THREE.BoxGeometry(netW, 0.1, 0.06)), flat(palette.line));
    tape.position.set(0, netH + 0.03, 0);
    this.scene.add(tape);
    const postGeometry = keep(new THREE.CylinderGeometry(0.09, 0.09, netH + 0.25, 12));
    const postMaterial = flat(palette.post);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set((side * netW) / 2, (netH + 0.25) / 2, 0);
      this.scene.add(post);
    }

    // Bayangan bulat (murah untuk HP) + penanda titik pantul.
    const blobGeometry = keep(new THREE.CircleGeometry(1, 28));
    const blobMaterial = flat("#060628", 0.32);
    const blob = (radius: number) => {
      const shadow = new THREE.Mesh(blobGeometry, blobMaterial);
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.setScalar(radius);
      shadow.position.y = 0.02;
      this.scene.add(shadow);
      return shadow;
    };
    this.ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.55, 0.78, 40)), flat(palette.ball, 0.9));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.ball = new THREE.Mesh(
      keep(new THREE.SphereGeometry(BALL_R, 20, 16)),
      keep(new THREE.MeshStandardMaterial({ color: palette.ball, emissive: palette.ball, emissiveIntensity: 0.35, roughness: 0.6 })),
    );
    this.scene.add(this.ball);
    this.ballShadow = blob(0.28);

    const actor = (character: Character, scale: number, facing: number, shadow: number): Actor => {
      character.root.scale.setScalar(scale);
      character.root.rotation.y = facing;
      this.scene.add(character.root);
      this.disposables.push(character);
      return { character, shadow: blob(shadow), lastAnim: "", loop: "idle", x: 0, y: 0 };
    };
    // Pemain dekat membelakangi kamera (menghadap net); lawan menghadap kamera.
    this.near = actor(createMinslay(), MINSLAY_SCALE, Math.PI, SHADOW_RADIUS.near);
    this.far = actor(createGhostslay(), GHOST_SCALE, 0, SHADOW_RADIUS.far);
  }

  resize(width: number, height: number, dpr: number) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    // Layar lebar: kamera rendah di belakang pemain. Potret: lebih tinggi & sudut lebih lebar supaya
    // lebar lapangan tetap muat.
    const k = aspect >= 1 ? LANDSCAPE_SCALE : 1;
    this.near.character.root.scale.setScalar(MINSLAY_SCALE * k);
    // Lawan di kejauhan sedikit kurang diperkecil supaya tetap terbaca.
    const kFar = aspect >= 1 ? LANDSCAPE_SCALE * 1.18 : 1;
    this.far.character.root.scale.setScalar(GHOST_SCALE * kFar);
    this.near.shadow.scale.setScalar(SHADOW_RADIUS.near * k);
    // Bola: ±14 cm di layar mendatar, ±19 cm di layar tegak (bola asli 3,3 cm tidak akan terlihat).
    this.ballScale = aspect >= 1 ? 0.58 : 0.8;
    this.ball.scale.setScalar(this.ballScale);
    this.far.shadow.scale.setScalar(SHADOW_RADIUS.far * kFar);
    if (aspect >= 1) {
      // Kamera dekat & rendah di belakang baseline: lapangan mengisi lebar layar, dan area lari di
      // belakang baseline (sampai ±2,6 m) tetap terlihat di tepi bawah.
      this.camera.fov = 42;
      this.camera.position.set(0, 10.5, 23.5);
      this.camera.lookAt(0, 0, 5);
    } else {
      this.camera.fov = 62;
      this.camera.position.set(0, 14, 24.5);
      this.camera.lookAt(0, 0, 2.5);
    }
    this.camera.updateProjectionMatrix();
  }

  /** `lerp` 0–1: seberapa cepat tampilan mengejar snapshot (1 = langsung, untuk host). */
  render(target: Snapshot, me: Side, dt: number, lerp = 1) {
    this.time += dt;
    const s = this.blend(target, lerp);
    const flip = me === 1 ? -1 : 1;
    const foe: Side = me === 0 ? 1 : 0;

    this.place(this.near, s.p[me], flip, dt, s, s.won === me);
    this.place(this.far, s.p[foe], flip, dt, s, s.won === foe);

    const bx = s.b.x * flip;
    const bz = -s.b.y * flip;
    this.ball.position.set(bx, s.b.z + BALL_R * this.ballScale, bz);
    this.ballShadow.position.set(bx, 0.02, bz);
    this.ballShadow.scale.setScalar(Math.max(0.14, 0.3 - s.b.z * 0.03) * this.ballScale);

    // Penanda pantul hanya untuk bola yang menuju sisi kita.
    const land = s.phase === "rally" ? s.land : null;
    const mine = land && land.y * flip < 0;
    this.ring.visible = Boolean(mine);
    if (land && mine) {
      this.ring.position.set(land.x * flip, 0.03, -land.y * flip);
      this.ring.scale.setScalar((1 + Math.sin(this.time * 9) * 0.1) * (0.55 + this.ballScale * 0.45));
    }

    this.renderer.render(this.scene, this.camera);
  }

  private place(actor: Actor, view: PlayerView, flip: number, dt: number, s: Snapshot, won: boolean) {
    const x = view.x * flip;
    const z = -view.y * flip;
    const dx = x - actor.x;
    const dz = z - actor.y;
    actor.x = x;
    actor.y = z;
    actor.character.root.position.set(x, 0, z);
    actor.shadow.position.set(x, 0.02, z);

    // Pukulan: sekali jalan, dipicu saat animasi di snapshot berganti.
    const swing: Partial<Record<PlayerView["anim"], Motion>> = { swingR: "forehand", swingL: "backhand", serve: "serve" };
    const shot = swing[view.anim];
    if (shot && actor.lastAnim !== view.anim) actor.character.play(shot);
    actor.lastAnim = view.anim;

    let loop: Motion = "idle";
    if (s.phase === "over") loop = won ? "win" : "lose";
    else if (view.anim === "run") loop = Math.abs(dx) > Math.abs(dz) * 1.2 ? "shuffle" : "run";
    if (loop !== actor.loop && !shot) {
      actor.loop = loop;
      actor.character.play(loop);
    }
    actor.character.update(dt);
  }

  private blend(target: Snapshot, lerp: number): Snapshot {
    const prev = this.smooth;
    if (!prev || lerp >= 1 || prev.phase !== target.phase) {
      this.smooth = structuredClone(target);
      return this.smooth;
    }
    const mix = (a: number, b: number) => a + (b - a) * lerp;
    const next = structuredClone(target);
    next.b = { x: mix(prev.b.x, target.b.x), y: mix(prev.b.y, target.b.y), z: mix(prev.b.z, target.b.z) };
    next.p = target.p.map((p, i) => ({ ...p, x: mix(prev.p[i].x, p.x), y: mix(prev.p[i].y, p.y) })) as [PlayerView, PlayerView];
    this.smooth = next;
    return next;
  }

  dispose() {
    for (const item of this.disposables) item.dispose();
    this.renderer.dispose();
  }
}
