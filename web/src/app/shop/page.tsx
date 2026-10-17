import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { InstagramFeed } from "@/components/sections/InstagramFeed/InstagramFeed";
import { Marquee } from "@/components/sections/Marquee/Marquee";
import { PageHero } from "@/components/sections/PageHero/PageHero";
import { ShopCategorySection } from "@/components/shop/ShopCategorySection/ShopCategorySection";
import { instagram } from "@/content/home";
import { productCategories, shopPage } from "@/content/products";
import { getShopCatalog } from "@/server/public/products";

export const metadata: Metadata = {
  title: "Shop — SOSLAY",
  description: "From the court to every day — apparel and accessories picked by the Soslay community.",
};

/**
 * Halaman Shop (Figma Website v2 347:2044): hero · satu section per kategori (urutan
 * productCategories, kategori kosong disembunyikan) · marquee · Best Seller · Instagram.
 */
export default async function ShopPage() {
  const { products, details } = await getShopCatalog();
  const sections = productCategories
    .map((category) => ({ ...category, products: products.filter((p) => p.category === category.slug) }))
    .filter((section) => section.products.length > 0);
  const bestSellers = products.filter((product) => product.featured);

  return (
    <>
      <Navbar variant="overlay" />
      <MotionProvider>
        <main>
          <PageHero id="shop-hero-title" {...shopPage.hero} />
          <div id="koleksi">
            {sections.map((section) => (
              <ShopCategorySection key={section.slug} id={`shop-${section.slug}`} title={section.label} description={section.description} products={section.products} details={details} />
            ))}
          </div>
          <Marquee />
          {bestSellers.length > 0 && (
            <ShopCategorySection id="best-seller" layout="carousel" products={bestSellers} details={details} {...shopPage.bestSeller} />
          )}
          <InstagramFeed {...instagram} />
        </main>
        <Footer />
      </MotionProvider>
    </>
  );
}
