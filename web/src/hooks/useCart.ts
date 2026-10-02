"use client";

import { useCallback, useSyncExternalStore } from "react";
import { addToCart, CART_EVENT, cartCount, readCart, removeFromCart, setCartQuantity, type CartItem } from "@/lib/cart";

function subscribe(onChange: () => void) {
  // CART_EVENT: perubahan di tab ini · storage: perubahan dari tab lain
  window.addEventListener(CART_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CART_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Snapshot berupa string supaya useSyncExternalStore bisa membandingkan dengan aman.
const getSnapshot = () => JSON.stringify(readCart());
const getServerSnapshot = () => "[]";

const noopSubscribe = () => () => {};

/** Keranjang + jumlah item, tersinkron antar komponen & tab. Hydrated = snapshot localStorage sudah terbaca. */
export function useCart() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const items = JSON.parse(snapshot) as CartItem[];
  // false saat render server & hidrasi → UI bisa menahan "keranjang kosong" sampai localStorage terbaca.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const add = useCallback((item: Omit<CartItem, "quantity">, quantity = 1) => addToCart(item, quantity), []);

  const setQuantity = useCallback((key: string, quantity: number) => setCartQuantity(key, quantity), []);
  const remove = useCallback((keys: string[]) => removeFromCart(keys), []);

  return { items, count: cartCount(items), hydrated, add, setQuantity, remove };
}
