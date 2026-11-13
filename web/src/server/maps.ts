"use server";

/**
 * Link Google Maps → koordinat, tanpa API key. Link pendek (maps.app.goo.gl, goo.gl, share.google, g.co)
 * dibuka di server dan redirect-nya diikuti manual (hanya ke domain Google) sampai ketemu link yang memuat
 * titik: …!3d<lat>!4d<lng> (titik tempat), …@<lat>,<lng>, ?q=<lat>,<lng>, ll=/center=.
 * Sebagian link hanya membawa nama tempat (mis. share.google → halaman Google Search). Nama itu dicari lewat
 * pencarian internal Google Maps (search?tbm=map). CATATAN: jalur ini TIDAK RESMI (bukan API Google) —
 * dipilih pemilik klub karena gratis; bisa berhenti bekerja bila Google mengubah format / memblokir.
 * Kalau gagal, nama dikembalikan supaya browser mencarinya di OpenStreetMap / member klik titik di peta.
 * Pengganti resmi: Google Places API (Text Search) dengan API key di environment server.
 */

export type ResolvedLink = { ok: true; lat: number; lng: number; name: string | null } | { ok: false; name: string | null; error: string };

const MAX_HOPS = 6;

const isGoogleHost = (host: string) =>
  host === "share.google" || host === "goo.gl" || host === "maps.app.goo.gl" || host === "g.co" || /^(www\.|maps\.)?google\.[a-z.]{2,6}$/.test(host);

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

function coordsFrom(text: string): { lat: number; lng: number } | null {
  const t = safeDecode(text.replace(/\+/g, " "));
  const m =
    t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ??
    t.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) ??
    t.match(/[?&](?:q|query|ll|center|destination|daddr)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

function nameFrom(url: URL): string | null {
  // google.com/share.google?q=<token> — token link, bukan nama tempat.
  if (url.pathname === "/share.google") return null;
  const place = url.pathname.match(/\/maps\/place\/([^/]+)/);
  const raw = place?.[1] ?? url.searchParams.get("q") ?? url.searchParams.get("query");
  if (!raw) return null;
  const name = (place ? safeDecode(raw.replace(/\+/g, " ")) : raw).trim();
  return name && !coordsFrom(`?q=${name}`) ? name.slice(0, 120) : null;
}

/** Tidak resmi: titik tempat pertama dari hasil pencarian internal Google Maps; null bila tidak ada / gagal. */
async function lookupPlace(name: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://www.google.com/search?tbm=map&hl=id&gl=id&q=${encodeURIComponent(name)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SoslayMapLink/1.0)", "Accept-Language": "id" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = (await res.text()).slice(0, 300_000);
    // Titik tempat: [null,null,<lat>,<lng>],"0x…:0x…","<nama tempat>" (kode fitur tempat Google).
    // Titik kota / wilayah ([…],"Jakarta, Daerah Khusus…") tidak punya kode itu → ditolak.
    const m = text.match(/\[null,null,(-?\d{1,2}\.\d{4,}),(-?\d{1,3}\.\d{4,})\],"0x[0-9a-f]+:0x[0-9a-f]+","[^"]+"/);
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    // Hanya wilayah Indonesia.
    if (lat < -11.5 || lat > 6.5 || lng < 94 || lng > 141.5) return null;
    return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  } catch {
    return null;
  }
}

export async function resolveMapsLink(input: string): Promise<ResolvedLink> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, name: null, error: "Link tidak valid." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, name: null, error: "Link tidak valid." };
  if (!isGoogleHost(url.hostname)) return { ok: false, name: null, error: "Tempel link dari Google Maps." };

  let name: string | null = null;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const found = coordsFrom(url.href);
    name = nameFrom(url) ?? name;
    if (found) return { ok: true, ...found, name };
    if (hop === MAX_HOPS) break;

    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SoslayMapLink/1.0)", "Accept-Language": "id" },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
    } catch {
      return { ok: false, name, error: "Link tidak bisa dibuka sekarang — coba lagi atau klik titik di peta." };
    }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      const next = new URL(location, url);
      if (!isGoogleHost(next.hostname)) break;
      url = next;
      continue;
    }
    // Halaman akhir: titik tempat kadang ada di tag meta (og:image / link kanonik).
    if (res.ok && /\/maps\//.test(url.pathname)) {
      const html = (await res.text()).slice(0, 400_000);
      const canonical = html.match(/https:\/\/www\.google\.[a-z.]+\/maps\/place\/[^"'\s]+/)?.[0];
      const inPage = canonical ? coordsFrom(canonical) : null;
      if (inPage) return { ok: true, ...inPage, name };
    }
    break;
  }
  if (name) {
    const place = await lookupPlace(name);
    if (place) return { ok: true, ...place, name };
  }
  return {
    ok: false,
    name,
    error: name ? `Link ini hanya berisi nama tempat ("${name}"), tanpa titik lokasi.` : "Titik lokasi tidak ditemukan di link ini.",
  };
}
