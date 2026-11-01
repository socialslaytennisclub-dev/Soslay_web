/**
 * Perkecil foto di browser sebelum diupload lewat Server Action. Vercel menolak body request
 * > 4,5 MB (sebelum sampai ke kode kita), padahal foto HP sering 5–10 MB — tanpa ini upload di
 * produksi gagal dengan error jaringan, sedangkan di localhost tetap jalan.
 *
 * Foto yang sudah kecil (≤ `maxBytes` dan sisi terpanjang ≤ `maxEdge`) dikirim apa adanya. Selain
 * itu digambar ulang ke canvas: sisi terpanjang maks `maxEdge`, JPEG kualitas 0.85. Browser yang
 * gagal decode (mis. format aneh) → file asli dikirim; validasi server tetap berlaku.
 */
export async function shrinkImage(file: File, { maxEdge = 2560, maxBytes = 1.5 * 1024 * 1024 }: { maxEdge?: number; maxBytes?: number } = {}): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (file.size <= maxBytes && longest <= maxEdge) return file;

    const scale = Math.min(1, maxEdge / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Latar putih: PNG transparan → JPEG tidak jadi hitam.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
