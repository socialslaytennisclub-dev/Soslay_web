/**
 * Keranjang sementara di localStorage (sebelum ada backend/checkout — lihat PRD FR-SHOP-2).
 * Fungsi murni + event "soslay:cart" supaya komponen lain (badge navbar) ikut ter-update.
 */

export type CartItem = {
  productSlug: string;
  name: string;
  price: number;
  image: string;
  /** Varian terpilih, mis. { type: "oversize", color: "putih", size: "L" }. */
  options: Record<string, string>;
  quantity: number;
};

const STORAGE_KEY = "soslay-cart";
export const CART_EVENT = "soslay:cart";

export function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const items = raw ? (JSON.parse(raw) as CartItem[]) : [];
    // Keranjang lama menyimpan path .jpg/.png — gambar sudah dikonversi ke WebP.
    return items.map((item) => ({ ...item, image: item.image.replace(/\.(jpe?g|png)$/i, ".webp") }));
  } catch {
    return [];
  }
}

function writeCart(items: CartItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage penuh / diblokir (private mode) — keranjang tetap jalan di memori sesi ini
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT));
}

function sameVariant(a: CartItem, b: Omit<CartItem, "quantity">) {
  return a.productSlug === b.productSlug && JSON.stringify(a.options) === JSON.stringify(b.options);
}

/** Tambah item; varian yang sama digabung (quantity bertambah). */
export function addToCart(item: Omit<CartItem, "quantity">, quantity = 1): CartItem[] {
  const items = readCart();
  const existing = items.find((entry) => sameVariant(entry, item));
  const next = existing
    ? items.map((entry) => (entry === existing ? { ...entry, quantity: entry.quantity + quantity } : entry))
    : [...items, { ...item, quantity }];
  writeCart(next);
  return next;
}

/** Kunci unik satu baris keranjang (produk + varian). */
export function cartItemKey(item: Pick<CartItem, "productSlug" | "options">): string {
  return `${item.productSlug}:${JSON.stringify(item.options)}`;
}

/** Ubah jumlah satu baris; quantity < 1 → baris dihapus. */
export function setCartQuantity(key: string, quantity: number): CartItem[] {
  const next = readCart()
    .map((item) => (cartItemKey(item) === key ? { ...item, quantity } : item))
    .filter((item) => item.quantity > 0);
  writeCart(next);
  return next;
}

export function removeFromCart(keys: string[]): CartItem[] {
  const next = readCart().filter((item) => !keys.includes(cartItemKey(item)));
  writeCart(next);
  return next;
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0);
}
