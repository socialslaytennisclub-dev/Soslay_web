/** Bagi array menjadi dua kolom: separuh pertama (dibulatkan ke atas) dan sisanya. */
export function splitInHalf<T>(items: readonly T[]): [T[], T[]] {
  const middle = Math.ceil(items.length / 2);
  return [items.slice(0, middle), items.slice(middle)];
}
