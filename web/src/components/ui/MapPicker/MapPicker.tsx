"use client";

import "leaflet/dist/leaflet.css";
import type { LatLngExpression, Map as LeafletMap, Marker } from "leaflet";
import { LocateFixed, Search } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./MapPicker.module.css";

export type LatLng = { lat: number; lng: number };

type Props = {
  value: LatLng | null;
  onChange: (value: LatLng) => void;
  /** Pusat peta saat belum ada titik (default: Jakarta). */
  fallbackCenter?: LatLng;
  /** Titik kedua yang hanya ditampilkan (mis. gudang pengirim). */
  origin?: LatLng & { label: string };
  height?: number;
  /** Teks di atas peta sebelum titik dipilih. */
  hint?: string;
};

const JAKARTA: LatLng = { lat: -6.2088, lng: 106.8456 };
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

type Place = { display_name: string; lat: string; lon: string };

/**
 * Koordinat dari teks yang ditempel: "-6.2607, 106.8136" atau link Google Maps
 * (…!3d-6.26!4d106.81… = titik tempat, …@-6.26,106.81,17z… / ?q=-6.26,106.81 = titik peta).
 */
export function parseCoords(raw: string): LatLng | null {
  const place = raw.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const m = place ?? raw.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat: round6(lat), lng: round6(lng) } : null;
}

/**
 * Peta pilih titik lokasi: klik peta / geser pin / cari alamat / "Pakai lokasi saya".
 * Leaflet + peta OpenStreetMap — tanpa API key & tanpa biaya. Pencarian alamat memakai
 * Nominatim (OpenStreetMap), dipanggil hanya saat member menekan Cari.
 */
export function MapPicker({ value, onChange, fallbackCenter = JAKARTA, origin, height = 260, hint = "Klik di peta untuk menaruh pin" }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  const onChangeRef = useRef(onChange);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Leaflet butuh `window` → dimuat di browser saja.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !box.current || map.current) return;
      const leaflet = mod.default ?? mod;
      L.current = leaflet;
      const start = value ?? fallbackCenter;
      const m = leaflet.map(box.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], value ? 16 : 12);
      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        })
        .addTo(m);
      if (origin) {
        leaflet
          .marker([origin.lat, origin.lng], { icon: leaflet.divIcon({ className: "", html: `<div class="${styles.origin}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] }), keyboard: false })
          .bindTooltip(origin.label)
          .addTo(m);
      }
      m.on("click", (e) => onChangeRef.current({ lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) }));
      map.current = m;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // Peta dibuat sekali; perubahan titik ditangani efek di bawah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sinkronkan pin dengan value.
  useEffect(() => {
    const m = map.current;
    const leaflet = L.current;
    if (!ready || !m || !leaflet) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const pos: LatLngExpression = [value.lat, value.lng];
    if (!marker.current) {
      marker.current = leaflet
        .marker(pos, { draggable: true, autoPan: true, icon: leaflet.divIcon({ className: "", html: `<div class="${styles.pin}"></div>`, iconSize: [28, 28], iconAnchor: [14, 30] }) })
        .addTo(m);
      marker.current.on("dragend", () => {
        const p = marker.current!.getLatLng();
        onChangeRef.current({ lat: round6(p.lat), lng: round6(p.lng) });
      });
    } else {
      marker.current.setLatLng(pos);
    }
    if (!m.getBounds().pad(-0.1).contains(pos)) m.setView(pos, Math.max(m.getZoom(), 15));
  }, [value, ready]);

  const flyTo = (p: LatLng) => {
    onChange(p);
    map.current?.setView([p.lat, p.lng], 17);
  };

  const locate = () => {
    setError(undefined);
    if (!navigator.geolocation) return setError("Browser tidak mendukung lokasi — klik titik di peta.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        flyTo({ lat: round6(pos.coords.latitude), lng: round6(pos.coords.longitude) });
      },
      () => {
        setBusy(false);
        setError("Lokasi tidak bisa dibaca — izinkan akses lokasi, atau klik titik di peta.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const search = async () => {
    const q = query.trim();
    if (q.length < 3) return;
    setError(undefined);
    setPlaces(null);
    // Koordinat / link Google Maps yang ditempel → langsung jadi titik.
    const coords = parseCoords(q);
    if (coords) return flyTo(coords);
    if (/goo\.gl|maps\.app/i.test(q))
      return setError("Link pendek Google Maps tidak bisa dibaca. Di Google Maps, tekan lama titik lokasinya lalu salin angka koordinatnya (mis. -6.2607, 106.8136) dan tempel di sini.");
    setBusy(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=id&accept-language=id&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const found = res.ok ? ((await res.json()) as Place[]) : [];
      setPlaces(found);
      if (!found.length)
        setError("Tidak ditemukan di peta OpenStreetMap — coba nama jalannya, klik titik di peta, atau tempel koordinat / link dari Google Maps.");
    } catch {
      setError("Pencarian sedang tidak bisa dipakai — klik titik di peta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.search}>
        <input
          className={styles.searchInput}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPlaces(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Cari jalan, atau tempel koordinat / link Google Maps"
          aria-label="Cari alamat di peta"
        />
        <button type="button" className={styles.button} onClick={search} disabled={busy || query.trim().length < 3}>
          <Search size={14} /> Cari
        </button>
        {places && places.length > 0 && (
          <ul className={styles.results}>
            {places.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button
                  type="button"
                  onClick={() => {
                    flyTo({ lat: round6(Number(p.lat)), lng: round6(Number(p.lon)) });
                    setPlaces(null);
                  }}
                >
                  {p.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={styles.map} style={{ "--map-height": `${height}px` } as CSSProperties}>
        <div ref={box} style={{ width: "100%", height: "100%" }} />
        {!value && <span className={styles.hint}>{hint}</span>}
      </div>
      <div className={styles.row}>
        <button type="button" className={styles.button} onClick={locate} disabled={busy}>
          <LocateFixed size={14} /> Pakai lokasi saya
        </button>
        {value && (
          <span className={styles.coords}>
            {value.lat.toFixed(6)}, {value.lng.toFixed(6)} · geser pin untuk merapikan
          </span>
        )}
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
