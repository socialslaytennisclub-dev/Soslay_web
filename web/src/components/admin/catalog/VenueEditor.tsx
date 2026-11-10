"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { cx } from "@/lib/cx";
import { INDONESIA_CITIES, MAX_COURTS, timezoneForCity, VENUE_FACILITIES, VENUE_SURFACES, VENUE_TIMEZONES, VENUE_TYPES, websiteRegion } from "@/lib/venue-options";
import { shrinkImage } from "@/lib/image-resize";
import { deleteVenue, discardVenueUploads, saveVenue, uploadVenuePhoto } from "@/server/admin/actions/catalog";
import type { VenueForm } from "@/server/admin/types";
import styles from "../activities/SessionEditor.module.css";
import { FormCard, MultiChips, SingleChips, TextArea, Toggle } from "../ui/AdminForm";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, Badge } from "../ui/AdminUI";
import { useConfirm } from "../ui/ConfirmDialog";
import { useImageCrop } from "@/components/ui/ImageCropper/ImageCropper";
import { useUploadCleanup } from "../ui/useUploadCleanup";
import { toast, ToastOnMount } from "../ui/Toaster";

const typeOptions = VENUE_TYPES.map((t) => ({ value: t, label: t }));
const facilityOptions = VENUE_FACILITIES.map((f) => ({ value: f, label: f }));

/** Ubah jumlah lapangan: nama yang sudah diisi dipertahankan, lapangan baru diberi nama "Court n" yang belum dipakai. */
function resizeCourts(courts: string[], count: number): string[] {
  const next = courts.slice(0, count);
  for (let n = 1; next.length < count; n++) if (!next.includes(`Court ${n}`)) next.push(`Court ${n}`);
  return next;
}

/** Tambah / edit venue — tampil di halaman Venue, detail venue, dan homepage. */
export function VenueEditor({ initial, imageOptions, initialNotice }: { initial: VenueForm; imageOptions: string[]; initialNotice?: string }) {
  const [v, setV] = useState(initial);
  const [saving, start] = useTransition();
  const [uploading, setUploading] = useState<"coverPath" | "heroPath" | null>(null);
  const [crop, cropDialog] = useImageCrop();
  const [confirm, confirmDialog] = useConfirm();
  const uploads = useUploadCleanup(discardVenueUploads);
  const set = <K extends keyof VenueForm>(key: K, value: VenueForm[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const isNew = !initial.id && !initial.slug;

  const save = () => {
    // Tunggu upload selesai — kalau tidak, venue tersimpan dengan foto lama.
    if (uploading) return;
    start(async () => {
      const result = await uploads.save(() => saveVenue(v), { isNew, stored: [initial.coverPath, initial.heroPath], current: [v.coverPath, v.heroPath] });
      toast.result(result);
    });
  };

  /** Upload langsung ke Storage; URL baru tersimpan ke venue saat admin menekan Simpan. */
  const upload = async (key: "coverPath" | "heroPath", picked: File | undefined) => {
    if (!picked || uploading) return;
    // Crop sesuai tempat tampilnya: cover = kartu venue, hero = banner detail venue.
    const file = key === "coverPath" ? await crop(picked, 633 / 371, "Foto cover venue") : await crop(picked, 1312 / 560, "Foto hero venue");
    if (!file) return;
    setUploading(key);
    // Foto HP > 4,5 MB ditolak Vercel sebelum sampai server → perkecil dulu di browser.
    const body = new FormData();
    body.append("file", await shrinkImage(file));
    const result = await uploadVenuePhoto(body).catch(() => ({ ok: false as const, error: "Upload gagal — coba lagi." }));
    setUploading(null);
    if (!result.ok) return toast.error(result.error);
    uploads.track(result.url);
    set(key, result.url);
    toast.success(`Foto terupload — tekan ${isNew ? "Simpan venue" : "Simpan perubahan"} untuk menerapkannya.`);
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Hapus venue ${v.name}?`,
      body: <p>Venue hilang dari website dan pilihan venue saat membuat sesi. Venue yang masih punya sesi tidak bisa dihapus — sembunyikan saja dari website.</p>,
      confirmLabel: "Hapus venue",
    });
    if (!ok) return;
    const id = v.id;
    if (!id) return toast.error("Venue ini belum tersimpan di database.");
    start(async () => {
      const result = await deleteVenue(id);
      if (!result.ok) toast.error(result.error);
    });
  };

  const imageSelect = (label: string, key: "coverPath" | "heroPath", hint?: string) => (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.selectWrap}>
        <select aria-label={label} className={cx(styles.input, styles.select)} value={v[key]} onChange={(e) => set(key, e.target.value)}>
          <option value="">{key === "heroPath" ? "Sama dengan cover" : "Pilih foto…"}</option>
          {[...new Set([v[key], ...imageOptions].filter(Boolean))].map((src) => (
            <option key={src} value={src}>
              {src.startsWith("https://") ? `Upload: ${src.split("/").pop()}` : src.replace("/images/", "")}
            </option>
          ))}
        </select>
        <AdminIcon name="caret-down" size={14} />
      </span>
      <label className={cx(styles.dropzone, uploading === key && styles.dropzoneBusy)}>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="visually-hidden"
          disabled={uploading !== null}
          onChange={(e) => {
            upload(key, e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <AdminIcon name="upload-simple" size={20} />
        <strong>{uploading === key ? "Mengupload…" : "Upload foto sendiri"}</strong>
        <span className={styles.muted}>JPG/PNG/WebP · maks 5 MB</span>
      </label>
      {hint && <span className={styles.muted}>{hint}</span>}
    </div>
  );

  return (
    <div className={styles.editor}>
      {cropDialog}
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
            <AdminButton size="sm" icon="trash" onClick={remove} disabled={saving}>
              Hapus venue
            </AdminButton>
          )}
          {!isNew && (
            <AdminButton href={`/venue/${v.slug}`} target="_blank" size="sm" icon="eye">
              Lihat di website
            </AdminButton>
          )}
          <AdminButton variant="primary" size="sm" icon="check-bold" onClick={save} disabled={saving || uploading !== null}>
            {saving ? "Menyimpan…" : uploading ? "Menunggu upload…" : isNew ? "Simpan venue" : "Simpan perubahan"}
          </AdminButton>
        </div>
      </div>

      {initialNotice && <ToastOnMount text={initialNotice} />}
      {confirmDialog}

      <div className={styles.grid}>
        <div className={styles.main}>
          <FormCard title="Info venue" subtitle="Tampil di halaman Venue & Venue Detail">
            <label className={styles.field}>
              <span className={styles.label}>Nama venue *</span>
              <input className={styles.input} value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="mis. Common Grounds Menteng" />
            </label>
            <div className={styles.cols2}>
              <label className={styles.field}>
                <span className={styles.label}>Kota *</span>
                <span className={styles.selectWrap}>
                  <select
                    className={cx(styles.input, styles.select)}
                    value={v.city}
                    onChange={(e) => setV((prev) => ({ ...prev, city: e.target.value, timezone: timezoneForCity(e.target.value) ?? prev.timezone }))}
                  >
                    {!v.city && <option value="">Pilih kota…</option>}
                    {/* Venue lama tersimpan dengan wilayah "Jakarta" / "Bali" — tetap bisa disimpan, tapi sebaiknya pilih kotanya. */}
                    {v.city && !INDONESIA_CITIES.some((c) => c.city === v.city) && <option value={v.city}>{v.city} (data lama — pilih kotanya)</option>}
                    {INDONESIA_CITIES.map((c) => (
                      <option key={c.city} value={c.city}>
                        {c.city} — {c.province}
                      </option>
                    ))}
                  </select>
                  <AdminIcon name="caret-down" size={14} />
                </span>
                {v.city && !websiteRegion(v.city) && <span className={styles.muted}>Website baru menampilkan venue di Jakarta (Jabodetabek) & Bali — venue di kota ini belum tampil di halaman Venue.</span>}
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Area</span>
                <input className={styles.input} value={v.area} onChange={(e) => set("area", e.target.value)} placeholder="mis. Menteng, Jakarta Pusat" />
              </label>
            </div>
            <SingleChips label="Tipe court *" options={typeOptions} value={v.type as (typeof VENUE_TYPES)[number]} onChange={(t) => set("type", t)} />
            <TextArea label="Deskripsi" value={v.description} onChange={(x) => set("description", x)} maxLength={500} rows={4} />
            <TextArea label="Tagline (hero detail venue)" value={v.tagline} onChange={(x) => set("tagline", x)} maxLength={140} rows={2} />
          </FormCard>

          <FormCard title="Lokasi" subtitle="Dipakai untuk peta & petunjuk arah peserta">
            <TextArea label="Alamat lengkap" required value={v.address} onChange={(x) => set("address", x)} maxLength={300} rows={3} />
            <div className={styles.cols2}>
              <label className={styles.field}>
                <span className={styles.label}>Link Google Maps *</span>
                <span className={styles.affix}>
                  <AdminIcon name="link-simple" size={16} />
                  <input value={v.mapsUrl} onChange={(e) => set("mapsUrl", e.target.value)} placeholder="https://maps.app.goo.gl/…" />
                </span>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Patokan</span>
                <input className={styles.input} value={v.landmark} onChange={(e) => set("landmark", e.target.value)} placeholder="mis. Seberang Taman Suropati" />
              </label>
            </div>
            <label className={styles.field}>
              <span className={styles.label}>Zona waktu *</span>
              <span className={styles.selectWrap}>
                <select className={cx(styles.input, styles.select)} value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
                  {VENUE_TIMEZONES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <AdminIcon name="caret-down" size={14} />
              </span>
              <span className={styles.muted}>Terisi otomatis dari kota — ganti bila perlu. Contoh: (GMT+08:00) WITA untuk venue di Bali.</span>
            </label>
          </FormCard>

          <FormCard title="Lapangan & fasilitas">
            <div className={styles.cols2}>
              <label className={styles.field}>
                <span className={styles.label}>Jumlah lapangan *</span>
                <span className={styles.selectWrap}>
                  <select className={cx(styles.input, styles.select)} value={v.courts.length} onChange={(e) => set("courts", resizeCourts(v.courts, Number(e.target.value)))}>
                    {Array.from({ length: Math.max(MAX_COURTS, v.courts.length) }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                  <AdminIcon name="caret-down" size={14} />
                </span>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Permukaan *</span>
                <span className={styles.selectWrap}>
                  <select className={cx(styles.input, styles.select)} value={v.surface} onChange={(e) => set("surface", e.target.value)}>
                    {!v.surface && <option value="">Pilih permukaan…</option>}
                    {VENUE_SURFACES.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                  <AdminIcon name="caret-down" size={14} />
                </span>
              </label>
            </div>
            <fieldset className={styles.fieldset}>
              <legend className={styles.label}>Nama lapangan * (dipakai di pilihan “Lapangan” saat membuat sesi)</legend>
              <div className={styles.cols2}>
                {v.courts.map((court, i) => (
                  <input
                    key={i}
                    className={styles.input}
                    aria-label={`Nama lapangan ${i + 1}`}
                    value={court}
                    placeholder={`Court ${i + 1}`}
                    onChange={(e) => set("courts", v.courts.map((c, j) => (j === i ? e.target.value : c)))}
                  />
                ))}
              </div>
            </fieldset>
            <MultiChips label="Fasilitas" options={facilityOptions} values={v.facilities as (typeof VENUE_FACILITIES)[number][]} onChange={(x) => set("facilities", x)} />
          </FormCard>
        </div>

        <aside className={styles.side}>
          <FormCard title="Publikasi">
            <Toggle label="Tampil di website" hint="Halaman Venue & detail venue" checked={v.active} onChange={(x) => set("active", x)} />
            <Toggle label="Tampil di homepage" hint='Section "Kami Hanya Bermain di Tempat…"' checked={v.homepage} onChange={(x) => set("homepage", x)} />
          </FormCard>
          <FormCard title="Foto" subtitle="Pilih foto yang sudah ada di website, atau upload foto sendiri">
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
