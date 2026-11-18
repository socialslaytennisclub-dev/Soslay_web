import { normalizeHandle } from "./community-posts";

/**
 * Label member di galeri: "Rizky (@kiu.kiu)" bila ada Instagram, "Rizky" bila tidak.
 * Tanpa nama → "@kiu.kiu"; tanpa keduanya → "Member". IG berupa link/"@" ikut dirapikan.
 */
export function memberLabel(name: string | null | undefined, instagram?: string | null): string {
  const n = name?.trim() ?? "";
  const ig = normalizeHandle(instagram ?? "");
  if (n && ig) return `${n} (${ig})`;
  return n || ig || "Member";
}

/** Huruf inisial avatar: dari nama, kalau kosong dari username Instagram. */
export function memberInitial(name: string | null | undefined, instagram?: string | null): string {
  const source = name?.trim() || normalizeHandle(instagram ?? "").slice(1) || "M";
  return source.charAt(0).toUpperCase();
}
