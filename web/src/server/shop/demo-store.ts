import "server-only";
import type { ShippingRate } from "@/lib/checkout";
import type { MyOrder } from "./types";

/**
 * Mode demo (tanpa Supabase): pesanan & file bukti disimpan di memori proses `next dev` supaya alur
 * checkout → bayar → verifikasi bisa dicoba lokal. Hilang saat server restart; tidak dipakai di production.
 */

export type DemoShopOrder = Omit<MyOrder, "stage"> & { status: string; payment: string; memberId: string };

type Store = { orders: Map<string, DemoShopOrder>; files: Map<string, { mime: string; data: Buffer }>; seq: number };

const g = globalThis as typeof globalThis & { __soslayDemoShop?: Store };
const store: Store = (g.__soslayDemoShop ??= { orders: new Map(), files: new Map(), seq: 2310 });

export const demoOrders = (): Map<string, DemoShopOrder> => store.orders;
export const demoProofFiles = (): Store["files"] => store.files;
export const nextDemoCode = (): string => `SOS-${++store.seq}`;

/** Sama dengan isi shipping_rates setelah migrasi 20261113010000 (nama resmi Kemendagri). */
export const DEMO_RATES: ShippingRate[] = [
  ["Kota Jakarta Selatan", "DKI Jakarta", 18000],
  ["Kota Jakarta Pusat", "DKI Jakarta", 18000],
  ["Kota Jakarta Barat", "DKI Jakarta", 18000],
  ["Kota Jakarta Timur", "DKI Jakarta", 18000],
  ["Kota Jakarta Utara", "DKI Jakarta", 18000],
  ["Kota Tangerang", "Banten", 20000],
  ["Kota Bekasi", "Jawa Barat", 20000],
  ["Kota Depok", "Jawa Barat", 20000],
  ["Kota Bogor", "Jawa Barat", 21000],
  ["Kota Bandung", "Jawa Barat", 22000],
  ["Kota Denpasar", "Bali", 27000],
].map(([city, province, perKg]) => ({ city: city as string, province: province as string, perKg: perKg as number, eta: "2–3" }));
