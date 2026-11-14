/**
 * Pilihan form venue admin: kota di Indonesia, zona waktu, permukaan lapangan, fasilitas.
 * Zona waktu disimpan sebagai ID IANA yang valid (Asia/Makassar = WITA, Asia/Jayapura = WIT).
 */

export const VENUE_TIMEZONES = [
  { value: "Asia/Jakarta", label: "(GMT+07:00) WIB - Asia/Jakarta" },
  { value: "Asia/Makassar", label: "(GMT+08:00) WITA - Asia/Bali" },
  { value: "Asia/Jayapura", label: "(GMT+09:00) WIT - Asia/Maluku" },
] as const;

export type VenueTimezone = (typeof VENUE_TIMEZONES)[number]["value"];

export const isVenueTimezone = (value: string): value is VenueTimezone => VENUE_TIMEZONES.some((t) => t.value === value);

export const VENUE_SURFACES = ["Hard Court", "Grass Court", "Clay Court", "Synthetic Grass Court"] as const;

export const VENUE_FACILITIES = ["Parkir", "Toilet", "Shower", "Kantin", "Mushola", "Sewa raket", "Ball machine", "Loker"] as const;

/** Tipe court (chip "Tipe court"). */
export const VENUE_TYPES = ["Indoor", "Outdoor", "Rooftop", "Premium", "Tropical"] as const;

/** Jumlah lapangan yang bisa dipilih di dropdown. */
export const MAX_COURTS = 20;

const WIB = "Asia/Jakarta";
const WITA = "Asia/Makassar";
const WIT = "Asia/Jayapura";

/**
 * Nilai kota lama ("Jakarta" & "Bali", dari sebelum dropdown kota) — tidak ada di dropdown, tapi
 * venue yang masih tersimpan begini tetap valid sampai admin memilih kotanya.
 */
export const WEBSITE_REGIONS = [
  { city: "Jakarta", timezone: WIB },
  { city: "Bali", timezone: WITA },
] as const;

const byProvince: [string, string, string[]][] = [
  ["Aceh", WIB, ["Banda Aceh", "Langsa", "Lhokseumawe", "Sabang", "Subulussalam"]],
  ["Sumatera Utara", WIB, ["Binjai", "Gunungsitoli", "Medan", "Padangsidimpuan", "Pematangsiantar", "Sibolga", "Tanjungbalai", "Tebing Tinggi"]],
  ["Sumatera Barat", WIB, ["Bukittinggi", "Padang", "Padang Panjang", "Pariaman", "Payakumbuh", "Sawahlunto", "Solok"]],
  ["Riau", WIB, ["Dumai", "Pekanbaru"]],
  ["Kepulauan Riau", WIB, ["Batam", "Tanjungpinang"]],
  ["Jambi", WIB, ["Jambi", "Sungai Penuh"]],
  ["Sumatera Selatan", WIB, ["Lubuklinggau", "Pagar Alam", "Palembang", "Prabumulih"]],
  ["Bengkulu", WIB, ["Bengkulu"]],
  ["Lampung", WIB, ["Bandar Lampung", "Metro"]],
  ["Kepulauan Bangka Belitung", WIB, ["Pangkalpinang"]],
  ["DKI Jakarta", WIB, ["Jakarta Barat", "Jakarta Pusat", "Jakarta Selatan", "Jakarta Timur", "Jakarta Utara"]],
  ["Banten", WIB, ["Cilegon", "Serang", "Tangerang", "Tangerang Selatan"]],
  ["Jawa Barat", WIB, ["Bandung", "Banjar", "Bekasi", "Bogor", "Cimahi", "Cirebon", "Depok", "Sukabumi", "Tasikmalaya"]],
  ["Jawa Tengah", WIB, ["Magelang", "Pekalongan", "Salatiga", "Semarang", "Surakarta", "Tegal"]],
  ["DI Yogyakarta", WIB, ["Yogyakarta"]],
  ["Jawa Timur", WIB, ["Batu", "Blitar", "Kediri", "Madiun", "Malang", "Mojokerto", "Pasuruan", "Probolinggo", "Surabaya"]],
  ["Bali", WITA, ["Denpasar"]],
  ["Nusa Tenggara Barat", WITA, ["Bima", "Mataram"]],
  ["Nusa Tenggara Timur", WITA, ["Kupang"]],
  ["Kalimantan Barat", WIB, ["Pontianak", "Singkawang"]],
  ["Kalimantan Tengah", WIB, ["Palangka Raya"]],
  ["Kalimantan Selatan", WITA, ["Banjarbaru", "Banjarmasin"]],
  ["Kalimantan Timur", WITA, ["Balikpapan", "Bontang", "Samarinda"]],
  ["Kalimantan Utara", WITA, ["Tarakan"]],
  ["Sulawesi Utara", WITA, ["Bitung", "Kotamobagu", "Manado", "Tomohon"]],
  ["Gorontalo", WITA, ["Gorontalo"]],
  ["Sulawesi Tengah", WITA, ["Palu"]],
  ["Sulawesi Selatan", WITA, ["Makassar", "Palopo", "Parepare"]],
  ["Sulawesi Tenggara", WITA, ["Baubau", "Kendari"]],
  ["Maluku", WIT, ["Ambon", "Tual"]],
  ["Maluku Utara", WIT, ["Ternate", "Tidore Kepulauan"]],
  ["Papua", WIT, ["Jayapura"]],
  ["Papua Barat Daya", WIT, ["Sorong"]],
];

/** 98 kota di Indonesia (urut abjad) + zona waktunya. */
export const INDONESIA_CITIES = byProvince
  .flatMap(([province, timezone, cities]) => cities.map((city) => ({ city, province, timezone })))
  .sort((a, b) => a.city.localeCompare(b.city, "id"));

/** Zona waktu bawaan untuk kota yang dipilih (bisa diganti admin). */
export function timezoneForCity(city: string): VenueTimezone | undefined {
  const tz = WEBSITE_REGIONS.find((r) => r.city === city)?.timezone ?? INDONESIA_CITIES.find((c) => c.city === city)?.timezone;
  return tz && isVenueTimezone(tz) ? tz : undefined;
}

export const isKnownCity = (city: string) => timezoneForCity(city) !== undefined;

const COMPASS_EN: Record<string, string> = { Pusat: "Central", Tengah: "Central", Selatan: "South", Utara: "North", Barat: "West", Timur: "East" };

/**
 * Nama kota untuk website (bahasa Inggris): "Jakarta Pusat" → "Central Jakarta", "Tangerang Selatan" →
 * "South Tangerang", "Kota Denpasar" → "Denpasar". Kota tanpa arah mata angin tetap seperti aslinya.
 */
export function cityInEnglish(city: string): string {
  const name = city.replace(/^(Kota|Kabupaten)\s+/, "").trim();
  const m = name.match(/^(.+?)\s+(Pusat|Tengah|Selatan|Utara|Barat|Timur)$/);
  return m ? `${COMPASS_EN[m[2]]} ${m[1]}` : name;
}

/** Provinsi yang masuk wilayah website "Jakarta" (Jabodetabek) & "Bali". */
const REGION_PROVINCES: Record<string, "Jakarta" | "Bali"> = {
  "DKI Jakarta": "Jakarta",
  Banten: "Jakarta",
  "Jawa Barat": "Jakarta",
  Bali: "Bali",
};
const JABODETABEK = new Set(["Bekasi", "Bogor", "Depok", "Tangerang", "Tangerang Selatan"]);

/**
 * Wilayah website (filter Venue & zona waktu jadwal) dari kota venue: Jakarta & Jabodetabek →
 * "Jakarta", Denpasar → "Bali". Kota lain belum punya wilayah di website → undefined.
 */
export function websiteRegion(city: string): "Jakarta" | "Bali" | undefined {
  if (city === "Jakarta" || city === "Bali") return city;
  const found = INDONESIA_CITIES.find((c) => c.city === city);
  if (!found) return undefined;
  const region = REGION_PROVINCES[found.province];
  if (region === "Jakarta" && found.province !== "DKI Jakarta" && !JABODETABEK.has(city)) return undefined;
  return region;
}
