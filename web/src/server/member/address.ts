import "server-only";
import { cache } from "react";
import { cityOptions } from "@/content/member";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getShopSettings } from "@/server/shop/settings";
import type { MemberAddress } from "@/server/shop/types";
import { getMemberSession } from "./user";

/** Pilihan kota alamat: kota ongkir J&T aktif + kota profil (sama dengan form checkout). */
export const getAddressCities = cache(async (): Promise<string[]> => {
  const { rates } = await getShopSettings();
  return [...new Set([...rates.filter((r) => r.active).map((r) => r.city), ...cityOptions])];
});

/** Alamat pengiriman member yang login; null = mode demo / belum login. */
export const getMyAddress = cache(async (): Promise<MemberAddress | null> => {
  if (!isSupabaseConfigured) return null;
  const { supabase, user } = await getMemberSession();
  if (!user) return null;
  const { data: p } = await supabase
    .from("profiles")
    .select("full_name, phone, ship_recipient, ship_phone, ship_address, ship_city, ship_postal_code, ship_lat, ship_lng")
    .eq("id", user.id)
    .maybeSingle();
  if (!p) return null;
  return {
    name: p.ship_recipient ?? p.full_name ?? "",
    phone: p.ship_phone ?? (p.phone ? `0${p.phone}` : ""),
    address: p.ship_address ?? "",
    city: p.ship_city ?? "",
    postalCode: p.ship_postal_code ?? "",
    pin: p.ship_lat !== null && p.ship_lng !== null ? { lat: p.ship_lat, lng: p.ship_lng } : null,
  };
});
