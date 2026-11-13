import type { InstantSettings, OrderStage, ShippingMethod, ShippingRate } from "@/lib/checkout";

/** Tipe bersama checkout & halaman pesanan member (dipakai server dan komponen klien). */

export type PickupSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  venue: string;
  /** Member terdaftar di sesi ini → chip "Kamu terdaftar", diurutkan teratas. */
  registered: boolean;
  /** Batas pembayaran terverifikasi: H-1 sesi 21.00 WIB. */
  deadline: string;
};

export type Recipient = { name: string; phone: string; address: string; city: string; postalCode: string };

export type CheckoutContext = {
  /** Mode demo (tanpa Supabase): pesanan disimpan di memori server dev. */
  demo: boolean;
  loggedIn: boolean;
  recipient: Recipient;
  /** Titik peta tersimpan di profil (untuk Instant). */
  pin: { lat: number; lng: number } | null;
  /** Singkatan bank tujuan transfer (Settings › Shop), mis. "BCA". */
  bankShort: string;
  rates: ShippingRate[];
  instant: InstantSettings;
  pickupSessions: PickupSession[];
  /** Berat per produk (gram) — pratinjau ongkir J&T. */
  weights: Record<string, number>;
};

export type CheckoutLine = { slug: string; options: Record<string, string>; quantity: number };

export type ShipInput = {
  method: ShippingMethod;
  name: string;
  phone: string;
  address?: string;
  city?: string;
  postalCode?: string;
  lat?: number;
  lng?: number;
  sessionId?: string;
};

export type ProofView = {
  id: string;
  status: "pending" | "approved" | "rejected" | "replaced";
  fileName: string;
  mime: string;
  size: number;
  senderName: string;
  senderBank: string;
  amount: number;
  transferDate: string;
  note: string | null;
  uploadedAt: string;
  rejectReason: string | null;
  rejectMessage: string | null;
  reviewedAt: string | null;
};

export type MyOrderItem = { name: string; variant: string; image: string; price: number; quantity: number };

export type MyOrder = {
  code: string;
  placedAt: string;
  stage: OrderStage;
  method: ShippingMethod;
  items: MyOrderItem[];
  subtotal: number;
  shippingFee: number;
  uniqueCode: number;
  total: number;
  payDeadline: string | null;
  recipient: Recipient;
  distanceKm: number | null;
  /** Titik lokasi Instant. */
  pin: { lat: number; lng: number } | null;
  weightGrams: number | null;
  courier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  /** late = batas H-1 21.00 sudah lewat (member diminta pilih sesi lain bila belum lunas). */
  pickup: (Omit<PickupSession, "registered"> & { late: boolean }) | null;
  proofs: ProofView[];
  rejections: number;
  pointsAwarded: number;
  paidAt: string | null;
  shippedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
};

export type MyOrderListItem = Pick<MyOrder, "code" | "placedAt" | "stage" | "method" | "total" | "payDeadline"> & { summary: string; image: string };

export type ShopResult<T = undefined> = ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

/** Alamat pengiriman tersimpan di profil member (kolom ship_* di profiles). */
export type MemberAddress = Recipient & { pin: { lat: number; lng: number } | null };
