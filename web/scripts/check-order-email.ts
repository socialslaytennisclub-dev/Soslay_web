/**
 * Uji isi email pemberitahuan order ke admin (server/shop/notify · buildOrderEmail) — tanpa Supabase / SMTP.
 *
 *   npm run email:check
 *
 * Subjek per jenis (order baru, tukar poin, bukti, bukti pengganti), isi HTML di-escape, link ke Admin Orders.
 */
import { buildOrderEmail, type NoticeOrder } from "../src/server/shop/notify";

let failed = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    failed++;
    console.error(`✗ ${msg}`);
  }
};

const base: NoticeOrder = {
  code: "SOS-1234",
  channel: "web",
  total: 455000,
  shipping_method: "jnt",
  recipient_name: `Rina <img src=x onerror="alert(1)">`,
  recipient_phone: "0812 1111 2222",
  shipping_city: "Jakarta Selatan",
  member: { full_name: "Rina Maharani" },
  order_items: [{ product_name: "A Piece of Bali", options: { size: "M" }, quantity: 2, unit_price: 220000, product_variants: null }],
  order_payment_proofs: [],
};

const placed = buildOrderEmail("placed", base);
check(placed.subject === "🛍️ Order baru #SOS-1234 · Rp455.000 · Rina Maharani", `subjek order baru: ${placed.subject}`);
check(placed.text.includes("2× A Piece of Bali (M) — Rp440.000"), "baris produk");
check(placed.text.includes("/admin/orders?order=SOS-1234"), "link Admin Orders");
check(!placed.html.includes("<img") && placed.html.includes("Rina &lt;img src=x onerror=&quot;alert(1)&quot;&gt;"), "nama penerima di-escape di HTML");

const reward = buildOrderEmail("placed", { ...base, channel: "reward" });
check(reward.subject.startsWith("🎁 Tukar poin #SOS-1234") && reward.text.includes("menunggu pembayaran ongkir"), `order tukar poin: ${reward.subject}`);

const proof = buildOrderEmail("proof", base);
check(proof.subject.startsWith("💸 Bukti transfer #SOS-1234") && proof.text.includes("perlu diverifikasi"), `bukti: ${proof.subject}`);

const again = buildOrderEmail("proof", { ...base, order_payment_proofs: [{ status: "replaced" }, { status: "pending" }] });
check(again.subject.startsWith("💸 Bukti pengganti #SOS-1234") && again.text.includes("Bukti transfer pengganti"), `bukti pengganti: ${again.subject}`);

const pickup = buildOrderEmail("placed", { ...base, shipping_method: null, member: null });
check(pickup.text.includes("Pengiriman: —") && pickup.subject.endsWith(base.recipient_name), "tanpa metode kirim & tanpa member");

if (failed) process.exit(1);
console.log("✓ email order admin: subjek per jenis (order baru, tukar poin, bukti, bukti pengganti), produk, link admin, HTML di-escape");
