"use client";

import "leaflet/dist/leaflet.css";
import type { LatLngExpression, Map as LeafletMap, Marker } from "leaflet";
import { CircleCheck, Link2, LocateFixed, Monitor, Smartphone } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { parseCoords, type LatLng } from "@/lib/geo";
import { resolveMapsLink } from "@/server/maps";
import styles from "./MapPicker.module.css";

export type { LatLng };

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

/**
 * Titik lokasi dari link Google Maps: member menempel link share Google Maps → server mengubahnya jadi
 * koordinat (src/server/maps.ts) → pin tampil di peta untuk dicek & dirapikan (geser / klik peta /
 * "Pakai lokasi saya"). Peta: Leaflet + OpenStreetMap — tanpa API key.
 */
export function MapPicker({ value, onChange, fallbackCenter = JAKARTA, origin, height = 260, hint = "Tempel link Google Maps di atas, atau klik peta" }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  const onChangeRef = useRef(onChange);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const inputId = useId();
  const latest = useRef(0);

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

  const applyLink = async (raw: string) => {
    const text = raw.trim();
    // Hanya hasil permintaan terakhir yang dipakai (link lama yang lebih lambat tidak menimpa pin baru).
    const request = ++latest.current;
    setError(undefined);
    setNote(undefined);
    if (!text) return;
    // Koordinat yang ditempel langsung ("-6.19, 106.78") juga diterima.
    const coords = /^https?:\/\//i.test(text) ? null : parseCoords(text);
    if (coords) {
      flyTo(coords);
      setNote("Titik lokasi diambil dari koordinat. Pastikan pin sudah tepat.");
      return;
    }
    if (!/^https?:\/\//i.test(text)) return setError("Tempel link dari Google Maps (diawali https://).");
    setBusy(true);
    try {
      const link = await resolveMapsLink(text);
      if (request !== latest.current) return;
      if (link.ok) {
        flyTo({ lat: link.lat, lng: link.lng });
        setNote(`Titik lokasi ditemukan${link.name ? `: ${link.name}` : ""}. Cek pin di peta — geser kalau kurang pas.`);
      } else {
        setError(`${link.error} Coba salin ulang link dari Google Maps, atau klik titiknya langsung di peta.`);
      }
    } catch {
      if (request !== latest.current) return;
      setError("Link belum bisa dibaca sekarang — coba lagi, atau klik titiknya langsung di peta.");
    } finally {
      if (request === latest.current) setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.linkBox}>
        <label htmlFor={inputId} className={styles.linkLabel}>
          <Link2 size={16} aria-hidden /> Link Google Maps
        </label>
        <div className={styles.search}>
          <input
            id={inputId}
            type="url"
            inputMode="url"
            className={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onPaste={(e) => {
              // Langsung diproses saat ditempel.
              const text = e.clipboardData.getData("text");
              if (text.trim()) {
                e.preventDefault();
                setQuery(text.trim());
                applyLink(text);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink(query);
              }
            }}
            placeholder="Tempel link di sini, mis. https://maps.app.goo.gl/…"
            aria-describedby={`${inputId}-steps`}
          />
          <button type="button" className={styles.button} onClick={() => applyLink(query)} disabled={busy || !query.trim()}>
            {busy ? "Membaca…" : "Pakai link"}
          </button>
        </div>
        {note && !error && (
          <p className={styles.success}>
            <CircleCheck size={16} aria-hidden /> {note}
          </p>
        )}
        {error && <p className={styles.error}>{error}</p>}
        <details className={styles.howTo} id={`${inputId}-steps`} open={!value}>
          <summary>Cara mendapatkan link Google Maps</summary>
          <div className={styles.howToCols}>
            <div>
              <p className={styles.howToTitle}>
                <Smartphone size={15} aria-hidden /> Dari HP (aplikasi Google Maps)
              </p>
              <ol>
                <li>Buka aplikasi <strong>Google Maps</strong>.</li>
                <li>
                  Cari nama tempat / alamatmu, <em>atau</em> tekan lama di titik lokasimu sampai muncul pin merah.
                </li>
                <li>
                  Ketuk tombol <strong>Bagikan</strong> (Share).
                </li>
                <li>
                  Pilih <strong>Salin link</strong> (Copy link).
                </li>
                <li>Kembali ke halaman ini, tempel di kolom di atas.</li>
              </ol>
            </div>
            <div>
              <p className={styles.howToTitle}>
                <Monitor size={15} aria-hidden /> Dari laptop / komputer
              </p>
              <ol>
                <li>
                  Buka <strong>maps.google.com</strong>.
                </li>
                <li>Cari nama tempat / alamatmu, atau klik titik lokasinya di peta.</li>
                <li>
                  Klik <strong>Bagikan</strong> → <strong>Salin link</strong>, atau salin alamat dari address bar browser.
                </li>
                <li>Tempel di kolom di atas.</li>
              </ol>
            </div>
          </div>
        </details>
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
    </div>
  );
}
