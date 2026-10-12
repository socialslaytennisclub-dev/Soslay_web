import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { ProductDetailSection } from "@/components/product/ProductDetailSection/ProductDetailSection";
import { InstagramFeed } from "@/components/sections/InstagramFeed/InstagramFeed";
import { TrustSection } from "@/components/sections/TrustSection/TrustSection";
import { instagram } from "@/content/home";
import { productPage } from "@/content/products";
import { getShopCatalog } from "@/server/public/products";

/** Produk aktif di-prerender saat build; produk baru dari admin dirender saat pertama dibuka. */
export async function generateStaticParams() {
  const { products } = await getShopCatalog();
  return products.map((product) => ({ slug: product.slug }));
}

/** Harga & stok bisa berubah dari admin → render ulang paling lambat tiap 10 menit (dan saat admin menyimpan). */
export const revalidate = 600;

async function findShopProduct(slug: string) {
  const { products, details } = await getShopCatalog();
  const product = products.find((p) => p.slug === slug);
  return { product, detail: product ? details[product.slug] : undefined };
}

export async function generateMetadata({ params }: PageProps<"/shop/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { product, detail } = await findShopProduct(slug);
  if (!product) return {};
  return {
    title: `${product.name} — SOSLAY Shop`,
    description: detail?.description,
  };
}

/** Product detail (Figma 25:1603). */
export default async function ProductPage({ params }: PageProps<"/shop/[slug]">) {
  const { slug } = await params;
  const { product, detail } = await findShopProduct(slug);
  if (!product || !detail) notFound();

  return (
    <>
      <Navbar variant="solid" />
      <MotionProvider>
        <main>
          <ProductDetailSection product={product} detail={detail} />
          <TrustSection {...productPage.trust} />
          <InstagramFeed {...instagram} />
        </main>
        <Footer />
      </MotionProvider>
    </>
  );
}
