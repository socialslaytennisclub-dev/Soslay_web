/**
 * Path internal saja ("/akun", "/game?x=1") — dipakai untuk `?next=` supaya tidak bisa jadi
 * open redirect ke situs lain ("//evil.com", "/\\evil.com", "https://…").
 */
export function isInternalPath(path: string | null | undefined): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}
