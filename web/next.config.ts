import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev server bisa dibuka dari perangkat lain di jaringan lokal (HP, tablet) lewat IP 192.168.x.x.
  // Hanya berlaku saat `next dev`; tidak memengaruhi build produksi.
  allowedDevOrigins: ["192.168.*.*"],

  // Ikon tas belanja di navbar → keranjang ada di tab Order member area.
  async redirects() {
    return [{ source: "/keranjang", destination: "/akun/order", permanent: false }];
  },
};

export default nextConfig;
