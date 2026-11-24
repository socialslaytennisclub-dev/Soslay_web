import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Actor } from "@/lib/supabase/actor";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Akses MCP (Claude): kunci rahasia MCP_TOKEN (di URL connector / header Bearer) + akun tim MCP_ACTOR_EMAIL
 * yang "dipinjam" — semua tulisan lewat MCP memakai sesi akun itu (RLS, izin role & Log aktivitas atas namanya).
 * Sesi dibuat server lewat service role (magic link yang langsung diverifikasi, tidak ada email terkirim)
 * dan disimpan di memori sampai hampir kedaluwarsa.
 */

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Kunci cocok dengan MCP_TOKEN (dibandingkan waktu-konstan). MCP_TOKEN kosong / pendek → MCP nonaktif. */
export function mcpKeyOk(provided: string | null): boolean {
  const expected = process.env.MCP_TOKEN ?? "";
  if (expected.length < 24 || !provided) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}

let cached: { accessToken: string; expiresAt: number; email: string } | null = null;

async function actorToken(email: string): Promise<string | { error: string }> {
  if (cached && cached.email === email && cached.expiresAt - Date.now() > 120_000) return cached.accessToken;
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY belum dipasang di server." };
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return { error: `Akun MCP_ACTOR_EMAIL tidak bisa dipakai: ${linkError?.message ?? "akun tidak ditemukan"}` };
  const anon = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error || !data.session) return { error: `Sesi akun MCP gagal dibuat: ${error?.message ?? "coba lagi"}` };
  cached = { accessToken: data.session.access_token, expiresAt: (data.session.expires_at ?? 0) * 1000, email };
  return cached.accessToken;
}

/** Akun tim yang dipakai MCP, lengkap dengan izinnya (sama dengan login admin biasa). */
export async function mcpActor(): Promise<Actor | { error: string }> {
  const email = process.env.MCP_ACTOR_EMAIL?.trim().toLowerCase();
  if (!email) return { error: "MCP_ACTOR_EMAIL belum diisi di server." };
  const token = await actorToken(email);
  if (typeof token !== "string") return token;
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: user }, { data: access }] = await Promise.all([client.auth.getUser(token), client.rpc("my_admin_access").maybeSingle()]);
  const row = access as { full_name: string; role_name: string; permissions: Actor["access"] } | null;
  if (!user.user || !row) return { error: `${email} bukan anggota tim aktif — tambahkan di Settings & Roles.` };
  return { client, userId: user.user.id, name: row.full_name, role: row.role_name, access: row.permissions };
}
