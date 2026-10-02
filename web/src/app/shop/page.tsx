import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { InstagramFeed } from "@/components/sections/InstagramFeed/InstagramFeed";
import { Marquee } from "@/components/sections/Marquee/Marquee";
import { PageHero } from "@/components/sections/PageHero/PageHero";
import { ShopCatalog } from "@/components/shop/ShopCatalog/ShopCatalog";
import { ShopFeatured } from "@/components/shop/ShopFeatured/ShopFeatured";
import { instagram } from "@/content/home";
import { isProductCategory, products, shopPage } from "@/content/products";

export const metadata: Metadata = {
  title: "Shop — SOSLAY",
  description: "Beyond the Court — apparel dan perlengkapan tenis pilihan komunitas Soslay.",
};

/** Halaman Shop (Figma 25:1346). Filter kategori lewat ?category=apparel | racket. */
export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const { category } = await searchParams;
  const activeCategory = isProductCategory(category) ? category : undefined;
  const catalog = activeCategory ? products.filter((product) => product.category === activeCategory) : products;

  return (
    <>
      <Navbar variant="overlay" />
      <MotionProvider>
        <main>
          <PageHero id="shop-hero-title" {...shopPage.hero} />
          <ShopFeatured />
          <Marquee />
          <ShopCatalog products={catalog} activeCategory={activeCategory} />
          <InstagramFeed {...instagram} />
        </main>
        <Footer />
      </MotionProvider>
    </>
  );
}
