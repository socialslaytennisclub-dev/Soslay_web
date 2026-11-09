"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./ImageCropper.module.css";

type Request = { file: File; aspect: number; label: string; resolve: (file: File | null) => void };

/**
 * Crop foto setelah dipilih, dengan rasio tetap sesuai tempat foto ditampilkan (cover activity 4:3,
 * kartu venue, post, avatar 1:1, …). `const [crop, cropDialog] = useImageCrop()` → render `{cropDialog}`,
 * lalu `const file = await crop(picked, 4 / 3, "Cover activity")` — null kalau dibatalkan. Hasilnya JPEG
 * tepat di area yang dipilih (sisi terpanjang maks 2560 px); diperkecil lagi oleh shrinkImage seperti biasa.
 */
export function useImageCrop(): [(file: File, aspect: number, label?: string) => Promise<File | null>, ReactNode] {
  const [request, setRequest] = useState<Request | null>(null);
  const crop = useCallback(
    (file: File, aspect: number, label = "Foto") =>
      new Promise<File | null>((resolve) => {
        // Bukan gambar (mis. format aneh) → lewati crop, validasi server tetap berlaku.
        if (!file.type.startsWith("image/")) return resolve(file);
        setRequest({ file, aspect, label, resolve });
      }),
    [],
  );
  const finish = (file: File | null) => {
    request?.resolve(file);
    setRequest(null);
  };
  return [crop, request ? <CropDialog key={request.file.name + request.file.lastModified} request={request} onFinish={finish} /> : null];
}

const MAX_EDGE = 2560;

function CropDialog({ request, onFinish }: { request: Request; onFinish: (file: File | null) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [url] = useState(() => URL.createObjectURL(request.file));
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [frameW, setFrameW] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const frameH = frameW / request.aspect;
  // Skala dasar: foto menutupi seluruh bingkai; zoom memperbesar dari situ.
  const base = natural && frameW ? Math.max(frameW / natural.w, frameH / natural.h) : 1;
  const scale = base * zoom;

  const clamp = useCallback(
    (x: number, y: number, s: number) => {
      if (!natural) return { x, y };
      const minX = frameW - natural.w * s;
      const minY = frameH - natural.h * s;
      return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
    },
    [natural, frameW, frameH],
  );

  /** Foto di tengah bingkai, zoom 1 (menutupi bingkai). */
  const center = useCallback(
    (nat: { w: number; h: number }, width: number) => {
      const s = Math.max(width / nat.w, width / request.aspect / nat.h);
      setZoom(1);
      setOffset({ x: (width - nat.w * s) / 2, y: (width / request.aspect - nat.h * s) / 2 });
    },
    [request.aspect],
  );

  useEffect(() => {
    dialog.current?.showModal();
    const measure = () => {
      const width = frame.current?.clientWidth ?? 0;
      setFrameW(width);
      const img = frame.current?.querySelector("img");
      if (img?.naturalWidth) center({ w: img.naturalWidth, h: img.naturalHeight }, width);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      URL.revokeObjectURL(url);
    };
  }, [url, center]);

  const changeZoom = (next: number) => {
    if (!natural) return;
    // Zoom ke tengah bingkai.
    const cx = frameW / 2;
    const cy = frameH / 2;
    const ns = base * next;
    const x = cx - ((cx - offset.x) / scale) * ns;
    const y = cy - ((cy - offset.y) / scale) * ns;
    setZoom(next);
    setOffset(clamp(x, y, ns));
  };

  const apply = async () => {
    if (!natural) return;
    setBusy(true);
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;
    const sw = frameW / scale;
    const sh = frameH / scale;
    const out = Math.min(1, MAX_EDGE / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * out);
    canvas.height = Math.round(sh * out);
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => undefined);
    if (!ctx) return onFinish(request.file);
    ctx.fillStyle = "#ffffff"; // PNG transparan → JPEG tidak hitam
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    setBusy(false);
    onFinish(blob ? new File([blob], request.file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() }) : request.file);
  };

  return (
    <dialog ref={dialog} className={styles.dialog} onCancel={(e) => (e.preventDefault(), onFinish(null))} aria-labelledby="crop-title">
      <h2 id="crop-title" className={styles.title}>
        Atur foto · {request.label}
      </h2>
      <p className={styles.hint}>Geser foto untuk memilih bagian yang tampil, perbesar dengan slider.</p>
      <div
        ref={frame}
        className={styles.frame}
        style={{ height: frameH || undefined, aspectRatio: frameH ? undefined : String(request.aspect) }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) setOffset(clamp(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y, scale));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau lokal (blob URL), bukan aset website */}
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const nat = { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight };
            setNatural(nat);
            center(nat, frame.current?.clientWidth ?? frameW);
          }}
          style={natural ? { width: natural.w, height: natural.h, transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` } : { opacity: 0 }}
        />
        <span className={styles.grid} aria-hidden />
      </div>
      <label className={styles.zoom}>
        Zoom
        <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} aria-label="Perbesar foto" />
      </label>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={() => onFinish(null)} disabled={busy}>
          Batal
        </button>
        <button type="button" className={`${styles.button} ${styles.primary}`} onClick={apply} disabled={busy || !natural}>
          {busy ? "Memproses…" : "Pakai foto"}
        </button>
      </div>
    </dialog>
  );
}
