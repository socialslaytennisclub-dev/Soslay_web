"use server";

import { isEmail } from "@/lib/auth";
import { participantsLockReason } from "@/lib/session-lock";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataset } from "../dataset";
import { normalizePhone, parseKuyExport, type KuyRow } from "../kuy-import";
import { findMemberById, findMemberByIdentifier, findMemberByPhone, normalizeIndoPhone, type MemberIdentity } from "../identity";
import { getAdminSession } from "../session";
import type { KuyImportPreview, KuyImportPreviewRow, SessionMatch } from "../types";
import { audit, refreshPaths, requireEditor, type ActionResult } from "./common";

/**
 * Aksi permainan sesi (admin): impor peserta dari export XLSX Kuyy dan simpan line-up.
 * Peserta dicocokkan ke member Soslay lewat email, lalu telepon, lalu Kuy ID (username
 * Kuyy hanya dipakai kalau unik di file — tamu yang dibelikan tiket memakai username pembeli).
 * Peserta yang belum jadi member diundang daftar lewat link wa.me (tanpa API WhatsApp) ke
 * nomor dari file Kuyy — admin yang menekan kirim di WhatsApp.
 */

/** Cara mengundang peserta yang tidak cocok dengan member mana pun. */
const inviteVia = (r: KuyRow, member: KuyImportPreviewRow["member"]): KuyImportPreviewRow["invite"] =>
  r.skipReason || member ? null : r.phone.length >= 9 ? "whatsapp" : "none";

const XLSX_MAX_BYTES = 5 * 1024 * 1024;

async function readUpload(formData: FormData): Promise<{ name: string; size: number; parsed: ReturnType<typeof parseKuyExport> } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih file XLSX dari Kuyy dulu." };
  if (!/\.xlsx$/i.test(file.name)) return { error: "Format harus .xlsx (export peserta Kuyy)." };
  if (file.size > XLSX_MAX_BYTES) return { error: "Ukuran file maksimal 5 MB." };
  try {
    return { name: file.name, size: file.size, parsed: parseKuyExport(await file.arrayBuffer()) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "File tidak bisa dibaca." };
  }
}

async function matchMembers(rows: KuyRow[]): Promise<Map<string, KuyImportPreviewRow["member"]>> {
  const d = await getDataset();
  const byEmail = new Map(d.members.map((m) => [m.email.toLowerCase(), m]));
  const byPhone = new Map(d.members.filter((m) => m.phone).map((m) => [normalizePhone(m.phone), m]));
  const byKuy = new Map(d.members.filter((m) => m.kuyId).map((m) => [m.kuyId.toLowerCase(), m]));
  const usernameCount = new Map<string, number>();
  for (const r of rows) usernameCount.set(r.username.toLowerCase(), (usernameCount.get(r.username.toLowerCase()) ?? 0) + 1);

  const result = new Map<string, KuyImportPreviewRow["member"]>();
  for (const r of rows) {
    const hit =
      (r.email && byEmail.get(r.email) && { m: byEmail.get(r.email)!, by: "email" as const }) ||
      (r.phone && byPhone.get(r.phone) && { m: byPhone.get(r.phone)!, by: "telepon" as const }) ||
      (r.username && usernameCount.get(r.username.toLowerCase()) === 1 && byKuy.get(r.username.toLowerCase()) && { m: byKuy.get(r.username.toLowerCase())!, by: "Kuy ID" as const }) ||
      null;
    result.set(r.regNo, hit ? { id: hit.m.id, name: hit.m.fullName, code: hit.m.memberCode, username: hit.m.kuyId, by: hit.by } : null);
  }
  return result;
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type GhostRow = { id: string; kuy_id: string | null; email: string | null; phone: string | null; full_name: string; tennis_level: string | null };

/** Username Kuyy yang benar-benar milik peserta (bukan pembeli yang membelikan tiket tamu). */
function ownKuyIds(rows: KuyRow[]) {
  const count = new Map<string, number>();
  for (const r of rows) if (r.username) count.set(r.username.toLowerCase(), (count.get(r.username.toLowerCase()) ?? 0) + 1);
  return new Map(rows.map((r) => [r.regNo, r.username && count.get(r.username.toLowerCase()) === 1 ? r.username.toLowerCase() : ""]));
}

/**
 * Cari ghost member (peserta belum daftar dari aktivitas sebelumnya) untuk tiap baris yang
 * tidak cocok dengan member: Kuy ID milik sendiri → email → telepon.
 */
async function findGhosts(supabase: Supabase, rows: KuyRow[]): Promise<Map<string, GhostRow>> {
  const own = ownKuyIds(rows);
  const kuy = [...new Set([...own.values()].filter(Boolean))];
  const emails = [...new Set(rows.map((r) => r.email).filter(Boolean))];
  const phones = [...new Set(rows.map((r) => r.phone).filter((p) => p.length >= 9))];
  const filters = [kuy.length && `kuy_id.in.(${kuy.map((k) => `"${k}"`).join(",")})`, emails.length && `email.in.(${emails.map((e) => `"${e}"`).join(",")})`, phones.length && `phone.in.(${phones.join(",")})`].filter(Boolean);
  if (!filters.length) return new Map();
  const { data } = await supabase.from("ghost_members").select("id, kuy_id, email, phone, full_name, tennis_level").is("claimed_by", null).or(filters.join(","));
  const ghosts = (data ?? []) as GhostRow[];
  const result = new Map<string, GhostRow>();
  for (const r of rows) {
    const k = own.get(r.regNo);
    const hit =
      (k && ghosts.find((g) => g.kuy_id?.toLowerCase() === k)) ||
      (r.email && ghosts.find((g) => g.email?.toLowerCase() === r.email)) ||
      (r.phone.length >= 9 && ghosts.find((g) => g.phone === r.phone)) ||
      null;
    if (hit) result.set(r.regNo, hit);
  }
  return result;
}

async function ghostActivityCounts(supabase: Supabase, ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const { data } = await supabase.from("session_participants").select("ghost_id").in("ghost_id", ids);
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.ghost_id as string, (counts.get(r.ghost_id as string) ?? 0) + 1);
  return counts;
}

/** Baca file & tampilkan preview (siapa yang cocok dengan member) — belum menyimpan apa pun. */
export async function previewKuyImport(sessionId: string, formData: FormData): Promise<{ ok: true; preview: KuyImportPreview } | { ok: false; error: string }> {
  const session = await getAdminSession();
  if (session.mode === "denied") return { ok: false, error: "Tidak punya akses." };
  if (session.mode === "live") {
    const auth = await requireEditor("activities");
    if ("error" in auth) return { ok: false, error: auth.error };
  }
  const upload = await readUpload(formData);
  if ("error" in upload) return { ok: false, error: upload.error };
  const { eventTitle, rows } = upload.parsed;
  if (!rows.length) return { ok: false, error: "Tidak ada peserta di file ini." };

  const members = await matchMembers(rows);
  let existing = new Set<string>();
  let ghosts = new Map<string, GhostRow>();
  let ghostCounts = new Map<string, number>();
  if (session.mode === "live") {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("session_participants").select("kuy_reg_no").eq("session_id", sessionId);
    existing = new Set((data ?? []).map((r) => r.kuy_reg_no as string));
    ghosts = await findGhosts(supabase, rows.filter((r) => !members.get(r.regNo)));
    ghostCounts = await ghostActivityCounts(supabase, [...new Set([...ghosts.values()].map((g) => g.id))]);
  }
  return {
    ok: true,
    preview: {
      fileName: upload.name,
      fileSize: upload.size,
      eventTitle,
      rows: rows.map((r) => ({
        regNo: r.regNo,
        name: r.name,
        email: r.email,
        phone: r.phone,
        instagram: r.instagram,
        level: r.level,
        levelRaw: r.levelRaw,
        username: r.username,
        amount: r.amount,
        paymentMethod: r.paymentMethod,
        ticket: r.ticket,
        ticketPrice: r.ticketPrice,
        skipReason: r.skipReason,
        member: members.get(r.regNo) ?? null,
        existing: existing.has(r.regNo),
        invite: inviteVia(r, members.get(r.regNo) ?? null),
        ghost: ghosts.has(r.regNo) ? { activities: ghostCounts.get(ghosts.get(r.regNo)!.id) ?? 0 } : null,
      })),
    },
  };
}

/**
 * Simpan peserta dari file yang sama (dibaca ulang di server, bukan dari preview client).
 * Impor ulang memperbarui data per nomor registrasi; check-in yang sudah ada dipertahankan.
 */
export async function importKuyParticipants(sessionId: string, formData: FormData): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const upload = await readUpload(formData);
  if ("error" in upload) return { ok: false, error: upload.error };
  // Hanya baris yang dicentang admin di preview (kalau dikirim); baris dilewati tetap diabaikan.
  const selectedRaw = formData.get("selected");
  const selected = typeof selectedRaw === "string" ? new Set(JSON.parse(selectedRaw) as string[]) : null;
  const rows = upload.parsed.rows.filter((r) => !r.skipReason && (!selected || selected.has(r.regNo)));
  if (!rows.length) return { ok: false, error: "Tidak ada peserta yang dipilih untuk diimpor." };

  const members = await matchMembers(rows);
  const supabase = await createSupabaseServerClient();

  // Belum member → ghost member: pakai yang sudah ada (aktivitas sebelumnya) atau buat baru.
  const guests = rows.filter((r) => !members.get(r.regNo));
  const ghostOf = new Map<string, string>();
  if (guests.length) {
    const known = await findGhosts(supabase, guests);
    const own = ownKuyIds(rows);
    const now = new Date().toISOString();
    for (const r of guests) {
      const g = known.get(r.regNo);
      if (g) {
        await supabase
          .from("ghost_members")
          .update({
            full_name: r.name,
            last_seen_at: now,
            kuy_id: g.kuy_id ?? (own.get(r.regNo) || null),
            email: g.email ?? (r.email || null),
            phone: g.phone ?? (r.phone || null),
            tennis_level: r.level ?? g.tennis_level,
          })
          .eq("id", g.id);
        ghostOf.set(r.regNo, g.id);
        continue;
      }
      const ghostRow = { kuy_id: own.get(r.regNo) || null, full_name: r.name, email: r.email || null, phone: r.phone || null, tennis_level: r.level };
      let { data: created, error: ghostError } = await supabase.from("ghost_members").insert(ghostRow).select("id").single();
      // Kuy ID sudah dipakai ghost yang telah diklaim member lain → simpan tanpa Kuy ID.
      if (ghostError?.code === "23505") ({ data: created, error: ghostError } = await supabase.from("ghost_members").insert({ ...ghostRow, kuy_id: null }).select("id").single());
      if (ghostError || !created) return { ok: false, error: `Gagal mencatat peserta ${r.name}: ${ghostError?.message ?? "coba lagi"}` };
      ghostOf.set(r.regNo, created.id as string);
      // Baris berikutnya di file yang sama orangnya (email/telepon sama) memakai ghost ini juga.
      for (const other of guests) {
        if (other !== r && !known.has(other.regNo) && ((r.email && other.email === r.email) || (r.phone.length >= 9 && other.phone === r.phone))) {
          known.set(other.regNo, { id: created.id as string, kuy_id: own.get(r.regNo) || null, email: r.email || null, phone: r.phone || null, full_name: r.name, tennis_level: r.level });
        }
      }
    }
  }

  const { error } = await supabase.from("session_participants").upsert(
    rows.map((r) => ({
      session_id: sessionId,
      kuy_reg_no: r.regNo,
      member_id: members.get(r.regNo)?.id ?? null,
      ghost_id: ghostOf.get(r.regNo) ?? null,
      full_name: r.name,
      email: r.email || null,
      phone: r.phone || null,
      instagram: r.instagram || null,
      tennis_level: r.level,
      kuy_username: r.username || null,
      amount: r.amount,
      payment_method: r.paymentMethod || null,
    })),
    { onConflict: "session_id,kuy_reg_no" },
  );
  if (error) return { ok: false, error: `Gagal mengimpor: ${error.message}` };

  // ID Soslay ↔ Kuy ID: member yang cocok lewat email/telepon tapi belum punya Kuy ID di profilnya
  // → username Kuyy miliknya sendiri (bukan pembeli tiket) disambungkan ke profil Soslay-nya.
  const own = ownKuyIds(rows);
  const linkable = rows.filter((r) => members.get(r.regNo) && !members.get(r.regNo)!.username && own.get(r.regNo));
  const admin = createSupabaseAdminClient();
  let linked = 0;
  if (admin && linkable.length) {
    for (const r of linkable) {
      const { data: free } = await supabase.rpc("kuy_id_available", { p_kuy_id: own.get(r.regNo) });
      if (!free) continue;
      const { error: linkError } = await admin.from("profiles").update({ kuy_id: r.username }).eq("id", members.get(r.regNo)!.id).is("kuy_id", null);
      if (!linkError) linked++;
    }
  }

  const matched = rows.filter((r) => members.get(r.regNo)).length;
  await audit(auth.userId, `mengimpor ${rows.length} peserta Kuyy`, "session", sessionId);
  refreshPaths(`/admin/activities/${sessionId}`);
  const parts = [`${rows.length} peserta diimpor`, `${matched} cocok dengan member Soslay`];
  if (linked) parts.push(`${linked} Kuy ID disambungkan ke ID Soslay`);
  if (guests.length) parts.push(`${guests.length} belum member dicatat sebagai ghost member — undang daftar lewat tombol WA`);
  return { ok: true, message: `${parts.join(" · ")}.` };
}

/**
 * Simpan line-up. Match yang sudah ada skornya terkunci (tidak boleh berubah); sisanya diganti.
 * Kalau sesi belum punya peserta import, peserta booking dijadikan daftar peserta dulu.
 */
export async function saveLineup(sessionId: string, matches: Omit<SessionMatch, "scoreA" | "scoreB">[]): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createSupabaseServerClient();

  const { data: session } = await supabase.from("sessions").select("court_count, round_count, ended_at").eq("id", sessionId).single();
  if (!session) return { ok: false, error: "Sesi tidak ditemukan." };
  if (session.ended_at) return { ok: false, error: "Sesi sudah diakhiri — line-up terkunci." };

  // Peserta booking (id = member id) → baris session_participants.
  let { data: roster } = await supabase.from("session_participants").select("id, member_id").eq("session_id", sessionId);
  if (!roster?.length) {
    const { data: booked } = await supabase
      .from("bookings")
      .select("member_id, amount, profiles(full_name, email, phone, instagram, tennis_level)")
      .eq("session_id", sessionId)
      .in("status", ["registered", "attended"]);
    type Booked = { member_id: string; amount: number; profiles: { full_name: string; email: string; phone: string | null; instagram: string | null; tennis_level: string | null } | null };
    const rows = ((booked ?? []) as unknown as Booked[]).map((b, i) => ({
      session_id: sessionId,
      member_id: b.member_id,
      kuy_reg_no: `B${i + 1}`,
      full_name: b.profiles?.full_name ?? "Member",
      email: b.profiles?.email ?? null,
      phone: b.profiles?.phone ?? null,
      instagram: b.profiles?.instagram ?? null,
      tennis_level: b.profiles?.tennis_level ?? null,
      amount: b.amount,
    }));
    if (rows.length) {
      const { data, error } = await supabase.from("session_participants").insert(rows).select("id, member_id");
      if (error) return { ok: false, error: `Gagal menyiapkan peserta: ${error.message}` };
      roster = data;
    }
  }
  const idOf = new Map<string, string>();
  for (const r of roster ?? []) {
    idOf.set(r.id as string, r.id as string);
    if (r.member_id) idOf.set(r.member_id as string, r.id as string);
  }

  const resolved = [];
  const usedPerRound = new Map<number, Set<string>>();
  for (const m of matches) {
    if (m.round < 1 || m.round > session.round_count || m.court < 1 || m.court > session.court_count) return { ok: false, error: `Ronde ${m.round} · Court ${m.court} di luar format sesi.` };
    const ids = [...m.a, ...m.b].map((p) => idOf.get(p));
    if (ids.some((p) => !p)) return { ok: false, error: `Ada pemain di Ronde ${m.round} yang bukan peserta sesi ini.` };
    const used = usedPerRound.get(m.round) ?? new Set<string>();
    for (const p of ids) {
      if (used.has(p!)) return { ok: false, error: `Ada pemain yang main dua kali di Ronde ${m.round}.` };
      used.add(p!);
    }
    usedPerRound.set(m.round, used);
    resolved.push({ session_id: sessionId, round_no: m.round, court_no: m.court, a1: ids[0]!, a2: ids[1]!, b1: ids[2]!, b2: ids[3]! });
  }

  const { data: scored } = await supabase.from("session_matches").select("round_no, court_no, a1, a2, b1, b2").eq("session_id", sessionId).not("score_a", "is", null);
  const lockedKey = (r: { round_no: number; court_no: number }) => `${r.round_no}:${r.court_no}`;
  const locked = new Map((scored ?? []).map((r) => [lockedKey(r), r]));
  for (const r of resolved) {
    const l = locked.get(lockedKey(r));
    if (l && [l.a1, l.a2, l.b1, l.b2].join() !== [r.a1, r.a2, r.b1, r.b2].join()) return { ok: false, error: `Ronde ${r.round_no} · Court ${r.court_no} sudah ada skornya — tidak bisa diubah.` };
  }

  const { error: delError } = await supabase.from("session_matches").delete().eq("session_id", sessionId).is("score_a", null);
  if (delError) return { ok: false, error: `Gagal menyimpan line-up: ${delError.message}` };
  const fresh = resolved.filter((r) => !locked.has(lockedKey(r)));
  if (fresh.length) {
    const { error } = await supabase.from("session_matches").insert(fresh);
    if (error) return { ok: false, error: `Gagal menyimpan line-up: ${error.message}` };
  }
  await audit(auth.userId, `menyimpan line-up (${resolved.length} match)`, "session", sessionId);
  refreshPaths(`/admin/activities/${sessionId}`);
  return { ok: true, message: `Line-up tersimpan · ${resolved.length} match.` };
}

/**
 * Skor match oleh admin/host. Total harus = target poin sesi (dicek lagi oleh RPC
 * save_match_score); skor dari host langsung final dan masuk leaderboard.
 */
export async function saveMatchScore(sessionId: string, matchId: string, scoreA: number, scoreB: number): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  if (![scoreA, scoreB].every((n) => Number.isInteger(n) && n >= 0)) return { ok: false, error: "Skor tidak valid." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_match_score", { p_match: matchId, p_score_a: scoreA, p_score_b: scoreB });
  if (error) return { ok: false, error: `Gagal menyimpan skor: ${error.message}` };
  await audit(auth.userId, `menyimpan skor ${scoreA}–${scoreB}`, "session_match", matchId);
  refreshPaths(`/admin/activities/${sessionId}`);
  return { ok: true, message: `Skor ${scoreA}–${scoreB} tersimpan · court terkunci.` };
}

/** Alasan data peserta sesi terkunci (aktivitas sudah dikerjakan), atau null kalau boleh dihapus. */
async function participantsLock(supabase: Supabase, sessionId: string, opts: { ignoreCheckIns?: boolean } = {}): Promise<string | null> {
  const [{ data: session }, { count: scored }, { count: checkedIn }] = await Promise.all([
    supabase.from("sessions").select("starts_at, status, ended_at").eq("id", sessionId).maybeSingle(),
    supabase.from("session_matches").select("id", { count: "exact", head: true }).eq("session_id", sessionId).not("score_a", "is", null),
    supabase.from("session_participants").select("id", { count: "exact", head: true }).eq("session_id", sessionId).not("checked_in_at", "is", null),
  ]);
  if (!session) return "Sesi tidak ditemukan.";
  return participantsLockReason({
    startsAt: session.starts_at as string,
    status: session.status as string,
    endedAt: session.ended_at as string | null,
    scoredMatches: scored ?? 0,
    checkedIn: opts.ignoreCheckIns ? 0 : (checkedIn ?? 0),
  });
}

/**
 * Hapus peserta terpilih dari sesi (satu atau banyak). Peserta impor Kuyy → baris
 * session_participants dihapus (match line-up yang memuatnya ikut terhapus) + booking Kuyy
 * member-nya dibatalkan; peserta dari booking → booking dibatalkan. Seluruh permintaan ditolak
 * kalau aktivitas sudah dikerjakan atau ada peserta terpilih yang sudah check-in.
 */
export async function removeParticipants(sessionId: string, participants: { id: string; memberId: string | null }[]): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!participants.length) return { ok: false, error: "Pilih peserta dulu." };
  const supabase = await createSupabaseServerClient();
  const locked = await participantsLock(supabase, sessionId, { ignoreCheckIns: true });
  if (locked) return { ok: false, error: locked };

  const rosterIds = participants.filter((p) => p.id !== p.memberId).map((p) => p.id);
  const bookingMembers = participants.filter((p) => p.id === p.memberId).map((p) => p.memberId!);
  const names: string[] = [];

  if (rosterIds.length) {
    const { data: rows } = await supabase.from("session_participants").select("id, full_name, member_id, checked_in_at").eq("session_id", sessionId).in("id", rosterIds);
    if ((rows?.length ?? 0) !== rosterIds.length) return { ok: false, error: "Sebagian peserta tidak ditemukan — muat ulang halaman." };
    const present = rows!.filter((r) => r.checked_in_at).map((r) => r.full_name as string);
    if (present.length) return { ok: false, error: `${present.join(", ")} sudah check-in — batalkan check-in dulu sebelum menghapus.` };
    const { error } = await supabase.from("session_participants").delete().in("id", rosterIds);
    if (error) return { ok: false, error: `Gagal menghapus: ${error.message}` };
    const memberIds = rows!.map((r) => r.member_id as string | null).filter((id): id is string => Boolean(id));
    if (memberIds.length) {
      // Booking hasil impor / tambahan admin dihapus; booking yang dibuat member sendiri di website
      // dibatalkan — keduanya supaya sesi hilang dari My Activities member itu.
      const bookings = () => supabase.from("bookings");
      await Promise.all([
        bookings().delete().eq("session_id", sessionId).eq("status", "registered").in("member_id", memberIds).in("source", ["kuy", "admin"]),
        bookings().update({ status: "cancelled" }).eq("session_id", sessionId).eq("status", "registered").in("member_id", memberIds).eq("source", "website"),
      ]);
    }
    names.push(...rows!.map((r) => r.full_name as string));
  }
  if (bookingMembers.length) {
    const { data, error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("session_id", sessionId)
      .in("member_id", bookingMembers)
      .in("status", ["registered", "waitlisted"])
      .select("member_id");
    if (error) return { ok: false, error: `Gagal menghapus: ${error.message}` };
    if ((data?.length ?? 0) < bookingMembers.length) return { ok: false, error: "Sebagian peserta sudah check-in atau booking-nya tidak ditemukan." };
    names.push(...Array(data!.length).fill("member"));
  }

  await audit(auth.userId, `menghapus ${names.length} peserta dari sesi`, "session", sessionId);
  refreshPaths(`/admin/activities/${sessionId}`, "/admin/activities");
  return { ok: true, message: names.length === 1 && names[0] !== "member" ? `${names[0]} dihapus dari peserta sesi.` : `${names.length} peserta dihapus dari sesi.` };
}

/**
 * Kosongkan semua peserta & absensi hasil impor Kuyy (untuk diganti impor data baru).
 * Line-up ikut terhapus; booking (Kuyy / tambahan manual) member yang belum hadir dihapus. Ditolak kalau
 * aktivitas sudah dikerjakan (mulai / selesai / ada skor / ada yang check-in).
 */
export async function clearParticipants(sessionId: string): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createSupabaseServerClient();
  const locked = await participantsLock(supabase, sessionId);
  if (locked) return { ok: false, error: locked };

  const { data: removed, error } = await supabase.from("session_participants").delete().eq("session_id", sessionId).select("member_id");
  if (error) return { ok: false, error: `Gagal menghapus: ${error.message}` };
  const memberIds = (removed ?? []).map((r) => r.member_id as string | null).filter((id): id is string => Boolean(id));
  if (memberIds.length) {
    await supabase.from("bookings").delete().eq("session_id", sessionId).in("source", ["kuy", "admin"]).eq("status", "registered").in("member_id", memberIds);
  }

  await audit(auth.userId, `mengosongkan ${removed?.length ?? 0} peserta sesi`, "session", sessionId);
  refreshPaths(`/admin/activities/${sessionId}`, "/admin/activities");
  return { ok: true, message: `${removed?.length ?? 0} peserta & absensi dihapus · line-up ikut dikosongkan. Silakan impor data baru.` };
}

// ── Tambah peserta manual (admin) ──────────────────────────────────────────

export type ParticipantLookup =
  | { found: "member"; member: Pick<MemberIdentity, "id" | "fullName" | "memberCode" | "kuyId" | "email" | "phone" | "level" | "matchedBy">; alreadyIn: boolean }
  | { found: "none" };

/** Tambah peserta ditolak hanya kalau sesi sudah selesai (saat Live masih boleh, mis. walk-in). */
async function addLock(supabase: Supabase, sessionId: string): Promise<string | null> {
  const { data: session } = await supabase.from("sessions").select("status, ended_at").eq("id", sessionId).maybeSingle();
  if (!session) return "Sesi tidak ditemukan.";
  if (session.status === "completed" || session.ended_at) return "Sesi sudah selesai — peserta tidak bisa ditambah lagi.";
  return null;
}

/** Cek isian admin (ID Soslay / Kuy ID / Reclub ID / nomor HP) → member Soslay atau belum terdaftar. */
export async function lookupParticipant(sessionId: string, query: string): Promise<{ ok: true; result: ParticipantLookup } | { ok: false; error: string }> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!query.trim()) return { ok: false, error: "Isi ID Soslay, Kuy ID, atau nomor HP." };
  const member = await findMemberByIdentifier(query);
  if (!member) return { ok: true, result: { found: "none" } };
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase.from("session_participants").select("id", { count: "exact", head: true }).eq("session_id", sessionId).eq("member_id", member.id);
  return { ok: true, result: { found: "member", member, alreadyIn: (count ?? 0) > 0 } };
}

export type ManualParticipantInput = { memberId: string } | { fullName: string; email: string; phone: string };

/**
 * Tambahkan peserta: member Soslay (datanya dari database) atau belum member → dicatat sebagai
 * ghost member (dipakai ulang kalau email/telepon sudah pernah tercatat).
 */
export async function addParticipantManual(sessionId: string, input: ManualParticipantInput): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createSupabaseServerClient();
  const locked = await addLock(supabase, sessionId);
  if (locked) return { ok: false, error: locked };
  const regNo = `ADM-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

  if ("memberId" in input) {
    const member = await findMemberById(input.memberId);
    if (!member) return { ok: false, error: "Member tidak ditemukan." };
    const { count } = await supabase.from("session_participants").select("id", { count: "exact", head: true }).eq("session_id", sessionId).eq("member_id", member.id);
    if (count) return { ok: false, error: `${member.fullName} sudah terdaftar di sesi ini.` };
    const { error } = await supabase.from("session_participants").insert({
      session_id: sessionId,
      kuy_reg_no: regNo,
      source: "admin",
      member_id: member.id,
      full_name: member.fullName,
      email: member.email || null,
      phone: member.phone || null,
      tennis_level: member.level,
      kuy_username: member.kuyId || null,
    });
    if (error) return { ok: false, error: `Gagal menambah peserta: ${error.message}` };
    await audit(auth.userId, `menambah peserta ${member.fullName} (manual)`, "session", sessionId);
    refreshPaths(`/admin/activities/${sessionId}`, "/admin/activities");
    return { ok: true, message: `${member.fullName} (${member.memberCode}) ditambahkan ke peserta.` };
  }

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);
  if (!fullName) return { ok: false, error: "Isi nama lengkap peserta." };
  if (phone.length < 9) return { ok: false, error: "Isi nomor HP (WhatsApp) yang valid — dipakai untuk mengenali & mengundang peserta." };
  if (email && !isEmail(email)) return { ok: false, error: "Email tidak valid." };
  // Ternyata sudah member (nomor HP terdaftar) → pakai data member.
  const existing = await findMemberByPhone(normalizeIndoPhone(input.phone) ?? phone);
  if (existing) return addParticipantManual(sessionId, { memberId: existing.id });

  const row: KuyRow = { regNo, name: fullName, email, phone, instagram: "", level: null, levelRaw: "", username: "", status: "going", amount: 0, paymentMethod: "", ticket: "", ticketPrice: 0, skipReason: null };
  const known = (await findGhosts(supabase, [row])).get(regNo);
  let ghostId = known?.id;
  if (ghostId) {
    const { count } = await supabase.from("session_participants").select("id", { count: "exact", head: true }).eq("session_id", sessionId).eq("ghost_id", ghostId);
    if (count) return { ok: false, error: `${known!.full_name} sudah terdaftar di sesi ini.` };
    await supabase.from("ghost_members").update({ last_seen_at: new Date().toISOString(), email: known!.email ?? (email || null), phone: known!.phone ?? (phone || null) }).eq("id", ghostId);
  } else {
    const { data, error } = await supabase.from("ghost_members").insert({ full_name: fullName, email: email || null, phone: phone || null }).select("id").single();
    if (error || !data) return { ok: false, error: `Gagal mencatat peserta: ${error?.message ?? "coba lagi"}` };
    ghostId = data.id as string;
  }
  const { error } = await supabase.from("session_participants").insert({
    session_id: sessionId,
    kuy_reg_no: regNo,
    source: "admin",
    ghost_id: ghostId,
    full_name: known?.full_name ?? fullName,
    email: email || null,
    phone: phone || null,
  });
  if (error) return { ok: false, error: `Gagal menambah peserta: ${error.message}` };
  await audit(auth.userId, `menambah peserta ${fullName} (manual, ghost)`, "session", sessionId);
  refreshPaths(`/admin/activities/${sessionId}`, "/admin/activities");
  return { ok: true, message: `${fullName} ditambahkan sebagai ghost member${known ? " (sudah pernah ikut aktivitas sebelumnya)" : ""}.` };
}
