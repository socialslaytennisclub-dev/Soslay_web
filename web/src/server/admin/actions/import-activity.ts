"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_PLAY } from "../play-repo";
import { attendancePointDefaults } from "../points-repo";
import { requireEditor, type ActionResult } from "./common";
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
};

export async function importActivity(input: ImportActivityInput, formData: FormData): Promise<ActionResult & { id?: string }> {
  if (!(formData.get("file") instanceof File)) return { ok: false, error: "Pilih file XLSX dari Kuyy dulu." };
  return createWithParticipants(input, (id) => importKuyParticipants(id, formData));
}

/** Sama dengan importActivity, peserta dari daftar (Claude lewat MCP membaca file Kuyy sendiri). */
export async function importActivityRows(input: ImportActivityInput, participants: KuyRowInput[]): Promise<ActionResult & { id?: string }> {
  if (!Array.isArray(participants) || !participants.length) return { ok: false, error: "Daftar peserta kosong." };
  return createWithParticipants(input, (id) => importKuyRows(id, participants));
}

async function createWithParticipants(input: ImportActivityInput, importParticipants: (sessionId: string) => Promise<ActionResult>): Promise<ActionResult & { id?: string }> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };

  const points = (await attendancePointDefaults())[input.typeSlug] ?? 50;
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
      coverPath: null,
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
    return { ok: false, error: `Activity tidak jadi dibuat — ${imported.error}` };
  }
  return { ok: true, message: `Activity dibuat · ${imported.message}`, id: saved.id };
}
