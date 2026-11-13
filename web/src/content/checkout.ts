/**
 * Teks halaman Checkout & Pembayaran (Figma WEB · 03 · Shop, UIF-05 / MOB-05).
 * Rekening tujuan diatur admin di Settings › Shop & pengiriman (app_settings 'shop_bank');
 * `shopBank` di bawah hanya isi awal / mode demo.
 */

export type ShopBank = { bank: string; short: string; accountNo: string; accountName: string; bankCode: string };

export const shopBank: ShopBank = {
  bank: "Bank Central Asia (BCA)",
  short: "BCA",
  accountNo: "123 456 7890",
  accountName: "Social Slay Tennis Club",
  bankCode: "014",
};

/** Bank pengirim di form bukti transfer. */
export const senderBanks = ["BCA", "Mandiri", "BRI", "BNI", "CIMB Niaga", "Permata", "BSI", "Jago", "SeaBank", "blu by BCA Digital", "Lainnya"];

export const adminWhatsApp = "https://wa.me/62642424792";

export const checkoutSteps = ["Checkout", "Bayar & upload bukti", "Verifikasi admin", "Dikirim / diambil"] as const;

/** Langkah transfer; khusus BCA ditampilkan jalur m-BCA / ATM BCA. */
export function transferHowTo(b: ShopBank): string[] {
  const bca = /\bBCA\b/i.test(`${b.short} ${b.bank}`);
  const other = `Bank lain: transfer antarbank / BI-FAST ke ${b.short}${b.bankCode ? ` (kode bank ${b.bankCode})` : ""}`;
  return bca ? ["m-BCA / KlikBCA: m-Transfer › Antar Rekening BCA", "ATM BCA: Transfer › Ke Rekening BCA", other] : [`Mobile banking / ATM ${b.short}: transfer ke rekening ${b.short}`, other];
}

export const verificationSla = "maks 1×24 jam (Senin–Sabtu, 09.00–21.00)";
