/**
 * Copy halaman Masuk & Daftar. Daftar = Figma 25:1850 ("Desktop - 30");
 * Masuk belum ada di Figma → memakai layout & gaya yang sama.
 * Placeholder lorem ipsum di Figma diganti copy final.
 */

export const authBackground = {
  src: "/images/auth/auth-bg.webp",
  alt: "Member Soslay berfoto bersama di lapangan tenis",
};

export const loginPage = {
  title: "Selamat datang kembali di Social Slay",
  description: "Masuk untuk lihat jadwal sesi, kartu member, Slay Point, dan pesanan kamu.",
  submit: "Masuk",
  remember: "Ingat saya",
  forgot: { label: "Lupa password?", href: "/lupa-password" },
  switch: { prompt: "Belum jadi member?", label: "Daftar sekarang", href: "/daftar" },
};

export const registerPage = {
  title: "Gabung jadi member Social Slay Tennis Club",
  description:
    "Satu akun untuk booking sesi, kumpulkan Slay Point, dan temukan foto kamu dari setiap mabar.",
  consent: "Saya setuju dengan Syarat & Ketentuan serta Kebijakan Privasi Soslay",
  submit: "Daftar Sekarang",
  switch: { prompt: "Sudah punya akun?", label: "Masuk", href: "/masuk" },
};

/** Tujuan setelah berhasil masuk / daftar. */
export const AFTER_AUTH = "/akun";
