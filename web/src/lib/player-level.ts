import type { TennisLevel } from "@/server/admin/types";

/**
 * Level pemain dari penilaian host (beta, 23 Nov 2026) — skala NTRP 1.0–6.0+, langkah 0.5. Nama & deskripsi
 * disepakati dengan tim Soslay; dipakai halaman penilaian host, admin Members & bobot acak line-up.
 * Pemain tidak pernah melihat levelnya sendiri.
 */

export type LevelGroup = "newbie" | "beginner" | "intermediate" | "advanced" | "pro";

export type NtrpLevel = { value: number; label: string; name: string; group: LevelGroup; description: string };

export const NTRP_LEVELS: NtrpLevel[] = [
  { value: 1.0, label: "1.0", name: "Newbie", group: "newbie", description: "Baru pertama kali main. Masih belajar memegang raket dan mengenai bola." },
  { value: 1.5, label: "1.5", name: "Lower Beginner", group: "beginner", description: "Sudah bisa mengenai bola, tapi arahnya belum terkontrol. Rally jarang lebih dari 2 pukulan." },
  { value: 2.0, label: "2.0", name: "Mid Beginner", group: "beginner", description: "Bisa rally pelan beberapa pukulan. Serve sering gagal atau masih underhand." },
  { value: 2.5, label: "2.5", name: "Upper Beginner", group: "beginner", description: "Rally pelan cukup stabil dan mulai paham posisi di lapangan. Serve overhand mulai masuk." },
  { value: 3.0, label: "3.0", name: "Lower Intermediate", group: "intermediate", description: "Forehand konsisten di tempo sedang. Backhand dan serve masih sering jadi titik lemah." },
  { value: 3.5, label: "3.5", name: "Mid Intermediate", group: "intermediate", description: "Mulai bisa mengarahkan bola. Serve cukup stabil, mulai berani ke net saat doubles." },
  { value: 4.0, label: "4.0", name: "Upper Intermediate", group: "intermediate", description: "Pukulan bisa diandalkan, bisa mengatur arah dan kedalaman. Volley dan smash cukup aman." },
  { value: 4.5, label: "4.5", name: "Lower Advanced", group: "advanced", description: "Main dengan power dan spin. Serve jadi senjata, agresif di net, jarang unforced error." },
  { value: 5.0, label: "5.0", name: "Mid Advanced", group: "advanced", description: "Antisipasi bagus dan punya pukulan andalan. Bisa mengubah strategi di tengah pertandingan." },
  { value: 5.5, label: "5.5", name: "Upper Advanced", group: "advanced", description: "Konsisten di tempo tinggi, siap bertanding di turnamen tingkat kota/klub." },
  { value: 6.0, label: "6.0+", name: "Pro", group: "pro", description: "Level turnamen nasional, eks-atlet, atau pelatih." },
];

export const UNKNOWN_LEVEL = { name: "Tidak tahu", description: "Belum cukup melihat pemain ini bermain." };

export const GROUP_LABEL: Record<LevelGroup, string> = { newbie: "Newbie", beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", pro: "Pro" };

/** Bulatkan ke 0.5 terdekat (tampilan level gabungan; angka asli tetap disimpan). */
export const roundHalf = (n: number) => Math.min(6, Math.max(1, Math.round(n * 2) / 2));

/** Tingkat untuk angka NTRP (dibulatkan ke 0.5 dulu). */
export const ntrpLevel = (n: number): NtrpLevel => NTRP_LEVELS.find((l) => l.value === roundHalf(n)) ?? NTRP_LEVELS[0];

/** "3.5 · Mid Intermediate"; null = Tidak tahu. */
export const ntrpText = (n: number | null) => (n === null ? UNKNOWN_LEVEL.name : `${ntrpLevel(n).label} · ${ntrpLevel(n).name}`);

/** Level isian profil member (self-declared) → perkiraan NTRP, dipakai bila belum ada nilai host. */
export const SELF_LEVEL_NTRP: Record<TennisLevel, number> = {
  beginner: 2.0,
  beginner_intermediate: 2.5,
  intermediate: 3.5,
  intermediate_advanced: 4.0,
  advanced: 5.0,
};

/** Bobot pemain tanpa level sama sekali (tengah skala). */
export const DEFAULT_LINEUP_NTRP = 3.0;

/** Bobot acak line-up: nilai host (rata-rata) → level profil → tengah. */
export const lineupNtrp = (rated: number | null | undefined, self: TennisLevel | null | undefined) =>
  rated ?? (self ? SELF_LEVEL_NTRP[self] : DEFAULT_LINEUP_NTRP);

/** Ringkasan level gabungan dari nilai beberapa host (Tidak tahu = null, tidak dihitung). */
export function levelSummary(values: (number | null)[]) {
  const known = values.filter((v): v is number => v !== null);
  if (!known.length) return null;
  const avg = known.reduce((a, b) => a + b, 0) / known.length;
  return {
    avg,
    level: ntrpLevel(avg),
    raters: known.length,
    /** Baru 1 host → "perkiraan awal"; resmi mulai 2 host. */
    provisional: known.length < 2,
    /** Beda pendapat besar antar host (≥ 1.0) → perlu dicek admin. */
    spread: Math.max(...known) - Math.min(...known),
  };
}

/** Satu pemain di antrean penilaian host. */
export type RatingQueueItem = {
  memberId: string;
  name: string;
  avatar: string | null;
  /** Main bareng dalam 90 hari terakhir. */
  times: number;
  lastTitle: string | null;
  lastAt: string | null;
  venue: string | null;
  /** Kota venue activity terakhir (zona waktu tanggal di kartu). */
  city: string | null;
  cohosts: string[];
  /** Nilai saya; null = belum dinilai atau "Tidak tahu" (lihat `rated`). */
  ntrp: number | null;
  rated: boolean;
  ratedAt: string | null;
  /** Perlu dinilai: belum pernah, atau nilai > 90 hari dan sejak itu main bareng lagi. */
  due: boolean;
};
