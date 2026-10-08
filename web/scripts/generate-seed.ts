/**
 * Membuat supabase/seed.sql dari data demo admin (member, sesi, booking, order, konten) supaya
 * database Supabase langsung berisi data yang sama dengan mode demo.
 *
 *   npm run db:seed:generate
 *
 * Isi seed = DATA CONTOH. Email member/staf memakai domain .test (tidak bisa menerima email)
 * dan akun tidak punya password, jadi tidak ada yang bisa login dengan akun contoh.
 */
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { productDetails, products } from "@/content/products";
import { venueList } from "@/content/venues";
import { listVenues } from "@/server/admin/catalog-repo";
import { listAlbums, listCommunityPosts, listHomepageSections } from "@/server/admin/content-repo";
import { activityTypeLabels, bookings, memberCode, members, memberStats, orders, sessionById, sessions } from "@/server/admin/demo-data";
import { getOrder } from "@/server/admin/orders-repo";
import { getSession } from "@/server/admin/sessions-repo";
import { listRoles, listStaff } from "@/server/admin/settings-repo";

// ── Util SQL ────────────────────────────────────────────────────────────────
/** UUID deterministik dari id demo → seed bisa dibuat ulang dengan hasil sama. */
const uuid = (key: string) => {
  const h = createHash("md5").update(`soslay:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

type Value = string | number | boolean | null | undefined | Date | { json: unknown } | { array: (string | number)[]; type: string };
const lit = (v: Value): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "object" && "json" in v) return `${lit(JSON.stringify(v.json))}::jsonb`;
  if (typeof v === "object" && "array" in v) return v.array.length ? `array[${v.array.map((x) => lit(x)).join(", ")}]::${v.type}[]` : `'{}'::${v.type}[]`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

const out: string[] = [];
function insert(table: string, columns: string[], rows: Value[][], suffix = "") {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400).map((r) => `  (${r.map(lit).join(", ")})`);
    out.push(`insert into ${table} (${columns.join(", ")}) values\n${chunk.join(",\n")}${suffix};\n`);
  }
}
/** Email contoh unik per member (nama demo bisa kembar). */
const demoEmail = (email: string, i: number) => `${email.split("@")[0].replace(/[^a-z0-9.]/gi, "")}.${i + 1}@demo.soslay.test`;

// ── Mapping nilai demo → enum database ──────────────────────────────────────
const FREQUENCY: Record<string, string> = { "First time / Rarely": "rarely", "1–2x/month": "monthly", "1x/week": "weekly", "2–3x/week": "twice_weekly", "4x+/week": "often" };
const FORMAT: Record<string, string> = { Singles: "singles", Doubles: "doubles", Both: "both" };
const HAND: Record<string, string> = { Right: "right", Left: "left" };
const CREW_ROLE: Record<string, string> = { Host: "host", Coach: "coach", Fotografer: "photographer" };

async function main() {
  out.push(`-- AUTO-GENERATED oleh scripts/generate-seed.ts — jangan diedit manual.
-- Data contoh untuk Soslay (member, sesi, booking, order, konten). Jalankan SETELAH semua
-- file di supabase/migrations. Aman dijalankan sekali di database kosong.
begin;
`);

  // ── Auth users (tanpa password → tidak bisa login) ─────────────────────────
  const staff = await listStaff();
  const authUsers = [
    ...members.map((m, i) => ({ id: uuid(`member:${m.id}`), email: demoEmail(m.email, i), at: m.joinedAt })),
    ...staff.map((s) => ({ id: uuid(`staff:${s.id}`), email: s.email.replace(/@.*/, "@demo.soslay.test"), at: new Date("2024-06-01T00:00:00Z") })),
  ];
  insert(
    "auth.users",
    ["id", "instance_id", "aud", "role", "email", "email_confirmed_at", "raw_app_meta_data", "raw_user_meta_data", "created_at", "updated_at"],
    authUsers.map((u) => [u.id, "00000000-0000-0000-0000-000000000000", "authenticated", "authenticated", u.email, u.at, { json: { provider: "email", providers: ["email"] } }, { json: { demo: true } }, u.at, u.at]),
  );

  // ── Staf ───────────────────────────────────────────────────────────────────
  const roles = await listRoles();
  out.push(`-- Staf contoh: role_id diambil dari tabel roles (seed di migration).\n`);
  for (const s of staff) {
    out.push(
      `insert into staff_members (user_id, role_id, full_name, email, status, last_active_at) select ${lit(uuid(`staff:${s.id}`))}, id, ${lit(s.name)}, ${lit(s.email.replace(/@.*/, "@demo.soslay.test"))}, ${lit(s.status)}, ${lit(s.lastActiveAt)} from roles where name = ${lit(s.role)};\n`,
    );
  }
  if (roles.length === 0) throw new Error("roles kosong");
  const staffIdByName = new Map(staff.map((s) => [s.name, uuid(`staff:${s.id}`)]));

  // ── Member ─────────────────────────────────────────────────────────────────
  insert(
    "profiles",
    ["id", "member_code", "full_name", "email", "phone", "city", "birth_date", "gender", "kuy_id", "instagram", "status", "tennis_level", "play_frequency", "play_format", "dominant_hand", "playing_since", "looking_for", "event_types", "joined_at", "created_at"],
    members.map((m, i) => [
      uuid(`member:${m.id}`),
      memberCode(m),
      m.fullName,
      demoEmail(m.email, i),
      m.phone,
      m.city,
      m.birthDate,
      m.gender,
      `${m.kuyId}-${m.seq}`,
      m.instagram,
      m.suspended ? "suspended" : "active",
      m.level,
      FREQUENCY[m.playFrequency] ?? null,
      FORMAT[m.playFormat] ?? null,
      HAND[m.hand] ?? null,
      m.playingSince,
      { array: m.lookingFor, type: "text" },
      { array: m.eventTypes, type: "text" },
      m.joinedAt,
      m.joinedAt,
    ]),
  );
  out.push(`select setval('member_number_seq', ${members.length});\n`);

  // ── Venue ──────────────────────────────────────────────────────────────────
  const adminVenues = await listVenues();
  const sessionVenueNames = [...new Set(sessions.map((s) => s.venueName))];
  const extraVenues = sessionVenueNames.filter((n) => !venueList.some((v) => v.name === n));
  const venueId = (name: string) => uuid(`venue:${name}`);
  insert(
    "venues",
    ["id", "slug", "name", "city", "venue_type", "tagline", "description", "cover_path", "courts", "is_active", "show_on_homepage", "sort_order"],
    [
      ...venueList.map((v, i) => {
        const courts = adminVenues.find((a) => a.slug === v.slug)?.courts ?? 2;
        return [venueId(v.name), v.slug, v.name, v.city, v.type, v.tagline, v.description, v.image, { array: Array.from({ length: courts }, (_, c) => `Court ${c + 1}`), type: "text" }, true, true, i] as Value[];
      }),
      ...extraVenues.map((name, i) => [venueId(name), name.toLowerCase().replace(/[^a-z]+/g, "-"), name, "Bali", "Outdoor", null, null, "/images/activity/featured-altitude.webp", { array: ["Court 1"], type: "text" }, true, false, 100 + i] as Value[]),
    ],
  );

  // ── Sesi + crew + booking ──────────────────────────────────────────────────
  insert(
    "sessions",
    ["id", "slug", "title", "type_slug", "description", "venue_id", "court_label", "starts_at", "ends_at", "price", "capacity", "points_per_attendance", "recommended_levels", "waitlist_enabled", "members_only", "status", "visibility", "publish_at", "show_on_homepage"],
    sessions.map((s) => [
      uuid(`session:${s.id}`),
      `${s.id}-${s.typeSlug}`,
      s.title,
      s.typeSlug,
      s.description,
      venueId(s.venueName),
      s.court,
      s.startsAt,
      s.endsAt,
      s.price,
      s.capacity,
      s.pointsPerAttendance,
      { array: s.recommendedLevels, type: "tennis_level" },
      s.waitlistEnabled,
      s.membersOnly,
      s.status,
      s.visibility,
      s.publishAt,
      s.showOnHomepage,
    ]),
  );
  if (!Object.keys(activityTypeLabels).length) throw new Error("activity types kosong");

  // Crew hanya untuk sesi mendatang (yang tampil di editor).
  const crewRows: Value[][] = [];
  for (const s of sessions.filter((x) => x.status === "published")) {
    const detail = await getSession(s.id);
    for (const c of detail?.crew ?? []) {
      const staffId = staffIdByName.get(c.name);
      if (staffId) crewRows.push([uuid(`session:${s.id}`), staffId, CREW_ROLE[c.role]]);
    }
  }
  insert("session_crew", ["session_id", "staff_id", "role"], crewRows, " on conflict do nothing");

  const bookingId = (b: (typeof bookings)[number]) => uuid(`booking:${b.sessionId}:${b.memberId}`);
  insert(
    "bookings",
    ["id", "session_id", "member_id", "status", "payment_status", "source", "amount", "checked_in_at", "created_at"],
    bookings.map((b, i) => {
      const s = sessionById.get(b.sessionId)!;
      return [bookingId(b), uuid(`session:${b.sessionId}`), uuid(`member:${b.memberId}`), b.status, b.payment, i % 5 === 1 ? "kuy" : i % 7 === 3 ? "admin" : "website", b.payment === "paid" ? s.price : 0, b.status === "attended" ? s.startsAt : null, b.createdAt];
    }),
  );

  // ── Produk ─────────────────────────────────────────────────────────────────
  insert(
    "products",
    ["id", "slug", "sku", "name", "category", "price", "compare_at_price", "description", "details", "material", "status", "is_featured", "show_size_guide", "sort_order"],
    products.map((p, i) => {
      const d = productDetails[p.slug];
      return [uuid(`product:${p.slug}`), p.slug, p.sku, p.name, p.category, p.price, p.compareAtPrice ?? null, d?.description ?? null, { array: d?.details ?? [], type: "text" }, d?.material ?? null, "active", Boolean(p.featured), Boolean(d?.sizeGuide), i];
    }),
  );
  insert(
    "product_images",
    ["product_id", "path", "alt", "position", "sort_order"],
    products.flatMap((p) => {
      const gallery = productDetails[p.slug]?.gallery ?? [{ src: p.image, alt: p.name, position: p.imagePosition }];
      return gallery.map((g, i) => [uuid(`product:${p.slug}`), g.src, g.alt, g.position ?? null, i] as Value[]);
    }),
  );
  // Satu varian per ukuran/grip; stok produk dibagi rata.
  insert(
    "product_variants",
    ["id", "product_id", "sku", "options", "stock"],
    products.flatMap((p) => {
      const groups = productDetails[p.slug]?.options ?? [];
      const group = groups.find((g) => g.key === "size") ?? groups.find((g) => !g.values.some((v) => v.hex));
      const values = group?.values ?? [{ value: "default", label: "Default" }];
      return values.map((v, i) => {
        const stock = Math.floor(p.stock / values.length) + (i < p.stock % values.length ? 1 : 0);
        return [uuid(`variant:${p.slug}:${v.value}`), uuid(`product:${p.slug}`), `${p.sku}-${v.value.toUpperCase()}`, { json: group ? { [group.key]: v.value } : {} }, stock] as Value[];
      });
    }),
  );

  // ── Order ──────────────────────────────────────────────────────────────────
  const orderRows: Value[][] = [];
  const itemRows: Value[][] = [];
  let maxCode = 0;
  for (const o of orders) {
    const d = (await getOrder(o.code))!;
    const member = members.find((m) => m.id === o.memberId)!;
    maxCode = Math.max(maxCode, Number(o.code.replace(/\D/g, "")));
    const placed = o.placedAt;
    const paid = o.payment === "paid" ? placed : null;
    orderRows.push([
      uuid(`order:${o.code}`),
      o.code,
      uuid(`member:${o.memberId}`),
      o.status,
      o.payment,
      d.paymentMethod,
      d.channel.toLowerCase(),
      d.subtotal,
      d.shippingCost,
      d.pointsDiscount,
      d.pointsDiscount,
      d.grandTotal,
      member.fullName,
      member.phone,
      d.address,
      d.courier,
      d.trackingNumber,
      placed,
      paid,
      o.status === "shipped" || o.status === "completed" ? new Date(placed.getTime() + 86_400_000) : null,
      o.status === "completed" ? new Date(placed.getTime() + 4 * 86_400_000) : null,
      o.status === "cancelled" ? new Date(placed.getTime() + 3_600_000) : null,
    ]);
    for (const item of o.items) itemRows.push([uuid(`order:${o.code}`), item.name, { json: { label: item.variant } }, item.price, item.quantity]);
  }
  insert(
    "orders",
    ["id", "code", "member_id", "status", "payment_status", "payment_method", "channel", "subtotal", "shipping_fee", "points_used", "discount", "total", "recipient_name", "recipient_phone", "shipping_address", "courier", "tracking_number", "placed_at", "paid_at", "shipped_at", "completed_at", "cancelled_at"],
    orderRows,
  );
  insert("order_items", ["order_id", "product_name", "options", "unit_price", "quantity"], itemRows);
  out.push(`select setval('order_number_seq', ${maxCode + 1}, false);\n`);

  // ── Slay Point (ledger) — sama dengan perhitungan memberStats() di mode demo ──
  const ledger: Value[][] = [];
  for (const b of bookings) {
    if (b.status !== "attended") continue;
    const s = sessionById.get(b.sessionId)!;
    ledger.push([uuid(`member:${b.memberId}`), s.pointsPerAttendance, "attendance", bookingId(b), null, "Hadir di sesi", s.endsAt]);
  }
  for (const o of orders) {
    const pts = Math.floor(o.total / 10_000);
    if (o.payment === "paid" && pts > 0) ledger.push([uuid(`member:${o.memberId}`), pts, "purchase", null, uuid(`order:${o.code}`), `Belanja #${o.code}`, o.placedAt]);
  }
  for (const m of members) {
    const st = memberStats(m.id);
    const redeemed = st.pointsEarned - st.pointsBalance;
    if (redeemed > 0) ledger.push([uuid(`member:${m.id}`), -redeemed, "redeem", null, null, "Tukar poin (data contoh)", new Date("2026-09-15T05:00:00Z")]);
  }
  insert("points_ledger", ["member_id", "delta", "reason", "booking_id", "order_id", "note", "created_at"], ledger);

  // ── Konten ─────────────────────────────────────────────────────────────────
  const sections = await listHomepageSections();
  insert(
    "content_sections",
    ["page", "key", "label", "draft", "published", "is_enabled", "sort_order", "published_at"],
    sections.map((s, i) => {
      const body = { title: s.title, description: s.description, cta: s.cta ?? null, image: s.image ?? null, overlay: s.overlay ?? null };
      return ["home", s.key, s.name, { json: body }, { json: body }, s.enabled, i, new Date("2026-09-24T03:24:00Z")];
    }),
  );
  const posts = (await listCommunityPosts()).filter((p) => p.kind === "testimonial");
  insert(
    "testimonials",
    ["author_name", "author_handle", "quote", "avatar_path", "is_published", "sort_order"],
    posts.map((p, i) => [p.handle.replace(/^@/, ""), p.handle.startsWith("@") ? p.handle : null, p.text, p.image ?? null, p.visible, i]),
  );
  const { albums } = await listAlbums();
  insert(
    "photo_albums",
    ["session_id", "venue_id", "title", "taken_on", "status", "published_at"],
    albums.map((a) => [uuid(`session:${a.sessionId}`), venueId(a.venueName), a.title, a.date.slice(0, 10), a.status === "published" ? "published" : "draft", a.status === "published" ? a.date : null]),
  );
  out.push(`update integrations set status = 'connected', last_sync_at = now() where key in ('kuy', 'reclub', 'payment', 'whatsapp');
update integrations set status = 'needs_reauth' where key = 'instagram';

commit;
`);

  const file = path.resolve(import.meta.dirname, "../supabase/seed.sql");
  await writeFile(file, out.join("\n"));
  console.log(`✓ supabase/seed.sql — ${members.length} member, ${sessions.length} sesi, ${bookings.length} booking, ${orders.length} order, ${ledger.length} baris poin`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
