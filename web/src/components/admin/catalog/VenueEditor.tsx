"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { cx } from "@/lib/cx";
import { saveVenue } from "@/server/admin/actions/catalog";
import type { VenueForm } from "@/server/admin/types";
import styles from "../activities/SessionEditor.module.css";
import { FormCard, TextArea, Toggle } from "../ui/AdminForm";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, Badge } from "../ui/AdminUI";
import own from "./Catalog.module.css";

const TYPES = ["Indoor", "Outdoor", "Rooftop", "Premium", "Tropical"];

/** Tambah / edit venue — tampil di halaman Venue, detail venue, dan homepage. */
export function VenueEditor({ initial, imageOptions, initialNotice }: { initial: VenueForm; imageOptions: string[]; initialNotice?: string }) {
  const [v, setV] = useState(initial);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(initialNotice ? { text: initialNotice, tone: "ok" } : null);
  const [saving, start] = useTransition();
  const set = <K extends keyof VenueForm>(key: K, value: VenueForm[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const isNew = !initial.id && !initial.slug;

  const save = () =>
    start(async () => {
      const result = await saveVenue(v);
      setNotice(result.ok ? { text: result.message, tone: "ok" } : { text: result.error, tone: "error" });
    });

  const imageSelect = (label: string, key: "coverPath" | "heroPath", hint?: string) => (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.selectWrap}>
        <select className={cx(styles.input, styles.select)} value={v[key]} onChange={(e) => set(key, e.target.value)}>
          <option value="">{key === "heroPath" ? "Sama dengan cover" : "Pilih foto…"}</option>
          {[...new Set([v[key], ...imageOptions].filter(Boolean))].map((src) => (
            <option key={src} value={src}>
              {src.replace("/images/", "")}
            </option>
          ))}
        </select>
        <AdminIcon name="caret-down" size={14} />
      </span>
      {hint && <span className={styles.muted}>{hint}</span>}
    </label>
  );

  return (
    <div className={styles.editor}>
      <div className={styles.bar}>
        <div className={styles.barLeft}>
          <Link href="/admin/venues" className={styles.back}>
            <AdminIcon name="caret-left" size={16} />
            Venues
          </Link>
          <Badge tone={v.active ? "lime" : "neutral"} dot>
            {v.active ? "Tampil di web" : "Disembunyikan"}
          </Badge>
        </div>
        <div className={styles.barActions}>
          {!isNew && (
            <AdminButton href={`/venue/${v.slug}`} target="_blank" size="sm" icon="eye">
              Lihat di website
            </AdminButton>
          )}
          <AdminButton variant="primary" size="sm" icon="check-bold" onClick={save} disabled={saving}>
            {saving ? "Menyimpan…" : isNew ? "Simpan venue" : "Simpan perubahan"}
          </AdminButton>
        </div>
      </div>

      {notice && (
        <p className={cx(styles.notice, notice.tone === "error" && styles.noticeError)} role={notice.tone === "error" ? "alert" : "status"}>
          <AdminIcon name={notice.tone === "error" ? "warning-circle" : "check-circle"} size={18} />
          {notice.text}
          <button type="button" className={styles.noticeClose} aria-label="Tutup" onClick={() => setNotice(null)}>
            <AdminIcon name="x" size={14} />
          </button>
        </p>
      )}

      <div className={styles.grid}>
        <div className={styles.main}>
          <FormCard title="Info venue">
            <div className={styles.cols2}>
              <label className={styles.field}>
                <span className={styles.label}>Nama venue *</span>
                <input className={styles.input} value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="mis. Common Grounds Menteng" />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Area</span>
                <input className={styles.input} value={v.area} onChange={(e) => set("area", e.target.value)} placeholder="mis. Jakarta Pusat" />
              </label>
            </div>
            <fieldset className={styles.fieldset}>
              <legend className={styles.label}>Kota</legend>
              <div className={styles.segmentWrap}>
                {(["Jakarta", "Bali"] as const).map((c) => (
                  <button key={c} type="button" aria-pressed={v.city === c} className={cx(styles.option, v.city === c && styles.optionOn)} onClick={() => set("city", c)}>
                    {c}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className={styles.fieldset}>
              <legend className={styles.label}>Tipe</legend>
              <div className={styles.segmentWrap}>
                {TYPES.map((t) => (
                  <button key={t} type="button" aria-pressed={v.type === t} className={cx(styles.option, v.type === t && styles.optionOn)} onClick={() => set("type", t)}>
                    {t}
                  </button>
                ))}
              </div>
            </fieldset>
            <TextArea label="Tagline (hero detail venue)" value={v.tagline} onChange={(x) => set("tagline", x)} maxLength={140} rows={2} />
            <TextArea label="Deskripsi" value={v.description} onChange={(x) => set("description", x)} maxLength={500} rows={4} />
          </FormCard>

          <FormCard title="Lokasi & lapangan">
            <label className={styles.field}>
              <span className={styles.label}>Alamat</span>
              <input className={styles.input} value={v.address} onChange={(e) => set("address", e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Link Google Maps</span>
              <span className={styles.affix}>
                <AdminIcon name="link-simple" size={16} />
                <input value={v.mapsUrl} onChange={(e) => set("mapsUrl", e.target.value)} placeholder="https://maps.app.goo.gl/…" />
              </span>
            </label>
            <div className={styles.field}>
              <span className={styles.label}>Lapangan (dipakai di pilihan “Lapangan” saat membuat sesi)</span>
              <ul className={own.variantList}>
                {v.courts.map((court, i) => (
                  <li key={i} className={own.variantRow}>
                    <input className={styles.input} aria-label={`Lapangan ${i + 1}`} value={court} onChange={(e) => set("courts", v.courts.map((c, j) => (j === i ? e.target.value : c)))} />
                    <span />
                    {v.courts.length > 1 && (
                      <button type="button" className={styles.iconButton} aria-label={`Hapus ${court}`} onClick={() => set("courts", v.courts.filter((_, j) => j !== i))}>
                        <AdminIcon name="x" size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <button type="button" className={styles.addCrew} onClick={() => set("courts", [...v.courts, `Court ${v.courts.length + 1}`])}>
                <AdminIcon name="plus-bold" size={14} />
                Tambah lapangan
              </button>
            </div>
          </FormCard>
        </div>

        <aside className={styles.side}>
          <FormCard title="Publikasi">
            <Toggle label="Tampil di website" hint="Halaman Venue & detail venue" checked={v.active} onChange={(x) => set("active", x)} />
            <Toggle label="Tampil di homepage" hint='Section "Kami Hanya Bermain di Tempat…"' checked={v.homepage} onChange={(x) => set("homepage", x)} />
          </FormCard>
          <FormCard title="Foto" subtitle="Upload foto baru aktif setelah Supabase Storage disiapkan">
            {imageSelect("Foto cover", "coverPath")}
            {imageSelect("Foto hero (detail venue)", "heroPath")}
            {v.coverPath && (
              <div className={styles.preview}>
                <Image src={v.coverPath} alt="" fill sizes="300px" />
                <span className={styles.previewText}>
                  <strong>{v.name || "Nama venue"}</strong>
                  <span>
                    {v.city} · {v.type}
                  </span>
                </span>
              </div>
            )}
          </FormCard>
        </aside>
      </div>
    </div>
  );
}
