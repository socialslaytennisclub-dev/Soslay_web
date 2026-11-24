"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_PLAY } from "../play-repo";
import { attendancePointDefaults } from "../points-repo";
import { audit, PUBLIC_SESSION_PATHS, refreshPaths, requireEditor, type ActionResult } from "./common";
import type { KuyRowInput } from "../kuy-import";
import { importKuyParticipants, importKuyRows } from "./play";
import { saveSession } from "./sessions";

/**
 * Import activity (Activities → Import dari Kuyy): buat activity dari isian form (judul, venue & tanggal
 * ditebak dari file Kuyy, jam diisi admin) lalu impor peserta dari file yang sama — aturan impor peserta
 * sama dengan tab "Import XLSX dari Kuy" (member dicocokkan, belum daftar → ghost member yang otomatis
 * tersambung saat dia daftar). Activity yang sudah lewat → peserta langsung tercatat hadir (+poin).
 * Peserta gagal diimpor → activity yang baru dibuat dihapus lagi, tidak ada activity kosong tertinggal.
 */

export type ImportActivityInput = {
  title: string;
  typeSlug: string;
  /** Maks. 500 karakter (dari teks halaman Kuyy yang ditempel admin). */
  description: string;
  venueName: string;
  /** WIB: "2026-11-22", "16:00". */
  date: string;
  start: string;
  end: string;
  price: number;
  capacity: number;
  kuyUrl: string;
  status: "published" | "draft";
  /** URL hasil upload cover (mis. foto event Kuyy lewat MCP); kosong → foto venue. */
  coverPath?: string | null;
  /** Slay Point per kehadiran; kosong → default tipe activity. 0 = tanpa poin (mis. event lama yang baru diimpor). */
  points?: number;
};

export async function importActivity(input: ImportActivityInput, formData: FormData): Promise<ActionResult & { id?: string }> {
  if (!(formData.get("file") instanceof File)) return { ok: false, error: "Pilih file XLSX dari Kuyy dulu." };
  return createWithParticipants(input, (id) => importKuyParticipants(id, formData));
}

/**
 * Sama dengan importActivity, peserta dari daftar (Claude lewat MCP membaca file Kuyy sendiri).
 * Daftar kosong = event Kuyy yang belum ada pendaftar → activity saja; peserta menyusul lewat import XLSX di activity itu.
 */
export async function importActivityRows(input: ImportActivityInput, participants: KuyRowInput[]): Promise<ActionResult & { id?: string }> {
  if (!Array.isArray(participants)) return { ok: false, error: "Daftar peserta tidak valid." };
  if (!participants.length) return createWithParticipants(input, async () => ({ ok: true, message: "belum ada peserta" }));
  return createWithParticipants(input, (id) => importKuyRows(id, participants));
}

async function createWithParticipants(input: ImportActivityInput, importParticipants: (sessionId: string) => Promise<ActionResult>): Promise<ActionResult & { id?: string }> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };

  // Diset sebelum peserta diimpor: activity lampau langsung menandai hadir, dan trigger poin membaca nilai ini.
  const points = input.points ?? (await attendancePointDefaults())[input.typeSlug] ?? 50;
  const { matchFormat, courtCount, roundCount, targetPoints, leaderboardMode, showLeaderboard, podiumBonus } = DEFAULT_PLAY;
  const saved = await saveSession(
    {
      ...input,
      court: "",
      points,
      levels: [],
      waitlist: false,
      membersOnly: false,
      visibility: "public",
      visibleUntil: "",
      homepage: false,
      coverPath: input.coverPath ?? null,
      repeatWeekly: false,
      crew: [],
      crewMembers: [],
      photos: { albumUrl: "", coverPath: null, count: null },
      play: { matchFormat, courtCount, roundCount, targetPoints, leaderboardMode, showLeaderboard, podiumBonus },
    },
    true,
  );
  if (!saved.ok || !saved.id) return saved.ok ? { ok: false, error: "Activity gagal dibuat — coba lagi." } : saved;

  const imported = await importParticipants(saved.id);
  if (!imported.ok) {
    const supabase = await createSupabaseServerClient();
    await supabase.from("sessions").delete().eq("id", saved.id);
    await audit(auth.userId, `membatalkan import activity ${input.title} (peserta gagal diimpor)`, "session", saved.id);
    refreshPaths(...PUBLIC_SESSION_PATHS);
    return { ok: false, error: `Activity tidak jadi dibuat — ${imported.error}` };
  }
  return { ok: true, message: `Activity dibuat · ${imported.message}`, id: saved.id };
}
