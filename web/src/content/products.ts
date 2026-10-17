/**
 * Katalog produk (dummy) — satu sumber untuk homepage, halaman Shop, dan Product detail.
 * Nama & harga mengikuti data contoh di desain admin (Figma 25:6156); struktur mengikuti tabel
 * `products` di PRD. Nanti diganti data dari CMS/API.
 */

import type { PageHeroContent } from "@/components/sections/PageHero/PageHero";

/** Urutan = urutan section di halaman Shop (Figma Website v2 347:2044). */
export const productCategories = [
  { slug: "apparel", label: "T-Shirt", description: "Tees made for the court and beyond. Breathable, easy to style, and inspired by the places we play." },
  { slug: "socks", label: "Socks", description: "Comfy crew socks in 100% cotton. The finishing touch for a clean, all-white tennis look." },
  { slug: "pin", label: "Enamel Pin", description: "Collectible pins from every Soslay series. Clip them on your bag, cap, or jacket to show off the rallies you've been part of." },
  { slug: "figure", label: "Custom Figure", description: "Mini collectible figures of the Slayers. A playful keepsake for your desk, shelf, or racket bag." },
  { slug: "racket", label: "Racket", description: "Rackets picked and played by the community — from control frames to easy-swinging lites." },
  { slug: "accessory", label: "Accessory", description: "The little extras that complete your kit." },
] as const;

export type ProductCategory = (typeof productCategories)[number]["slug"];

export type Product = {
  slug: string;
  sku: string;
  name: string;
  /** Baris kecil di kartu, mis. "Oversized fit T-shirt". */
  subtitle?: string;
  category: ProductCategory;
  price: number;
  compareAtPrice?: number;
  image: string;
  /** Crop foto di kartu. */
  imagePosition?: string;
  /** Best Seller di Shop & produk unggulan homepage. */
  featured?: boolean;
  /** 0 = habis. */
  stock: number;
};

const IMG = "/images";

export const products: Product[] = [
  {
    slug: "a-piece-of-bali",
    sku: "SOS-APP-001",
    name: "A Piece of Bali",
    category: "apparel",
    price: 220000,
    compareAtPrice: 250000,
    image: `${IMG}/home/product-a-piece-of-bali.webp`,
    imagePosition: "50% 66%",
    stock: 42,
  },
  {
    slug: "a-piece-of-the-really",
    sku: "SOS-APP-002",
    name: "A Piece of The Really",
    category: "apparel",
    price: 220000,
    compareAtPrice: 250000,
    image: `${IMG}/home/product-a-piece-of-the-really.webp`,
    imagePosition: "30% 20%",
    stock: 4,
  },
  {
    slug: "pro-racket-series",
    sku: "SOS-RCK-004",
    name: "Pro Racket Series",
    category: "racket",
    price: 800000,
    image: `${IMG}/products/racket-net-clay.webp`,
    imagePosition: "20% 30%",
    stock: 3,
  },
  {
    slug: "court-racket-lite",
    sku: "SOS-RCK-005",
    name: "Court Racket Lite",
    category: "racket",
    price: 300000,
    image: `${IMG}/products/racket-black-hand.webp`,
    imagePosition: "20% 40%",
    stock: 9,
  },
  {
    slug: "blade-green-edition",
    sku: "SOS-RCK-007",
    name: "Blade Green Edition",
    category: "racket",
    price: 950000,
    image: `${IMG}/products/racket-wilson-green.webp`,
    imagePosition: "50% 20%",
    stock: 6,
  },
  {
    slug: "green-line-racket",
    sku: "SOS-RCK-006",
    name: "Green Line Racket",
    category: "racket",
    price: 650000,
    image: `${IMG}/products/racket-green-paving.webp`,
    imagePosition: "20% 30%",
    stock: 0,
  },
  ...([
    ["destination-series-bali-white", "SOS-APP-010", "Destination Series 01: Bali — White", "apparel", "Oversized fit T-shirt", 220000, 280000, false],
    ["love-game-black-washed", "SOS-APP-011", "Love Game — Black Washed", "apparel", "Relaxed semi-oversized fit T-shirt", 250000, 300000, false],
    ["rally-in-paradise-white", "SOS-APP-012", "Rally in Paradise — White", "apparel", "Regular fit T-shirt", 200000, 250000, true],
    ["destination-series-bali-black", "SOS-APP-013", "Destination Series 01: Bali — Black", "apparel", "Oversized fit T-shirt", 220000, 280000, true],
    ["beyond-the-court-black", "SOS-APP-014", "Beyond the Court — Black", "apparel", "Relaxed semi-oversized fit T-shirt", 200000, 280000, false],
    ["slay-socks-white", "SOS-SCK-001", "Slay Socks — White", "socks", "Crew socks · 100% cotton", 80000, undefined, false],
    ["pin-destination-series-lime", "SOS-PIN-001", "Destination Series — Lime", "pin", "Collectible enamel pin", 70000, undefined, false],
    ["pin-destination-series-navy", "SOS-PIN-002", "Destination Series — Navy", "pin", "Collectible enamel pin", 70000, undefined, false],
    ["pin-love-game", "SOS-PIN-003", "Love Game Series", "pin", "Collectible enamel pin", 70000, undefined, false],
    ["pin-beyond-the-court", "SOS-PIN-004", "Beyond the Court", "pin", "Collectible enamel pin", 70000, undefined, true],
    ["pin-rally-in-paradise", "SOS-PIN-005", "Rally in Paradise", "pin", "Collectible enamel pin", 70000, undefined, false],
    ["mini-slayers-figure", "SOS-FIG-001", "Mini Slayers Figure", "figure", "Collectible mini figure", 220000, undefined, true],
  ] as const).map(([slug, sku, name, category, subtitle, price, compareAtPrice, featured]): Product => ({
    slug,
    sku,
    name,
    subtitle,
    category,
    price,
    compareAtPrice,
    image: `${IMG}/products/${slug}.webp`,
    imagePosition: "50% 50%",
    featured,
    stock: 10,
  })),
];

export type ProductOptionGroup = {
  /** Kunci yang disimpan di keranjang, mis. "type" | "color" | "size" | "grip". */
  key: string;
  label: string;
  values: { value: string; label: string; hex?: string }[];
};

export type ProductDetail = {
  description: string;
  /** Poin untuk accordion "Detail Produk". */
  details: string[];
  material: string;
  /** Grup pilihan varian, urut sesuai tampilan (Figma: Type → Warna → Ukuran). */
  options: ProductOptionGroup[];
  /** Foto galeri (foto utama = index 0). */
  gallery: { src: string; alt: string; position?: string }[];
  /** Tampilkan link "Panduan Ukuran". */
  sizeGuide?: boolean;
};

const apparelOptions: ProductOptionGroup[] = [
  {
    key: "type",
    label: "Select Type",
    values: [
      { value: "oversize", label: "Oversize" },
      { value: "regular", label: "Regular" },
    ],
  },
  {
    key: "color",
    label: "Select Color",
    values: [
      { value: "putih", label: "White", hex: "#FFFFFF" },
      { value: "charcoal", label: "Charcoal", hex: "#5F5F5F" },
    ],
  },
  {
    key: "size",
    label: "Select Size",
    values: ["S", "M", "L", "XL", "XXL"].map((size) => ({ value: size, label: size })),
  },
];

const racketOptions: ProductOptionGroup[] = [
  {
    key: "grip",
    label: "Select Grip",
    values: [
      { value: "G2", label: "G2" },
      { value: "G3", label: "G3" },
    ],
  },
];

const apparelDetails = [
  "Combed cotton 24s, 220 gsm — thick yet breathable for morning sessions.",
  "Plastisol print on the back that holds up wash after wash.",
  "Chain-stitched shoulders & collar so it keeps its shape.",
];

const racketDetails = [
  "100 sq in head — a generous sweet spot for long rallies.",
  "±300 g unstrung, slightly head-light balance.",
  "Comes with a limited-edition Soslay racket cover.",
];

export const productDetails: Record<string, ProductDetail> = {
  "a-piece-of-bali": {
    description:
      "The Tennis Escape Bali tee — a tennis-court frangipani on the back, made for members who joined the Kintamani sessions. Great to play in, even better afterwards.",
    details: apparelDetails,
    material: "100% combed cotton 24s, 220 gsm. Wash cold and don't iron directly on the print.",
    options: apparelOptions,
    gallery: [
      { src: `${IMG}/home/product-a-piece-of-bali.webp`, alt: "A Piece of Bali, back view", position: "50% 30%" },
      { src: `${IMG}/home/activity-tennis-escape.webp`, alt: "A member wearing A Piece of Bali at a Tennis Escape session", position: "50% 40%" },
    ],
    sizeGuide: true,
  },
  "a-piece-of-the-really": {
    description:
      "The “Beyond the Court” tee with a hand-drawn flower print on the back. Washed charcoal that gets better with every wash — for playing, hanging out, and travelling.",
    details: apparelDetails,
    material: "100% combed cotton 24s, 220 gsm, acid-washed. Color may vary slightly per piece.",
    options: apparelOptions,
    gallery: [
      { src: `${IMG}/home/product-a-piece-of-the-really.webp`, alt: "A Piece of The Really, back view", position: "50% 25%" },
      { src: `${IMG}/home/community-group.webp`, alt: "Soslay members wearing merch on court", position: "40% 50%" },
    ],
    sizeGuide: true,
  },
  "pro-racket-series": {
    description: "A control racket for intermediate–advanced players. Stiff frame, solid feel on net volleys.",
    details: racketDetails,
    material: "100% graphite with anti-vibration grommets. Sold unstrung.",
    options: racketOptions,
    gallery: [{ src: `${IMG}/products/racket-net-clay.webp`, alt: "Pro Racket Series leaning on the net", position: "30% 40%" }],
  },
  "court-racket-lite": {
    description: "A light racket for beginners — easy to swing and forgiving on off-center hits.",
    details: racketDetails,
    material: "Graphite composite. Comes strung (52 lbs tension).",
    options: racketOptions,
    gallery: [{ src: `${IMG}/products/racket-black-hand.webp`, alt: "Court Racket Lite held in hand", position: "40% 40%" }],
  },
  "blade-green-edition": {
    description: "A green edition for players who love a classic feel. Flexible, precise, and an obvious head-turner.",
    details: racketDetails,
    material: "Braided graphite + basalt. Sold unstrung.",
    options: racketOptions,
    gallery: [{ src: `${IMG}/products/racket-wilson-green.webp`, alt: "Blade Green Edition close-up", position: "50% 30%" }],
  },
  "green-line-racket": {
    description: "An all-round racket with green accents. The next restock will be announced on our Instagram.",
    details: racketDetails,
    material: "Graphite composite. Sold unstrung.",
    options: racketOptions,
    gallery: [{ src: `${IMG}/products/racket-green-paving.webp`, alt: "Green Line Racket on paving", position: "40% 40%" }],
  },
};

/** Tabel panduan ukuran apparel (cm). */
export const sizeGuide = {
  title: "Size Guide",
  note: "Measure your best-fitting tee and compare. Tolerance ±1–2 cm.",
  columns: ["Size", "Chest width", "Body length"],
  rows: [
    ["S", "50", "68"],
    ["M", "53", "71"],
    ["L", "56", "74"],
    ["XL", "59", "76"],
    ["XXL", "62", "78"],
  ],
};

/** Stok ≤ 5 dianggap menipis (aturan yang sama dengan admin). */
export const LOW_STOCK = 5;

export function productHref(product: Product): string {
  return `/shop/${product.slug}`;
}

export function findProduct(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}

/**
 * Varian tersimpan di keranjang ({ color: "putih", size: "L" }) → label tampilan.
 * Warna jadi swatch, grup lain jadi chip (urut sesuai grup produk).
 */
export function describeVariant(slug: string, selection: Record<string, string>) {
  const groups = productDetails[slug]?.options ?? [];
  let color: { label: string; hex: string } | undefined;
  const chips: string[] = [];

  for (const group of groups) {
    const option = group.values.find((value) => value.value === selection[group.key]);
    if (!option) continue;
    if (option.hex) color = { label: option.label, hex: option.hex };
    else chips.push(option.label);
  }

  return { color, chips };
}

export function featuredProducts(): Product[] {
  return products.filter((product) => product.featured);
}

/**
 * Data siap pakai untuk <ProductCard>. `detail` (opsional) → tombol tas di kartu:
 * semua grup satu nilai (pin, figure) → langsung masuk tas; tepat satu grup dengan banyak nilai
 * (ukuran kaos) → pilih di kartu; lebih dari itu → tombol membuka halaman produk.
 */
export function productCardProps(product: Product, detail?: ProductDetail) {
  const groups = detail?.options ?? [];
  const multi = groups.filter((group) => group.values.length > 1);
  const quickAdd =
    detail && multi.length <= 1
      ? {
          fixed: Object.fromEntries(groups.filter((group) => group.values.length === 1).map((group) => [group.key, group.values[0].value])),
          choice: multi[0] && { key: multi[0].key, label: multi[0].label, values: multi[0].values.map((v) => v.value) },
        }
      : undefined;
  return {
    slug: product.slug,
    quickAdd,
    featured: product.featured,
    name: product.name,
    subtitle: product.subtitle,
    href: productHref(product),
    image: product.image,
    imagePosition: product.imagePosition,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    stock: product.stock === 0 ? ("sold-out" as const) : product.stock <= LOW_STOCK ? ("low" as const) : undefined,
  };
}

export function isProductCategory(value: unknown): value is ProductCategory {
  return productCategories.some((category) => category.slug === value);
}

/** Copy Product detail (Figma Website v2 375:2522). */
export const productPage = {
  addToBag: "Add to Bag",
  buyNow: "Buy Now",
  soldOut: "Sold out",
  added: "Added to your bag.",
  /** "Select Size" → "Select Size first." */
  chooseFirst: (label: string) => `${label} first.`,
  loginBanner: { text: "Sign in to earn Slay Points on this purchase.", cta: "Sign In", href: "/masuk" },
  accordion: {
    details: "Product Details",
    material: "Material",
    /** Tampil bila material belum diisi di admin Products. */
    materialEmpty: { text: "Material & care details are coming soon. Have a question?", cta: "Chat with us on WhatsApp" },
  },
  trust: {
    title: "Shop with peace of mind",
    items: [
      { icon: "truck", title: "Fast, tracked shipping", text: "Orders ship within 2–3 business days with a tracking number, so you always know where your package is." },
      { icon: "package", title: "Easy size exchange", text: "Wrong size? Exchange it within 7 days of delivery, as long as it's unworn and the tags are still attached." },
      { icon: "shield-check", title: "Secure checkout", text: "Pay safely through trusted payment partners — from bank transfer to e-wallets and cards." },
    ],
  },
} as const;

/** Copy halaman Shop (Figma Website v2 347:2044). */
export const shopPage = {
  hero: {
    wordmark: "Shop",
    eyebrow: "Soslay Shop",
    title: "From the Court to Every Day",
    highlight: "Every Day",
    description: "Apparel and accessories picked by the Soslay community. Made to play in and to show off afterwards.",
    cta: { label: "Shop the collection", href: "#koleksi" },
    meta: ["Limited edition", "Ships in 2–3 days", "+1 Slay Point per Rp10,000"],
    image: {
      src: "/images/shop/shop-hero.webp",
      alt: "Soslay tees laid out on a tennis court",
      position: "50% 50%",
    },
  } satisfies PageHeroContent,
  bestSeller: {
    title: "Best Seller",
    description: "Community favorites — the pieces that keep selling out and keep showing up on court.",
  },
  empty: "New drops are on the way — check back soon.",
};
