import { firstName } from "@/lib/text";

/**
 * Undangan daftar member lewat WhatsApp tanpa API: link wa.me ke nomor peserta dengan pesan
 * yang sudah terisi. Admin membuka link, WhatsApp terbuka, lalu menekan kirim sendiri.
 */

/** URL website publik untuk link daftar di pesan (bukan localhost saat admin dibuka lokal). */
export const PUBLIC_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://soslay-web.vercel.app").replace(/\/+$/, "");

/**
 * Nomor dalam format pembanding (profiles.phone): hanya angka, tanpa 62 / 0 di depan
 * ("+62 0812-3456-7890" → "81234567890"). Satu aturan untuk semua form & impor Kuyy.
 */
export const localPhone = (raw: string) => raw.replace(/\D/g, "").replace(/^62/, "").replace(/^0/, "");

/** Nomor tersimpan (format localPhone) → nomor internasional untuk wa.me, atau null kalau terlalu pendek. */
export function waNumber(phone: string): string | null {
  const local = localPhone(phone);
  return local.length >= 9 ? `62${local}` : null;
}

/** Nomor tersimpan → tampilan "+62 812 3456 7890". */
export function displayPhone(phone: string): string {
  const local = localPhone(phone);
  return local && `+62 ${local.replace(/(\d{3})(\d{4})(\d+)/, "$1 $2 $3")}`;
}

/**
 * Cek format nomor WhatsApp Indonesia: boleh diawali 0 / 62 / +62, berisi angka (spasi, "-", ".", "()"
 * diizinkan), dan nomor lokalnya 8xx dengan 9–12 digit. null = valid (atau kosong).
 */
export function phoneFormatError(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/[^\d\s()+.-]/.test(value) || !/^8\d{8,11}$/.test(localPhone(value))) return "Format nomor WhatsApp tidak valid — contoh: 0812 3456 7890.";
  return null;
}

/** Nomor yang sama walau beda format (0812… / +62 812… / 812…). */
export const samePhone = (a: string | null | undefined, b: string | null | undefined) => localPhone(a ?? "") === localPhone(b ?? "");

/** Seperti phoneFormatError, tapi nomor yang tidak diubah (sama dengan `stored`) selalu lolos — data lama tetap bisa disimpan. */
export const changedPhoneError = (raw: string, stored: string | null | undefined) => (localPhone(raw) === localPhone(stored ?? "") ? null : phoneFormatError(raw));

const greetName = (name: string) => firstName(name) || "kak";

/** Link wa.me ke nomor tersimpan dengan pesan terisi, atau null kalau nomornya tidak valid. */
export function waLink(phone: string, text: string): string | null {
  const number = waNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}

export function memberInviteMessage(name: string, sessionTitle: string): string {
  return [
    `Halo ${greetName(name)}! 👋 Terima kasih sudah ikut ${sessionTitle} bareng Social Slay Tennis Club.`,
    "",
    "Yuk daftar jadi member Soslay (gratis) supaya riwayat main & Slay Point kamu tercatat — poinnya bisa ditukar merch & diskon booking:",
    `${PUBLIC_SITE_URL}/daftar`,
    "",
    "Sampai ketemu lagi di court! 🎾",
  ].join("\n");
}

/** Undangan daftar member lewat WhatsApp (tanpa konteks sesi) — dipakai saat email undangan admin gagal. */
export function signupWaLink(person: { name: string; phone: string }): string | null {
  return waLink(
    person.phone,
    [
      `Halo ${greetName(person.name)}! 👋 Yuk daftar jadi member Social Slay Tennis Club (gratis) supaya riwayat main & Slay Point kamu tercatat:`,
      `${PUBLIC_SITE_URL}/daftar`,
      "",
      "Pakai email / nomor WhatsApp ini supaya datamu langsung tersambung. Sampai ketemu di court! 🎾",
    ].join("\n"),
  );
}

/** Link wa.me berisi undangan daftar member, atau null kalau nomornya tidak valid. */
export function memberInviteWaLink(person: { name: string; phone: string }, sessionTitle: string): string | null {
  return waLink(person.phone, memberInviteMessage(person.name, sessionTitle));
}

/**
 * Pengingat bayar order Shop (admin → customer, ikon chat di panel order): template diminta 19 Nov 2026.
 * Semua isian dari data order; `total` dikirim apa adanya supaya 3 digit kode unik ikut.
 */
export function orderPaymentReminderMessage(o: {
  name: string;
  code: string;
  products: string[];
  /** "J&T Express — Reguler · Rp18.000" / "Free Pickup di Mabar Session · Min, 23 Nov 2026 07.00 · Rana Grounds". */
  shipping: string;
  total: string;
  bank: { short: string; accountNo: string; accountName: string };
  deadline: string | null;
}): string {
  return [
    `Halo Kak ${firstName(o.name) || o.name}! 👋`,
    "",
    "Terima kasih sudah order di Soslay 💚 Pesanan Kakak sedang menunggu pembayaran:",
    "",
    `🧾 *Order #${o.code}*`,
    ...o.products.map((p) => `🛍️ ${p}`),
    `🚚 ${o.shipping}`,
    "",
    `💰 *Total transfer: ${o.total}*`,
    "_(mohon transfer persis sampai 3 digit terakhir ya Kak)_",
    "",
    "Transfer ke:",
    `🏦 ${o.bank.short} — ${o.bank.accountNo}`,
    `a.n. ${o.bank.accountName}`,
    "",
    "Setelah transfer, jangan lupa *upload bukti transfer* di sini ya Kak:",
    `👉 ${PUBLIC_SITE_URL}/akun/pesanan/${encodeURIComponent(o.code)}`,
    ...(o.deadline ? ["", `Pesanan otomatis batal kalau belum dibayar sampai *${o.deadline} WIB*.`] : []),
    "",
    "Ada pertanyaan? Langsung balas chat ini aja 🙌",
  ].join("\n");
}

const greetKak = (name: string) => `Halo Kak ${firstName(name) || name}!`;

/** "A", "A & B", "A, B & C" — nama produk dalam satu kalimat. */
const joinNames = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`);

/** Order lunas, sedang disiapkan (status Diproses / Perlu dikirim). */
export function orderProcessingMessage(o: { name: string; code: string; products: string[]; total: string; courier: string }): string {
  return [
    `${greetKak(o.name)} 👋`,
    "",
    `Pembayaran untuk pesanan *#${o.code}* sudah kami terima, terima kasih ya Kak 💚`,
    "",
    ...o.products.map((p) => `🛍️ ${p}`),
    `💰 Total: ${o.total}`,
    "",
    "📦 Status: *Sedang diproses*",
    `Pesanan Kakak sedang kami siapkan dan packing dengan rapi. Nomor resi akan kami kirimkan begitu paket diserahkan ke kurir ${o.courier}.`,
    "",
    "Kalau ada pertanyaan, langsung balas chat ini aja ya Kak 🙌",
  ].join("\n");
}

/** Paket sudah diserahkan ke kurir (status Dikirim). Baris resi / link / estimasi dilewati bila datanya kosong. */
export function orderShippedMessage(o: {
  name: string;
  code: string;
  products: string[];
  courier: string;
  tracking: string | null;
  /** Label baris nomor: "No. resi" (J&T) / "Driver / no. booking" (Instant). */
  trackingLabel: string;
  trackingUrl: string | null;
  eta: string | null;
}): string {
  return [
    `${greetKak(o.name)} 🚚`,
    "",
    `Kabar baik, pesanan *#${o.code}* sudah *dikirim* ya Kak!`,
    "",
    ...o.products.map((p) => `🛍️ ${p}`),
    `🚚 Kurir: ${o.courier}`,
    ...(o.tracking ? [`🔢 ${o.trackingLabel}: *${o.tracking}*`] : []),
    ...(o.trackingUrl ? ["", "Cek posisi paket di sini:", `👉 ${o.trackingUrl}`] : []),
    "",
    `${o.eta ? `Estimasi tiba: ${o.eta}. ` : ""}Kalau paket belum sampai${o.eta ? " sesuai estimasi" : ""} atau ada kendala di pengiriman, kabari kami ya Kak 🙏`,
  ].join("\n");
}

/** Pesanan selesai. */
export function orderCompletedMessage(o: { name: string; code: string; productNames: string[] }): string {
  return [
    `${greetKak(o.name)} 🎉`,
    "",
    `Pesanan *#${o.code}* sudah sampai dan kami tandai *selesai*. Semoga suka dengan ${joinNames(o.productNames)} ya Kak 💚`,
    "",
    "Kalau ada yang kurang sesuai (ukuran, warna, atau kondisi barang), kabari kami maksimal 1x24 Jam setelah paket diterima, sertakan foto/video unboxing ya Kak.",
    "",
    "Kami juga senang banget kalau Kakak mau share foto pakai outfit-nya di instagram dan tag @socialslayclub & @slayclub.wear 📸 See you on court kak! 🎾",
  ].join("\n");
}
