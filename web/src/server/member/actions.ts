"use server";

import { revalidatePath } from "next/cache";
import { genderOptions, handOptions, playingFormatOptions, playingFrequencyOptions, tennisLevelOptions, type MemberProfile } from "@/content/member";
import { validateProfile } from "@/lib/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FORMAT, FREQUENCY, GENDER, HAND, LEVEL, toEnum } from "./profile";

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

  const errors = validateProfile(profile);
  const first = Object.keys(errors)[0] as keyof MemberProfile | undefined;
  if (first) return { ok: false, error: errors[first] ?? "Periksa kembali isian kamu.", field: first };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: profile.fullName.trim(),
      display_name: profile.displayName.trim() || null,
      birth_date: /^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate) ? profile.birthDate : null,
      gender: toEnum(GENDER, genderOptions, profile.gender),
      phone: profile.phone.replace(/\D/g, "").replace(/^(62|0)/, "") || null,
      city: profile.city.trim() || null,
      kuy_id: profile.kuyId.trim().replace(/^@/, "") || null,
      reclub_id: profile.reclubId.trim().replace(/^@/, "") || null,
      instagram: profile.instagram.trim().replace(/^@/, "") || null,
      tennis_level: toEnum(LEVEL, tennisLevelOptions, profile.tennisLevel),
      play_frequency: toEnum(FREQUENCY, playingFrequencyOptions, profile.playingFrequency),
      play_format: toEnum(FORMAT, playingFormatOptions, profile.playingFormat),
      dominant_hand: toEnum(HAND, handOptions, profile.hand),
      playing_since: profile.playingDuration || null,
      looking_for: profile.lookingFor,
      event_types: profile.eventTypes,
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505" && /kuy/i.test(error.message)) return { ok: false, error: "Kuy ID ini sudah dipakai member lain.", field: "kuyId" };
    if (error.code === "23505" && /reclub/i.test(error.message)) return { ok: false, error: "Reclub ID ini sudah dipakai member lain.", field: "reclubId" };
    return { ok: false, error: "Gagal menyimpan profil. Coba lagi sebentar lagi." };
  }
  revalidatePath("/akun", "layout");
  return { ok: true };
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
