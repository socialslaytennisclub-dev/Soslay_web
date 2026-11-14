import "server-only";
import { headers } from "next/headers";

/**
 * Pembatas percobaan sederhana (jendela tetap, di memori) untuk aksi publik yang memanggil Supabase Auth
 * dari server. Semua panggilan itu datang dari IP server, jadi batas per-IP Supabase tidak membedakan
 * pengunjung — penyerang bisa menghabiskan kuota untuk semua orang. Kunci = IP pengunjung + target.
 * Catatan: per instance server (serverless bisa punya beberapa), jadi ini rem tambahan, bukan jaminan;
 * batas Supabase sendiri tetap berlaku di belakangnya.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/** IP pengunjung dari header proxy (Vercel), cadangan "unknown". */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** true = masih boleh; false = melewati `limit` kali dalam `windowMs` untuk kunci ini. */
export function allowAttempt(key: string, limit: number, windowMs: number, now = Date.now()) {
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}
