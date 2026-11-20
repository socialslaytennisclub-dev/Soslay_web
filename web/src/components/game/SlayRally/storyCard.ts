/**
 * Gambar Instagram Story (1080×1920) hasil game Slay Rally — digambar di <canvas> dari token warna
 * & font situs, lalu dibagikan lewat Web Share API (lembar share HP → Instagram → Story) atau diunduh.
 */

// Isi penting berada di antara y 250–1670: bagian atas & bawah Story tertutup bar profil / kolom balas Instagram.
export const STORY_W = 1080;
export const STORY_H = 1920;
export const STORY_FILENAME = "slay-rally-score.png";

export type StoryData = {
  score: number;
  level: number;
  newBest: boolean;
  /** Peringkat di leaderboard (member); null = tamu / tidak diketahui. */
  rank: number | null;
  /** Slay Point yang didapat dari game ini (member). */
  points: number | null;
  /** Domain + path ajakan, mis. "slayclub.id/game". */
  link: string;
};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Nilai token CSS (warna / keluarga font) — canvas tidak bisa membaca var(--…). */
function tokens() {
  const css = getComputedStyle(document.documentElement);
  const t = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    navy950: t("--color-navy-950", "#060628"),
    navy900: t("--color-navy-900", "#0a084a"),
    indigo500: t("--color-indigo-500", "#4035de"),
    indigo700: t("--color-indigo-700", "#26209a"),
    lime: t("--color-lime-neon", "#d7ff00"),
    pink: t("--color-pink-500", "#ec6abc"),
    white: "#ffffff",
    display: t("--font-display", "system-ui, sans-serif"),
    ui: t("--font-ui", "system-ui, sans-serif"),
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Teks dengan jarak huruf (overline) — canvas lama tidak punya letterSpacing. */
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

/** Lapangan tenis perspektif di bagian bawah, sama nuansanya dengan lapangan 3D di game. */
function drawCourt(ctx: CanvasRenderingContext2D, c: ReturnType<typeof tokens>) {
  const top = 1270;
  const bottom = STORY_H + 40;
  const farHalf = 250;
  const nearHalf = 640;
  const mid = STORY_W / 2;
  const at = (t: number) => ({ y: top + (bottom - top) * t, half: farHalf + (nearHalf - farHalf) * t });

  const grad = ctx.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, c.indigo700);
  grad.addColorStop(1, c.indigo500);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(mid - farHalf, top);
  ctx.lineTo(mid + farHalf, top);
  ctx.lineTo(mid + nearHalf, bottom);
  ctx.lineTo(mid - nearHalf, bottom);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 6;
  ctx.stroke();
  // Garis singles, servis & tengah.
  const line = (t1: number, f1: number, t2: number, f2: number) => {
    const a = at(t1);
    const b = at(t2);
    ctx.beginPath();
    ctx.moveTo(mid + a.half * f1, a.y);
    ctx.lineTo(mid + b.half * f2, b.y);
    ctx.stroke();
  };
  ctx.lineWidth = 4;
  line(0, -0.78, 1, -0.78);
  line(0, 0.78, 1, 0.78);
  line(0.42, -0.78, 0.42, 0.78);
  line(0.42, 0, 1, 0);
  drawNet(ctx, c, mid, at(0.2));
}

/**
 * Net berdiri di lapangan (dilihat dari belakang baseline): tiang di kedua sisi, jaring kotak
 * tembus pandang, pita putih di atas yang sedikit melengkung turun ke tengah, dan bayangan di lantai.
 */
function drawNet(
  ctx: CanvasRenderingContext2D,
  c: ReturnType<typeof tokens>,
  mid: number,
  base: { y: number; half: number },
) {
  const overhang = 34; // tiang berdiri sedikit di luar garis lapangan
  const left = mid - base.half - overhang;
  const right = mid + base.half + overhang;
  const height = base.half * 0.3; // tinggi net di tiang
  const sag = height * 0.12; // pita turun sedikit di tengah
  const topAt = (x: number) => {
    const t = (x - mid) / (right - mid); // -1..1
    return base.y - height + sag * (1 - t * t);
  };

  // Bayangan net di lantai lapangan.
  ctx.save();
  ctx.fillStyle = "rgba(6,6,40,0.35)";
  ctx.beginPath();
  ctx.moveTo(left, base.y);
  ctx.lineTo(right, base.y);
  ctx.lineTo(right + 30, base.y + 26);
  ctx.lineTo(left - 30, base.y + 26);
  ctx.closePath();
  ctx.fill();

  // Badan jaring: area di antara pita & lantai, digelapkan tipis supaya terbaca sebagai jaring.
  const body = new Path2D();
  body.moveTo(left, base.y);
  for (let x = left; x <= right; x += 8) body.lineTo(x, topAt(x));
  body.lineTo(right, topAt(right));
  body.lineTo(right, base.y);
  body.closePath();
  ctx.fillStyle = "rgba(6,6,40,0.28)";
  ctx.fill(body);

  // Mata jaring (kotak) dipotong mengikuti bentuk jaring.
  ctx.clip(body);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1.5;
  const cell = 14;
  for (let x = left; x <= right; x += cell) {
    ctx.beginPath();
    ctx.moveTo(x, base.y - height - 4);
    ctx.lineTo(x, base.y);
    ctx.stroke();
  }
  for (let y = base.y; y >= base.y - height - 4; y -= cell) {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
  ctx.restore();

  // Pita putih di atas (dengan sisi bawah sedikit gelap supaya bervolume).
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(6,6,40,0.35)";
  ctx.lineWidth = 16;
  ctx.beginPath();
  for (let x = left; x <= right; x += 8) ctx.lineTo(x, topAt(x) + 4);
  ctx.stroke();
  ctx.strokeStyle = c.white;
  ctx.lineWidth = 12;
  ctx.beginPath();
  for (let x = left; x <= right; x += 8) ctx.lineTo(x, topAt(x));
  ctx.lineTo(right, topAt(right));
  ctx.stroke();

  // Tali bawah net.
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left, base.y);
  ctx.lineTo(right, base.y);
  ctx.stroke();

  // Tiang: batang navy dengan sisi terang, topi lime di atas.
  for (const x of [left, right]) {
    const top = base.y - height - 10;
    roundRect(ctx, x - 9, top, 18, base.y - top + 6, 6);
    ctx.fillStyle = c.navy950;
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x - 5, top + 6, 4, base.y - top - 6);
    ctx.beginPath();
    ctx.arc(x, top, 12, 0, Math.PI * 2);
    ctx.fillStyle = c.lime;
    ctx.fill();
  }
  ctx.lineCap = "butt";
}

export async function renderStoryCard(data: StoryData): Promise<Blob> {
  const c = tokens();
  // Pastikan font judul sudah siap sebelum menggambar (maks. 1,5 detik).
  await Promise.race([
    Promise.all([
      document.fonts.load(`800 300px ${c.display}`),
      document.fonts.load(`700 40px ${c.display}`),
      document.fonts.load(`600 40px ${c.ui}`),
    ]).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  const [logo, ball] = await Promise.all([
    loadImage("/images/brand/logo-lime.webp").catch(() => null),
    loadImage("/images/splash/ball.svg").catch(() => null),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Latar navy + cahaya lime di belakang skor.
  const bg = ctx.createLinearGradient(0, 0, 0, STORY_H);
  bg.addColorStop(0, c.navy950);
  bg.addColorStop(0.55, c.navy900);
  bg.addColorStop(1, c.navy950);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  const glow = ctx.createRadialGradient(STORY_W / 2, 820, 40, STORY_W / 2, 820, 620);
  glow.addColorStop(0, "rgba(215,255,0,0.22)");
  glow.addColorStop(1, "rgba(215,255,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  drawCourt(ctx, c);

  // Logo.
  if (logo) {
    const w = 380;
    const h = (logo.naturalHeight / logo.naturalWidth) * w;
    ctx.drawImage(logo, (STORY_W - w) / 2, 270, w, h);
  }

  // Overline.
  ctx.fillStyle = c.lime;
  ctx.font = `700 40px ${c.display}`;
  spaced(ctx, data.newBest ? "NEW PERSONAL BEST" : "SLAY RALLY", STORY_W / 2, 520, 10);

  // Skor besar — diperkecil bila angkanya panjang.
  const scoreText = String(data.score);
  let size = 340;
  ctx.font = `800 ${size}px ${c.display}`;
  while (ctx.measureText(scoreText).width > STORY_W - 160 && size > 120) {
    size -= 10;
    ctx.font = `800 ${size}px ${c.display}`;
  }
  ctx.fillStyle = c.lime;
  ctx.fillText(scoreText, STORY_W / 2, 840);

  ctx.fillStyle = c.white;
  ctx.font = `600 46px ${c.ui}`;
  ctx.fillText(`points · level ${data.level}`, STORY_W / 2, 925);

  // Lencana peringkat & Slay Point.
  const chips: { text: string; fill: string; ink: string }[] = [];
  if (data.rank) chips.push({ text: `#${data.rank} on the leaderboard`, fill: c.lime, ink: c.navy950 });
  if (data.points && data.points > 0)
    chips.push({ text: `+${data.points} Slay Point${data.points > 1 ? "s" : ""}`, fill: c.pink, ink: c.navy950 });
  ctx.font = `700 40px ${c.display}`;
  let y = 990;
  for (const chip of chips) {
    const w = ctx.measureText(chip.text).width + 80;
    roundRect(ctx, (STORY_W - w) / 2, y, w, 84, 42);
    ctx.fillStyle = chip.fill;
    ctx.fill();
    ctx.fillStyle = chip.ink;
    ctx.fillText(chip.text, STORY_W / 2, y + 56);
    y += 108;
  }

  // Bola tenis di atas lapangan.
  if (ball) ctx.drawImage(ball, STORY_W / 2 + 300, 1150, 96, 96);

  // Ajakan di bawah.
  ctx.fillStyle = c.white;
  ctx.font = `800 76px ${c.display}`;
  ctx.shadowColor = "rgba(6,6,40,0.55)";
  ctx.shadowBlur = 24;
  ctx.fillText("Can you beat me?", STORY_W / 2, 1525);
  ctx.shadowBlur = 0;
  const link = data.link;
  ctx.font = `700 44px ${c.display}`;
  const lw = ctx.measureText(link).width + 96;
  roundRect(ctx, (STORY_W - lw) / 2, 1565, lw, 96, 48);
  ctx.fillStyle = c.navy950;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = c.lime;
  ctx.stroke();
  ctx.fillStyle = c.lime;
  ctx.fillText(link, STORY_W / 2, 1629);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png"),
  );
}
