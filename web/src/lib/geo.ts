/**
 * Baca koordinat dari teks (dipakai browser & server — satu aturan untuk semua jalur):
 * - "-6.2607, 106.8136" (koordinat yang disalin dari Google Maps)
 * - link Google Maps: …!3d<lat>!4d<lng>… (titik tempat), ?q= / query= / ll= / destination=<lat>,<lng>,
 *   dan …/maps/place/…/@<lat>,<lng> (di link place, @ = titik tempat).
 * "@lat,lng" di link /maps/search/ atau /maps/dir/ hanyalah pusat tampilan peta — sengaja diabaikan.
 */

export type LatLng = { lat: number; lng: number };

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

function valid(lat: number, lng: number): LatLng | null {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat: round6(lat), lng: round6(lng) } : null;
}

export function parseCoords(raw: string): LatLng | null {
  const text = safeDecode(raw.trim().replace(/\+/g, " "));
  const place = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (place) return valid(Number(place[1]), Number(place[2]));

  if (/^https?:\/\//i.test(text)) {
    const param = text.match(/[?&](?:q|query|ll|center|destination|daddr)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/);
    if (param) return valid(Number(param[1]), Number(param[2]));
    const at = /\/maps\/place\//.test(text) ? text.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) : null;
    return at ? valid(Number(at[1]), Number(at[2])) : null;
  }

  const plain = text.match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
  return plain ? valid(Number(plain[1]), Number(plain[2])) : null;
}
