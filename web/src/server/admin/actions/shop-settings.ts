"use server";

import { citiesOf } from "@/content/wilayah";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ShopSettings } from "@/server/shop/settings";
import { audit, done, fail, refreshPaths, requireEditor, type ActionResult } from "./common";

/** Settings › Shop & pengiriman → app_settings 'shop_bank', shipping_instant_settings, shipping_rates. */
export async function saveShopSettings(s: ShopSettings): Promise<ActionResult> {
  const auth = await requireEditor("settings");
  if ("error" in auth) return fail(auth.error);

  const bank = {
    bank: s.bank.bank.trim(),
    short: s.bank.short.trim(),
    accountNo: s.bank.accountNo.trim(),
    accountName: s.bank.accountName.trim(),
    bankCode: s.bank.bankCode.trim(),
  };
  if (!bank.bank || !bank.short || !bank.accountName) return fail("Lengkapi nama bank, singkatan & nama pemilik rekening.");
  if (!/^\d{6,20}$/.test(bank.accountNo.replace(/[\s-]/g, ""))) return fail("Nomor rekening harus 6–20 angka.");
  if (bank.bankCode && !/^\d{3}$/.test(bank.bankCode)) return fail("Kode bank 3 angka (mis. 014).");

  const i = s.instant;
  if (!i.originAddress.trim()) return fail("Isi alamat gudang.");
  if (Math.abs(i.originLat) > 90 || Math.abs(i.originLng) > 180) return fail("Titik lokasi gudang tidak valid.");
  if (i.maxKm <= 0 || i.baseKm < 0 || i.baseFee < 0 || i.perKmFee < 0) return fail("Angka ongkir Instant tidak valid.");
  if (!/^\d{2}:\d{2}$/.test(i.cutoff)) return fail("Isi batas jam kirim (mis. 15:00).");

  const rates = s.rates.map((r) => ({ city: r.city.trim(), province: r.province.trim(), per_kg: Math.round(r.perKg), eta_days: r.eta.trim() || "2–3", is_active: r.active }));
  if (rates.some((r) => !r.city || !r.province)) return fail("Setiap baris ongkir J&T butuh provinsi & kabupaten/kota.");
  const wrong = rates.find((r) => !citiesOf(r.province).includes(r.city));
  if (wrong) return fail(`"${wrong.city}" tidak ada di daftar kabupaten/kota ${wrong.province} — pilih ulang dari dropdown.`);
  if (rates.some((r) => r.per_kg <= 0)) return fail("Tarif J&T per kg harus lebih dari 0.");
  const cities = rates.map((r) => r.city.toLowerCase());
  if (new Set(cities).size !== cities.length) return fail("Ada kota yang tercantum dua kali di ongkir J&T.");

  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const { data: existing } = await supabase.from("shipping_rates").select("city");
  const removed = (existing ?? []).map((r) => r.city as string).filter((c) => !rates.some((r) => r.city === c));

  const results = await Promise.all([
    supabase.from("app_settings").upsert({ key: "shop_bank", value: bank, updated_at: now }, { onConflict: "key" }),
    supabase.from("shipping_instant_settings").upsert(
      {
        id: true,
        origin_address: i.originAddress.trim(),
        origin_lat: i.originLat,
        origin_lng: i.originLng,
        base_fee: Math.round(i.baseFee),
        base_km: i.baseKm,
        per_km_fee: Math.round(i.perKmFee),
        max_km: i.maxKm,
        cutoff_time: i.cutoff,
        updated_at: now,
      },
      { onConflict: "id" },
    ),
    rates.length ? supabase.from("shipping_rates").upsert(rates.map((r) => ({ ...r, updated_at: now })), { onConflict: "city" }) : null,
    removed.length ? supabase.from("shipping_rates").delete().in("city", removed) : null,
  ]);
  const failed = results.find((r) => r?.error);
  if (failed?.error) return fail(`Gagal menyimpan: ${failed.error.message}`);

  await audit(auth.userId, "mengubah pengaturan shop & pengiriman", "settings", "shop");
  refreshPaths("/admin/settings", "/akun/checkout");
  return done("Pengaturan shop tersimpan — berlaku untuk checkout berikutnya.");
}
