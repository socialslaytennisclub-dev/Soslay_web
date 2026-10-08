import placeholders from "./image-placeholders.json";

const blurMap: Record<string, string> = placeholders;

/**
 * Blur placeholder untuk foto di public/images (dibuat oleh scripts/optimize-images.mjs).
 * Pemakaian: <Image src={src} {...blurProps(src)} /> — foto muncul halus dari versi blur, bukan kotak kosong.
 */
export function blurProps(src: string): { placeholder?: "blur"; blurDataURL?: string } {
  const blurDataURL = blurMap[src];
  return blurDataURL ? { placeholder: "blur", blurDataURL } : {};
}
