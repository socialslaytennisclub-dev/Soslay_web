import "server-only";
import type { Transporter } from "nodemailer";
import { rp, SHIPPING_LABEL, variantLabel } from "@/lib/checkout";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { escapeHtml } from "@/lib/text";
import { displayPhone, PUBLIC_SITE_URL } from "@/lib/wa-invite";
import type { OrderRow } from "./orders";

/**
 * Email pemberitahuan ke admin saat order shop masuk (order baru / tukar poin / bukti transfer) lewat Gmail SMTP
 * — env di .env.example (GMAIL_USER, GMAIL_APP_PASSWORD, ORDER_NOTIFY_TO). Ikut saklar Admin Settings →
 * Notifikasi "Order baru (untuk admin)". Dipanggil lewat after(): tidak pernah menggagalkan checkout; gagal
 * sesaat dicoba sekali lagi, gagal lagi → log server "[order-email]".
 */

export type OrderNotice = "placed" | "proof";

export type NoticeOrder = Pick<OrderRow, "code" | "channel" | "total" | "shipping_method" | "recipient_name" | "recipient_phone" | "shipping_city" | "order_items"> & {
  member: { full_name: string | null } | null;
  /** Bukti sebelumnya yang diganti (status 'replaced') → email bukti ditandai "pengganti". */
  order_payment_proofs: { status: string }[];
};

/** Subjek & judul per jenis email. */
const COPY = {
  placed: { tag: "🛍️ Order baru", head: "Order baru", status: "menunggu pembayaran" },
  reward: { tag: "🎁 Tukar poin", head: "Order tukar Slay Point", status: "menunggu pembayaran ongkir" },
  proof: { tag: "💸 Bukti transfer", head: "Bukti transfer masuk", status: "perlu diverifikasi" },
  replaced: { tag: "💸 Bukti pengganti", head: "Bukti transfer pengganti", status: "perlu diverifikasi" },
} as const;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

let transport: Transporter | null = null;

/** Transport Gmail (nodemailer dimuat saat email pertama, bukan di setiap server action). null = env belum diisi. */
async function mailer() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) return null;
  if (!transport) {
    const { default: nodemailer } = await import("nodemailer");
    // Batas waktu pendek: SMTP yang macet tidak menahan fungsi server sampai batas durasinya.
    transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
  }
  return { transport, from: user, to: process.env.ORDER_NOTIFY_TO || user };
}

/** Isi email (subjek, teks, HTML) dari satu order — dipisah supaya bisa diuji tanpa Supabase / SMTP. */
export function buildOrderEmail(kind: OrderNotice, o: NoticeOrder) {
  const buyer = o.member?.full_name || o.recipient_name;
  const method = o.shipping_method ? SHIPPING_LABEL[o.shipping_method].short : "—";
  const items = o.order_items.map((i) => {
    const variant = variantLabel(i.product_variants?.products?.slug ?? "", i.options ?? {});
    return `${i.quantity}× ${i.product_name}${variant ? ` (${variant})` : ""} — ${rp(i.unit_price * i.quantity)}`;
  });
  const link = `${PUBLIC_SITE_URL}/admin/orders?order=${encodeURIComponent(o.code)}`;
  const variant =
    kind === "placed" ? (o.channel === "reward" ? "reward" : "placed") : o.order_payment_proofs.some((p) => p.status === "replaced") ? "replaced" : "proof";
  const { tag, head, status } = COPY[variant];
  const headline = `${head} #${o.code} — ${status}`;
  const rows: [string, string][] = [
    ["Pembeli", buyer],
    ["Penerima", `${o.recipient_name} · ${displayPhone(o.recipient_phone)}`],
    ["Pengiriman", [method, o.shipping_city].filter(Boolean).join(" · ")],
    ["Total", rp(o.total)],
  ];
  return {
    subject: `${tag} #${o.code} · ${rp(o.total)} · ${buyer}`,
    text: [headline, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", "Produk:", ...items.map((i) => `- ${i}`), "", `Buka di admin: ${link}`].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1b1a55">
<h2 style="margin:0 0 12px">${escapeHtml(headline)}</h2>
<table style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6b6a8f">${escapeHtml(k)}</td><td><b>${escapeHtml(v)}</b></td></tr>`).join("")}</table>
<p style="margin:12px 0 4px">Produk:</p><ul style="margin:0;padding-left:18px">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
<p style="margin-top:16px"><a href="${escapeHtml(link)}" style="background:#1b1a55;color:#d4f64b;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Buka di Admin Orders</a></p>
</div>`,
  };
}

export async function notifyAdminOrder(kind: OrderNotice, code: string) {
  const mail = await mailer().catch((e: unknown) => {
    console.error(`[order-email] nodemailer: ${errText(e)}`);
    return null;
  });
  if (!mail) return;
  try {
    const admin = createSupabaseAdminClient();
    if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY belum dipasang di server — detail order tidak bisa dibaca");
    const [{ data, error }, { data: setting }] = await Promise.all([
      admin
        .from("orders")
        .select(
          "code, channel, total, shipping_method, recipient_name, recipient_phone, shipping_city, member:profiles!orders_member_id_fkey(full_name), order_items(product_name, options, quantity, unit_price, product_variants(products(slug))), order_payment_proofs(status)",
        )
        .eq("code", code)
        .maybeSingle(),
      admin.from("app_settings").select("value").eq("key", "notifications").maybeSingle(),
    ]);
    // Saklar di Admin Settings → Notifikasi; belum pernah disimpan = aktif (bawaan).
    const toggles = (setting?.value ?? []) as { key: string; enabled: boolean }[];
    if (toggles.find((t) => t.key === "admin_order")?.enabled === false) return;
    if (error || !data) throw new Error(error?.message ?? `order ${code} tidak ditemukan`);

    const message = { from: `"Soslay Shop" <${mail.from}>`, to: mail.to, ...buildOrderEmail(kind, data as unknown as NoticeOrder) };
    try {
      await mail.transport.sendMail(message);
    } catch (first) {
      // Gmail kadang menolak sesaat (batas login / koneksi) → coba sekali lagi.
      console.warn(`[order-email] ${kind} #${code}: percobaan pertama gagal (${errText(first)}), coba lagi`);
      await new Promise((r) => setTimeout(r, 1000));
      await mail.transport.sendMail(message);
    }
  } catch (e) {
    console.error(`[order-email] ${kind} #${code}: ${errText(e)}`);
  }
}
