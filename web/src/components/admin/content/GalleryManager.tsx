"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { cx } from "@/lib/cx";
import { deleteGalleryPhoto, discardGalleryUploads, saveGalleryPhoto, uploadGalleryPhoto } from "@/server/admin/actions/content";
import type { AdminGalleryPhoto, GalleryActivity } from "@/server/admin/types";
import ordersStyles from "../orders/Orders.module.css";
import settingsStyles from "../settings/Settings.module.css";
import { TextArea } from "../ui/AdminForm";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton } from "../ui/AdminUI";
import { toast } from "../ui/Toaster";
import styles from "./Content.module.css";
import galleryStyles from "./Gallery.module.css";
import testimonialStyles from "./Testimonials.module.css";

const day = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const num = new Intl.NumberFormat("id-ID");
const venueOf = (p: AdminGalleryPhoto) => p.activity.venueName || "Tanpa venue";
const activityLabel = (a: { title: string; venueName: string; date: string }) => `${day.format(new Date(a.date))} · ${a.title}${a.venueName ? ` · ${a.venueName}` : ""}`;

type Props = {
  initial: AdminGalleryPhoto[];
  activities: GalleryActivity[];
  totalPhotos: number;
  totalAlbums: number;
  /** Ringkasan di tab Homepage: beberapa foto terbaru + tautan ke tab Galeri foto. */
  preview?: number;
};

/** Konten & Galeri → Galeri foto: foto per activity, caption, tag member peserta; tampil di galeri venue. */
export function GalleryManager({ initial, activities, totalPhotos, totalAlbums, preview }: Props) {
  const [photos, setPhotos] = useState(initial);
  const [editing, setEditing] = useState<AdminGalleryPhoto | "new" | null>(null);
  const [, start] = useTransition();
  const [venue, setVenue] = useState<string | null>(null);
  // Tab venue: foto dikelompokkan per venue activity-nya (sekali jalan), terbanyak dulu. Tidak dipakai di preview.
  const { groups, tabs } = useMemo(() => {
    const groups = new Map<string, AdminGalleryPhoto[]>();
    if (preview) return { groups, tabs: [] };
    for (const p of photos) {
      const v = venueOf(p);
      const list = groups.get(v);
      if (list) list.push(p);
      else groups.set(v, [p]);
    }
    const byVenue = [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "id"));
    return {
      groups,
      tabs: [{ value: null, label: "Semua venue", count: photos.length }, ...byVenue.map(([name, list]) => ({ value: name, label: name, count: list.length }))],
    };
  }, [photos, preview]);
  // Venue yang fotonya habis dihapus → kembali ke "Semua venue".
  const active = venue && groups.has(venue) ? venue : null;
  const shown = preview ? photos.slice(0, preview) : active ? (groups.get(active) ?? []) : photos;

  const remove = (photo: AdminGalleryPhoto) => {
    if (!window.confirm("Hapus foto ini dari galeri venue? Tindakan ini tidak bisa dibatalkan.")) return;
    start(async () => {
      const result = await deleteGalleryPhoto(photo.id);
      if (result.ok) {
        setPhotos((list) => list.filter((p) => p.id !== photo.id));
        setEditing(null);
      }
      toast.result(result);
    });
  };

  const saved = (photo: AdminGalleryPhoto, isNew: boolean) => {
    setPhotos((list) => (isNew ? [photo, ...list] : list.map((p) => (p.id === photo.id ? photo : p))));
    setEditing(null);
  };

  const tileBody = (p: AdminGalleryPhoto) => (
    <>
      <span className={cx(styles.albumCover, galleryStyles.cover)}>
        <Image src={p.url} alt="" fill sizes="(min-width: 1200px) 200px, (min-width: 640px) 33vw, 50vw" />
        {p.members.length > 0 && (
          <span className={galleryStyles.tagCount}>
            <AdminIcon name="users-three" size={12} /> {p.members.length}
          </span>
        )}
      </span>
      <span className={styles.albumTitle}>{p.activity.title}</span>
      <span className={styles.muted}>
        {day.format(new Date(p.activity.date))}
        {p.activity.venueName ? ` · ${p.activity.venueName}` : ""}
      </span>
      {p.caption && <span className={galleryStyles.caption}>{p.caption}</span>}
    </>
  );

  const list = (
    <section className={styles.card} aria-label="Galeri foto sesi">
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>Galeri foto sesi</h2>
          <p className={styles.muted}>
            {num.format(Math.max(totalPhotos, photos.length))} foto · {num.format(totalAlbums)} activity · tampil di galeri venue tempat activity berlangsung
          </p>
        </div>
        {preview ? (
          <AdminButton href="/admin/konten?tab=gallery" variant="primary" size="sm" icon="upload-simple">
            Upload foto
          </AdminButton>
        ) : (
          <AdminButton variant="primary" size="sm" icon="upload-simple" onClick={() => setEditing("new")}>
            Upload foto
          </AdminButton>
        )}
      </header>

      {tabs.length > 0 && (
        <div className={styles.filterPills} role="tablist" aria-label="Venue">
          {tabs.map((t) => (
            <button
              key={t.value ?? "all"}
              type="button"
              role="tab"
              aria-selected={active === t.value}
              className={cx(styles.pill, active === t.value && styles.pillOn)}
              onClick={() => setVenue(t.value)}
            >
              {t.label} <span className={galleryStyles.handle}>{num.format(t.count)}</span>
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className={ordersStyles.empty}>Belum ada foto. Upload foto, pilih activity-nya, lalu tag member yang ikut main.</p>
      ) : (
        <ul className={styles.albums}>
          {shown.map((p) => (
            <li key={p.id}>
              {preview ? (
                <Link href="/admin/konten?tab=gallery" className={cx(styles.album, galleryStyles.tile)}>
                  {tileBody(p)}
                </Link>
              ) : (
                <button
                  type="button"
                  className={cx(styles.album, galleryStyles.tile, editing !== "new" && editing?.id === p.id && galleryStyles.tileActive)}
                  onClick={() => setEditing(p)}
                >
                  {tileBody(p)}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {preview ? (
        <AdminButton href="/admin/konten?tab=gallery" size="sm" className={styles.more} iconAfter="caret-right">
          Lihat semua foto
        </AdminButton>
      ) : null}
    </section>
  );

  if (preview) return list;
  return (
    <div className={testimonialStyles.layout}>
      {list}
      {editing && (
        <GalleryEditor
          key={editing === "new" ? "new" : editing.id}
          photo={editing === "new" ? null : editing}
          activities={activities}
          onClose={() => setEditing(null)}
          onSaved={saved}
          onDelete={remove}
        />
      )}
    </div>
  );
}

type EditorProps = {
  photo: AdminGalleryPhoto | null;
  activities: GalleryActivity[];
  onClose: () => void;
  onSaved: (photo: AdminGalleryPhoto, isNew: boolean) => void;
  onDelete: (photo: AdminGalleryPhoto) => void;
};

function GalleryEditor({ photo, activities, onClose, onSaved, onDelete }: EditorProps) {
  const isNew = !photo;
  const [sessionId, setSessionId] = useState(photo?.sessionId ?? "");
  const [url, setUrl] = useState(photo?.url ?? "");
  const [caption, setCaption] = useState(photo?.caption ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(photo?.members.map((m) => m.id) ?? []);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, start] = useTransition();
  /** Upload di form ini yang belum tersimpan → dibuang saat form ditutup / foto diganti. */
  const pendingUploads = useRef<string[]>([]);

  const activity = activities.find((a) => a.id === sessionId);
  // Tag lama di foto yang activity-nya sudah di luar daftar tetap terlihat (dan bisa dilepas).
  const participants = useMemo(() => {
    const list = activity?.participants ?? [];
    const extra = (photo?.members ?? []).filter((m) => !list.some((p) => p.id === m.id)).map((m) => ({ ...m, instagram: "" }));
    return [...list, ...extra];
  }, [activity, photo]);
  const q = query.trim().toLowerCase();
  const visible = q ? participants.filter((p) => `${p.name} ${p.instagram}`.toLowerCase().includes(q)) : participants;

  // Editor ditutup / diganti foto lain / pindah tab → upload yang belum disimpan dibuang dari Storage.
  useEffect(
    () => () => {
      const leftovers = pendingUploads.current;
      pendingUploads.current = [];
      if (leftovers.length) void discardGalleryUploads(leftovers);
    },
    [],
  );
  const close = onClose;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const result = await uploadGalleryPhoto(form);
    setUploading(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (url && pendingUploads.current.includes(url)) void discardGalleryUploads([url]);
    pendingUploads.current = [...pendingUploads.current.filter((u) => u !== url), result.url];
    setUrl(result.url);
  };

  const toggle = (id: string) => setMemberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const changeActivity = (id: string) => {
    setSessionId(id);
    // Tag hanya untuk peserta activity yang dipilih.
    const allowed = new Set(activities.find((a) => a.id === id)?.participants.map((p) => p.id));
    setMemberIds((ids) => ids.filter((x) => allowed.has(x)));
  };

  const save = () =>
    start(async () => {
      const result = await saveGalleryPhoto({ id: photo?.id ?? null, sessionId, url, caption, memberIds });
      toast.result(result);
      if (!result.ok || !result.id) return;
      pendingUploads.current = [];
      const members = memberIds.map((id) => ({ id, name: participants.find((p) => p.id === id)?.name ?? "Member" }));
      onSaved(
        {
          id: result.id,
          url,
          caption: caption.trim(),
          sessionId,
          activity: photo?.activity ?? { title: activity?.title ?? "Activity", venueName: activity?.venueName ?? "", date: activity?.startsAt ?? new Date().toISOString() },
          members,
          createdAt: photo?.createdAt ?? new Date().toISOString(),
        },
        isNew,
      );
    });

  return (
    <aside className={testimonialStyles.panel} aria-label={isNew ? "Upload foto galeri" : "Edit foto galeri"}>
      <header className={ordersStyles.panelHead}>
        <div>
          <h2 className={ordersStyles.panelTitle}>{isNew ? "Upload foto" : "Edit foto"}</h2>
          <p className={ordersStyles.muted}>Tampil di galeri venue activity ini</p>
        </div>
        <button type="button" className={ordersStyles.close} aria-label="Tutup editor" onClick={close}>
          <AdminIcon name="x" size={18} />
        </button>
      </header>

      <div className={testimonialStyles.form}>
        {isNew ? (
          <label className={settingsStyles.field}>
            <span className={settingsStyles.label}>Activity *</span>
            <span className={galleryStyles.selectWrap}>
              <select className={settingsStyles.input} value={sessionId} onChange={(e) => changeActivity(e.target.value)}>
                <option value="">Pilih activity…</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {activityLabel({ title: a.title, venueName: a.venueName, date: a.startsAt })}
                  </option>
                ))}
              </select>
            </span>
            <span className={ordersStyles.muted}>Activity yang sudah berlangsung (120 hari terakhir). Foto tampil di galeri venue-nya.</span>
          </label>
        ) : (
          <div className={settingsStyles.field}>
            <span className={settingsStyles.label}>Activity</span>
            <span className={ordersStyles.strong}>{activityLabel(photo.activity)}</span>
          </div>
        )}

        <div className={settingsStyles.field}>
          <span className={settingsStyles.label}>Foto *</span>
          <div className={galleryStyles.photoRow}>
            <span className={galleryStyles.preview}>{url ? <Image src={url} alt="" fill sizes="120px" /> : <AdminIcon name="image" size={24} />}</span>
            {isNew && (
              <label className={cx(galleryStyles.dropzone, uploading && galleryStyles.busy)}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="visually-hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <AdminIcon name="upload-simple" size={20} />
                <strong>{uploading ? "Mengupload…" : url ? "Ganti foto" : "Pilih foto"}</strong>
                <span className={ordersStyles.muted}>JPG/PNG/WebP · maks 10 MB · potret 4:5 paling pas</span>
              </label>
            )}
          </div>
        </div>

        <TextArea label="Caption (opsional)" value={caption} onChange={setCaption} maxLength={200} rows={3} />

        <fieldset className={testimonialStyles.fieldset}>
          <legend className={settingsStyles.label}>
            Tag member {memberIds.length > 0 && <span className={ordersStyles.muted}>· {memberIds.length} dipilih</span>}
          </legend>
          {!sessionId ? (
            <p className={ordersStyles.muted}>Pilih activity dulu — yang bisa di-tag hanya member yang ikut main di activity itu.</p>
          ) : participants.length === 0 ? (
            <p className={ordersStyles.muted}>Belum ada peserta terdaftar di activity ini.</p>
          ) : (
            <>
              {participants.length > 8 && (
                <span className={settingsStyles.affix}>
                  <AdminIcon name="magnifying-glass" size={16} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Cari di ${participants.length} peserta…`} aria-label="Cari peserta" />
                </span>
              )}
              <ul className={galleryStyles.people}>
                {visible.map((p) => {
                  const on = memberIds.includes(p.id);
                  return (
                    <li key={p.id}>
                      <button type="button" aria-pressed={on} className={cx(galleryStyles.person, on && galleryStyles.personOn)} onClick={() => toggle(p.id)}>
                        <AdminIcon name={on ? "check-circle" : "plus-bold"} size={14} />
                        <span>{p.name}</span>
                        {p.instagram && <span className={galleryStyles.handle}>@{p.instagram.replace(/^@/, "")}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className={ordersStyles.muted}>Member ter-tag muncul sebagai avatar di kartu foto galeri venue.</p>
            </>
          )}
        </fieldset>
      </div>

      <div className={testimonialStyles.actions}>
        {photo && (
          <AdminButton variant="ghost" icon="trash" className={testimonialStyles.danger} onClick={() => onDelete(photo)} disabled={saving}>
            Hapus
          </AdminButton>
        )}
        <AdminButton onClick={close} disabled={saving}>
          Batal
        </AdminButton>
        <AdminButton variant="primary" icon="check-bold" onClick={save} disabled={saving || uploading || (isNew && (!sessionId || !url))}>
          {saving ? "Menyimpan…" : "Simpan"}
        </AdminButton>
      </div>
    </aside>
  );
}
