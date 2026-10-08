# Soslay Web

Website Soslay (Next.js 16 · App Router · TypeScript · CSS Modules). Desain: Figma "Soslay - Development".

```bash
npm install
npm run dev        # http://localhost:3000
```

- `/` — Homepage
- `/design-system` — styleguide: semua token & komponen UI dirender dari kode produksi
- `/admin` · `/admin/members` · `/admin/members/[id]` — Admin CMS & CRM tahap 1 (Overview, Members, Member Detail). Data demo sampai Supabase tersambung — lihat `docs/04-DATABASE.md`
- `/masuk` · `/daftar` — login & registrasi member (validasi di client; belum ada backend)
- `/akun` · `/akun/profil` · `/akun/aktivitas` · `/akun/order` — member area (Dashboard, Profile, My Activities, Order/keranjang). `/keranjang` → redirect ke `/akun/order`.

## Struktur

```
src/
├─ app/                     # route — hanya menyusun komponen, tanpa style/logic sendiri
│  ├─ page.tsx              # homepage
│  └─ design-system/        # styleguide
├─ styles/
│  ├─ tokens.css            # DESIGN TOKENS (1:1 dengan variable Figma) — satu-satunya sumber warna/spacing/radius
│  └─ base.css              # reset & style elemen dasar
├─ components/
│  ├─ ui/                   # design system primitives (Button, Text, Icon, MediaCard, StatCard, ProductCard, …)
│  ├─ layout/               # Navbar, Footer
│  ├─ sections/             # section yang dipakai di banyak halaman (InstagramFeed)
│  ├─ home/                 # section khusus homepage
│  └─ member/               # member area: header, tab, kartu dashboard, form profil, keranjang
├─ hooks/                   # logic/behaviour (useScrolled, useDisclosure, useAutoRotate, useDragScroll, useCountUp, …)
├─ lib/                     # helper murni (format Rupiah, cx, array, text)
├─ content/                 # copy, gambar & link (nanti diganti data CMS)
└─ fonts/                   # Chillax Bold (wordmark)
```

Setiap komponen = `Nama.tsx` (markup) + `Nama.module.css` (styling). Behaviour interaktif ada di `hooks/`, bukan di komponen.

## Animasi (GSAP)

Semua animasi ada di `src/animations/` dan dijalankan oleh `<MotionProvider>` (`src/components/motion/`). Komponen **tidak** berisi logic animasi — cukup beri atribut:

| Atribut | Efek |
|---|---|
| `data-anim="split"` | Judul: baris naik dari balik mask (SplitText) — otomatis di `<SectionIntro>` |
| `data-anim="fade-up"` | Naik + fade saat masuk layar — otomatis untuk deskripsi `<SectionIntro>` |
| `data-anim="reveal"` | Kartu foto: clip-path terbuka dari bawah + foto zoom-out (`data-anim-delay="0.1"` opsional) |
| `data-anim="stagger"` | Anak-anaknya muncul berurutan (`data-anim-from="right"` untuk geser horizontal) |
| `data-parallax="-8"` | Parallax `yPercent` saat scroll (desktop) |
| `data-cursor="Lihat"` | Kursor custom membesar + label saat hover — otomatis di `ProductCard` & `SocialPostCard` |
| `data-magnetic` | Tombol tertarik ke kursor — otomatis di `<Button>` varian arrow/primary/social |
| `data-marquee` / `data-marquee-track` | Marquee yang bereaksi pada kecepatan & arah scroll |

- **ScrollSmoother** (smooth scroll) + kursor custom + magnetic hanya aktif di pointer halus (mouse). HP/tablet memakai scroll native.
- `prefers-reduced-motion: reduce` → tidak ada animasi sama sekali, konten tampil statis.
- Elemen `[data-anim]` disembunyikan via CSS sebelum JS jalan (anti-flash), dengan fallback tampil setelah 4 detik bila JS gagal.
- Navbar (fixed) harus berada **di luar** `<MotionProvider>`.
- Debug (dev): `window.gsap`, `window.ScrollTrigger` tersedia di DevTools.
- **Member area**: layout `/akun` tetap ter-mount saat pindah tab, jadi isi tab memakai animasi CSS (`TabPanel`), bukan `data-anim`. `position: sticky` tidak jalan di dalam ScrollSmoother — pakai `pinWithin()` (`src/animations/pin.ts`); scroll ke elemen pakai `scrollToElement()`.

## Aturan

1. **Jangan pakai hex/px mentah di komponen** — pakai token `var(--color-*)`, `var(--space-*)`, `var(--radius-*)`.
2. **Import komponen UI dari `@/components/ui`** (barrel), jangan bikin varian baru di luar folder `ui/`.
3. **Teks pakai `<Text variant="…">`** — nama variant = nama text style Figma (`heading-42`, `title-28`, `body-16`, …).
4. **Ikon pakai `<Icon name="…">`** — SVG dari Figma di `public/icons`, warnanya ikut `currentColor`.
5. Gambar di `public/images` berformat **WebP**. Gambar baru (JPG/PNG) cukup ditaruh di sana lalu jalankan `npm run images` — otomatis dikonversi ke WebP + dibuatkan blur placeholder (`src/lib/image-placeholders.json`). Di komponen: `<Image src={src} {...blurProps(src)} sizes="…" />`.
6. Responsif mobile-first: breakpoint `768px` (tablet) dan `1200px` (desktop = layout Figma 1440).
