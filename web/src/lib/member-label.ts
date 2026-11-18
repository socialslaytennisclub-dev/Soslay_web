import { normalizeHandle } from "./text";

/**
 * Label + inisial member di galeri. Label: "Rizky (@kiu.kiu)" bila ada Instagram, "Rizky" bila tidak;
 * tanpa nama → "@kiu.kiu"; tanpa keduanya → "Member". IG berupa link/"@" ikut dirapikan.
 * Inisial 1 huruf (avatar bertumpuk kecil): dari nama, kalau kosong dari username Instagram.
 */
export function memberTag(name: string | null | undefined, instagram?: string | null): { label: string; initial: string } {
  const n = name?.trim() ?? "";
  const ig = normalizeHandle(instagram ?? "");
  return {
    label: n && ig ? `${n} (${ig})` : n || ig || "Member",
    initial: (n || ig.slice(1) || "M").charAt(0).toUpperCase(),
  };
}
