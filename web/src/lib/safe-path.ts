/**
 * Path internal saja ("/akun", "/game?x=1") — dipakai untuk `?next=` supaya tidak bisa jadi
 * open redirect ke situs lain ("//evil.com", "/\\evil.com", "https://…"). Karakter kontrol
 * (tab, baris baru) dan backslash ditolak di mana pun: browser membuangnya / menganggapnya "/"
 * saat mem-parsing URL, sehingga "/\t/evil.com" menjadi "//evil.com".
 */
/** `next` bila aman dipakai sebagai tujuan redirect, selain itu `fallback`. */
export function safeNext(next: string | null | undefined, fallback: string) {
  return isInternalPath(next) ? next : fallback;
}

export function isInternalPath(path: string | null | undefined): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !/[\u0000-\u001f\u007f\\]/.test(path);
}
