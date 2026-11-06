import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FINANCE_PROOF_BUCKET, getFinanceAccess } from "@/server/admin/finance-repo";
import { privateFileUrl } from "@/server/storage";

/** GET /admin/keuangan/bukti/:id → redirect ke signed URL bukti transaksi (5 menit), setelah cek akses. */
export async function GET(_request: Request, { params }: RouteContext<"/admin/keuangan/bukti/[id]">) {
  const { role } = await getFinanceAccess();
  if (!role) return new Response("Tidak punya akses Keuangan.", { status: 403 });
  if (!isSupabaseConfigured) return new Response("Mode demo: bukti contoh tidak tersedia.", { status: 404 });
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("finance_transactions").select("proof_path").eq("id", id).maybeSingle();
  if (!data?.proof_path) return new Response("Bukti tidak ditemukan.", { status: 404 });
  const url = await privateFileUrl(FINANCE_PROOF_BUCKET, data.proof_path);
  if (!url) return new Response("SUPABASE_SERVICE_ROLE_KEY belum dipasang di server.", { status: 503 });
  return Response.redirect(url, 302);
}
