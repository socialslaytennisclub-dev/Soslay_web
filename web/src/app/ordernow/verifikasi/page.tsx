import type { Metadata } from "next";
import { CheckoutShell } from "@/components/checkout/CheckoutParts";
import { OrderNowVerify } from "@/components/checkout/OrderNow/OrderNowVerify";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";

export const metadata: Metadata = { title: "Verifikasi email — SOSLAY", robots: { index: false, follow: false } };

/** Order Now · akun baru: verifikasi email dulu sebelum bayar (link di email → halaman bayar pesanan). */
export default function OrderNowVerifyPage() {
  return (
    <>
      {/* Sign In → kembali ke halaman ini, yang langsung meneruskan ke halaman bayar pesanannya (akun pemesan). */}
      <Navbar variant="solid" compactLogo signInNext="/ordernow/verifikasi" />
      <main>
        <CheckoutShell breadcrumb={[{ label: "Shop", href: "/shop" }, { label: "Order Now", href: "/ordernow" }, { label: "Verifikasi email" }]} back={{ label: "Order Now", href: "/ordernow" }} title="Verifikasi email" step={1}>
          <OrderNowVerify />
        </CheckoutShell>
      </main>
      <Footer />
    </>
  );
}
