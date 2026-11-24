"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { formatRupiahPlain } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { dateFromFileName, kuyBookmarklet, matchVenue, readKuyEventHash, typeFromTitle, usualPrice, venueFromTitle, wibParts, type KuyEvent } from "@/lib/kuy-activity";
import { importActivity, type ImportActivityInput } from "@/server/admin/actions/import-activity";
import { previewKuyImport } from "@/server/admin/actions/play";
import type { KuyImportPreview } from "@/server/admin/types";
import { FormCard } from "../ui/AdminForm";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, PickerInput } from "../ui/AdminUI";
import { toast } from "../ui/Toaster";
import { KuyPreviewTable } from "./KuyPreviewTable";
import editor from "./SessionEditor.module.css";
import styles from "./Play.module.css";

/**
 * Import activity dari Kuyy: upload file peserta → judul, venue ([…] di judul), tanggal (awalan nama file
 * YYMMDD), tipe & harga terisi otomatis → admin isi jam & cek → activity + peserta dibuat sekaligus.
 * Jadwal & detail event: tombol bookmark "Kirim ke Slay Club" diklik admin di halaman event Kuyy → halaman ini
 * terbuka dengan data event di hash URL (#kuy=…) → jam, tanggal, venue, harga, kuota, deskripsi & link ikut
 * terisi saat file peserta di-upload. Server tidak bisa membuka kuyy.id sendiri (diblokir).
 */

type Fields = Omit<ImportActivityInput, "price" | "capacity"> & { price: string; capacity: string };

const EMPTY: Fields = { title: "", typeSlug: "weekly-mabar", description: "", venueName: "", date: "", start: "", end: "", price: "", capacity: "", kuyUrl: "", status: "published" };
const DESCRIPTION_MAX = 500;

const noopSubscribe = () => () => {};
// Hash dibaca sekali saat halaman dibuka (lalu dihapus dari URL) — disimpan supaya render berikutnya tetap dapat.
let openedHash: string | null = null;
const readHash = () => (openedHash ??= window.location.hash);

/** Isian dari data event Kuyy (menimpa tebakan dari file); kapasitas minimal jumlah peserta di file. */
function eventFields(ev: KuyEvent, venues: string[], participants: number): Partial<Fields> {
  const start = wibParts(ev.start);
  const end = wibParts(ev.end);
  const venue = (ev.venue && matchVenue(ev.venue, venues)) || venueFromTitle(ev.title, venues);
  const description = ev.description.length > DESCRIPTION_MAX ? `${ev.description.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…` : ev.description;
  return {
    ...(ev.title && { title: ev.title.trim(), typeSlug: typeFromTitle(ev.title) }),
    ...(venue && { venueName: venue }),
    ...(start.date && { date: start.date, start: start.time }),
    ...(end.time && { end: end.time }),
    ...(ev.price > 0 && { price: String(ev.price) }),
    ...(ev.quota > 0 && { capacity: String(Math.max(ev.quota, participants)) }),
    ...(description && { description }),
    ...(ev.url && { kuyUrl: ev.url }),
  };
}

/** " · Min, 6 Des 2026 14.00–16.00" dari jadwal event Kuyy. */
function eventWhen(ev: KuyEvent): string {
  const start = new Date(ev.start);
  if (Number.isNaN(start.getTime())) return "";
  const day = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(start);
  const end = wibParts(ev.end).time;
  return ` · ${day} ${wibParts(ev.start).time.replace(":", ".")}${end ? `–${end.replace(":", ".")}` : ""}`;
}

export function ImportActivity({ types, venues }: { types: { slug: string; label: string }[]; venues: { name: string; city: string }[] }) {
  const router = useRouter();
  const fileRef = useRef<File | null>(null);
  const [preview, setPreview] = useState<KuyImportPreview | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [guessedVenue, setGuessedVenue] = useState(false);
  const hash = useSyncExternalStore(noopSubscribe, readHash, () => "");
  const kuyEvent = hash ? readKuyEventHash(hash) : null;
  const bookmarkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // Data event sudah terbaca → hapus dari URL (refresh / bagikan link tidak membawa data lama).
    if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
    // React menolak href "javascript:" → tombol bookmark dipasang langsung ke elemennya.
    bookmarkRef.current?.setAttribute("href", kuyBookmarklet(window.location.origin));
  }, []);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();
  const set = (patch: Partial<Fields>) => {
    setFields((f) => ({ ...f, ...patch }));
    setFormError(null);
  };

  const fileForm = (selected?: string[]) => {
    const form = new FormData();
    if (fileRef.current) form.append("file", fileRef.current);
    if (selected) form.append("selected", JSON.stringify(selected));
    return form;
  };

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    fileRef.current = file;
    setFileError(null);
    startReading(async () => {
      const res = await previewKuyImport(null, fileForm()).catch(() => ({ ok: false as const, error: "File gagal dibaca — coba lagi." }));
      if (!res.ok) {
        fileRef.current = null;
        setPreview(null);
        return setFileError(res.error);
      }
      const p = res.preview;
      const importable = p.rows.filter((r) => !r.skipReason);
      const names = venues.map((v) => v.name);
      const fromEvent = kuyEvent ? eventFields(kuyEvent, names, importable.length) : {};
      const venue = fromEvent.venueName ?? venueFromTitle(p.eventTitle, names);
      setPreview(p);
      setPicked(new Set(importable.map((r) => r.regNo)));
      setGuessedVenue(Boolean(venue));
      // Isian dari file sebelumnya diganti; link & status yang sudah diisi admin tetap.
      setFields((f) => ({
        ...f,
        title: p.eventTitle.trim(),
        typeSlug: typeFromTitle(p.eventTitle),
        venueName: venue ?? "",
        date: dateFromFileName(p.fileName),
        price: String(usualPrice(importable) || ""),
        capacity: String(Math.max(1, importable.length)),
        ...fromEvent,
      }));
      setFormError(null);
    });
  };

  const clearFile = () => {
    fileRef.current = null;
    setPreview(null);
    setPicked(new Set());
    setFields((f) => ({ ...EMPTY, kuyUrl: f.kuyUrl, status: f.status }));
  };

  const missing = [
    !fields.title.trim() && "judul",
    !fields.venueName && "venue",
    !fields.date && "tanggal",
    !fields.start && "jam mulai",
    !fields.end && "jam selesai",
  ].filter(Boolean);

  const submit = () => {
    if (!preview) return;
    if (missing.length) return setFormError(`Lengkapi ${missing.join(", ")}.`);
    if (!picked.size) return setFormError("Pilih minimal 1 peserta.");
    const capacity = Number(fields.capacity);
    if (!Number.isInteger(capacity) || capacity < picked.size) return setFormError(`Kapasitas minimal ${picked.size} (jumlah peserta yang diimpor).`);
    const price = Number(fields.price.replace(/\D/g, "") || 0);
    startSaving(async () => {
      const res = await importActivity({ ...fields, title: fields.title.trim(), price, capacity }, fileForm([...picked]));
      toast.result(res);
      if (res.ok && res.id) router.push(`/admin/activities/${res.id}`);
      else if (!res.ok) setFormError(res.error);
    });
  };

  const rows = preview?.rows ?? [];
  const members = rows.filter((r) => r.member && !r.skipReason).length;
  const ghosts = rows.filter((r) => !r.member && !r.skipReason).length;
  const skipped = rows.filter((r) => r.skipReason).length;
  const totalPaid = rows.filter((r) => picked.has(r.regNo)).reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className={editor.main}>
      {kuyEvent ? (
        <p className={styles.info}>
          <AdminIcon name="check-circle" size={16} />
          <span>
            Data event dari Kuyy diterima: <strong>{kuyEvent.title}</strong>
            {eventWhen(kuyEvent)}
            {kuyEvent.venue && ` · ${kuyEvent.venue}`}. Upload file peserta untuk melanjutkan.
          </span>
        </p>
      ) : (
        <FormCard title="Isi otomatis dari halaman Kuyy" subtitle="Pasang sekali di browser laptop, lalu jadwal, venue, harga & deskripsi terisi sendiri">
          <ol className={editor.muted}>
            <li>
              Tarik tombol ini ke bookmarks bar browser (tidak terlihat? tekan Cmd+Shift+B):{" "}
              <a ref={bookmarkRef} className={styles.pickButton} onClick={(e) => e.preventDefault()} draggable>
                <AdminIcon name="upload-simple" size={14} />
                Kirim ke Slay Club
              </a>
            </li>
            <li>Buka halaman event di Kuyy (link kuyy.app/…), lalu klik bookmark &quot;Kirim ke Slay Club&quot;.</li>
            <li>Halaman ini terbuka dengan data event terisi — tinggal upload file peserta.</li>
          </ol>
        </FormCard>
      )}

      <FormCard title="1. File peserta Kuyy" subtitle="Export peserta event dari Kuyy (.xlsx) — 1 file = 1 activity">
        {preview ? (
          <div className={styles.fileCard}>
            <span className={styles.xlsxIcon}>XLSX</span>
            <span className={styles.importMeta}>
              <strong>{preview.fileName}</strong>
              <span>
                {rows.length} peserta terbaca · {members} member · {ghosts} belum daftar{skipped ? ` · ${skipped} dilewati` : ""}
              </span>
            </span>
            <button type="button" className={styles.fileAction} onClick={clearFile}>
              <AdminIcon name="upload-simple" size={14} />
              Ganti file
            </button>
          </div>
        ) : (
          <label
            className={styles.dropBig}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              chooseFile(e.dataTransfer.files[0]);
            }}
          >
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="visually-hidden"
              disabled={reading}
              onChange={(e) => {
                chooseFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <span className={styles.dropIcon}>
              <AdminIcon name="upload-simple" size={22} />
            </span>
            <strong>{reading ? "Membaca file…" : "Tarik & lepas file .xlsx export Kuyy di sini"}</strong>
            <span className={styles.dropOr}>
              atau
              <span className={styles.pickButton}>
                <AdminIcon name="upload-simple" size={14} />
                Pilih file
              </span>
            </span>
            <span className={editor.muted}>Nama file diawali tanggal (mis. 261122 …) → tanggal activity terisi otomatis</span>
          </label>
        )}
        {fileError && (
          <p className={cx(styles.info, styles.warn)} role="alert">
            <AdminIcon name="warning-circle" size={16} />
            {fileError}
          </p>
        )}
      </FormCard>

      {preview && (
        <>
          <FormCard title="2. Detail activity" subtitle={kuyEvent ? "Terisi dari halaman event & file Kuyy — cek sebelum import" : "Terisi dari file — isi jam main (tidak ada di file Kuyy)"}>
            <label className={editor.field}>
              <span className={editor.label}>Judul *</span>
              <input className={editor.input} value={fields.title} onChange={(e) => set({ title: e.target.value })} />
            </label>
            <div className={editor.cols2}>
              <label className={editor.field}>
                <span className={editor.label}>Tipe *</span>
                <span className={editor.selectWrap}>
                  <select className={cx(editor.input, editor.select)} value={fields.typeSlug} onChange={(e) => set({ typeSlug: e.target.value })}>
                    {types.map((t) => (
                      <option key={t.slug} value={t.slug}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <AdminIcon name="caret-down" size={14} />
                </span>
              </label>
              <label className={editor.field}>
                <span className={editor.label}>Venue *</span>
                <span className={editor.selectWrap}>
                  <AdminIcon name="map-pin" size={16} />
                  <select className={cx(editor.input, editor.select, editor.withIcon)} value={fields.venueName} onChange={(e) => set({ venueName: e.target.value })}>
                    <option value="">Pilih venue…</option>
                    {venues.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} · {v.city}
                      </option>
                    ))}
                  </select>
                  <AdminIcon name="caret-down" size={14} />
                </span>
                <span className={editor.muted}>
                  {guessedVenue ? "Dicocokkan dari [ … ] di judul — pastikan benar." : "Venue di judul belum ada di daftar — pilih, atau tambahkan dulu di menu Venues."}
                </span>
              </label>
            </div>
            <div className={editor.cols3}>
              <label className={editor.field}>
                <span className={editor.label}>Tanggal *</span>
                <PickerInput type="date" className={editor.input} value={fields.date} onChange={(e) => set({ date: e.target.value })} />
              </label>
              <label className={editor.field}>
                <span className={editor.label}>Jam mulai *</span>
                <PickerInput type="time" className={editor.input} value={fields.start} onChange={(e) => set({ start: e.target.value })} />
              </label>
              <label className={editor.field}>
                <span className={editor.label}>Jam selesai *</span>
                <PickerInput type="time" className={editor.input} value={fields.end} onChange={(e) => set({ end: e.target.value })} />
              </label>
            </div>
            <div className={editor.cols3}>
              <label className={editor.field}>
                <span className={editor.label}>Harga tiket (Rp)</span>
                <input className={editor.input} inputMode="numeric" value={fields.price} onChange={(e) => set({ price: e.target.value.replace(/\D/g, "") })} />
              </label>
              <label className={editor.field}>
                <span className={editor.label}>Kapasitas *</span>
                <input className={editor.input} inputMode="numeric" value={fields.capacity} onChange={(e) => set({ capacity: e.target.value.replace(/\D/g, "") })} />
              </label>
              <label className={editor.field}>
                <span className={editor.label}>Status</span>
                <span className={editor.selectWrap}>
                  <select className={cx(editor.input, editor.select)} value={fields.status} onChange={(e) => set({ status: e.target.value as Fields["status"] })}>
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                  <AdminIcon name="caret-down" size={14} />
                </span>
              </label>
            </div>
            <label className={editor.field}>
              <span className={editor.label}>Deskripsi</span>
              <textarea className={editor.input} rows={5} maxLength={DESCRIPTION_MAX} value={fields.description} onChange={(e) => set({ description: e.target.value })} />
              <span className={editor.muted}>
                {fields.description.length}/{DESCRIPTION_MAX} karakter
              </span>
            </label>
            <label className={editor.field}>
              <span className={editor.label}>Link event Kuyy</span>
              <input className={editor.input} value={fields.kuyUrl} onChange={(e) => set({ kuyUrl: e.target.value })} placeholder="https://kuyy.app/…" inputMode="url" />
              <span className={editor.muted}>Disimpan sebagai link booking activity.</span>
            </label>
          </FormCard>

          <FormCard title={`3. Peserta (${picked.size} dipilih)`} subtitle="Yang belum daftar dicatat sebagai ghost member — foto & riwayat activity-nya muncul sendiri saat dia daftar">
            <KuyPreviewTable rows={rows} picked={picked} onPickedChange={setPicked} sessionTitle={fields.title} />
            <p className={styles.info}>
              <AdminIcon name="question" size={16} />
              Activity yang sudah lewat → peserta langsung tercatat hadir dan member dapat Slay Point kehadiran. Total dibayar: {formatRupiahPlain(totalPaid)}.
            </p>
          </FormCard>

          {formError && (
            <p className={cx(styles.info, styles.warn)} role="alert">
              <AdminIcon name="warning-circle" size={16} />
              {formError}
            </p>
          )}
          <div className={editor.cardActions}>
            <AdminButton href="/admin/activities">Batal</AdminButton>
            <AdminButton variant="primary" icon="check-bold" onClick={submit} disabled={saving}>
              {saving ? "Mengimpor…" : `Import activity + ${picked.size} peserta`}
            </AdminButton>
          </div>
        </>
      )}
    </div>
  );
}
