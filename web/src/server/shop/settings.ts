import "server-only";
import { cache } from "react";
import { shopBank, type ShopBank } from "@/content/checkout";
import { DEFAULT_INSTANT, type InstantSettings, type ShippingRate } from "@/lib/checkout";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_RATES } from "./demo-store";

/**
 * Pengaturan Shop yang diatur admin (Settings › Shop & pengiriman):
 * rekening tujuan (app_settings 'shop_bank'), alamat gudang + ongkir Instant (shipping_instant_settings),
 * ongkir J&T per kota (shipping_rates). Semua tabel bisa dibaca publik (RLS).
 */

export type RateRow = ShippingRate & { active: boolean };

export type ShopSettings = { bank: ShopBank; instant: InstantSettings; rates: RateRow[] };

type InstantRow = {
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  base_fee: number;
  base_km: number | string;
  per_km_fee: number;
  max_km: number | string;
  cutoff_time: string;
};

export const toInstant = (r: InstantRow | null): InstantSettings =>
  r
    ? {
        originAddress: r.origin_address,
        originLat: r.origin_lat,
        originLng: r.origin_lng,
        baseFee: r.base_fee,
        baseKm: Number(r.base_km),
        perKmFee: r.per_km_fee,
        maxKm: Number(r.max_km),
        cutoff: String(r.cutoff_time).slice(0, 5),
      }
    : DEFAULT_INSTANT;

const toBank = (v: unknown): ShopBank => ({ ...shopBank, ...((v && typeof v === "object" ? v : {}) as Partial<ShopBank>) });

export const getShopBank = cache(async (): Promise<ShopBank> => {
  if (!isSupabaseConfigured) return shopBank;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "shop_bank").maybeSingle();
  return toBank(data?.value);
});

/** Untuk halaman admin: termasuk kota yang nonaktif. */
export const getShopSettings = cache(async (): Promise<ShopSettings> => {
  if (!isSupabaseConfigured) return { bank: shopBank, instant: DEFAULT_INSTANT, rates: DEMO_RATES.map((r) => ({ ...r, active: true })) };
  const supabase = await createSupabaseServerClient();
  const [bank, { data: instant }, { data: rates }] = await Promise.all([
    getShopBank(),
    supabase.from("shipping_instant_settings").select("*").maybeSingle<InstantRow>(),
    supabase.from("shipping_rates").select("city, province, per_kg, eta_days, is_active").order("city"),
  ]);
  return {
    bank,
    instant: toInstant(instant),
    rates: (rates ?? []).map((r) => ({ city: r.city, province: r.province, perKg: r.per_kg, eta: r.eta_days, active: r.is_active })),
  };
});
