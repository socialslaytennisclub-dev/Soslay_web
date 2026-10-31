"use server";

import { revalidatePath } from "next/cache";
import { genderOptions, handOptions, playingFormatOptions, playingFrequencyOptions, tennisLevelOptions, type MemberProfile } from "@/content/member";
import { normalizeKuyId } from "@/lib/auth";
import { validateProfile } from "@/lib/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { localPhone } from "@/lib/wa-invite";
import { removePublicImage, uploadPublicImage } from "../storage";
import { FORMAT, FREQUENCY, GENDER, HAND, LEVEL, toEnum } from "./profile";

const AVATAR_BUCKET = "avatars";

export type SaveProfileResult = { ok: true } | { ok: false; error: string; field?: keyof MemberProfile };

/**
 * Simpan profil member sendiri (sesi member). Nama lengkap & data lain bebas diganti kapan saja;
 * ID Soslay, tier & status dikunci trigger database. Email ganti lewat alur akun (tidak di sini).
 */
export async function saveMyProfile(profile: MemberProfile): Promise<SaveProfileResult> {
  const supabase = await createSupabaseServerClient("member");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi kamu berakhir — masuk lagi untuk menyimpan." };

  const { data: stored } = await supabase.from("profiles").select("phone, kuy_id, avatar_path").eq("id", user.id).maybeSingle();
  const errors = validateProfile(profile, { phone: stored?.phone as string | null | undefined, kuyId: stored?.kuy_id as string | null | undefined });
  const first = Object.keys(errors)[0] as keyof MemberProfile | undefined;
  if (first) return { ok: false, error: errors[first] ?? "Periksa kembali isian kamu.", field: first };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: profile.fullName.trim(),
      display_name: profile.displayName.trim() || null,
      birth_date: /^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate) ? profile.birthDate : null,
      gender: toEnum(GENDER, genderOptions, profile.gender),
      phone: localPhone(profile.phone) || null,
      city: profile.city.trim() || null,
      kuy_id: normalizeKuyId(profile.kuyId) || null,
      reclub_id: profile.reclubId.trim().replace(/^@/, "") || null,
      instagram: profile.instagram.trim().replace(/^@/, "") || null,
      tennis_level: toEnum(LEVEL, tennisLevelOptions, profile.tennisLevel),
      play_frequency: toEnum(FREQUENCY, playingFrequencyOptions, profile.playingFrequency),
      play_format: toEnum(FORMAT, playingFormatOptions, profile.playingFormat),
      dominant_hand: toEnum(HAND, handOptions, profile.hand),
      playing_since: profile.playingDuration || null,
      looking_for: profile.lookingFor,
      event_types: profile.eventTypes,
      // Foto baru disimpan lewat uploadMyAvatar; di sini hanya "Hapus foto".
      ...(profile.photo === null ? { avatar_path: null } : {}),
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505" && /kuy/i.test(error.message)) return { ok: false, error: "Kuy ID ini sudah dipakai member lain.", field: "kuyId" };
    if (error.code === "23505" && /reclub/i.test(error.message)) return { ok: false, error: "Reclub ID ini sudah dipakai member lain.", field: "reclubId" };
    return { ok: false, error: "Gagal menyimpan profil. Coba lagi sebentar lagi." };
  }
  // Nama di navbar halaman publik dibaca dari sesi (cookie) → samakan metadata auth; "Hapus foto" → file
  // lamanya ikut dihapus dari Storage. Keduanya pelengkap: profil sudah tersimpan, jadi gagal = hanya dicatat.
  const [meta] = await Promise.all([
    supabase.auth.updateUser({ data: { full_name: profile.fullName.trim(), display_name: profile.displayName.trim() } }),
    profile.photo === null ? removePublicImage(AVATAR_BUCKET, stored?.avatar_path as string | null | undefined) : null,
  ]);
  if (meta.error) console.warn(`[saveMyProfile] metadata nama tidak tersinkron: ${meta.error.message}`);
  revalidatePath("/akun", "layout");
  return { ok: true };
}

/**
 * Ganti foto profil member sendiri: upload ke Storage (bucket publik "avatars/<id member>/…"),
 * simpan URL-nya di profiles.avatar_path, lalu hapus foto lama.
 */
export async function uploadMyAvatar(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient("member");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi kamu berakhir — masuk lagi untuk mengganti foto." };

  const [upload, { data: before }] = await Promise.all([
    uploadPublicImage({
    bucket: AVATAR_BUCKET,
    file: formData.get("file"),
    folder: user.id,
    maxBytes: 2 * 1024 * 1024,
      types: { "image/jpeg": "jpg", "image/png": "png" },
    }),
    supabase.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle(),
  ]);
  if (!upload.ok) return upload;
  const { error } = await supabase.from("profiles").update({ avatar_path: upload.url }).eq("id", user.id);
  if (error) {
    await removePublicImage(AVATAR_BUCKET, upload.url);
    return { ok: false, error: "Foto gagal disimpan. Coba lagi sebentar lagi." };
  }
  await removePublicImage(AVATAR_BUCKET, before?.avatar_path as string | null);
  revalidatePath("/akun", "layout");
  return { ok: true, url: upload.url };
}

export type HostScoreResult = { ok: true } | { ok: false; error: string };

/**
 * Host sesi menginput skor court dari member web. Hak host & total poin = target divalidasi
 * di database (RPC `save_match_score`: hanya admin / host aktif sesi itu).
 */
export async function submitHostScore(matchId: string, scoreA: number, scoreB: number): Promise<HostScoreResult> {
  const supabase = await createSupabaseServerClient("member");
  const { error } = await supabase.rpc("save_match_score", { p_match: matchId, p_score_a: scoreA, p_score_b: scoreB });
  if (error) {
    if (/Hanya admin atau host/.test(error.message)) return { ok: false, error: "Hanya host sesi ini yang bisa input skor." };
    if (/Total poin/.test(error.message)) return { ok: false, error: error.message.replace("Total poin harus", "Total skor kedua tim harus") + " poin." };
    if (/terkunci/.test(error.message)) return { ok: false, error: "Sesi sudah diakhiri — skor terkunci." };
    return { ok: false, error: "Skor gagal disimpan. Coba lagi." };
  }
  return { ok: true };
}

/** "Mulai Ronde" dari Panel Host (Figma UIF-13): ronde terpilih jadi live; hak host dicek di database. */
export async function startHostRound(sessionId: string, round: number): Promise<HostScoreResult> {
  const supabase = await createSupabaseServerClient("member");
  const { error } = await supabase.rpc("start_session_round", { p_session: sessionId, p_round: round });
  if (error) {
    if (/tidak ditemukan/.test(error.message)) return { ok: false, error: "Sesi tidak ditemukan." };
    if (/Hanya admin atau host/.test(error.message)) return { ok: false, error: "Hanya host sesi ini yang bisa memulai ronde." };
    if (/diakhiri/.test(error.message)) return { ok: false, error: "Sesi sudah diakhiri." };
    if (/belum dimulai/.test(error.message)) return { ok: false, error: "Sesi belum dimulai — ronde bisa dimulai saat sesi berjalan." };
    if (/line-up/.test(error.message)) return { ok: false, error: `Ronde ${round} belum ada di line-up.` };
    return { ok: false, error: "Ronde gagal dimulai. Coba lagi." };
  }
  return { ok: true };
}

/** Pesan error RPC host → teks untuk host; urutan = prioritas, selain itu `fallback`. */
const HOST_ERRORS: [RegExp, (message: string) => string][] = [
  [/Hanya admin atau host/, () => "Hanya host sesi ini yang bisa melakukan ini."],
  [/diakhiri|terkunci/, () => "Sesi sudah diakhiri."],
  [/belum dimulai|30 menit/, (m) => m.replace("Sesi belum dimulai", "Sesi belum dimulai.")],
  [/dua kali|bukan peserta|di luar format/, (m) => `${m}.`],
];

const hostError = (message: string, fallback: string) => {
  const hit = HOST_ERRORS.find(([re]) => re.test(message));
  return hit ? hit[1](message) : fallback;
};

/** "Mulai Activity" (Figma S1-H): sesi live sekarang, ronde pertama langsung jalan. */
export async function startHostActivity(sessionId: string): Promise<HostScoreResult> {
  const supabase = await createSupabaseServerClient("member");
  const { error } = await supabase.rpc("start_session_activity", { p_session: sessionId });
  return error ? { ok: false, error: hostError(error.message, "Activity gagal dimulai. Coba lagi.") } : { ok: true };
}

export type HostLineupMatch = { round_no: number; court_no: number; a1: string; a2: string; b1: string; b2: string };

/** "Atur line-up" / "Acak ulang" dari Panel Host: ganti match tanpa skor mulai `fromRound`. */
export async function saveHostLineup(sessionId: string, fromRound: number, matches: HostLineupMatch[]): Promise<HostScoreResult> {
  const supabase = await createSupabaseServerClient("member");
  const { error } = await supabase.rpc("host_save_lineup", { p_session: sessionId, p_from_round: fromRound, p_matches: matches });
  return error ? { ok: false, error: hostError(error.message, "Line-up gagal disimpan. Coba lagi.") } : { ok: true };
}

/** "Akhiri Activity" (HL-5a): skor terkunci, bonus juara dibagikan (database). */
export async function endHostActivity(sessionId: string): Promise<HostScoreResult> {
  const supabase = await createSupabaseServerClient("member");
  const { error } = await supabase.rpc("end_session_activity", { p_session: sessionId });
  return error ? { ok: false, error: hostError(error.message, "Activity gagal diakhiri. Coba lagi.") } : { ok: true };
}

/** Check-in peserta oleh host dari tab Peserta (id roster: baris peserta, atau member_id booking website). */
export async function setHostCheckIn(sessionId: string, personId: string, checkedIn: boolean): Promise<HostScoreResult> {
  const supabase = await createSupabaseServerClient("member");
  const { error } = await supabase.rpc("host_set_check_in", { p_session: sessionId, p_id: personId, p_checked_in: checkedIn });
  if (!error) return { ok: true };
  if (/bukan peserta|Peserta tidak ditemukan/.test(error.message)) return { ok: false, error: "Peserta ini sudah tidak terdaftar di sesi ini. Muat ulang halaman." };
  return { ok: false, error: hostError(error.message, "Check-in gagal disimpan. Coba lagi.") };
}

export type ReviewInput = { rating: number; highlights: string[]; host: number | null; venue: number | null; format: number | null; comment: string; testimonial: boolean };

/** Review sesi oleh peserta (S3-P): +10 Slay Point sekali, bisa diubah 7 hari setelah sesi. */
export async function submitSessionReview(sessionId: string, input: ReviewInput): Promise<HostScoreResult> {
  if (input.rating < 1 || input.rating > 5) return { ok: false, error: "Pilih bintang dulu." };
  if (input.comment.length > 500) return { ok: false, error: "Ulasan maksimal 500 karakter." };
  const supabase = await createSupabaseServerClient("member");
  const { error } = await supabase.rpc("submit_session_review", {
    p_session: sessionId,
    p_rating: input.rating,
    p_highlights: input.highlights,
    p_host: input.host,
    p_venue: input.venue,
    p_format: input.format,
    p_comment: input.comment,
    p_testimonial: input.testimonial,
  });
  if (error) return { ok: false, error: /terkunci|dibuka|Hanya peserta/.test(error.message) ? `${error.message}.` : "Review gagal dikirim. Coba lagi." };
  return { ok: true };
}

/** "Urungkan" dari Panel Host: kosongkan skor match (hak host dicek di database). */
export async function clearHostScore(matchId: string): Promise<HostScoreResult> {
  const supabase = await createSupabaseServerClient("member");
  const { error } = await supabase.rpc("clear_match_score", { p_match: matchId });
  if (error) return { ok: false, error: /Hanya admin atau host/.test(error.message) ? "Hanya host sesi ini yang bisa mengubah skor." : /terkunci/.test(error.message) ? "Sesi sudah diakhiri — skor terkunci." : "Gagal mengurungkan skor. Coba lagi." };
  return { ok: true };
}
