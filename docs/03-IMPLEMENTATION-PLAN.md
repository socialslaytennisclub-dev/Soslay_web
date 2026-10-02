# Rencana Pembuatan — Soslay Website & Admin

> Turunan dari [02-PRD.md](02-PRD.md) dan [01-DESIGN-SYSTEM.md](01-DESIGN-SYSTEM.md). Mulai: **Senin, 5 Oktober 2026**.

---

## 1. Rekomendasi Tech Stack

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Satu codebase untuk website (SSG/ISR, SEO), member area, dan admin. |
| Styling | **Tailwind CSS v4** dengan token dari Figma (`@theme`) | Token langsung jadi utility (`bg-navy-900`, `text-lime-500`). |
| Komponen admin | **shadcn/ui** (Radix) di-theme ulang ke token Soslay | Tabel, dialog, dropdown, command palette (`⌘K`) siap pakai & aksesibel. |
| Ikon | `@phosphor-icons/react` | Sesuai sheet ikon Figma. |
| Font | `next/font/google` — Poppins (500–800), Inter (400–700) | Self-hosted, tanpa CLS. |
| Chart | Recharts (bar, ring) + komponen heatmap custom | |
| Form & validasi | React Hook Form + Zod (schema dipakai bersama client/server) | |
| Tabel | TanStack Table (sort, filter, seleksi, pagination server-side) | |
| Database | **PostgreSQL** (Supabase atau Neon) | Relasional, cocok untuk CRM/segmen/laporan. |
| ORM | Drizzle ORM (atau Prisma) + migrasi | |
| Auth | Better Auth / Auth.js — email+password, OTP WhatsApp, session, 2FA admin | |
| Storage foto | Cloudflare R2 / Supabase Storage + image CDN (Cloudflare Images / Next Image) | 1.000+ foto/bulan. |
| Background jobs | Inngest / Trigger.dev | Reminder WA, sesi berulang, promosi waitlist, sinkron Kuy, resize foto. |
| Payment | Midtrans atau Xendit | QRIS, VA, e-wallet. |
| Email | Resend + React Email | |
| WhatsApp | Meta WhatsApp Cloud API | |
| Ongkir | Biteship | JNE, SiCepat, label & tracking. |
| Hosting | Vercel (app) + Supabase/Neon (DB) | |
| Monitoring | Sentry + Vercel Analytics / PostHog | |
| Testing | Vitest (unit), Playwright (E2E), Storybook (komponen) | |

## 2. Arsitektur & Struktur Folder

```
soslay/
├─ app/
│  ├─ (public)/                 # website publik — layout: Navbar + Footer
│  │  ├─ page.tsx               # Homepage
│  │  ├─ activity/[slug]/
│  │  ├─ venue/[slug]/
│  │  ├─ shop/[slug]/
│  │  ├─ gabung/  masuk/  checkout/
│  │  └─ [page]/                # halaman CMS (kontak, info, privasi…)
│  ├─ (member)/akun/            # member area — layout: member header + tabs
│  │  ├─ page.tsx               # Dashboard
│  │  ├─ profil/  aktivitas/  order/  foto/
│  ├─ admin/                    # admin — layout: sidebar + topbar, guard RBAC
│  │  ├─ page.tsx               # Overview
│  │  ├─ members/[id]/
│  │  ├─ activities/[id]/       # editor + peserta & absensi
│  │  ├─ activities/[id]/scan/  # scanner QR (mobile)
│  │  ├─ orders/  venues/[id]/  products/[id]/
│  │  ├─ content/  gallery/[albumId]/
│  │  └─ settings/
│  └─ api/webhooks/{payment,kuy,whatsapp,shipping}/
├─ components/
│  ├─ ui/                       # primitives (Button, Badge, Input, Toggle, Chip…)
│  ├─ site/                     # komponen website (Hero, ActivityCard, VenueCard, Marquee, Lightbox…)
│  ├─ member/                   # MemberCard, PointCard, Heatmap, RingChart…
│  └─ admin/                    # Sidebar, Topbar, KpiCard, DataTable, StatusPill…
├─ lib/ (db, auth, rbac, format-id, points, payments, wa, storage)
├─ db/schema/*.ts  db/migrations/
├─ styles/tokens.css
└─ docs/
```

**Prinsip:** Server Components untuk data-fetching; Server Actions untuk mutasi admin (selalu cek RBAC di server); halaman publik ISR + revalidate saat admin publish.

## 3. Token → Kode (`styles/tokens.css`)

```css
@import "tailwindcss";

@theme {
  /* Navy / Indigo */
  --color-navy-950: #060628;  --color-navy-900: #0A084A;  --color-navy-850: #0D0D5D;
  --color-navy-800: #100E54;  --color-navy-700: #1E1E6A;
  --color-indigo-700: #221B9D; --color-indigo-600: #291FC0; --color-indigo-500: #4035DE;
  --color-indigo-muted: #3A3582; --color-indigo-200: #D6D9FF; --color-indigo-150: #E5E8FF;
  --color-indigo-100: #EBECFF; --color-indigo-border: #EAECFF; --color-indigo-50: #F4F5FF;
  --color-blue-600: #2941FF;
  /* Lime */
  --color-lime-neon: #D7FF00; --color-lime-400: #CAF100; --color-lime-500: #D4EF1F;
  --color-lime-550: #C5EB00; --color-lime-600: #C0E500; --color-lime-700: #A4C400;
  --color-lime-750: #9AB800; --color-lime-800: #8EA800; --color-lime-100: #F4FFB8; --color-lime-50: #FAFFE3;
  /* Pink */
  --color-pink-500: #EC6ABC; --color-pink-400: #EF83C7; --color-pink-100: #FCE7F4;
  /* Neutral */
  --color-neutral-100: #F3F3F3; --color-neutral-200: #E3E3E3; --color-neutral-300: #D9D9D9;
  --color-neutral-400: #CECECE; --color-neutral-500: #B7B7B7; --color-neutral-600: #7B7B7B;
  --color-neutral-700: #5F5F5F; --color-neutral-900: #252525;

  /* Type */
  --font-display: "Poppins", sans-serif;
  --font-sans: "Inter", sans-serif;
  --tracking-display: -0.03em;
  --tracking-tight-xl: -0.04em;
  --tracking-overline: 0.14em;

  /* Radius */
  --radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px;

  /* Shadow */
  --shadow-card: 0 4px 32px rgb(0 0 0 / 0.05);
}

:root {
  --gradient-indigo: linear-gradient(180deg, #4035DE, #291FC0);
  --gradient-lime: linear-gradient(180deg, #D7FF00, #C1E500);
  --gradient-navy: linear-gradient(180deg, #100E54, #0A084A);
  --overlay-photo: linear-gradient(180deg, rgb(0 0 0 / 0) 40%, rgb(0 0 0 / .5));
  --overlay-hero: linear-gradient(180deg, rgb(0 0 0 / .5), rgb(0 0 0 / 0) 35%, rgb(0 0 0 / .75));
}
body { background: var(--color-indigo-50); color: var(--color-navy-900); font-family: var(--font-sans); }
```

Plus util `lib/format-id.ts`: `formatRupiah` (`Rp220.000`), `formatRupiahShort` (`Rp48,6 jt`), `formatTanggal` (`Minggu, 20 September 2026`), `formatJam` (`07.00–11.00`) — semua `Intl` dengan `id-ID` dan timezone venue.

## 4. Model Data (inti)

```
users            id, email, phone, password_hash, role(member|staff), status, created_at
members          user_id, member_no, full_name, display_name, dob, gender, city, kuy_id, reclub_id,
                 instagram, avatar_url, tier, points_balance, joined_at, last_played_at
tennis_profiles  member_id, level, frequency, format, hand, years_playing
member_prefs     member_id, looking_for[], event_types[]
staff            user_id, name, role_id, last_active_at
roles            id, name ; role_permissions(role_id, module, access: edit|view|none)

venues           id, slug, name, city, type, address, lat, lng, courts_count, facilities[],
                 description, cover_url, is_visible, release_at, sort
venue_photos     venue_id, url, sort

activity_types   id, name (Weekly MABAR, Match Day, Coaching, Tennis Escape, Social)
activities       id, slug, title, type_id, description, cover_url, venue_id, court_label,
                 starts_at, ends_at, timezone, price, capacity, points_per_attend,
                 levels[], waitlist_enabled, members_only, kuy_url, status(draft|scheduled|published|archived),
                 visibility(public|members|link), visible_until, show_on_homepage, recurrence_id
activity_crew    activity_id, staff_id, role(host|coach|photographer)
bookings         id, activity_id, member_id, guests_count, source(website|kuy|admin),
                 status(registered|waitlist|cancelled), payment_status, payment_id, qr_token, created_at
attendances      booking_id, checked_in_at, checked_in_by, method(qr|self|manual), no_show bool

points_ledger    id, member_id, delta, reason(attend|purchase|redeem|adjust|order_discount), ref_type, ref_id, created_at
tier_rules       tier, min_points

products         id, slug, name, sku, category, description, details, material, price, compare_price,
                 is_visible, is_featured, size_guide_id
product_variants id, product_id, sku, type, color, size, stock
product_images   product_id, url, sort
carts / cart_items
orders           id, code(#SOS-2309), member_id, channel, subtotal, shipping_fee, points_used, total,
                 payment_status, payment_method, fulfillment_status, courier, service, tracking_no,
                 address_json, created_at
order_items      order_id, variant_id, qty, price

albums           id, activity_id, title, date, status
photos           id, album_id, url, width, height, caption, photographer_id
photo_tags       photo_id, member_id

home_sections    id, key, sort, enabled, content_json, updated_by
testimonials     id, handle, text, image_url, source(ig|threads), sort, enabled
pages            slug, title, body_json, status

segments         id, name, filter_json   (jumlah dihitung live)
member_notes     member_id, author_id, body, created_at
member_events    member_id, type, payload_json, created_at   (timeline CRM)
messages         id, channel(wa|email), template, segment_id, recipients_count, status
audit_logs       actor_id, action, entity, entity_id, diff_json, created_at
integrations     key, status, credentials_enc, last_sync_at
```

## 5. Fase & Timeline (± 16 minggu)

| Fase | Minggu | Tanggal | Output |
|---|---|---|---|
| **0. Discovery & desain gap** | 1 | 5–9 Okt | Jawaban §10 PRD; desain mobile (minimal homepage, activity, product, checkout, dashboard, scan QR); desain halaman yang hilang (login, checkout, editor venue/produk); fix inkonsistensi Figma. |
| **1. Fondasi** | 2–3 | 12–23 Okt | Repo, CI/CD, env staging; token & font; primitives UI (Button varian, Badge/StatusPill, Input, Chip, Toggle, Card, Tabs, Avatar, Progress); Storybook; skema DB + seed data dari Figma; auth (member & staff) + RBAC; layout publik, member, admin. |
| **2. Website publik (R1)** | 4–6 | 26 Okt–13 Nov | Homepage (semua section, marquee, carousel), Activity list + detail, Venue list + detail + galeri + lightbox, Shop list + product detail (tanpa checkout), Register/Login/Reset, halaman statis, SEO, responsif. |
| **3. Admin CMS (R1)** | 6–8 | 9–27 Nov | Admin shell (sidebar, topbar, `⌘K`), Activities (list, editor, berulang, publikasi), Venues (+ editor), Konten & Galeri (section homepage drag & drop, editor Hero, album + bulk upload), Members list/detail dasar, Settings: tim, role & izin, audit log. |
| **🚀 R1 Launch** | 9 | **2 Des** | QA, UAT dengan tim, migrasi data member (CSV Kuy/Reclub), go-live. |
| **4. Commerce & Booking (R2)** | 9–12 | 30 Nov–25 Des | Products admin (varian, stok, CSV import), keranjang & checkout, payment gateway + webhook, ongkir & resi (Biteship), Orders admin (panel detail, label, tandai dikirim), booking + bayar di website, waitlist, tiket QR (email + WA), check-in (scan QR mobile & self), poin dasar. |
| **🚀 R2 Launch** | 13 | **5 Jan 2027** | |
| **5. Member engagement & CRM (R3)** | 13–16 | 4–29 Jan | Dashboard member (kartu, Slay Activity, Slay Point, ring chart, heatmap, favorit), My Activities, Order history, Foto saya + tagging, tier otomatis & penukaran poin; CRM segmen, bulk WA/email, timeline & catatan; Overview analytics + export; integrasi Kuy & Reclub (sinkron), Instagram feed. |
| **🚀 R3 Launch** | 17 | **2 Feb 2027** | |

> Catatan: drop "Destination Series" (10 Okt) terjadi sebelum shop on-site siap — tetap arahkan ke kanal penjualan saat ini.

## 6. Backlog per Epic (urutan pengerjaan)

1. **Design system in code** — tokens, primitives, Storybook, kontrol kontras.
2. **Auth & RBAC** — member/staff, OTP WA, 2FA admin, middleware guard `/akun` & `/admin`, permission helper `can(user, module, 'edit')`.
3. **Venues** — CRUD admin → halaman publik.
4. **Activities** — CRUD, recurrence, status/visibility, homepage flag → halaman publik.
5. **Content** — home sections (JSON per section + schema Zod), testimonials, pages, preview mode (draft).
6. **Gallery** — upload multipart langsung ke storage (signed URL), job resize, album, tagging, lightbox.
7. **Members & profil** — register/onboarding, profil + kelengkapan, admin list/detail.
8. **Catalog** — produk & varian, stok, CSV import.
9. **Cart/Checkout/Payment** — reservasi stok, webhook idempoten, invoice.
10. **Fulfillment** — ongkir, label, resi, notifikasi.
11. **Booking & attendance** — booking, waitlist, QR, scanner, poin otomatis, no-show job.
12. **Points & tiers** — ledger, recalculation tier, redeem.
13. **Member dashboard analytics** — agregasi (materialized view / query terjadwal).
14. **CRM** — segmen (filter builder → SQL), bulk messaging, timeline, notes, export.
15. **Admin overview & reports**.
16. **Integrations** — Kuy, Reclub, Instagram, status panel.

## 7. Tim yang Disarankan

| Peran | Alokasi |
|---|---|
| Product owner (Soslay) | Part-time, keputusan & UAT |
| UI/UX designer | Full-time fase 0, lalu part-time (mobile, state, halaman baru) |
| Full-stack engineer (lead) | Full-time |
| Frontend engineer | Full-time |
| QA (manual + Playwright) | Part-time mulai minggu 6 |

Dengan 1 engineer saja, kalikan timeline ± 1,7×.

## 8. Definition of Done (per fitur)

- Sesuai Figma desktop (toleransi ±2px spacing) **dan** layout mobile disetujui.
- Semua state: loading (skeleton), kosong, error, disabled, hover/focus.
- Teks & angka memakai format `id-ID`.
- Mutasi admin: validasi Zod server-side, cek RBAC, tercatat di audit log.
- Lighthouse mobile ≥ 90 (Performance, A11y, SEO) untuk halaman publik.
- Test: unit untuk logika (poin, tier, kapasitas, waitlist, harga); E2E untuk alur kritis (register, booking, checkout, check-in, publish konten).

## 9. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Kuy/Reclub tidak punya API | Data booking ganda | Import CSV terjadwal; arahkan booking baru ke website. |
| Tidak ada desain mobile | Rework & inkonsistensi | Fase 0 wajib menghasilkan desain mobile halaman kunci. |
| Template WhatsApp ditolak Meta | Reminder/QR tertunda | Ajukan template di minggu 1; fallback email. |
| Volume foto besar | Biaya storage & lambat | Resize saat upload, simpan 3 ukuran, lazy load, arsip original ke cold storage. |
| Overbooking (website + Kuy bersamaan) | Peserta melebihi kapasitas | Lock kapasitas di DB (transaksi), sinkron Kuy sering, kuota terpisah per kanal. |
| Kepatuhan UU PDP | Hukum/reputasi | Consent granular, kebijakan privasi, fitur hapus akun & data. |
| Scope creep (marketplace, matchmaking) | Telat launch | Non-goals v1 dikunci di PRD. |

## 10. Langkah Berikutnya

1. Review & jawab **Pertanyaan Terbuka** di PRD §10.
2. Sepakati stack & hosting.
3. Brief desainer untuk desain mobile + halaman yang hilang + perbaikan inkonsistensi (Design System §6).
4. Setup repo & fondasi (Fase 1) — bisa langsung dimulai paralel dengan Fase 0.
