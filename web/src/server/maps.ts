"use server";

/**
 * Link Google Maps → koordinat, tanpa API key. Link pendek (maps.app.goo.gl, goo.gl, share.google, g.co)
 * dibuka di server dan redirect-nya diikuti manual (hanya ke domain Google yang terdaftar) sampai ketemu link yang
 * memuat titik (aturan baca: src/lib/geo.ts). Hanya untuk member / tim yang login; hasil di-cache & dibatasi
 * per akun supaya server tidak bisa dipakai sebagai proxy dan tidak diblokir Google.
 * Sebagian link hanya membawa nama tempat (mis. share.google → halaman Google Search). Nama itu dicari lewat
 * pencarian internal Google Maps (search?tbm=map). CATATAN: jalur ini TIDAK RESMI (bukan API Google) —
 * dipilih pemilik klub karena gratis; bisa berhenti bekerja bila Google mengubah format / memblokir.
 * Kalau gagal, nama dikembalikan supaya browser mencarinya di OpenStreetMap / member klik titik di peta.
 * Pengganti resmi: Google Places API (Text Search) dengan API key di environment server.
 */

import { parseCoords } from "@/lib/geo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "./admin/session";

export type ResolvedLink = { ok: true; lat: number; lng: number; name: string | null } | { ok: false; name: string | null; error: string };

const MAX_HOPS = 6;

/** Hanya domain resmi Google yang dibuka server (bukan pola google.* — google.xx.io bisa milik siapa saja). */
const GOOGLE_HOSTS = new Set([
  "share.google",
  "goo.gl",
  "maps.app.goo.gl",
  "g.co",
  "google.com",
  "www.google.com",
  "maps.google.com",
  "google.co.id",
  "www.google.co.id",
  "maps.google.co.id",
]);
const isGoogleHost = (host: string) => GOOGLE_HOSTS.has(host.toLowerCase());

const coordsFrom = (text: string) => parseCoords(text);

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

// ── Cache & batas pemakaian (per proses server) ──────────────────────────────
const CACHE_TTL = 24 * 3600_000;
const CACHE_MAX = 500;
const LIMIT = 20;
const LIMIT_WINDOW = 10 * 60_000;
type Memo = { cache: Map<string, { at: number; result: ResolvedLink }>; calls: Map<string, number[]> };
const g = globalThis as typeof globalThis & { __soslayMapLinks?: Memo };
const memo: Memo = (g.__soslayMapLinks ??= { cache: new Map(), calls: new Map() });

/** Akun pemanggil: member (sesi member) atau tim admin; mode demo (tanpa Supabase) diizinkan. */
async function callerId(): Promise<string | null> {
  if (!isSupabaseConfigured) return "demo";
  const member = await createSupabaseServerClient("member");
  const {
    data: { user },
  } = await member.auth.getUser();
  if (user) return user.id;
  const admin = await getAdminSession();
  return admin.mode === "live" ? admin.userId : null;
}

function overLimit(id: string): boolean {
  const now = Date.now();
  const recent = (memo.calls.get(id) ?? []).filter((t) => now - t < LIMIT_WINDOW);
  if (recent.length >= LIMIT) return true;
  memo.calls.set(id, [...recent, now]);
  return false;
}

function nameFrom(url: URL): string | null {
  // google.com/share.google?q=<token> — token link, bukan nama tempat.
  if (url.pathname === "/share.google") return null;
  const place = url.pathname.match(/\/maps\/(?:place|search)\/([^/@]+)/);
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
  const id = await callerId();
  if (!id) return { ok: false, name: null, error: "Masuk dulu untuk memakai link Google Maps." };
  const key = input.trim();
  const hit = memo.cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.result;
  if (overLimit(id)) return { ok: false, name: null, error: "Terlalu banyak link dicoba — tunggu beberapa menit." };

  const result = await resolve(key);
  // Hanya hasil yang berhasil di-cache: gagal bisa karena Google sedang membatasi / jaringan → boleh dicoba lagi.
  if (result.ok) {
    if (memo.cache.size >= CACHE_MAX) memo.cache.delete(memo.cache.keys().next().value!);
    memo.cache.set(key, { at: Date.now(), result });
  }
  return result;
}

async function resolve(input: string): Promise<ResolvedLink> {
  let url: URL;
  try {
    url = new URL(input);
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
