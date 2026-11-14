import type { Metadata } from "next";
import { CheckoutShell } from "@/components/checkout/CheckoutParts";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { getCheckoutContext } from "@/server/shop/orders";

export const metadata: Metadata = { title: "Checkout — SOSLAY" };

/**
 * Checkout Shop (Figma UIF-05 langkah 4 · 04a/04b/04c; MOB-05). Di bawah /akun → wajib login
 * (proxy) supaya Slay Point & riwayat pesanan tercatat. Produk dari Keranjang (dicentang) atau Buy Now.
 */
export default async function CheckoutPage() {
  const ctx = await getCheckoutContext();
  return (
    <CheckoutShell
      breadcrumb={[{ label: "Shop", href: "/shop" }, { label: "Keranjang", href: "/akun/order" }, { label: "Checkout" }]}
      back={{ label: "Keranjang", href: "/akun/order" }}
      title="Checkout"
      step={1}
    >
      <CheckoutForm ctx={ctx} />
    </CheckoutShell>
  );
}
