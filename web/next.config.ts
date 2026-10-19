import type { NextConfig } from "next";

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

  // Ikon tas belanja di navbar → keranjang ada di tab Order member area.
  async redirects() {
    return [{ source: "/keranjang", destination: "/akun/order", permanent: false }];
  },
};

export default nextConfig;
