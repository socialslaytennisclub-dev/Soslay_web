/**
 * Import activity dari file peserta Kuyy: tebakan isian awal form dari judul event (baris 1 file)
 * & nama file. Semua tebakan bisa diubah admin sebelum Import — jam tidak ada di file, selalu diisi admin.
 */

/** Awalan nama file "261122 …" (YYMMDD, cara admin menamai export Kuyy) → "2026-11-22"; selain itu "". */
export function dateFromFileName(name: string): string {
  const m = name.match(/^(\d{2})(\d{2})(\d{2})(?!\d)/);
  if (!m) return "";
  const iso = `20${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : "";
}

/** Kata umum di nama venue ("Tennis Court", "Club") tidak dipakai untuk mencocokkan. */
const GENERIC = new Set(["the", "tennis", "court", "courts", "club", "lapangan", "di", "and"]);
const words = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w.length > 1 && !GENERIC.has(w));

/**
 * Venue yang paling banyak berbagi kata khas dengan `text` — minimal separuh kata dari yang lebih pendek
 * ("The Raquette Temple (TRT) Sunter" ↔ "Racquette Temple Sunter"). null = tidak ada yang cukup mirip.
 */
export function matchVenue(text: string, venues: string[]): string | null {
  const want = new Set(words(text));
  if (!want.size) return null;
  let best: { name: string; score: number } | null = null;
  for (const name of venues) {
    const own = words(name);
    if (!own.length) continue;
    const score = own.filter((w) => want.has(w)).length / Math.min(own.length, want.size);
    if (score >= 0.5 && (!best || score > best.score)) best = { name, score };
  }
  return best?.name ?? null;
}

/** Venue dari teks di dalam […] judul ("MABAR SORE [COMMON GROUNDS MENTENG]"). */
export function venueFromTitle(title: string, venues: string[]): string | null {
  const tag = title.match(/\[([^\]]+)\]/)?.[1];
  return tag ? matchVenue(tag, venues) : null;
}

/** Tipe activity dari kata di judul; selain yang dikenali → Mabar (activity Kuyy paling umum). */
export function typeFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (/coach|clinic|kelas|lesson/.test(t)) return "beginner-coaching";
  if (/escape/.test(t)) return "tennis-escape";
  if (/social|brunch|party/.test(t)) return "social";
  if (/match ?day|tournament|turnamen|event/.test(t)) return "match-day";
  return "weekly-mabar";
}

/** Harga tiket yang paling sering muncul (Pass Revenue, kalau kosong Total bayar) di baris yang diimpor. */
export function usualPrice(rows: { ticketPrice: number; amount: number; skipReason: string | null }[]): number {
  const count = new Map<number, number>();
  for (const r of rows) {
    const price = r.ticketPrice || r.amount;
    if (!r.skipReason && price > 0) count.set(price, (count.get(price) ?? 0) + 1);
  }
  let best = 0;
  let most = 0;
  for (const [price, n] of count) if (n > most) [best, most] = [price, n];
  return best;
}

/** Data event dari halaman Kuyy yang dikirim tombol bookmark "Kirim ke Slay Club" (dibaca di browser admin). */
export type KuyEvent = {
  url: string;
  title: string;
  /** ISO (UTC) dari data terstruktur halaman Kuyy. */
  start: string;
  end: string;
  venue: string;
  price: number;
  quota: number;
  description: string;
};

/** Hash URL halaman Import activity yang membawa data event: "#kuy=<JSON>". */
export const KUY_EVENT_HASH = "kuy=";

/**
 * Kode tombol bookmark: dijalankan admin di halaman event Kuyy yang sedang dia buka. Membaca data terstruktur
 * halaman (schema.org Event: judul, jadwal, venue, harga) + kuota & deskripsi dari teks halaman, lalu membuka
 * form Import activity dengan data itu di hash URL (tidak terkirim ke server). Server Slay Club sendiri
 * tidak bisa membuka kuyy.id (diblokir), jadi pembacaan memang harus dari browser admin.
 */
export function kuyBookmarklet(origin: string): string {
  const code = `(()=>{try{var d=document,e=[].slice.call(d.querySelectorAll('script[type="application/ld+json"]')).map(function(s){try{return JSON.parse(s.textContent)}catch(x){return null}}).filter(function(x){return x&&x["@type"]==="Event"})[0];if(!/kuyy\\./.test(location.hostname)||!e){alert("Buka halaman event di Kuyy dulu, lalu klik tombol ini.");return}var t=d.body.innerText,q=t.match(/kuota (\\d+) peserta/i),a=t.indexOf("\\nDeskripsi\\n"),b=a<0?-1:t.indexOf("\\nDiselenggarakan oleh",a),o=e.offers||{},l=e.location||{},p={url:e.url||location.href.split("#")[0],title:e.name||"",start:e.startDate||"",end:e.endDate||"",venue:l.name||"",price:Number(o.price)||0,quota:q?Number(q[1]):0,description:(a<0?e.description||"":t.slice(a+11,b<0?void 0:b)).trim()};window.open(${JSON.stringify(origin)}+"/admin/activities/import#${KUY_EVENT_HASH}"+encodeURIComponent(JSON.stringify(p)),"_blank")}catch(x){alert("Gagal membaca halaman Kuyy: "+x.message)}})()`;
  return `javascript:${encodeURIComponent(code)}`;
}

/** Data event dari hash "#kuy=…" (null bila tidak ada / tidak valid). */
export function readKuyEventHash(hash: string): KuyEvent | null {
  const at = hash.indexOf(KUY_EVENT_HASH);
  if (at < 0) return null;
  try {
    const raw: unknown = JSON.parse(decodeURIComponent(hash.slice(at + KUY_EVENT_HASH.length)));
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
    const num = (k: string) => (typeof r[k] === "number" && Number.isFinite(r[k]) && (r[k] as number) >= 0 ? Math.round(r[k] as number) : 0);
    const event = { url: str("url"), title: str("title"), start: str("start"), end: str("end"), venue: str("venue"), price: num("price"), quota: num("quota"), description: str("description") };
    return event.title || event.start ? event : null;
  } catch {
    return null;
  }
}

const wibDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
const wibTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** ISO → tanggal & jam WIB untuk form ("2026-12-06", "14:00"); kosong bila tidak valid. */
export function wibParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? { date: "", time: "" } : { date: wibDate.format(d), time: wibTime.format(d) };
}
