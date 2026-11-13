/**
 * Teks halaman Checkout & Pembayaran (Figma WEB · 03 · Shop, UIF-05 / MOB-05).
 * Rekening tujuan seharusnya dari "Pengaturan Shop" (aturan §4.1, belum didesain) — sementara di sini.
 * TODO: ganti nomor rekening contoh dari desain dengan rekening BCA klub yang asli.
 */

export const shopBank = {
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

export const transferHowTo = [
  "m-BCA / KlikBCA: m-Transfer › Antar Rekening BCA",
  "ATM BCA: Transfer › Ke Rekening BCA",
  `Bank lain: transfer antarbank / BI-FAST ke BCA (kode bank ${shopBank.bankCode})`,
];

export const verificationSla = "maks 1×24 jam (Senin–Sabtu, 09.00–21.00)";
