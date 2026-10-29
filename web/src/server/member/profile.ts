import "server-only";
import { cache } from "react";
import { genderOptions, handOptions, playingFormatOptions, playingFrequencyOptions, tennisLevelOptions, type MemberProfile, type MemberTier } from "@/content/member";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { localPhone } from "@/lib/wa-invite";
import { getMemberSession } from "./user";

/**
 * Profil member yang sedang login (sesi member, bukan sesi admin). Pilihan di form memakai
 * label tampilan ("Laki-laki", "1x/week"); kolom database memakai enum — dipetakan di sini.
 * Tanpa Supabase / belum login → null, halaman memakai data contoh.
 */

export const GENDER = ["male", "female", "undisclosed"] as const;
export const LEVEL = ["beginner", "beginner_intermediate", "intermediate", "intermediate_advanced", "advanced"] as const;
export const FREQUENCY = ["rarely", "monthly", "weekly", "twice_weekly", "often"] as const;
export const FORMAT = ["singles", "doubles", "both"] as const;
export const HAND = ["right", "left", "both"] as const;

/** Enum database ↔ label form, berdasarkan urutan pilihan yang sama. */
export const toLabel = (values: readonly string[], labels: string[], value: string | null) => (value ? (labels[values.indexOf(value)] ?? "") : "");
export const toEnum = (values: readonly string[], labels: string[], label: string) => (label ? (values[labels.indexOf(label)] ?? null) : null);

export type MyMember = {
  header: { name: string; username: string; email: string; tier: MemberTier; memberSince: string; memberId: string; photo: string | null };
  profile: MemberProfile;
};

type ProfileRow = {
  member_code: string;
  full_name: string;
  display_name: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  birth_date: string | null;
  gender: string | null;
  kuy_id: string | null;
  reclub_id: string | null;
  instagram: string | null;
  tier: string;
  tennis_level: string | null;
  play_frequency: string | null;
  play_format: string | null;
  dominant_hand: string | null;
  playing_since: string | null;
  looking_for: string[];
  event_types: string[];
  joined_at: string;
  avatar_path: string | null;
};

const since = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

export const getMyMember = cache(async (): Promise<MyMember | null> => {
  if (!isSupabaseConfigured) return null;
  const { supabase, user } = await getMemberSession();
  if (!user) return null;
  const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<ProfileRow>();
  if (!p) return null;

  return {
    header: {
      name: p.full_name,
      username: p.kuy_id ?? "",
      email: p.email,
      tier: (p.tier.charAt(0).toUpperCase() + p.tier.slice(1)) as MemberTier,
      memberSince: since.format(new Date(p.joined_at)),
      memberId: p.member_code,
      photo: p.avatar_path,
    },
    profile: {
      photo: p.avatar_path,
      fullName: p.full_name,
      displayName: p.display_name ?? "",
      birthDate: p.birth_date ?? "",
      gender: toLabel(GENDER, genderOptions, p.gender),
      phone: localPhone(p.phone ?? ""),
      city: p.city ?? "",
      kuyId: p.kuy_id ?? "",
      reclubId: p.reclub_id ?? "",
      instagram: p.instagram ?? "",
      email: p.email,
      tennisLevel: toLabel(LEVEL, tennisLevelOptions, p.tennis_level),
      playingFrequency: toLabel(FREQUENCY, playingFrequencyOptions, p.play_frequency),
      playingFormat: toLabel(FORMAT, playingFormatOptions, p.play_format),
      hand: toLabel(HAND, handOptions, p.dominant_hand),
      playingDuration: p.playing_since ?? "",
      lookingFor: p.looking_for ?? [],
      eventTypes: p.event_types ?? [],
    },
  };
});
