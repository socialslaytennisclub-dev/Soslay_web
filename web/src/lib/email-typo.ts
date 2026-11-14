/**
 * Deteksi salah ketik domain email (mis. "gmail.con", "gmial.com", "yahoo.con").
 * - `suggestion`: alamat lengkap yang kemungkinan dimaksud → tampilkan "Maksudnya …?" (satu klik).
 * - `error`: domain yang PASTI salah (TLD seperti ".con" tidak ada) → ditolak saat daftar / ganti email.
 * Dipakai di client (form) dan server (validasi ulang) — tanpa dependensi.
 */

/** Domain email populer di Indonesia — urutan = prioritas bila jaraknya sama. */
const KNOWN_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "yahoo.co.id",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "live.com",
  "ymail.com",
  "googlemail.com",
  "outlook.co.id",
  "rocketmail.com",
  "protonmail.com",
  "proton.me",
  "aol.com",
  "msn.com",
  "me.com",
  "mail.com",
  "email.com",
];

/** TLD yang tidak ada dan hampir selalu salah ketik ".com". (".co" / ".cm" valid → hanya disarankan, tidak ditolak.) */
const BAD_TLD_FIX: Record<string, string> = {
  con: "com",
  c: "com",
  cmo: "com",
  ocm: "com",
  cpm: "com",
  vom: "com",
  xom: "com",
  cim: "com",
  coom: "com",
  comm: "com",
  ccom: "com",
  conm: "com",
  comn: "com",
  cmm: "com",
  nte: "net",
  ent: "net",
};

/** Jarak edit Damerau (OSA): sisip, hapus, ganti, tukar dua huruf bersebelahan = 1. */
function editDistance(a: string, b: string) {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** "yahoo.co.id" → ["yahoo", "co.id"]: nama penyedia + akhiran. */
const splitDomain = (domain: string) => {
  const dot = domain.indexOf(".");
  return [domain.slice(0, dot), domain.slice(dot + 1)] as const;
};

/**
 * Domain populer terdekat (atau undefined bila tidak ada yang cukup mirip). Nama & akhiran dibandingkan
 * terpisah: akhiran maks. beda 1 (gmail.co → .com) supaya akhiran negara lain yang valid tidak
 * "dikoreksi" (yahoo.co.uk ≠ yahoo.co.id), lalu total beda maks. 2 (domain pendek maks. 1).
 */
function nearestKnown(domain: string) {
  const [name, suffix] = splitDomain(domain);
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const known of KNOWN_DOMAINS) {
    const [knownName, knownSuffix] = splitDomain(known);
    const suffixDistance = editDistance(suffix, knownSuffix);
    if (suffixDistance > 1) continue;
    const distance = editDistance(name, knownName) + suffixDistance;
    const limit = known.length >= 9 ? 2 : 1;
    if (distance <= limit && distance < bestDistance) {
      best = known;
      bestDistance = distance;
    }
  }
  return best;
}

/** `invalidTld` diisi bila domain pasti salah (".con") — pesan error disusun pemanggil (UI member Inggris, admin Indonesia). */
export type EmailTypo = { suggestion?: string; invalidTld?: string; trailingDot?: boolean };

/** Periksa domain email. Kosong `{}` = tidak ada yang mencurigakan (atau format belum lengkap). */
export function checkEmailTypo(value: string): EmailTypo {
  const email = value.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return {};
  const local = email.slice(0, at);
  const rawDomain = email.slice(at + 1);
  const domain = rawDomain.replace(/\.+$/, "");
  // "joe@gmail.com." (titik di akhir, sering terketik di HP) → alamat tidak valid; sarankan tanpa titik.
  const trailingDot = domain !== rawDomain && domain.includes(".");
  if (!domain.includes(".")) return {};
  if (KNOWN_DOMAINS.includes(domain)) return trailingDot ? { suggestion: `${local}@${domain}`, trailingDot } : {};

  const parts = domain.split(".");
  const tld = parts[parts.length - 1];
  const fixedTld = BAD_TLD_FIX[tld];
  const badTld = !!fixedTld || tld.length < 2;
  const candidate = fixedTld ? [...parts.slice(0, -1), fixedTld].join(".") : domain;
  const target = KNOWN_DOMAINS.includes(candidate) ? candidate : (nearestKnown(candidate) ?? (fixedTld ? candidate : undefined));
  const suggestion = target && (target !== domain || trailingDot) ? `${local}@${target}` : trailingDot ? `${local}@${domain}` : undefined;

  return { suggestion, ...(badTld ? { invalidTld: tld } : {}), ...(trailingDot ? { trailingDot } : {}) };
}

