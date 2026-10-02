# Soslay — Design System & Bahasa Desain

> Sumber: Figma `Soslay - Development` → section **Ready to reviews** (`25:124`, 12 frame website) dan **Soslay Admin — CMS & CRM** (`25:3056`, 10 frame admin + sheet ikon).
> Semua nilai di bawah diambil langsung dari variable Figma (`get_variable_defs`) dan inspeksi node. Variabel berasal dari library (tidak ada local collection di file ini).

---

## 1. Karakter Brand

| Aspek | Penjelasan |
|---|---|
| **Nama** | SOSLAY / Social Slay Tennis Club ("SLAY CLUB." pada logo) |
| **Positioning** | "Bukan sekadar komunitas bermain tenis" — komunitas sosial-lifestyle: main, terhubung, foto profesional. |
| **Tagline** | *PLAY. CONNECT. REPEAT.* · *Good courts. Good people. Good times.* · *See You on the Court!* |
| **Tone of voice** | Bahasa Indonesia santai + sisipan English ("mabar", "Booking Session di Kuyy", "have a good time"). Hangat, ajakan, tidak formal. Admin: Bahasa Indonesia ringkas & fungsional. |
| **Visual mood** | Sporty-premium. Kontras tinggi **navy gelap ↔ lime neon**, foto lapangan full-bleed, tipografi display tebal & rapat. |
| **Motif grafis** | (1) Wordmark raksasa "SOSLAY" (hero & footer). (2) Garis lengkung indigo tebal (swoosh) di header gelap — `hero/bg-shape`. (3) Marquee "PLAY. CONNECT. REPEAT." di strip lime. (4) Garis putus-putus di dasar footer. (5) Kartu member bergaya lapangan tenis (garis court) dengan bunga/bola lime. |

---

## 2. Design Tokens

### 2.1 Warna

**Primary — Navy / Indigo (brand gelap)**

| Token | Hex | Pemakaian |
|---|---|---|
| `color/navy/950` | `#060628` | Overlay terdalam, teks paling gelap |
| `color/navy/900` | `#0A084A` | **Teks heading utama**, section gelap, sidebar admin, wordmark footer |
| `color/navy/850` | `#0D0D5D` | Gradien section |
| `color/navy/800` | `#100E54` | Background section "Venue" homepage, nav gelap |
| `color/navy/700` | `#1E1E6A` | Teks body di atas terang |
| `color/indigo/700` | `#221B9D` | Hover/pressed indigo |
| `color/indigo/600` | `#291FC0` | Accent indigo (tab aktif, link, progress) |
| `color/indigo/500` | `#4035DE` | **Accent utama interaktif** (bar chart, toggle on, badge) |
| `color/indigo/muted` | `#3A3582` | Teks sekunder di atas terang (subtitle, caption berwarna) |
| `color/blue/600` | `#2941FF` | Varian aksen (jarang) |
| `color/indigo/200` | `#D6D9FF` | Track progress, chip off |
| `color/indigo/150` | `#E5E8FF` | Surface kartu ringan |
| `color/indigo/140` | `#E5EBFF` | — |
| `color/indigo/100` | `#EBECFF` | Chip/pill background |
| `color/indigo/border` | `#EAECFF` | **Border kartu & input** |
| `color/indigo/50` | `#F4F5FF` | **Background halaman** (lavender sangat muda) |

**Accent — Lime (energi, CTA)**

| Token | Hex | Pemakaian |
|---|---|---|
| `color/lime/neon` | `#D7FF00` | Highlight maksimal (wordmark hero, judul kartu di atas foto) |
| `color/lime/500` | `#D4EF1F` | **CTA primer**, footer, kartu Slay Point, menu aktif admin |
| `color/lime/550` | `#C5EB00` | — |
| `color/lime/400` | `#CAF100` | Varian CTA |
| `color/lime/600` | `#C0E500` | Ujung gradien CTA |
| `color/lime/700` | `#A4C400` | Hover/pressed lime |
| `color/lime/750` | `#9AB800` | Teks/ikon lime di atas terang |
| `color/lime/800` | `#8EA800` | Teks lime kontras |
| `color/lime/100` | `#F4FFB8` | Badge "Lunas", "Buka", "Gold" |
| `color/lime/50` | `#FAFFE3` | Background badge sangat muda |

**Support — Pink (status negatif / aksen ketiga)**

| Token | Hex | Pemakaian |
|---|---|---|
| `color/pink/500` | `#EC6ABC` | Dot status "Hampir penuh", "Gagal", notifikasi, ring chart ke-3 |
| `color/pink/400` | `#EF83C7` | Avatar pink |
| `color/pink/100` | `#FCE7F4` | Background badge pink |

**Neutral**

`white #FFFFFF` · `100 #F3F3F3` · `150 #F4F4F4` · `200 #E3E3E3` · `300 #D9D9D9` · `400 #CECECE` · `500 #B7B7B7` · `600 #7B7B7B` · `700 #5F5F5F` · `900 #252525` · `black #000000`

**Gradien (paling sering dipakai)**

| Nama | Nilai | Pemakaian |
|---|---|---|
| `gradient/indigo` | `#4035DE → #291FC0` (linear) | Avatar, bar, tombol indigo |
| `gradient/lime` (CTA) | `#D4EF1F → #C0D438` / `#D7FF00 → #C1E500` | Tombol primer lime, footer |
| `gradient/navy` | `#100E54 → #0A084A` | Section gelap, kartu member |
| `overlay/photo-50` | `rgba(0,0,0,0) → rgba(0,0,0,.5)` | Scrim bawah kartu foto (agar teks terbaca) |
| `overlay/hero` | `rgba(0,0,0,.5) → 0 → .75` | Hero foto (atas & bawah gelap) |
| `gradient/holo` | `#E8E0FF → #A894FA → #D9F2FF → #9E85F2` | Efek holografik badge tier di kartu member |

### 2.2 Tipografi

Empat keluarga (dicek ulang dari node teks Figma saat implementasi homepage):

| Font | Peran | Catatan |
|---|---|---|
| **Chillax Bold** (Fontshare) | Wordmark "SOSLAY" (hero & footer), 320px, tracking -3% | Bukan Poppins — di-self-host di `web/src/fonts` |
| **Poppins** 500–800 | Heading, judul kartu, tombol, link footer | |
| **Helvetica** (system stack) | Body copy website, nav, caption | Variable token menyebut "Inter", tapi node teks website memakai Helvetica |
| **Inter** 400–700 | UI data: meta venue ("Jakarta · Indoor"), admin (tabel, form) | |

Keputusan implementasi: semua label tombol diseragamkan ke **Poppins Bold 16 / -2%** (Figma mencampur Helvetica & Poppins).

| Style | Font | Size / Weight | Line-height | Letter-spacing* |
|---|---|---|---|---|
| Wordmark | Poppins | ~240px ExtraBold | 1 | rapat |
| Heading/52 ExtraBold | Poppins | 52 / 800 | 110% | -3% |
| Heading/52 Bold | Poppins | 52 / 700 | 110% | 0 |
| Heading/48 ExtraBold | Poppins | 48 / 800 | 100–120% | -3% |
| Heading/42 ExtraBold | Poppins | 42 / 800 | 100% | -3% |
| Title/36 ExtraBold | Poppins | 36 / 800 | 120% | -3% |
| Title/28 ExtraBold | Poppins | 28 / 800 | 100% | -4% |
| Title/24 Bold / ExtraBold | Poppins | 24 / 700–800 | 100–140% | -3…-4% / 0 |
| Subtitle/20 (Bold, ExtraBold, SemiBold, Medium) | Poppins | 20 | 100–140% | 0 / -3% |
| Body/18 Inter SemiBold | Inter | 18 / 600 | 160% | 0 |
| Body/18 Poppins Medium | Poppins | 18 / 500 | 110% | 0 |
| Body/16 Inter Regular / Medium | Inter | 16 / 400–500 | 140–160% | 0 |
| Body/16 Poppins Bold / SemiBold | Poppins | 16 / 600–700 | 140–150% | 0 / -2% |
| Caption/14 Poppins SemiBold / Bold | Poppins | 14 / 600–700 | 140–150% | 0 |
| Caption/14 Inter Regular / Medium | Inter | 14 / 400–500 | 150% | 0 |
| Caption/12 Inter Regular / Medium | Inter | 12 / 400–500 | 140% | 0 |
| Caption/12 Poppins SemiBold / Bold | Poppins | 12 / 600–700 | 140% | 0 |
| Overline/12 · 9 · 8 caps | Poppins | 12 / 9 / 8, SemiBold–Bold, UPPERCASE | 120% | +14% |

\* Figma menyimpan letter-spacing sebagai angka (`-3`, `-4`, `14`); dari konteks visual ini adalah **persen** (`-0.03em`, `-0.04em`, `0.14em`). Verifikasi ke desainer.

**Aturan:**
- Heading selalu Poppins 700–800, warna `navy/900` (di terang) atau `white`/`lime/neon` (di gelap), tracking negatif.
- Body website & seluruh tabel/form admin pakai Inter.
- Angka besar KPI (1.284, 2.450 pts, 91%) pakai Poppins ExtraBold.
- Format angka & tanggal: **locale `id-ID`** — `1.284`, `Rp220.000`, `Rp48,6 jt`, `Minggu, 20 September 2026`, jam `07.00–11.00` (titik, bukan titik dua).

### 2.3 Spacing

Skala (px): `2, 4, 8, 10, 12, 14, 16, 20, 24, 26, 30, 32, 38, 42, 48, 64, 80, 88, 97, 100, 128, 184, 200` (+ `6` di admin).
Skala inti yang direkomendasikan untuk kode: **4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64 · 80 · 128**. Nilai ganjil (26, 38, 97, 184) adalah one-off — normalisasi ke skala inti.

### 2.4 Radius

| Token | Nilai | Pemakaian |
|---|---|---|
| `radius/sm` | 4 | Tag kecil, thumbnail mini |
| `radius/md` | 8 | Input website, tombol action |
| `radius/lg` | 12 | **Kartu admin**, input admin, tombol ikon |
| `radius/xl` | 16 | Kartu website, foto, modal |
| `radius/full` | 999 | **Semua tombol pill, badge, chip, avatar, toggle** |

### 2.5 Elevasi & Efek

- Website: `drop-shadow 0 4 32 rgba(0,0,0,.05)` pada kartu (lembut, hampir flat). Satu varian `.10`.
- Admin: **tanpa shadow** — hierarki dengan border `1px indigo/border` + background putih di atas `indigo/50`.
- Navbar di atas foto: `background-blur 10` (glass) saat scroll.
- Lightbox: backdrop blur + dim di atas grid foto.
- Border default **1px**; stroke 1.5–2px hanya untuk ikon & state fokus.

### 2.6 Ikon

**Phosphor Icons** (regular 24px, beberapa `-bold`). Sheet ikon resmi ada di `25:3057`:
`squares-four, users-three, user, calendar-dots, map-pin, t-shirt, receipt, layout, images, gear-six, magnifying-glass, bell-simple, funnel-simple, download-simple, caret-down/right/left, pencil-simple, eye, upload-simple, dots-six-vertical, trend-up/down, clock, whatsapp-logo, instagram-logo, envelope-simple, phone, image, tag, sign-out, star, x, coins, shopping-bag-open, tennis-ball, qr-code, copy, trash, arrows-down-up, crown-simple, package, truck, link-simple, globe-simple, question, arrow-up-right, check-circle, warning-circle, note-pencil, user-plus, calendar-plus, sliders-horizontal, text-t, list-bullets, map-trifold, storefront, chat-circle-text, shield-check, key, plus-bold, check-bold, dots-three(-vertical)-bold`.
→ Pakai paket `@phosphor-icons/react`.

---

## 3. Komponen (inventaris dari Figma)

### 3.1 Website

| Komponen | Spesifikasi |
|---|---|
| **Navbar** | Tinggi 89px. Logo "SLAY CLUB." + ikon pemain; menu `Activity ▾`, `Venue`, `Shop`; kanan: ikon tas belanja · divider · tombol `Masuk` (pill lime, di halaman register varian indigo). Transparan di atas hero foto, solid navy di halaman dalam. |
| **Button/Arrow** (CTA utama) | Pill lime gradien, h 50–54, px 24, label Poppins Bold navy + lingkaran indigo berisi `arrow-up-right`. Contoh: "Booking Session di Kuyy", "Gabung Komunitas". |
| **Button/Pill** | Pill h 38–44, px 24–32. Solid lime atau indigo. |
| **Button/Outline** | Pill border 1px navy, background putih/transparan. |
| **Button/Social** | Lingkaran 48, putih, ikon IG / Threads / WhatsApp. |
| **Button/Add to Bag** · **Buy Now** · **Checkout** · **Save** | Pill h 52 full-width (outline vs lime). |
| **Activity card (foto)** | Foto radius 16, scrim gradien bawah, judul Poppins Bold `lime/neon`, meta putih. Varian: dengan tombol "Booking Session di Kuyy" inline. |
| **Venue card** | Foto 16:9 radius 16 + nama `lime` + "Kota · Tipe" (Indoor/Rooftop/Outdoor/Premium/Tropical). |
| **Stat card** | Putih, angka Poppins ExtraBold 32+, label Inter 14, ikon di lingkaran `indigo/100`. |
| **Testimonial / IG card** | Rasio ~4:5, foto atau solid navy, teks putih, handle `@user` (lime pada kartu navy), ikon IG/Threads pojok kanan atas. Carousel horizontal overflow. |
| **Product card** | Foto radius 16 + badge ikon tas lime di pojok, nama Poppins Bold, harga `Rp. 220.000` + coret `Rp. 250.000`. |
| **Marquee strip** | Background lime, teks "PLAY. CONNECT. REPEAT." Poppins ExtraBold navy, bergerak horizontal infinite. |
| **Option chip** (varian produk) | Pill kecil border 1px, aktif = border/fill indigo. Swatch warna = lingkaran 24. |
| **Accordion** | Baris "Detail Produk" / "Material" + tombol `+` lingkaran `indigo/100`, divider putus-putus. |
| **Form field (web)** | Label Inter 14 Medium navy, input h 46, radius 8, border `neutral/300`, placeholder neutral/600. |
| **Footer** | Background lime gradien, logo, deskripsi, Telepon/Email, 3 kolom link (Halaman lain · Bantuan · Ikuti Kami), copyright, wordmark "SOSLAY" raksasa navy, garis putus-putus. |
| **Photo grid + Lightbox** | Grid 3 kolom foto potret radius 12, di bawahnya stack avatar member yang ter-tag + tanggal. Klik → modal foto besar, tanggal, avatar + `@handle` + badge verified lime, caption. |
| **Member header** | Cover foto radius bawah, avatar lingkaran 96 (indigo, inisial lime), nama Heading/48, `@handle · email`, badge tier lime, "Club member sejak …", tombol "Edit Profil" (outline) + CTA Arrow. |
| **Tabs (member)** | 4 tab rata, aktif = teks navy bold + underline indigo 2px. |
| **Member card** | Kartu navy dengan garis lapangan, bunga lime + badge holografik tier, Member ID, "Valid thru". |
| **Progress bar** | Track `indigo/200` / navy, fill `indigo/500` atau navy di kartu lime. Tinggi 6, radius full. |
| **Ring chart** | 3 cincin konsentris (navy, indigo, pink). |
| **Heatmap** | Grid hari × minggu, 4 tingkat indigo + sel lime = sesi berikutnya. |
| **Status pill** | `Upcoming` (lime), `Terdaftar` (indigo/100), `Selesai` (neutral). |

### 3.2 Admin

| Komponen | Spesifikasi |
|---|---|
| **Layout** | Canvas 1440. **Sidebar 248px** navy/900 + **main 1192px** background `indigo/50`, padding 28. |
| **Sidebar** | Logo + badge "Admin" lime. Grup berlabel caps kecil: `UMUM` (Overview) · `CRM` (Members + counter) · `CMS` (Activities, Venues, Products, Orders + counter, Konten & Galeri). Bawah: Settings & Roles, Bantuan, kartu user (avatar lime, nama, role, tombol sign-out). Item aktif = blok lime radius 12, teks navy bold. |
| **Topbar** | Breadcrumb kecil (`CMS / Activities / …`) + judul halaman Title/24; search global "Cari member, sesi, order…" dengan hint `⌘K`; tombol bell (dot pink); tombol outline "Lihat website ↗". |
| **Card** | Putih, radius 16, border 1px `indigo/border`, padding 20–24, judul Poppins Bold 16 + subjudul Inter 14 `indigo/muted`, aksi link indigo "Semua ›" kanan atas. |
| **KPI card** | Ikon dalam lingkaran, label, angka Poppins ExtraBold 28, delta pill (`trend-up` lime / `trend-down` pink), caption. |
| **Segmented control** | Pill group `indigo/100`, item aktif putih (4 mgg / 12 mgg / Tahun). |
| **Data table** | Header row background `indigo/50` Inter 12, row h ~54 border bawah, avatar inisial 32 + nama + sub-teks, checkbox seleksi, pagination "Menampilkan 1–10 dari 1.284". |
| **Status pill (dot)** | Pill radius full + dot 6px: Lunas/Buka/Published (lime) · Menunggu/Dikirim/Terdaftar (indigo) · Gagal/Dibatalkan/Hampir penuh/Penuh (pink) · Draft/Arsip/Belum (neutral). |
| **Tier badge** | Basic (outline), Silver (indigo/100), Gold (lime), Platinum (navy solid, teks lime) + ikon `crown-simple`. |
| **Filter bar** | Search field + dropdown chip "Tier: Semua", "Level: Semua", "Kota: Semua"… |
| **Status tabs w/ counter** | "Semua 1.284 · Aktif 1.198 · Baru 86 · Tidak aktif" |
| **Bulk action bar** | Muncul saat ada seleksi: "2 member dipilih · Kirim WhatsApp · Kirim email · Tambah ke segmen · Export". |
| **Form** | Label Inter 14 + `*` wajib, input h 44 radius 12 border 1px, ikon kanan (kalender/jam/caret), helper Inter 12 `indigo/muted`, counter karakter. |
| **Choice chips** | Pilihan tunggal/multi sebagai pill outline; aktif = fill `indigo/100` + border indigo + bold. |
| **Toggle** | 40×22, on = `indigo/500`. |
| **Dropzone** | Border dashed, ikon upload, "Tarik foto ke sini atau pilih file", hint format. |
| **Sticky action header** | "‹ Activities · [Published] · Tersimpan otomatis · 2 menit lalu" + Preview / Duplikat / Simpan perubahan (lime). |
| **Right rail** | Kolom kanan 1/3 untuk Publikasi, Preview kartu, Host & crew. |
| **Detail drawer** | Panel order di kanan tabel (Orders). |
| **Timeline** | Riwayat aktivitas member: ikon, judul, badge, meta, timestamp kanan. |
| **Permission matrix** | Tabel modul × role dengan nilai Ubah / Lihat / —. |
| **Sortable list** | Section homepage dengan handle `dots-six-vertical` (drag reorder) + toggle aktif. |

---

## 4. Layout & Grid

- **Desktop frame 1440**. Konten website max-width **≈1312** (margin 64 kiri-kanan); beberapa section 1200.
- Section vertikal padding 80–128.
- Grid kartu: 2 kolom (aktivitas & venue), 3 kolom (foto, trust badges), 4 kolom (stat), carousel 5+ (IG).
- Admin: konten main grid 12 kolom; pola umum **2/3 + 1/3** (tabel/chart + panel samping).
- **Tidak ada desain mobile/tablet di Figma** → lihat PRD §8 untuk aturan responsif yang perlu disepakati.

---

## 5. Prinsip Penggunaan

1. **Lime = aksi.** Satu CTA lime per viewport. Aksi sekunder outline navy.
2. **Navy = otoritas & konteks gelap**; lavender `indigo/50` = kanvas terang. Hindari putih polos sebagai background halaman.
3. **Foto adalah konten utama** — selalu radius 12–16 + scrim gradien jika ada teks di atasnya.
4. **Pill everywhere** untuk elemen interaktif kecil (tombol, chip, badge, toggle).
5. **Admin = flat + border**, website = sedikit shadow lembut.
6. **Status konsisten lintas modul** (lime positif, indigo proses, pink negatif/urgent, abu netral).
7. Kontras: teks lime di atas putih **tidak lolos WCAG** — lime hanya untuk background tombol/teks di atas navy/foto gelap.

---

## 6. Temuan & Inkonsistensi di Figma (perlu dirapikan sebelum build)

| # | Temuan | Rekomendasi |
|---|---|---|
| 1 | Ejaan "**Vanue**" di nav & nama frame | → "Venue" |
| 2 | Placeholder "Nama **Lenkap** kamu" dipakai di semua field register; label "Birth of date" | Placeholder per field; "Tanggal lahir" |
| 3 | Tombol submit register berlabel "Booking Session di Kuyy" | → "Daftar Sekarang" |
| 4 | "Common Ground Menteng" vs "Common Grounds Menteng"; "Kuta Mori" vs "Kula Mani Tennis Village" | Satu nama kanonik (dari data Venue) |
| 5 | Lorem ipsum di register, product detail, lightbox, trust badges (3× "Detail Produk") | Copywriting final |
| 6 | Halaman Activity punya 2 section berjudul sama "Lebih dari Sekadar Pertandingan!" | Mis. "Sesi minggu ini" & "Sesi mendatang" |
| 7 | Tombol `Masuk` lime vs indigo antar halaman | Tetapkan satu varian (lime) |
| 8 | Bahasa campur di form profil (Full Name, Gender…) vs register Indonesia | Putuskan satu bahasa UI per konteks |
| 9 | Banyak nilai spacing one-off (26, 38, 97, 184) & radius 25.69 | Normalisasi ke skala inti |
| 10 | Tidak ada state hover/focus/disabled/error/empty/loading | Perlu didesain atau ditetapkan di kode |
| 11 | Tab dashboard "Order" menampilkan keranjang | Pisahkan "Keranjang" (cart) dan "Order" (riwayat pesanan) |
