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

/** Seperti phoneFormatError, tapi nomor yang tidak diubah (sama dengan `stored`) selalu lolos — data lama tetap bisa disimpan. */
export const changedPhoneError = (raw: string, stored: string | null | undefined) => (localPhone(raw) === localPhone(stored ?? "") ? null : phoneFormatError(raw));

const greetName = (name: string) => firstName(name) || "kak";

/** Link wa.me ke nomor tersimpan dengan pesan terisi, atau null kalau nomornya tidak valid. */
function waLink(phone: string, text: string): string | null {
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
