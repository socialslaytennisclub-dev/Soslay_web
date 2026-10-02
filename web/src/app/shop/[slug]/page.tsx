import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { ProductDetailSection } from "@/components/product/ProductDetailSection/ProductDetailSection";
import { InstagramFeed } from "@/components/sections/InstagramFeed/InstagramFeed";
import { TrustSection } from "@/components/sections/TrustSection/TrustSection";
import { instagram } from "@/content/home";
import { findProduct, productDetails, productPage, products } from "@/content/products";

/** Semua produk di-prerender saat build. Slug lain → 404. */
export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/shop/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = findProduct(slug);
  if (!product) return {};
  return {
    title: `${product.name} — SOSLAY Shop`,
    description: productDetails[product.slug]?.description,
  };
}

/** Product detail (Figma 25:1603). */
export default async function ProductPage({ params }: PageProps<"/shop/[slug]">) {
  const { slug } = await params;
  const product = findProduct(slug);
  const detail = product && productDetails[product.slug];
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
