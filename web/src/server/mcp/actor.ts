import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Actor } from "@/lib/supabase/actor";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { likeEscape } from "@/lib/text";

/**
 * Akses MCP (Claude): kunci rahasia MCP_TOKEN (di URL connector / header Bearer) + akun tim MCP_ACTOR_EMAIL
 * yang "dipinjam" — semua tulisan lewat MCP memakai sesi akun itu (RLS, izin role & Log aktivitas atas namanya).
 * Sesi dibuat server lewat service role (magic link yang langsung diverifikasi, tidak ada email terkirim),
 * disimpan di memori & diperpanjang dengan refresh token. Disarankan akun tim khusus untuk Claude (role
 * dengan izin edit Activities saja), supaya sesinya terpisah dari login pribadi admin.
 */

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Kunci cocok dengan MCP_TOKEN (dibandingkan waktu-konstan). MCP_TOKEN kosong / pendek → MCP nonaktif. */
export function mcpKeyOk(provided: string | null): boolean {
  const expected = process.env.MCP_TOKEN ?? "";
  if (expected.length < 24 || !provided) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}

type CachedSession = { accessToken: string; refreshToken: string; expiresAt: number; email: string; userId: string };
let cached: CachedSession | null = null;
/** Login yang sedang berjalan — panggilan bersamaan menunggu yang sama, tidak membuat sesi masing-masing. */
let pending: Promise<CachedSession | { error: string }> | null = null;

const anonClient = () => createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });

type Session = { access_token: string; refresh_token: string; expires_at?: number; expires_in?: number; user: { id: string } };

function remember(email: string, session: Session): CachedSession {
  // expires_at kadang tidak dikirim → hitung dari expires_in (default 1 jam), jangan 0 (refresh tiap panggilan).
  const expiresAt = session.expires_at ? session.expires_at * 1000 : Date.now() + (session.expires_in ?? 3600) * 1000;
  cached = { accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt, email, userId: session.user.id };
  return cached;
}

/**
 * Sesi akun MCP. Masih berlaku → dipakai; hampir habis → diperpanjang dengan refresh token (sesi login yang
 * sama, tidak menambah sesi baru). Login baru (magic link) hanya bila belum ada sesi di instance server ini
 * atau refresh gagal. Panggilan bersamaan berbagi satu proses login.
 */
function actorSession(email: string): Promise<CachedSession | { error: string }> {
  if (cached?.email === email && cached.expiresAt - Date.now() > 120_000) return Promise.resolve(cached);
  pending ??= openSession(email).finally(() => {
    pending = null;
  });
  return pending;
}

async function openSession(email: string): Promise<CachedSession | { error: string }> {
  if (cached?.email === email) {
    const { data } = await anonClient().auth.refreshSession({ refresh_token: cached.refreshToken });
    if (data.session) return remember(email, data.session);
    cached = null;
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY belum dipasang di server." };
  // Magic link untuk email yang belum terdaftar MEMBUAT akun baru → pastikan dulu email ini anggota tim aktif
  // yang akunnya sudah ada (salah ketik MCP_ACTOR_EMAIL tidak boleh membuat akun liar).
  const { data: staff } = await admin.from("staff_members").select("user_id").ilike("email", likeEscape(email)).eq("status", "active").not("user_id", "is", null).maybeSingle();
  if (!staff?.user_id) return { error: `${email} bukan anggota tim aktif — cek MCP_ACTOR_EMAIL di Vercel dan statusnya di Settings & Roles.` };
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash || link.user?.id !== staff.user_id) {
    return { error: `Akun MCP_ACTOR_EMAIL tidak bisa dipakai: ${linkError?.message ?? (tokenHash ? "akun login tidak sama dengan akun tim" : "akun tidak ditemukan")}` };
  }
  const { data, error } = await anonClient().auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error || !data.session) return { error: `Sesi akun MCP gagal dibuat: ${error?.message ?? "coba lagi"}` };
  return remember(email, data.session);
}

/** Token ditolak (kedaluwarsa / sesi dicabut) — bukan gangguan sesaat. */
const authRejected = (status: number, message: string) => status === 401 || /jwt|token/i.test(message);

/** Akun tim yang dipakai MCP, lengkap dengan izinnya (sama dengan login admin biasa). */
export async function mcpActor(): Promise<Actor | { error: string }> {
  const email = process.env.MCP_ACTOR_EMAIL?.trim().toLowerCase();
  if (!email) return { error: "MCP_ACTOR_EMAIL belum diisi di server." };
  const session = await actorSession(email);
  if ("error" in session) return session;
  // Cara resmi supabase-js memakai token yang sudah ada: setiap query (PostgREST/RPC) membawa token akun ini.
  const token = session.accessToken;
  const client = createClient(supabaseUrl, supabaseAnonKey, { accessToken: async () => token });
  const { data: access, error, status } = await client.rpc("my_admin_access").maybeSingle();
  if (error) {
    // Hanya token yang ditolak yang membuang cache (login ulang); gangguan sesaat memakai sesi yang sama lagi.
    if (authRejected(status, error.message) && cached?.accessToken === token) cached = null;
    console.error(`[mcp] my_admin_access ${status} ${error.code ?? ""}: ${error.message}`);
    return { error: `Akses akun ${email} gagal dicek (${status}): ${error.message}` };
  }
  const row = access as { full_name: string; role_name: string; permissions: Actor["access"] } | null;
  if (!row) {
    console.error(`[mcp] my_admin_access kosong untuk user ${session.userId}`);
    return { error: `${email} bukan anggota tim aktif (akun ${session.userId.slice(0, 8)}) — cek status & role-nya di Settings & Roles.` };
  }
  return { client, userId: session.userId, name: row.full_name, role: row.role_name, access: row.permissions };
}
