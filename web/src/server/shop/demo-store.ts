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

/** Sama dengan isi awal shipping_rates di migrasi. */
export const DEMO_RATES: ShippingRate[] = [
  ["Jakarta Selatan", "DKI Jakarta", 18000],
  ["Jakarta Pusat", "DKI Jakarta", 18000],
  ["Jakarta Barat", "DKI Jakarta", 18000],
  ["Jakarta Timur", "DKI Jakarta", 18000],
  ["Jakarta Utara", "DKI Jakarta", 18000],
  ["Tangerang", "Banten", 20000],
  ["Bekasi", "Jawa Barat", 20000],
  ["Depok", "Jawa Barat", 20000],
  ["Bogor", "Jawa Barat", 21000],
  ["Bandung", "Jawa Barat", 22000],
  ["Bali", "Bali", 27000],
].map(([city, province, perKg]) => ({ city: city as string, province: province as string, perKg: perKg as number, eta: "2–3" }));
