/**
 * Katalog produk (dummy) — satu sumber untuk homepage, halaman Shop, dan Product detail.
 * Nama & harga mengikuti data contoh di desain admin (Figma 25:6156); struktur mengikuti tabel
 * `products` di PRD. Nanti diganti data dari CMS/API.
 */

import type { PageHeroContent } from "@/components/sections/PageHero/PageHero";

export const productCategories = [
  { slug: "apparel", label: "Apparel" },
  { slug: "racket", label: "Racket" },
] as const;

export type ProductCategory = (typeof productCategories)[number]["slug"];

export type Product = {
  slug: string;
  sku: string;
  name: string;
  category: ProductCategory;
  price: number;
  compareAtPrice?: number;
  image: string;
  /** Crop foto di kartu. */
  imagePosition?: string;
  /** Tampil di section unggulan (homepage & atas halaman Shop). */
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
    image: `${IMG}/home/product-a-piece-of-bali.jpg`,
    imagePosition: "50% 66%",
    featured: true,
    stock: 42,
  },
  {
    slug: "a-piece-of-the-really",
    sku: "SOS-APP-002",
    name: "A Piece of The Really",
    category: "apparel",
    price: 220000,
    compareAtPrice: 250000,
    image: `${IMG}/home/product-a-piece-of-the-really.jpg`,
    imagePosition: "30% 20%",
    featured: true,
    stock: 4,
  },
  {
    slug: "pro-racket-series",
    sku: "SOS-RCK-004",
    name: "Pro Racket Series",
    category: "racket",
    price: 800000,
    image: `${IMG}/products/racket-net-clay.jpg`,
    imagePosition: "20% 30%",
    stock: 3,
  },
  {
    slug: "court-racket-lite",
    sku: "SOS-RCK-005",
    name: "Court Racket Lite",
    category: "racket",
    price: 300000,
    image: `${IMG}/products/racket-black-hand.jpg`,
    imagePosition: "20% 40%",
    stock: 9,
  },
  {
    slug: "blade-green-edition",
    sku: "SOS-RCK-007",
    name: "Blade Green Edition",
    category: "racket",
    price: 950000,
    image: `${IMG}/products/racket-wilson-green.jpg`,
    imagePosition: "50% 20%",
    stock: 6,
  },
  {
    slug: "green-line-racket",
    sku: "SOS-RCK-006",
    name: "Green Line Racket",
    category: "racket",
    price: 650000,
    image: `${IMG}/products/racket-green-paving.jpg`,
    imagePosition: "20% 30%",
    stock: 0,
  },
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
    label: "Pilih Type",
    values: [
      { value: "oversize", label: "Oversize" },
      { value: "regular", label: "Regular" },
    ],
  },
  {
    key: "color",
    label: "Pilih Warna",
    values: [
      { value: "putih", label: "Putih", hex: "#FFFFFF" },
      { value: "charcoal", label: "Charcoal", hex: "#5F5F5F" },
    ],
  },
  {
    key: "size",
    label: "Pilih Ukuran",
    values: ["S", "M", "L", "XL", "XXL"].map((size) => ({ value: size, label: size })),
  },
];

const racketOptions: ProductOptionGroup[] = [
  {
    key: "grip",
    label: "Pilih Grip",
    values: [
      { value: "G2", label: "G2" },
      { value: "G3", label: "G3" },
    ],
  },
];

const apparelDetails = [
  "Cotton combed 24s, 220 gsm — tebal tapi tetap adem untuk main pagi.",
  "Sablon plastisol di bagian belakang, tahan dicuci berulang.",
  "Jahitan rantai di bahu & leher supaya tidak melar.",
];

const racketDetails = [
  "Head size 100 sq in — sweet spot luas, cocok untuk rally panjang.",
  "Berat tanpa senar ±300 g, balance sedikit head-light.",
  "Termasuk cover raket Soslay edisi terbatas.",
];

export const productDetails: Record<string, ProductDetail> = {
  "a-piece-of-bali": {
    description:
      "Kaos edisi Tennis Escape Bali — bunga kamboja ala lapangan tenis di punggung, dibuat untuk member yang ikut sesi di Kintamani. Enak dipakai main, lebih enak lagi dipakai setelahnya.",
    details: apparelDetails,
    material: "100% cotton combed 24s, 220 gsm. Cuci dengan air dingin, jangan disetrika langsung di atas sablon.",
    options: apparelOptions,
    gallery: [
      { src: `${IMG}/home/product-a-piece-of-bali.jpg`, alt: "A Piece of Bali tampak belakang", position: "50% 30%" },
      { src: `${IMG}/home/activity-tennis-escape.jpg`, alt: "Member memakai kaos A Piece of Bali di sesi Tennis Escape", position: "50% 40%" },
    ],
    sizeGuide: true,
  },
  "a-piece-of-the-really": {
    description:
      "Kaos “Beyond the Court” dengan sablon bunga tangan di punggung. Washed charcoal yang makin bagus tiap kali dicuci — buat main, nongkrong, sampai jalan-jalan.",
    details: apparelDetails,
    material: "100% cotton combed 24s, 220 gsm, proses acid wash. Warna bisa sedikit berbeda tiap potong.",
    options: apparelOptions,
    gallery: [
      { src: `${IMG}/home/product-a-piece-of-the-really.jpg`, alt: "A Piece of The Really tampak belakang", position: "50% 25%" },
      { src: `${IMG}/home/community-group.jpg`, alt: "Member Soslay memakai merchandise di lapangan", position: "40% 50%" },
    ],
    sizeGuide: true,
  },
  "pro-racket-series": {
    description: "Raket kontrol untuk pemain intermediate–advanced. Frame kaku, feel solid saat volley di net.",
    details: racketDetails,
    material: "Graphite 100% dengan grommet anti-getar. Senar belum terpasang.",
    options: racketOptions,
    gallery: [{ src: `${IMG}/products/racket-net-clay.jpg`, alt: "Pro Racket Series bersandar di net", position: "30% 40%" }],
  },
  "court-racket-lite": {
    description: "Raket ringan untuk pemula — mudah diayun, memaafkan pukulan yang belum tepat di tengah.",
    details: racketDetails,
    material: "Graphite composite. Termasuk senar terpasang (tension 52 lbs).",
    options: racketOptions,
    gallery: [{ src: `${IMG}/products/racket-black-hand.jpg`, alt: "Court Racket Lite dipegang di tangan", position: "40% 40%" }],
  },
  "blade-green-edition": {
    description: "Edisi hijau untuk yang suka main dengan feel klasik. Fleksibel, presisi, dan jelas mencuri perhatian.",
    details: racketDetails,
    material: "Braided graphite + basalt. Senar belum terpasang.",
    options: racketOptions,
    gallery: [{ src: `${IMG}/products/racket-wilson-green.jpg`, alt: "Blade Green Edition close-up", position: "50% 30%" }],
  },
  "green-line-racket": {
    description: "Raket all-round dengan aksen hijau. Restock berikutnya diumumkan di Instagram kami.",
    details: racketDetails,
    material: "Graphite composite. Senar belum terpasang.",
    options: racketOptions,
    gallery: [{ src: `${IMG}/products/racket-green-paving.jpg`, alt: "Green Line Racket di atas paving", position: "40% 40%" }],
  },
};

/** Tabel panduan ukuran apparel (cm). */
export const sizeGuide = {
  title: "Panduan Ukuran",
  note: "Ukur kaos favoritmu yang paling pas, lalu bandingkan. Toleransi ±1–2 cm.",
  columns: ["Ukuran", "Lebar dada", "Panjang badan"],
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

/** Data siap pakai untuk <ProductCard>. */
export function productCardProps(product: Product) {
  return {
    name: product.name,
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

/** Copy halaman Shop (Figma 25:1346). */
export const productPage = {
  addToBag: "Tambahkan ke Tas Belanja",
  buyNow: "Beli Langsung Sekarang",
  soldOut: "Stok habis",
  added: "Ditambahkan ke tas belanja.",
  /** "Pilih Ukuran" → "Pilih Ukuran dulu ya." */
  chooseFirst: (label: string) => `${label} dulu ya.`,
  loginBanner: { text: "Masuk untuk dapat Slay Point dari setiap pembelian.", cta: "Masuk", href: "/masuk" },
  accordion: { details: "Detail Produk", material: "Material" },
  trust: {
    title: "Belanja dengan rasa aman dan nyaman",
    items: [
      { icon: "truck", title: "Pengiriman cepat", text: "Dikirim lewat JNE & SiCepat, sampai dalam 2–3 hari kerja untuk Jabodetabek dan Bali." },
      { icon: "package", title: "Dikemas rapi", text: "Setiap pesanan dibungkus box Soslay dan diperiksa satu per satu sebelum dikirim." },
      { icon: "shield-check", title: "Pembayaran aman", text: "Bayar dengan QRIS, virtual account, atau e-wallet. Tukar ukuran gratis dalam 7 hari." },
    ],
  },
} as const;

export const shopPage = {
  hero: {
    wordmark: "Shop",
    eyebrow: "Soslay Shop",
    title: "Dari Lapangan ke Keseharian",
    highlight: "Keseharian",
    description:
      "Apparel dan perlengkapan tenis pilihan komunitas Soslay. Dibuat untuk dipakai main — dan dipamerkan sesudahnya.",
    cta: { label: "Lihat koleksi", href: "#koleksi" },
    meta: ["Edisi terbatas", "Dikirim 2–3 hari", "+1 Slay Point / Rp10.000"],
    image: {
      src: "/images/home/hero.jpg",
      alt: "Member Soslay melompat bersama di lapangan tenis",
      position: "50% 60%",
    },
  } satisfies PageHeroContent,
  featured: {
    title: "Beyond the Court.",
    description:
      "Koleksi yang terinspirasi dari permainan, perjalanan, dan orang-orang yang membuat setiap momen di SOSLAY terasa spesial.",
  },
  catalog: {
    title: "Semua Koleksi",
    description: "Apparel, raket, dan perlengkapan pilihan — dikurasi dan dipakai sendiri oleh komunitas.",
    soldOut: "Habis",
    lowStock: "Stok terbatas",
    empty: "Belum ada produk di kategori ini.",
  },
};
