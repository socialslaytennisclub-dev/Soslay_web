import type { NextRequest } from "next/server";
import { runAsActor } from "@/lib/supabase/actor";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { mcpActor, mcpKeyOk } from "@/server/mcp/actor";
import { callTool, toolList } from "@/server/mcp/tools";

/**
 * Server MCP Slay Club (Streamable HTTP, tanpa sesi) — connector untuk Claude: import activity dari
 * event Kuyy lewat chat. URL connector: https://<domain>/api/mcp?key=<MCP_TOKEN>. Semua tulisan memakai
 * akun tim MCP_ACTOR_EMAIL (lihat server/mcp/actor).
 */

export const dynamic = "force-dynamic";

const PROTOCOL = "2025-06-18";
const INSTRUCTIONS =
  "Slay Club: import activity dari event Kuyy. Alur: (1) baca halaman event Kuyy (judul, tanggal, jam, venue, harga, kuota, deskripsi) dan file export peserta Kuyy (.xlsx) dari admin; (2) panggil preview_activity_import dan tunjukkan ringkasannya; (3) setelah admin setuju, panggil import_activity dengan data yang sama. Jam & tanggal dalam WIB. Jangan menebak data yang tidak ada — tanyakan ke admin.";

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const reply = (id: RpcRequest["id"], result: unknown) => Response.json({ jsonrpc: "2.0", id, result });
const fail = (id: RpcRequest["id"], code: number, message: string, status = 200) => Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });

export async function POST(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!mcpKeyOk(request.nextUrl.searchParams.get("key") ?? bearer)) return fail(null, -32001, "Kunci MCP salah atau MCP belum diaktifkan.", 401);

  const body = (await request.json().catch(() => null)) as RpcRequest | null;
  if (!body || Array.isArray(body) || typeof body.method !== "string") return fail(null, -32600, "Permintaan JSON-RPC tidak valid.", 400);
  const { id, method, params } = body;
  // Notifikasi (tanpa id), mis. notifications/initialized → cukup diterima.
  if (id === undefined) return new Response(null, { status: 202 });

  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "slay-club", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: toolList() });
    case "tools/call": {
      // Mode demo (tanpa database): alat jalan dengan data demo, menyimpan ditolak aksi admin seperti biasa.
      const actor = isSupabaseConfigured ? await mcpActor() : null;
      if (actor && "error" in actor) return reply(id, { content: [{ type: "text", text: actor.error }], isError: true });
      const name = typeof params?.name === "string" ? params.name : "";
      const run = () => callTool(name, params?.arguments);
      try {
        return reply(id, await (actor ? runAsActor(actor, run) : run()));
      } catch (e) {
        console.error(`[mcp] ${name}:`, e);
        return reply(id, { content: [{ type: "text", text: "Terjadi kesalahan di server — coba lagi." }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Metode "${method}" tidak didukung.`);
  }
}

export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
