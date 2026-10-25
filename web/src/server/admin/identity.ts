import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TennisLevel } from "./types";

/**
 * Identitas member Soslay. Urutan prioritas ID: ID Soslay (nomor member "SOS 0541 2610") →
 * Kuy ID → Reclub ID; nomor HP juga diterima. Dipakai "Tambah peserta manual" & impor Kuyy.
 * Membaca profiles lewat service role (setelah requireEditor) supaya staf Activities tanpa
 * izin modul Members tetap bisa mencari member.
 */

export type MemberIdentity = {
  id: string;
  fullName: string;
  memberCode: string;
  kuyId: string;
  reclubId: string;
  email: string;
  phone: string;
  level: TennisLevel | null;
  matchedBy: "ID Soslay" | "Kuy ID" | "Reclub ID" | "nomor HP";
};

/** "SOS 0541 2610", "sos-05412610", "05412610" → "SOS 0541 2610"; selain itu null. */
export function normalizeMemberCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /^(?:SOS)?(\d{4})(\d{4})$/.exec(compact);
  return m ? `SOS ${m[1]} ${m[2]}` : null;
}

async function readClient() {
  return createSupabaseAdminClient() ?? (await createSupabaseServerClient("admin"));
}

type ProfileRow = { id: string; full_name: string; member_code: string; kuy_id: string | null; reclub_id: string | null; email: string; phone: string | null; tennis_level: TennisLevel | null };
const PROFILE_FIELDS = "id, full_name, member_code, kuy_id, reclub_id, email, phone, tennis_level";

const toIdentity = (p: ProfileRow, matchedBy: MemberIdentity["matchedBy"]): MemberIdentity => ({
  id: p.id,
  fullName: p.full_name,
  memberCode: p.member_code,
  kuyId: p.kuy_id ?? "",
  reclubId: p.reclub_id ?? "",
  email: p.email,
  phone: p.phone ?? "",
  level: p.tennis_level,
  matchedBy,
});

/** "0812-4658-4868", "+62 812…", "62812…" → "81246584868" (format pembanding); null kalau bukan nomor HP. */
export function normalizeIndoPhone(input: string): string | null {
  if (!/^[+\d][\d\s().-]*$/.test(input.trim())) return null;
  const digits = input.replace(/\D/g, "");
  // Nomor Indonesia: diawali 0 / 62 / +62, atau langsung 8… (tanpa awalan).
  if (!/^(0|62|8)/.test(digits) && !input.trim().startsWith("+")) return null;
  const local = digits.replace(/^(62|0)/, "");
  return local.length >= 9 && local.length <= 13 ? local : null;
}

/** Cari member dari satu isian admin: ID Soslay, Kuy ID, Reclub ID, atau nomor HP. */
export async function findMemberByIdentifier(raw: string): Promise<MemberIdentity | null> {
  const q = raw.trim().replace(/^@/, "");
  if (!q) return null;
  const db = await readClient();
  const one = async (column: string, value: string, by: MemberIdentity["matchedBy"]) => {
    const { data } = await db.from("profiles").select(PROFILE_FIELDS).eq(column, value).limit(1).maybeSingle<ProfileRow>();
    return data ? toIdentity(data, by) : null;
  };
  const code = normalizeMemberCode(q);
  if (code) return one("member_code", code, "ID Soslay");
  const phone = normalizeIndoPhone(q);
  if (phone) return findMemberByPhone(phone);
  return (await one("kuy_id", q, "Kuy ID")) || (await one("reclub_id", q, "Reclub ID"));
}

/** Nomor HP di profil tersimpan dengan/tanpa 0 / 62 di depan → cocokkan ketiganya. */
export async function findMemberByPhone(local: string): Promise<MemberIdentity | null> {
  const db = await readClient();
  const { data } = await db
    .from("profiles")
    .select(PROFILE_FIELDS)
    .in("phone", [local, `0${local}`, `62${local}`])
    .limit(1)
    .maybeSingle<ProfileRow>();
  return data ? toIdentity(data, "nomor HP") : null;
}

/** Data profil Soslay untuk banyak member sekaligus (nama, ID Soslay, Kuy ID). */
export async function membersByIds(ids: string[]): Promise<Map<string, MemberIdentity>> {
  if (!ids.length) return new Map();
  const db = await readClient();
  const { data } = await db.from("profiles").select(PROFILE_FIELDS).in("id", ids).returns<ProfileRow[]>();
  return new Map((data ?? []).map((p) => [p.id, toIdentity(p, "ID Soslay")]));
}

export async function findMemberById(id: string): Promise<MemberIdentity | null> {
  return (await membersByIds([id])).get(id) ?? null;
}
