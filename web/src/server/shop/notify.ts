import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { rp, SHIPPING_LABEL, variantLabel, type ShippingMethod } from "@/lib/checkout";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PUBLIC_SITE_URL } from "@/lib/wa-invite";

/**
 * Email pemberitahuan ke admin Soslay saat ada order shop masuk (order baru dibuat / bukti transfer diupload).
 * Dikirim lewat Gmail (SMTP) dengan App Password — env server:
 *   GMAIL_USER          akun pengirim, mis. akun Gmail Soslay
 *   GMAIL_APP_PASSWORD  App Password 16 huruf dari Google Account (bukan password biasa)
 *   ORDER_NOTIFY_TO     penerima (opsional, pisahkan koma); default = GMAIL_USER
 * Tanpa env → tidak mengirim apa pun. Dipanggil lewat after(): gagal kirim tidak pernah menggagalkan checkout;
 * gagal sesaat dicoba sekali lagi, gagal lagi → tercatat di log server ("[order-email]").
 */

export type OrderNotice = "placed" | "proof";

export type NoticeOrder = {
  code: string;
  /** 'reward' = order ongkir dari tukar Slay Point. */
  channel: string;
  total: number;
  shipping_method: ShippingMethod | null;
  recipient_name: string;
  recipient_phone: string;
  shipping_city: string | null;
  member: { full_name: string | null } | null;
  order_items: { product_name: string; options: Record<string, string> | null; quantity: number; unit_price: number; product_variants: { products: { slug: string } | null } | null }[];
  /** Bukti sebelumnya yang diganti (status 'replaced') → email bukti ditandai "pengganti". */
  order_payment_proofs: { status: string }[];
};

let transport: Transporter | null = null;

function mailer() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) return null;
  // Batas waktu pendek: SMTP yang macet tidak menahan fungsi server sampai batas durasinya.
  transport ??= nodemailer.createTransport({ service: "gmail", auth: { user, pass }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
  return { transport, from: user, to: process.env.ORDER_NOTIFY_TO || user };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Isi email (subjek, teks, HTML) dari satu order — dipisah supaya bisa diuji tanpa Supabase / SMTP. */
export function buildOrderEmail(kind: OrderNotice, o: NoticeOrder) {
  const buyer = o.member?.full_name || o.recipient_name;
  const method = o.shipping_method ? SHIPPING_LABEL[o.shipping_method].short : "—";
  const items = o.order_items.map((i) => {
    const variant = variantLabel(i.product_variants?.products?.slug ?? "", i.options ?? {});
    return `${i.quantity}× ${i.product_name}${variant ? ` (${variant})` : ""} — ${rp(i.unit_price * i.quantity)}`;
  });
  const link = `${PUBLIC_SITE_URL}/admin/orders?order=${encodeURIComponent(o.code)}`;
  const reward = o.channel === "reward";
  const replaced = o.order_payment_proofs.some((p) => p.status === "replaced");
  const headline =
    kind === "placed"
      ? `${reward ? "Order tukar Slay Point" : "Order baru"} #${o.code} — menunggu pembayaran${reward ? " ongkir" : ""}`
      : `${replaced ? "Bukti transfer pengganti" : "Bukti transfer masuk"} #${o.code} — perlu diverifikasi`;
  const rows: [string, string][] = [
    ["Pembeli", buyer],
    ["Penerima", `${o.recipient_name} · ${o.recipient_phone}`],
    ["Pengiriman", [method, o.shipping_city].filter(Boolean).join(" · ")],
    ["Total", rp(o.total)],
  ];
  return {
    subject: `${kind === "placed" ? (reward ? "🎁 Tukar poin" : "🛍️ Order baru") : replaced ? "💸 Bukti pengganti" : "💸 Bukti transfer"} #${o.code} · ${rp(o.total)} · ${buyer}`,
    text: [headline, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", "Produk:", ...items.map((i) => `- ${i}`), "", `Buka di admin: ${link}`].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1b1a55">
<h2 style="margin:0 0 12px">${esc(headline)}</h2>
<table style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6b6a8f">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join("")}</table>
<p style="margin:12px 0 4px">Produk:</p><ul style="margin:0;padding-left:18px">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
<p style="margin-top:16px"><a href="${esc(link)}" style="background:#1b1a55;color:#d4f64b;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Buka di Admin Orders</a></p>
</div>`,
  };
}

export async function notifyAdminOrder(kind: OrderNotice, code: string) {
  const mail = mailer();
  if (!mail) return;
  try {
    const admin = createSupabaseAdminClient();
    if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY belum dipasang di server — detail order tidak bisa dibaca");
    const { data, error } = await admin
      .from("orders")
      .select(
        "code, channel, total, shipping_method, recipient_name, recipient_phone, shipping_city, member:profiles!orders_member_id_fkey(full_name), order_items(product_name, options, quantity, unit_price, product_variants(products(slug))), order_payment_proofs(status)",
      )
      .eq("code", code)
      .maybeSingle();
    if (error || !data) throw new Error(error?.message ?? `order ${code} tidak ditemukan`);
    const message = { from: `"Soslay Shop" <${mail.from}>`, to: mail.to, ...buildOrderEmail(kind, data as unknown as NoticeOrder) };
    // Gmail kadang menolak sesaat (batas login / koneksi) → coba sekali lagi setelah 3 detik.
    await mail.transport.sendMail(message).catch(async (first: unknown) => {
      console.warn(`[order-email] ${kind} #${code}: percobaan pertama gagal (${first instanceof Error ? first.message : String(first)}), coba lagi`);
      await new Promise((r) => setTimeout(r, 3000));
      return mail.transport.sendMail(message);
    });
  } catch (e) {
    console.error(`[order-email] ${kind} #${code}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
