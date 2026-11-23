import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyAdminOrder } from "./notify";
import type { CheckoutLine, ShipInput, ShopResult } from "./types";

/** Payload RPC pesanan (place_shop_order / place_shop_order_for / check_shop_order) — satu bentuk untuk semua. */
export const rpcItems = (lines: CheckoutLine[]) => lines.map((l) => ({ slug: l.slug, options: l.options, quantity: l.quantity }));
export const rpcShip = (ship: ShipInput) => ({
  method: ship.method,
  name: ship.name,
  phone: ship.phone,
  address: ship.address ?? null,
  city: ship.city ?? null,
  postal_code: ship.postalCode ?? null,
  lat: ship.method === "instant" ? ship.lat : null,
  lng: ship.method === "instant" ? ship.lng : null,
  session_id: ship.method === "pickup" ? ship.sessionId : null,
});

/** Setelah pesanan dibuat: segarkan halaman order & kirim email admin setelah respons (tidak memperlambat checkout). */
export function afterOrderPlaced(code: string) {
  revalidatePath("/akun/order");
  after(() => notifyAdminOrder("placed", code));
}

/**
 * Pesanan atas nama sesi di `client` (place_shop_order, auth.uid()). Order Now memberi klien yang baru saja masuk
 * — cookie respons belum terbaca ulang oleh klien baru di request yang sama.
 */
export async function placeOrderWith(client: SupabaseClient, lines: CheckoutLine[], ship: ShipInput): Promise<ShopResult<{ code: string }>> {
  const { data, error } = await client.rpc("place_shop_order", { p_items: rpcItems(lines), p_ship: rpcShip(ship) });
  if (error) return { ok: false, error: error.code === "42501" ? "Sesi kamu berakhir — masuk lagi untuk checkout." : error.message };
  afterOrderPlaced(data as string);
  return { ok: true, data: { code: data as string } };
}
