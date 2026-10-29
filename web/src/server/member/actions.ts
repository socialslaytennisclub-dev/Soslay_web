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

/** "Urungkan" dari Panel Host: kosongkan skor match (hak host dicek di database). */
export async function clearHostScore(matchId: string): Promise<HostScoreResult> {
  const supabase = await createSupabaseServerClient("member");
  const { error } = await supabase.rpc("clear_match_score", { p_match: matchId });
  if (error) return { ok: false, error: /Hanya admin atau host/.test(error.message) ? "Hanya host sesi ini yang bisa mengubah skor." : /terkunci/.test(error.message) ? "Sesi sudah diakhiri — skor terkunci." : "Gagal mengurungkan skor. Coba lagi." };
  return { ok: true };
}
