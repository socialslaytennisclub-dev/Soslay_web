/**
 * Kudos (BR-23): tipe & helper bersama member, profil, host & admin. Kategori sebenarnya disimpan di tabel
 * `kudos_categories` (bisa ditambah / dinonaktifkan tanpa deploy); daftar di bawah = isi awal migrasi, dipakai
 * mode demo dan sebagai cadangan bila tabel belum terbaca.
 */

export type KudosGroup = "skill" | "attitude";

export type KudosCategory = { key: string; label: string; group: KudosGroup };

export const KUDOS_GROUP_LABEL: Record<KudosGroup, string> = { skill: "Skill", attitude: "Sikap" };

/**
 * Jendela kudos sejak sesi diakhiri: 3 minggu untuk sementara (spec BR-23: 7 hari). Harus sama dengan
 * kudos_window_closes_at di database — dicek di scripts/check-migrations.mjs.
 */
export const KUDOS_WINDOW_DAYS = 21;
export const KUDOS_WINDOW_MS = KUDOS_WINDOW_DAYS * 86_400_000;

/** Chip "kudos teratas" untuk host & admin: kudos 6 bulan terakhir (= session_kudos_top di database). */
export const KUDOS_TOP_DAYS = 180;

export const DEFAULT_KUDOS_CATEGORIES: KudosCategory[] = [
  ...(
    [
      ["serve", "Serve"],
      ["second_serve", "Second serve"],
      ["forehand", "Forehand"],
      ["backhand", "Backhand"],
      ["slice", "Slice"],
      ["return", "Return"],
      ["drop_shot", "Drop shot"],
      ["volley", "Volley"],
      ["lob", "Lob"],
      ["overhead", "Overhead"],
      ["passing_shot", "Passing shot"],
      ["footwork", "Footwork"],
      ["consistency", "Consistency"],
    ] as const
  ).map(([key, label]) => ({ key, label, group: "skill" as const })),
  ...(
    [
      ["positivity", "Positivity"],
      ["teamwork", "Teamwork"],
      ["fair_play", "Fair play"],
      ["strategy", "Strategy"],
      ["patience", "Patience"],
      ["entertainer", "Entertainer"],
      ["cheerleader", "Cheerleader"],
      ["organiser", "Organiser"],
      ["style", "Style"],
    ] as const
  ).map(([key, label]) => ({ key, label, group: "attitude" as const })),
];

/** Satu calon penerima di bagian kudos halaman sesi selesai (+ kudos yang SAYA berikan, null = belum). */
export type KudosReceiver = { memberId: string; name: string; avatar: string | null; role: "participant" | "host"; category: string | null };

/** Bagian kudos untuk pemberi eligible (RPC session_kudos). */
export type SessionKudos = {
  windowClosesAt: string;
  canEdit: boolean;
  receivers: KudosReceiver[];
  /** Kategori aktif yang bisa dipilih. */
  categories: KudosCategory[];
};

/** Agregat kudos profil (RPC member_kudos) — tanpa data pemberi & tanpa waktu. Kategori sudah urut: terbanyak → terbaru diterima. */
export type MemberKudos = {
  total: number;
  uniqueGivers: number;
  categories: (KudosCategory & { count: number })[];
};

/** Chip "kudos teratas" per member (host & admin). */
export type KudosTop = { label: string; count: number };

/** 3 kategori teratas (yang punya kudos saja). */
export const topKudos = (k: MemberKudos, n = 3) => k.categories.filter((c) => c.count > 0).slice(0, n);

type MemberKudosRow = { total: number; unique_givers: number; categories: { key: string; label: string; group: KudosGroup; count: number }[] };

export function toMemberKudos(row: MemberKudosRow | null | undefined): MemberKudos {
  return {
    total: row?.total ?? 0,
    uniqueGivers: row?.unique_givers ?? 0,
    categories: (row?.categories ?? []).map((c) => ({ key: c.key, label: c.label, group: c.group, count: c.count })),
  };
}

/** Kartu peserta (klik nama di tab Peserta): riwayat & kudos, tanpa kontak / pemberi. null = tamu tanpa akun. */
export type PersonCard = { sessionsAttended: number; kudosTotal: number; kudosGivers: number; kudosTop: KudosTop[] };
