import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Actor } from "@/lib/supabase/actor";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

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

const anonClient = () => createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });

type Session = { access_token: string; refresh_token: string; expires_at?: number; user: { id: string } };

function remember(email: string, session: Session): CachedSession {
  cached = { accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: (session.expires_at ?? 0) * 1000, email, userId: session.user.id };
  return cached;
}

/**
 * Sesi akun MCP. Masih berlaku → dipakai; hampir habis → diperpanjang dengan refresh token (sesi login yang
 * sama, tidak menambah sesi baru). Login baru (magic link) hanya bila belum ada sesi di instance server ini
 * atau refresh gagal.
 */
async function actorSession(email: string): Promise<CachedSession | { error: string }> {
  if (cached?.email === email) {
    if (cached.expiresAt - Date.now() > 120_000) return cached;
    const { data } = await anonClient().auth.refreshSession({ refresh_token: cached.refreshToken });
    if (data.session) return remember(email, data.session);
    cached = null;
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY belum dipasang di server." };
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return { error: `Akun MCP_ACTOR_EMAIL tidak bisa dipakai: ${linkError?.message ?? "akun tidak ditemukan"}` };
  const { data, error } = await anonClient().auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error || !data.session) return { error: `Sesi akun MCP gagal dibuat: ${error?.message ?? "coba lagi"}` };
  return remember(email, data.session);
}

/** Akun tim yang dipakai MCP, lengkap dengan izinnya (sama dengan login admin biasa). */
export async function mcpActor(): Promise<Actor | { error: string }> {
  const email = process.env.MCP_ACTOR_EMAIL?.trim().toLowerCase();
  if (!email) return { error: "MCP_ACTOR_EMAIL belum diisi di server." };
  const session = await actorSession(email);
  if ("error" in session) return session;
  // Cara resmi supabase-js memakai token yang sudah ada: setiap query (PostgREST/RPC) membawa token akun ini.
  const token = session.accessToken;
  const client = createClient(supabaseUrl, supabaseAnonKey, { accessToken: async () => token });
  const { data: access, error } = await client.rpc("my_admin_access").maybeSingle();
  if (error) {
    // Token ditolak (mis. sesi dicabut) → buang cache supaya permintaan berikutnya login ulang.
    cached = null;
    return { error: `Akses akun ${email} gagal dicek: ${error.message}` };
  }
  const row = access as { full_name: string; role_name: string; permissions: Actor["access"] } | null;
  if (!row) return { error: `${email} bukan anggota tim aktif — cek status & role-nya di Settings & Roles.` };
  return { client, userId: session.userId, name: row.full_name, role: row.role_name, access: row.permissions };
}
