import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMemberSession } from "@/server/member/user";
import { demoOrders, demoProofFiles } from "@/server/shop/demo-store";
import { PROOF_BUCKET } from "@/server/shop/orders";
import { privateFileUrl } from "@/server/storage";

/** GET /akun/pesanan/:code/bukti/:id → bukti transfer milik member sendiri (signed URL 5 menit). */
export async function GET(_request: Request, { params }: RouteContext<"/akun/pesanan/[code]/bukti/[id]">) {
  const { code, id } = await params;
  if (!isSupabaseConfigured) {
    const file = demoOrders().get(code)?.proofs.some((p) => p.id === id) ? demoProofFiles().get(id) : undefined;
    if (!file) return new Response("Bukti tidak ditemukan.", { status: 404 });
    return new Response(new Uint8Array(file.data), { headers: { "content-type": file.mime, "cache-control": "private, no-store" } });
  }
  const { supabase, user } = await getMemberSession();
  if (!user) return new Response("Masuk dulu.", { status: 401 });
  // RLS "member read own proofs": hanya bukti pesanan milik sendiri yang terbaca.
  const { data } = await supabase.from("order_payment_proofs").select("file_path, orders!inner(code)").eq("id", id).eq("orders.code", code).maybeSingle();
  if (!data?.file_path) return new Response("Bukti tidak ditemukan.", { status: 404 });
  const url = await privateFileUrl(PROOF_BUCKET, data.file_path);
  if (!url) return new Response("SUPABASE_SERVICE_ROLE_KEY belum dipasang di server.", { status: 503 });
  return Response.redirect(url, 302);
}
