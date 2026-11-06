import type { NextConfig } from "next";
// Import relatif tanpa alias "@/": next.config dimuat sebelum path alias tsconfig berlaku.
import { ACTIVITY_PATHS } from "./src/content/activity-paths";
import { venueCities } from "./src/content/venues";

const nextConfig: NextConfig = {
  // Dev server bisa dibuka dari perangkat lain di jaringan lokal (HP, tablet) lewat IP 192.168.x.x.
  // Hanya berlaku saat `next dev`; tidak memengaruhi build produksi.
  allowedDevOrigins: ["192.168.*.*"],

  // Jangan cetak argumen Server Function di terminal dev — signIn() menerima password.
  logging: { serverFunctions: false },

  // Upload foto cover sesi lewat Server Action (maks 5 MB + overhead multipart).
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },

  images: {
    // Foto cover sesi yang diupload admin ke Supabase Storage (bucket publik).
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? [new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/**`)]
      : [],
    // Lebar srcset: termasuk 1440 (desain desktop) & 2560 (retina besar) supaya tidak lompat terlalu jauh.
    deviceSizes: [640, 750, 828, 1080, 1200, 1440, 1920, 2560],
    // Sumber sudah WebP; hasil optimasi di-cache setahun (nama file berubah bila gambar diganti).
    minimumCacheTTL: 31_536_000,
  },

  async redirects() {
    return [
      // Ikon tas belanja di navbar → keranjang ada di tab Order member area.
      { source: "/keranjang", destination: "/akun/order", permanent: false },
      // Link lama filter /activity?type=… → halaman per tipe (/activity statis, tidak membaca query).
      ...Object.entries(ACTIVITY_PATHS).map(([type, path]) => ({
        source: "/activity",
        has: [{ type: "query" as const, key: "type", value: type }],
        destination: `/activity/${path}`,
        permanent: false,
      })),
    ];
  },

  // /venue?city=bali dilayani halaman statis per kota (URL tetap ?city=…) — HTML awal sudah
  // terfilter, jadi tidak ada kilasan "semua venue" sebelum JavaScript jalan. beforeFiles: /venue
  // sendiri halaman statis, jadi rewrite harus dicek sebelum file statis itu dilayani.
  async rewrites() {
    return {
      beforeFiles: venueCities.map(({ slug }) => ({
        source: "/venue",
        has: [{ type: "query" as const, key: "city", value: slug }],
        destination: `/venue/kota/${slug}`,
      })),
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
