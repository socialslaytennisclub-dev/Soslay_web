# PRD — Soslay Website & Admin (CMS + CRM)

| | |
|---|---|
| **Produk** | Soslay (Social Slay Tennis Club) — website publik, member area, dan admin panel |
| **Versi dokumen** | v1.0 · 1 Oktober 2026 |
| **Sumber desain** | Figma `Soslay - Development` — website `node 25:124`, admin `node 25:3056` |
| **Dokumen terkait** | [01-DESIGN-SYSTEM.md](01-DESIGN-SYSTEM.md) · [03-IMPLEMENTATION-PLAN.md](03-IMPLEMENTATION-PLAN.md) |

---

## 1. Latar Belakang

Soslay adalah komunitas tenis sosial di Jakarta & Bali (500+ member aktif, 60+ event, 5+ sesi/minggu, setiap sesi ada fotografer profesional). Saat ini booking dijalankan lewat platform pihak ketiga **Kuy** (kuy.id), data member tersebar (Kuy ID, Reclub ID, Instagram, WhatsApp), dan foto sesi didistribusikan manual.

Soslay butuh satu platform milik sendiri yang:

1. Menjual pengalaman komunitas (brand, venue, foto) ke calon member,
2. Memberi member "rumah" — profil, riwayat sesi, poin, kartu member, foto diri,
3. Menjual merchandise (shop),
4. Memberi tim satu admin panel untuk mengelola sesi, absensi, member (CRM), order, venue, konten, dan galeri.

## 2. Tujuan & Metrik Sukses

| Tujuan | Metrik | Target 3 bulan pasca-launch |
|---|---|---|
| Konversi pengunjung → member | Registrasi / pengunjung unik | ≥ 3% |
| Data member terpusat | % member aktif dengan profil ≥ 80% lengkap | ≥ 70% |
| Retensi | Member yang main ≥ 2× / bulan | +15% vs baseline |
| Operasional sesi | Check-in via QR (bukan manual) | ≥ 90% sesi |
| Penjualan shop | Pendapatan shop / bulan | ≥ Rp48,6 jt (baseline Sep 2026) |
| Efisiensi tim | Waktu rata-rata proses order "Perlu dikirim" | < 24 jam |

**Non-goals (v1):** aplikasi mobile native, marketplace jual-beli alat antar member, sistem matchmaking otomatis, multi-bahasa penuh, booking lapangan untuk publik umum (non-sesi Soslay).

## 3. Persona & Role

| Persona | Kebutuhan utama |
|---|---|
| **Pengunjung / calon member** | Lihat vibe komunitas, jadwal sesi, venue, foto; gabung; booking pertama. |
| **Member** (tier Basic → Silver → Gold → Platinum) | Booking sesi, lihat jadwal & riwayat, cek poin/tier, kartu member, temukan foto dirinya, belanja merch. |
| **Super Admin** | Akses penuh, kelola tim & role, integrasi. |
| **Admin** | Operasional harian semua modul. |
| **Community Manager** | Member/CRM, sesi, konten. |
| **Coach** | Lihat sesi yang ia pegang, absensi/check-in. |
| **Fotografer** | Upload & tag foto ke album sesi. |
| **Kasir Shop** | Products & Orders. |

Matriks izin final diatur di admin (Settings & Roles) dengan nilai per modul: **Ubah / Lihat / —**.

---

## 4. Ruang Lingkup — Website Publik

> Semua halaman memakai Navbar (Activity ▾ · Venue · Shop · Tas · Masuk) dan Footer lime (Halaman lain: Aktifitas, Tempat, Belanja, Komunitas, Acara · Bantuan: Kontak, Info, Kolaborasi · Ikuti Kami: IG, Threads, WhatsApp).

### 4.1 Homepage `/` — Figma "Hero" (`25:125`)

| Section | Isi | Sumber data |
|---|---|---|
| Hero | Foto full-bleed + wordmark "SOSLAY", deskripsi, CTA "Gabung Komunitas" → `/gabung` | CMS: Konten › Hero |
| Lebih dari Sekadar Pertandingan! | 4 kartu tipe aktivitas (Weekly MABAR Sessions, Tennis Match Day, Tennis Escape, Beginner Coaching) + CTA "Booking Session di Kuyy" | Otomatis dari Activities (flag "Tampilkan di homepage") |
| Statistik | 500+ Active Members · 60+ Events Hosted · 5+ Sessions per Week · 100% Pro Photography | CMS (angka manual atau hitung otomatis) |
| Kami Hanya Bermain di Tempat yang Terlihat Bagus | Section navy, intro Jakarta/Bali, 6 kartu venue, CTA "See all Court" → `/venue` | Otomatis dari Venues (flag "Tampil di web") |
| The People Make the Game | Kolase foto + 1 testimoni (slider) + CTA "Gabung ke Komunitas" | CMS: Testimoni |
| Marquee | "PLAY. CONNECT. REPEAT." | CMS |
| Beyond the Court | 2 produk unggulan + "Lihat Koleksi" → `/shop` | Otomatis dari Products (flag unggulan) |
| See You on the Court! | Carousel post IG/testimoni + "Follow our Instagram" | CMS: kurasi manual / Instagram feed |
| Promo banner (opsional) | mis. "Destination Series drop · 10 Okt" | CMS, default nonaktif |

**Requirement:** urutan & visibilitas section dapat diatur dari admin (drag & drop, toggle on/off).

### 4.2 Activity `/activity` — Figma "Activity Page - Mabar Session" (`25:493`)

- **Hero sesi unggulan / mendatang**: label "Aktivitas mendatang", judul (mis. "Mabar di Bali [Altitude Kintamani] with Photographer"), tanggal, jam, venue + alamat, foto.
- Tombol **"Absensi Kehadiran"** (member check-in mandiri — lihat FR-ACT-5) dan **"Booking Session di Kuyy"**.
- Grid kartu sesi (foto venue, nama venue, tanggal, jam, tombol booking).
- Filter (rekomendasi, tidak di desain): tipe sesi, kota, tanggal.
- Navbar "Activity ▾" dropdown → filter per tipe (Weekly MABAR, Match Day, Tennis Escape, Coaching, Social).
- **Detail sesi** `/activity/[slug]` (tidak ada desain terpisah — pakai pola hero halaman ini): deskripsi, level disarankan, harga, kapasitas tersisa, waitlist, host/coach/fotografer, tombol booking.

### 4.3 Venue `/venue` — Figma "Vanue" (`25:749`)

- Header navy + intro, tab/filter **Jakarta / Bali**, grid kartu venue (nama, kota · tipe).

### 4.4 Venue Detail `/venue/[slug]` — Figma "Vanue detail" (`25:894`) + Lightbox (`25:1145`)

- Hero navy dengan swoosh: nama venue, deskripsi, foto utama, kartu sesi berikutnya (tanggal, jam, CTA booking).
- **Galeri foto** grid 3 kolom: tiap foto menampilkan avatar member yang ter-tag + tanggal sesi.
- **Lightbox**: foto besar, tanggal, `@handle` member (badge verified), caption, tombol tutup; navigasi kiri/kanan & keyboard (Esc, ←, →).

### 4.5 Shop `/shop` — Figma "Shop Page" (`25:1346`)

- Header "Beyond the Court." + deskripsi koleksi, marquee, grid produk (foto, nama, harga + harga coret).
- Filter kategori: Apparel · Racket · Aksesoris.

### 4.6 Product Detail `/shop/[slug]` — Figma "Desktop - 29" (`25:1603`)

- Galeri (thumbnail vertikal kiri + foto utama).
- Nama, harga & harga coret, pilih **Type** (Fit / Re…), **Warna** (swatch), **Ukuran** (S–XXL) + link "Panduan Ukuran" (modal).
- "Tambahkan ke Tas Belanja" (outline) · "Beli Langsung Sekarang" (lime).
- Info box: ajakan login/"Masuk" untuk dapat Slay Point.
- Deskripsi, accordion "Detail Produk" & "Material".
- Section "Belanja dengan rasa aman dan nyaman" (3 trust badges: pengiriman, packaging, garansi/aman).
- Carousel "See You on the Court!".
- Varian habis → chip disabled; stok ≤ 5 → label "Stok terbatas".

### 4.7 Registrasi `/gabung` — Figma "Desktop - 30" (`25:1850`)

Form di atas foto full-bleed: Nama Lengkap, Display Name, Kuy ID, Tanggal lahir, Nomor HP (WhatsApp), Email, Password, checkbox persetujuan S&K/Privasi. Submit → verifikasi email/OTP WhatsApp → onboarding profil tenis (opsional, bisa dilewati).

### 4.8 Halaman yang **belum ada di Figma** (wajib v1)

| Halaman | Catatan |
|---|---|
| Masuk `/masuk` | Email/HP + password; "Lupa password". Reuse layout register. |
| Lupa / reset password | |
| Keranjang & Checkout `/checkout` | Alamat, kurir & ongkir (JNE, SiCepat), pakai Slay Point, pembayaran (QRIS/VA/e-wallet), ringkasan. |
| Status pembayaran / terima kasih | |
| Booking sesi on-site | Konfirmasi peserta (+1 teman), pembayaran, tiket QR. |
| 404 / 500 | Pakai wordmark & foto. |
| Kebijakan Privasi, S&K, Kontak, Kolaborasi, Komunitas, Acara | Halaman konten (CMS "Halaman lain"). |

---

## 5. Ruang Lingkup — Member Area

Semua tab berbagi **header member**: cover foto, avatar, nama, `@handle · email`, badge tier, "Club member sejak …", tombol **Edit Profil** + **Booking Session di Kuyy**. Tab: Dashboard · Profile · My Activities · Order.

### 5.1 Dashboard `/akun` — Figma "Member Dashboard" (`25:2601`)

| Widget | Isi |
|---|---|
| Official Member Card | Kartu navy bergaya lapangan, tier (Basic/Silver/Gold/Platinum), Member ID (`SOS 0067 2507`), nama, "Valid thru 07/26". Bisa diunduh/ditampilkan sebagai kartu digital (QR untuk check-in). |
| Slay Activity | Sesi bulan ini (12), target bulanan (12/16) + progress, Jam main (18j), Venue (5), Streak (4 mgg). |
| Slay Point | Saldo (2.450 pts), "+120 minggu ini", progress ke tier berikutnya ("550 pts lagi ke Platinum", 2.450/3.000), tombol **Tukar** (redeem merch/sesi gratis). |
| Info Grafis | Toggle 1 Bln / 3 Bln / 1 Thn. Ring chart "Target tahunan" (Sesi mabar 72/96, Jam bermain 108/150, Venue 7/10). Heatmap "Hari paling aktif" (33 sesi dalam 13 minggu). Kartu Hari favorit, Jam favorit, Venue favorit. |
| Activity | 5 sesi terbaru/mendatang dengan status (Upcoming, Terdaftar, Selesai) + "Lihat semua". |

### 5.2 Profile `/akun/profil` — Figma (`25:2250`)

- **Basic Information**: foto profil (JPG/PNG ≤ 2 MB, ganti/hapus), Full Name\*, Display Name, Date of Birth, Gender, Phone/WhatsApp\* (+62), City\*, Kuy ID\*, Reclub ID, Instagram\*, Email\*, Password\* (Ubah).
- **Tennis Profile**: Tennis Level* (Beginner · Beginner–Intermediate · Intermediate · Intermediate–Advanced · Advanced), Playing Frequency (First time/Rarely · 1–2x/month · 1x/week · 2–3x/week · 4x+/week), Preferred Format (Singles/Doubles/Both), Preferred Hand (Right/Left), lama bermain.
- **Community Preferences**: What are you looking for? (multi: Meet new people, Improve my tennis, Join tennis events, Buy Merchandise, Find tennis partners, Buy & Sell tennis equipment, Travel & play tennis, Social & lifestyle experiences); Preferred Event Type (multi: Social Match, Competitive Match, Tennis Trip/Destination, Tennis + Dining, Tennis + Lifestyle, Private/Intimate Gathering).
- Panel kanan sticky: **Kelengkapan profil** (85%) dengan checklist per section.
- Batal / Simpan Perubahan. Field `*` wajib.

### 5.3 My Activities `/akun/aktivitas` — Figma (`25:1926`)

- **Terbaru** — sesi yang akan diikuti (status Terdaftar), tombol lihat tiket/QR, batal (sesuai kebijakan).
- **Lampau** — riwayat sesi (Selesai, +50 pts), link ke album foto sesi.

### 5.4 Order `/akun/order` — Figma "Member Dashboard - Shop" (`25:2087`)

- Desain saat ini = **keranjang**: daftar item (foto, nama, warna, ukuran, ketersediaan "dikirim dalam 2–3 hari", qty, harga), "Pilih semua", Ringkasan (Subtotal, Ongkos kirim "Dihitung saat checkout", Total, "+22 pts Slay Point dari pesanan ini"), Checkout / Lanjut belanja.
- **Tambahan wajib**: riwayat pesanan & status pengiriman (no. resi).

### 5.5 Foto saya (rekomendasi)
Galeri foto tempat member ter-tag (dari album sesi). Admin menyebut galeri "tampil di member dashboard & halaman venue".

---

## 6. Ruang Lingkup — Admin Panel (`/admin`)

Layout: sidebar navy 248px + topbar (breadcrumb, judul, search global `⌘K`, notifikasi, "Lihat website").

### 6.1 Overview — `25:3186`
- Sapaan + tanggal; tombol **Export laporan**, **Buat sesi baru**.
- KPI: Member aktif (1.284, +7,2%, +86 bulan ini) · Booking minggu ini (142, +12%, kapasitas 84%) · Penjualan shop bulan ini (Rp48,6 jt, +9,4%, 312 pesanan) · Tingkat kehadiran (91%, −2,1%, 13 no-show).
- Chart **Booking per minggu** (4 mgg / 12 mgg / Tahun) + total & rata-rata.
- **Sesi mendatang** (7 hari) dengan progress kapasitas & status (Hampir penuh / Buka).
- **Member terbaru** (tabel: member, level, bergabung, tier).
- **Distribusi tier** (stacked bar + persentase) & **Level tenis** (bar horizontal).
- **Pesanan terbaru** (order, customer & produk, total, bayar, pengiriman).
- **Produk terlaris** bulan berjalan.

### 6.2 Members (CRM) — `25:3767`
- Tab status: Semua · Aktif · Baru · Tidak aktif (dengan counter).
- **Segmen tersimpan** (chip + jumlah): mis. "Gold+ di Jakarta", "Beginner baru (30 hari)", "Belum main 30 hari", "Minat Tennis Trip", "Suka Tennis + Dining"; tombol **Simpan segmen**.
- Search (nama, email, Kuy ID, Instagram) + filter Tier, Level, Kota, Frekuensi, Minat.
- Tabel: Member (avatar, nama, email), Kuy ID, Level, Kota, Sesi, Poin, Tier, Terakhir main. Sort per kolom.
- Bulk action: **Kirim WhatsApp**, **Kirim email**, **Tambah ke segmen**, **Export**.
- Export CSV, Tambah member, pagination.

### 6.3 Member Detail — `25:4301`
- Header: avatar, nama, tier, status, kontak, Member ID; tombol WhatsApp, Email, Edit member.
- Stat: Sesi diikuti, Jam bermain, Kehadiran %, Slay Point, Total belanja, Terakhir main.
- Tab: Ringkasan · Aktivitas · Booking · Order · Poin · Catatan.
- **Riwayat aktivitas** (timeline semua interaksi: booking, hadir/no-show, beli, naik tier, ubah profil) filter 30 hari.
- **Riwayat booking** + aksi "Booking-kan sesi" (admin booking atas nama member).
- Panel: Tennis profile, Community preferences, Akun & kontak, **Catatan internal** (hanya tim, bertimestamp & penulis).

### 6.4 Activities — `25:4725`
- Tab: Mendatang · Selesai · Draft · Arsip; tombol **Buat sesi**.
- Search + filter Tipe, Venue, Kota, rentang tanggal.
- Tabel: Sesi (judul + tipe), Jadwal, Venue, Kapasitas (22/24 + waitlist), Harga, Status (Published, Hampir penuh, Penuh, Terjadwal, Draft).

### 6.5 Activity Editor — `25:5098`
- Header sticky: status, autosave ("Tersimpan otomatis · 2 menit lalu"), Preview, Duplikat, Simpan perubahan.
- **Info sesi**: Judul\*, Tipe\* (Weekly MABAR / Tennis Match Day / Beginner Coaching / Tennis Escape / Social), Deskripsi (≤ 500 karakter), Foto cover\* (JPG/PNG 4:3 ≤ 5 MB).
- **Jadwal & lokasi**: Tanggal\*, Jam mulai\*, Jam selesai\*, Venue\*, Lapangan, **Ulangi setiap minggu** (generate sesi berulang sampai tanggal X).
- **Tiket & kapasitas**: Harga\*, Kapasitas\*, Slay Point per hadir, Level disarankan (multi), Waitlist (on/off), Hanya untuk member (on/off), Link booking Kuy (copy).
- **Peserta & absensi**: info check-in ("dibuka 06.30 · QR dikirim ke WhatsApp"), **Scan QR**, **Tambah peserta**; stat Terdaftar/Sudah bayar/Waitlist/Check-in; tabel peserta (level, pembayaran, via Website/Kuy/Admin, tombol Check-in); "+1 teman".
- Right rail: **Publikasi** (Status, Visibilitas Publik/Member saja/Link saja, tampil sampai, tampilkan di homepage), **Preview kartu**, **Host & fotografer** (Host, Coach, Fotografer + Tambah crew).

### 6.6 Orders — `25:5560`
- KPI: Perlu diproses (5, "2 lewat 24 jam"), Dalam pengiriman (12), Selesai bulan ini (295, 98% tepat waktu), Pendapatan.
- Tab status: Semua · Perlu diproses · Dikirim · Selesai · Dibatalkan; search; filter pembayaran & bulan.
- Tabel order + **panel detail kanan**: waktu & kanal, status bayar (Lunas · QRIS), customer (tier, jumlah order sebelumnya), produk & varian, subtotal, ongkir (JNE REG), poin dipakai, alamat, kurir, input **No. resi**, **Cetak label**, **Tandai dikirim**.

### 6.7 Venues — `25:5882`
- Tab Semua / Jakarta / Bali; urutkan (Terpopuler); Tambah venue.
- Kartu venue: foto, badge "Tampil di web"/"Disembunyikan", nama, kota·tipe, jumlah lapangan, sesi bulan ini, okupansi %, toggle tampil di halaman Venue, tanggal rilis.
- Editor venue (belum didesain): foto (multi), alamat + map, kota, tipe, jumlah & nama lapangan, fasilitas, deskripsi, slug.

### 6.8 Products — `25:6156`
- Tab kategori (Semua, Apparel, Racket, Aksesoris); **Import CSV**, Tambah produk.
- Banner peringatan stok ("2 produk stoknya menipis (≤ 5) dan 1 habis…").
- Tabel: Produk (foto, nama, SKU), Kategori, Varian (chip), Harga (+ coret), Stok (menipis/habis), Terjual, Tampil (toggle).
- Editor produk (belum didesain): foto, deskripsi, detail & material, kategori, varian (type × warna × ukuran) dengan stok & SKU per varian, harga & harga coret, unggulan homepage, panduan ukuran.

### 6.9 Konten & Galeri — `25:6502`
- Tab: Homepage · Galeri foto (1.240) · Testimoni & IG (18) · Halaman lain (6). Draft tersimpan, Preview, **Publikasikan**.
- **Section homepage**: daftar 9 section drag-to-reorder, toggle aktif, "Tambah section"; editor section (mis. Hero: foto, judul, deskripsi ≤ 180, label & link tombol, overlay gelap).
- **Galeri foto sesi**: album per sesi (judul, tanggal, jumlah foto, status Published / belum upload), Upload foto (bulk), tag member di foto.

### 6.10 Settings & Roles — `25:6834`
- Tab: Tim & akses · Umum · Membership & poin · Pembayaran · Notifikasi · Integrasi.
- **Anggota tim** (nama, email, role, terakhir aktif, status Aktif/Diundang) + Undang anggota.
- **Role & izin akses**: matriks modul (Overview, Members, Activities & absensi, Venues, Products, Orders, Konten & galeri, Settings & roles) × role → Ubah/Lihat/—; Buat role.
- **Integrasi**: Kuy (sinkron booking & Kuy ID), Reclub (import member & Reclub ID), Payment gateway (QRIS, VA, e-wallet), WhatsApp Business (reminder & QR check-in), Instagram (feed). Status Terhubung / Perlu login ulang.
- **Log aktivitas admin** (audit trail 7 hari+).
- **Membership & poin**: ambang tier, poin per hadir, poin per Rp belanja, katalog penukaran.

---

## 7. Functional Requirements (ringkas, ber-ID)

### Auth & Akun
- **FR-AUTH-1** Registrasi email + password dengan field §4.7; email & nomor HP unik.
- **FR-AUTH-2** Verifikasi via email link atau OTP WhatsApp.
- **FR-AUTH-3** Login, logout, lupa password, ubah password.
- **FR-AUTH-4** Admin login terpisah (role tim), wajib 2FA untuk Super Admin.
- **FR-AUTH-5** Member ID otomatis (`SOS NNNN YYMM`).

### Activities & Booking
- **FR-ACT-1** Admin membuat/mengedit/duplikat/mengarsip sesi; sesi berulang mingguan.
- **FR-ACT-2** Booking dari website: pilih sesi → (+1 teman opsional) → bayar → tiket QR dikirim email & WhatsApp.
- **FR-ACT-3** Booking dari Kuy disinkronkan ke peserta sesi (sumber "Kuy"); deep-link "Booking Session di Kuyy" tetap tersedia.
- **FR-ACT-4** Kapasitas, waitlist otomatis (promosi saat ada slot kosong + notifikasi), "hanya member".
- **FR-ACT-5** Check-in: admin/coach scan QR peserta; atau member tekan "Absensi Kehadiran" saat check-in dibuka (validasi waktu, opsional geofence/kode sesi).
- **FR-ACT-6** Hadir → poin otomatis (default 50 pts); tidak hadir → status no-show.
- **FR-ACT-7** Kebijakan pembatalan & refund dapat dikonfigurasi.

### Membership, Poin & Tier
- **FR-MEM-1** Tier: Basic → Silver → Gold (≥ 2.000 pts) → Platinum (≥ 3.000 pts); ambang dapat diatur.
- **FR-MEM-2** Ledger poin (earn: hadir, belanja; spend: tukar, diskon checkout); semua transaksi poin tercatat.
- **FR-MEM-3** Statistik dashboard dihitung dari data kehadiran (sesi, jam, venue, streak mingguan, heatmap, favorit).
- **FR-MEM-4** Target bulanan/tahunan (default oleh sistem, bisa diubah member).
- **FR-MEM-5** Kelengkapan profil dihitung per section.

### Shop & Order
- **FR-SHOP-1** Katalog dengan varian (type, warna, ukuran), stok per varian, harga coret.
- **FR-SHOP-2** Keranjang (tamu & member, merge saat login).
- **FR-SHOP-3** Checkout: alamat, ongkir real-time, pakai poin, payment gateway (QRIS, VA, e-wallet), webhook status bayar.
- **FR-SHOP-4** Stok di-reserve saat checkout, dilepas jika pembayaran kedaluwarsa.
- **FR-SHOP-5** Admin: input resi, cetak label, tandai dikirim/selesai/batal; notifikasi ke customer.
- **FR-SHOP-6** Poin dari belanja (contoh: Rp220.000 → +22 pts ⇒ 1 pt / Rp10.000).

### CRM
- **FR-CRM-1** Filter & segmentasi dinamis, segmen tersimpan dengan jumlah live.
- **FR-CRM-2** Bulk WhatsApp (template disetujui Meta) & email ke seleksi/segmen.
- **FR-CRM-3** Timeline aktivitas per member (event sourcing ringan).
- **FR-CRM-4** Catatan internal per member.
- **FR-CRM-5** Export CSV (dengan hak akses).
- **FR-CRM-6** Import member dari Reclub/CSV.

### CMS & Galeri
- **FR-CMS-1** Section homepage: urutan, toggle, konten; draft → preview → publish.
- **FR-CMS-2** Album foto per sesi, bulk upload (ratusan foto), kompresi & thumbnail otomatis, watermark opsional.
- **FR-CMS-3** Tag member di foto → muncul di "Foto saya" & avatar stack di grid venue.
- **FR-CMS-4** Testimoni & post IG (kurasi manual; feed otomatis opsional).
- **FR-CMS-5** Halaman statis (Kontak, Info, Kolaborasi, Privasi, S&K, …).

### Admin umum
- **FR-ADM-1** RBAC per modul (Ubah/Lihat/—), role kustom.
- **FR-ADM-2** Audit log semua aksi mutasi.
- **FR-ADM-3** Search global `⌘K` (member, sesi, order).
- **FR-ADM-4** Notifikasi admin (order baru, order > 24 jam, stok menipis, sesi penuh).
- **FR-ADM-5** Export laporan (Overview) CSV/PDF.

---

## 8. Non-Functional Requirements

| Area | Requirement |
|---|---|
| **Responsif** | Figma hanya desktop 1440. Website **wajib mobile-first** (≥ 70% traffic diperkirakan dari HP/IG): breakpoint 375 / 768 / 1024 / 1440. Navbar → hamburger; grid 2–3 kolom → 1 kolom; carousel tetap swipe; wordmark diskalakan `clamp()`. Admin: optimal ≥ 1280, usable di tablet; halaman **Scan QR / check-in harus mobile-friendly** (dipakai coach di lapangan). |
| **Performa** | LCP < 2,5 s di 4G, CLS < 0,1. Gambar via CDN (AVIF/WebP, `srcset`, lazy). Halaman publik SSG/ISR. |
| **SEO** | Meta & OG per halaman (sesi, venue, produk), sitemap, schema.org `Event`, `Product`, `SportsActivityLocation`. |
| **Aksesibilitas** | WCAG 2.1 AA: kontras (hindari teks lime di atas putih), fokus terlihat, alt foto, keyboard untuk lightbox & modal. |
| **Keamanan** | HTTPS, hash password (argon2/bcrypt), rate-limit login/OTP, RBAC di server, validasi webhook (signature), CSRF, upload file divalidasi tipe & ukuran. |
| **Privasi (UU PDP)** | Persetujuan eksplisit saat daftar, persetujuan terpisah untuk tag foto & pesan marketing WhatsApp, hak hapus akun & data, data minimisasi di export. |
| **Locale** | `id-ID`, zona waktu **WIB (Jakarta) & WITA (Bali)** — simpan UTC, tampilkan sesuai venue. |
| **Reliabilitas** | Backup DB harian, uptime 99,5%, error monitoring. |
| **Skala awal** | ~2.000 member, ~50 sesi/bulan, ~1.500 foto/bulan, ~400 order/bulan. |

---

## 9. Integrasi Eksternal

| Integrasi | Fungsi | Catatan |
|---|---|---|
| **Kuy** (kuy.id) | Booking eksternal & Kuy ID | Perlu konfirmasi apakah Kuy punya API/webhook; fallback = link + import CSV peserta. |
| **Reclub** | Import member & Reclub ID | Konfirmasi ketersediaan API. |
| **Payment gateway** (Midtrans / Xendit) | QRIS, VA, e-wallet, webhook | |
| **WhatsApp Business Cloud API** | OTP, reminder sesi, QR tiket, broadcast segmen | Template harus di-approve Meta. |
| **Email transaksional** (Resend / SES) | Verifikasi, tiket, invoice | |
| **Ongkir & resi** (Biteship / RajaOngkir) | JNE, SiCepat, label | |
| **Instagram Graph API** | Feed "See You on the Court!" | Opsional; default kurasi manual. |
| **Maps** (Google Maps embed) | Lokasi venue | |

---

## 10. Asumsi & Pertanyaan Terbuka

1. **Booking utama di mana?** Website sendiri atau tetap Kuy? (Desain admin menunjukkan keduanya: "Via Website / Kuy / Admin".) → Rekomendasi: v1 booking + bayar di website, Kuy disinkron/import.
2. **Aturan tier**: berbasis poin kumulatif atau poin 12 bulan berjalan? Apakah tier bisa turun? "Valid thru" kartu berarti masa berlaku membership berbayar?
3. **Membership berbayar?** Ada iuran tahunan atau gratis?
4. **Penukaran poin**: katalog & nilai tukar.
5. **Kebijakan pembatalan/refund** sesi.
6. **Persetujuan foto**: opt-in/opt-out tag & publikasi foto member.
7. **Bahasa UI**: full Indonesia, atau campur seperti desain?
8. **Desain mobile**: akan dibuat desainer atau diturunkan oleh developer mengikuti aturan §8?
9. Halaman "Komunitas" & "Acara" di footer — isinya apa?
10. Kontak `+62 642424792` & `support@soslay.com` — data final?

---

## 11. Rilis Bertahap (ringkas — detail di Implementation Plan)

| Rilis | Isi |
|---|---|
| **R1 — Public Launch** | Website publik (home, activity, venue, venue detail + galeri, shop katalog, product detail), registrasi/login, member Profile, admin: Activities, Venues, Konten & Galeri, Members (list/detail dasar), Settings (tim & role). Booking via link Kuy. |
| **R2 — Commerce & Booking** | Keranjang, checkout, payment gateway, Orders admin, Products admin, booking + bayar di website, tiket QR, check-in, poin dasar. |
| **R3 — Member Engagement & CRM** | Dashboard lengkap (kartu member, statistik, heatmap, tier), My Activities, Foto saya + tagging, segmentasi, bulk WhatsApp/email, Overview analytics, integrasi Kuy/Reclub, penukaran poin. |
