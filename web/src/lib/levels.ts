import type { TennisLevel } from "@/server/admin/types";

/**
 * Level tenis: satu sumber label untuk admin, profil member, halaman activity & impor Kuyy. Modul kecil
 * tanpa dependensi supaya halaman publik tidak ikut memuat label admin lainnya.
 */
export const LEVEL_LABEL: Record<TennisLevel, string> = {
  beginner: "Beginner",
  beginner_intermediate: "Upper Beginner",
  intermediate: "Intermediate",
  intermediate_advanced: "Upper Intermediate",
  advanced: "Advanced",
};

/** Nama lama (sebelum Nov 2026) — form yang masih terbuka / file lama tetap dikenali. */
const LEGACY_LABEL: Record<string, TennisLevel> = {
  "beginner–intermediate": "beginner_intermediate",
  "beginner-intermediate": "beginner_intermediate",
  "beg–intermediate": "beginner_intermediate",
  "intermediate–advanced": "intermediate_advanced",
  "intermediate-advanced": "intermediate_advanced",
  "int–advanced": "intermediate_advanced",
};

const BY_LABEL = new Map<string, TennisLevel>(Object.entries(LEVEL_LABEL).map(([value, label]) => [label.toLowerCase(), value as TennisLevel]));

/** Label (nama sekarang atau nama lama, tanpa beda huruf besar/kecil) → enum; tidak dikenal → null. */
export function levelFromLabel(label: string): TennisLevel | null {
  const key = label.trim().toLowerCase().replace(/\s*([–-])\s*/g, "$1");
  return BY_LABEL.get(key) ?? LEGACY_LABEL[key] ?? null;
}
