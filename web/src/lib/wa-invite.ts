/**
 * Undangan daftar member lewat WhatsApp tanpa API: link wa.me ke nomor peserta dengan pesan
 * yang sudah terisi. Admin membuka link, WhatsApp terbuka, lalu menekan kirim sendiri.
 */

/** URL website publik untuk link daftar di pesan (bukan localhost saat admin dibuka lokal). */
export const PUBLIC_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://soslay-web.vercel.app").replace(/\/+$/, "");

/** Nomor tanpa +62 / 0 di depan (format profiles.phone) → nomor internasional, atau null kalau terlalu pendek. */
export function waNumber(phone: string): string | null {
  const local = phone.replace(/\D/g, "").replace(/^(62|0)/, "");
  return local.length >= 9 ? `62${local}` : null;
}

export function memberInviteMessage(name: string, sessionTitle: string): string {
  const first = name.trim().split(/\s+/)[0] || "kak";
  return [
    `Halo ${first}! 👋 Terima kasih sudah ikut ${sessionTitle} bareng Social Slay Tennis Club.`,
    "",
    "Yuk daftar jadi member Soslay (gratis) supaya riwayat main & Slay Point kamu tercatat — poinnya bisa ditukar merch & diskon booking:",
    `${PUBLIC_SITE_URL}/daftar`,
    "",
    "Sampai ketemu lagi di court! 🎾",
  ].join("\n");
}

/** Link wa.me berisi undangan daftar member, atau null kalau nomornya tidak valid. */
export function memberInviteWaLink(person: { name: string; phone: string }, sessionTitle: string): string | null {
  const number = waNumber(person.phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(memberInviteMessage(person.name, sessionTitle))}` : null;
}
