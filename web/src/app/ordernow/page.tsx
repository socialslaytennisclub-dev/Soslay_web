import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CheckoutShell } from "@/components/checkout/CheckoutParts";
import { OrderNowForm } from "@/components/checkout/OrderNow/OrderNowForm";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { getShopCatalog } from "@/server/public/products";
import { DEMO_MEMBER_COOKIE } from "@/lib/demo-member";
import { getCheckoutContext } from "@/server/shop/orders";

export const metadata: Metadata = {
  title: "Order Now — SOSLAY",
  // Halaman khusus link (bio IG, broadcast WA, QR) — tidak di navigasi & tidak diindeks.
  robots: { index: false, follow: false },
};

/**
 * Order Now: pilih produk, daftar akun (bila belum login) & buat pesanan dalam satu halaman.
 * ?produk=SLUG → produk itu langsung terbuka (link per produk dari Admin Products).
 */
export default async function OrderNowPage({ searchParams }: PageProps<"/ordernow">) {
  const raw = (await searchParams).produk;
  const initial = typeof raw === "string" ? raw : undefined;
  const [base, catalog, jar] = await Promise.all([getCheckoutContext(), getShopCatalog(), cookies()]);
  // Mode demo: tamu sampai "Masuk" demo (cookie) — supaya form akun Order Now bisa dicoba lokal.
  const loggedIn = base.demo ? jar.has(DEMO_MEMBER_COOKIE) : base.loggedIn;
  // Tamu: alamat kosong (bukan alamat contoh demo).
  const ctx = loggedIn ? base : { ...base, loggedIn, recipient: { name: "", phone: "", address: "", city: "", postalCode: "" }, pin: null };
  const products = catalog.products.map((p) => ({ slug: p.slug, name: p.name, price: p.price, image: p.image, stock: p.stock, options: catalog.details[p.slug]?.options ?? [] }));
  const here = `/ordernow${initial ? `?produk=${encodeURIComponent(initial)}` : ""}`;
  return (
    <>
      <Navbar variant="solid" compactLogo signInNext={here} />
      <main>
        <CheckoutShell
          breadcrumb={[{ label: "Shop", href: "/shop" }, { label: "Order Now" }]}
          back={{ label: "Shop", href: "/shop" }}
          title="Order Now"
          subtitle={ctx.loggedIn ? "Pilih produk, atur pengiriman, lalu bayar." : "Pilih produk, isi data akun & pengiriman — pesanan langsung dibuat."}
          step={1}
        >
          <OrderNowForm ctx={ctx} products={products} initial={initial} loginHref={`/masuk?next=${encodeURIComponent(here)}`} />
        </CheckoutShell>
      </main>
      <Footer />
    </>
  );
}
