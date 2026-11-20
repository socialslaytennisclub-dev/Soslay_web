import * as THREE from "three";
import { STORY_H, STORY_TYPE, STORY_W } from "../SlayRally/storyCard";
import { createGhostslay, createMinslay } from "./characters3d";

/**
 * Gambar Instagram Story (1080×1920) hasil pertandingan Slay Tennis: Minslay (pemain di layar ini)
 * dan Ghostslay (lawan) berdiri berdampingan — pemenang berpose menang, yang kalah berpose kalah —
 * dengan nama kedua pemain, skor game, dan Slay Point yang didapat.
 */

export const TENNIS_STORY_FILENAME = "slay-tennis-result.jpg";

export type TennisStoryData = {
  /** Nama pemain di layar ini (Minslay) dan lawannya (Ghostslay). */
  me: string;
  foe: string;
  won: boolean;
  /** Skor game: [saya, lawan]. */
  games: [number, number];
  /** Slay Point yang didapat dari pertandingan ini (member vs member), bila ada. */
  points: number;
  /** Domain + path ajakan, mis. "slayclub.id/gameoncourt". */
  link: string;
};

const POSE_W = 1080;
const POSE_H = 800;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function tokens() {
  const css = getComputedStyle(document.documentElement);
  const t = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    navy950: t("--color-navy-950", "#060628"),
    navy900: t("--color-navy-900", "#0a084a"),
    indigo500: t("--color-indigo-500", "#4035de"),
    lime: t("--color-lime-neon", "#d7ff00"),
    pink: t("--color-pink-500", "#ec6abc"),
    white: "#ffffff",
    display: t("--font-display", "system-ui, sans-serif"),
    ui: t("--font-ui", "system-ui, sans-serif"),
  };
}

/**
 * Render kedua karakter 3D ke kanvas transparan: Minslay di kiri, Ghostslay di kanan, masing-masing
 * dibekukan di tengah gerakan menang / kalahnya.
 */
function renderPoses(meWon: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = POSE_W;
  canvas.height = POSE_H;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(POSE_W, POSE_H, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a8a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(2.5, 5, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(34, POSE_W / POSE_H, 0.1, 50);
  camera.position.set(0, 1.25, 6.6);
  camera.lookAt(0, 1.02, 0);

  const minslay = createMinslay();
  const ghostslay = createGhostslay();
  minslay.root.position.x = -1.05;
  minslay.root.rotation.y = 0.28;
  minslay.root.scale.setScalar(1.1);
  ghostslay.root.position.x = 1.05;
  ghostslay.root.rotation.y = -0.28;
  ghostslay.root.scale.setScalar(1.22);
  scene.add(minslay.root, ghostslay.root);

  // Maju-kan animasi sampai pose terbaiknya: Minslay di puncak lompatan (±0,22 dtk), Ghostslay saat
  // putarannya kembali menghadap depan (±0,94 dtk). Pose kalah diam, cukup dihaluskan.
  const freeze = (character: typeof minslay, won: boolean, winTime: number) => {
    character.play(won ? "win" : "lose");
    const total = won ? winTime : 0.5;
    for (let t = 0; t < total; t += 0.01) character.update(0.01);
  };
  freeze(minslay, meWon, 0.22);
  freeze(ghostslay, !meWon, 0.94);

  renderer.render(scene, camera);
  minslay.dispose();
  ghostslay.dispose();
  renderer.dispose();
  return canvas;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, weight: number, size: number, family: string, min = 28) {
  let px = size;
  ctx.font = `${weight} ${px}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && px > min) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${family}`;
  }
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  const chars = [...text];
  const width = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + spacing * (chars.length - 1);
  let cx = x - width / 2;
  ctx.textAlign = "left";
  for (const ch of chars) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = "center";
}

function pill(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, h: number, fill: string | null, ink: string, stroke?: string) {
  const w = ctx.measureText(text).width + h;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, y, w, h, h / 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
  ctx.fillStyle = ink;
  ctx.fillText(text, cx, y + h * 0.66);
}

export async function renderTennisStory(data: TennisStoryData): Promise<Blob> {
  const c = tokens();
  await Promise.race([
    Promise.all([
      document.fonts.load(`800 200px ${c.display}`),
      document.fonts.load(`700 40px ${c.display}`),
      document.fonts.load(`600 40px ${c.ui}`),
    ]).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  const logo = await loadImage("/images/brand/logo-lime.webp").catch(() => null);
  const poses = renderPoses(data.won);

  const canvas = document.createElement("canvas");
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const mid = STORY_W / 2;

  // Latar navy + cahaya lime di belakang skor.
  const bg = ctx.createLinearGradient(0, 0, 0, STORY_H);
  bg.addColorStop(0, c.navy950);
  bg.addColorStop(0.5, c.navy900);
  bg.addColorStop(1, c.navy950);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  const glow = ctx.createRadialGradient(mid, 700, 40, mid, 700, 620);
  glow.addColorStop(0, "rgba(215,255,0,0.2)");
  glow.addColorStop(1, "rgba(215,255,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  // Isi penting di antara y 250–1670 (di luar itu tertutup bar profil / kolom balas Instagram).
  if (logo) {
    const w = 320;
    ctx.drawImage(logo, mid - w / 2, 262, w, (logo.naturalHeight / logo.naturalWidth) * w);
  }
  ctx.fillStyle = c.lime;
  ctx.font = `700 36px ${c.display}`;
  spaced(ctx, "SLAY TENNIS", mid, 440, 10);

  // Judul: siapa yang menang.
  const winner = data.won ? data.me : data.foe;
  ctx.fillStyle = c.white;
  fitText(ctx, `${winner} wins!`, STORY_W - 140, 800, 92, c.display, 48);
  ctx.fillText(`${winner} wins!`, mid, 545);

  // Skor game.
  ctx.fillStyle = c.lime;
  ctx.font = `800 210px ${c.display}`;
  ctx.fillText(`${data.games[0]} – ${data.games[1]}`, mid, 748);

  // Lantai lapangan + kedua karakter.
  const floorY = 1345;
  ctx.fillStyle = c.indigo500;
  ctx.beginPath();
  ctx.ellipse(mid, floorY, 500, 72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(mid, floorY, 430, 52, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Lantai dunia (y = 0) jatuh di ±75% tinggi render (kamera fov 34° dari jarak 6,6, melihat y ≈ 1).
  const poseH = 830;
  const poseW = (POSE_W / POSE_H) * poseH;
  ctx.drawImage(poses, mid - poseW / 2, floorY - poseH * 0.75, poseW, poseH);

  // VS + nama pemain di bawah tiap karakter; pemenang diberi lencana.
  ctx.fillStyle = c.pink;
  ctx.font = `800 64px ${c.display}`;
  ctx.fillText("VS", mid, 1115);
  const names: [string, number, boolean][] = [
    [data.me, mid - 262, data.won],
    [data.foe, mid + 262, !data.won],
  ];
  for (const [name, x, won] of names) {
    fitText(ctx, name, 400, 800, 46, c.display, 30);
    // Pemenang: lencana lime penuh; yang kalah: garis tepi saja.
    // Jarak: lantai → nama 36 px, nama → ajakan 44 px (batas aman bawah Story ±1670).
    pill(ctx, name, x, 1453, 78, won ? c.lime : null, won ? c.navy950 : c.white, won ? undefined : "rgba(255,255,255,0.6)");
  }

  if (data.points > 0) {
    ctx.font = `700 36px ${c.display}`;
    pill(ctx, `+${data.points} Slay Point`, mid, 778, 68, c.pink, c.navy950);
  }

  // Ajakan.
  ctx.font = `700 40px ${c.display}`;
  pill(ctx, `Play me at ${data.link}`, mid, 1575, 80, c.navy950, c.lime, c.lime);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), STORY_TYPE, 0.9),
  );
}
