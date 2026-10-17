"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import { cx } from "@/lib/cx";
import { initials } from "@/lib/text";
import { detectVideoPlatform, formatDuration, VIDEO_PLATFORM_LABEL } from "@/lib/video";
import { deleteTestimonial, saveTestimonial, setTestimonialVisible, type TestimonialInput } from "@/server/admin/actions/content";
import type { AdminTestimonial, MemberChoice } from "@/server/admin/types";
import ordersStyles from "../orders/Orders.module.css";
import settingsStyles from "../settings/Settings.module.css";
import { ActionNotice, type Notice } from "../ui/ActionNotice";
import { TextArea, Toggle } from "../ui/AdminForm";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, Badge } from "../ui/AdminUI";
import styles from "./Testimonials.module.css";

const toInput = (t: AdminTestimonial): TestimonialInput => ({
  kind: t.kind,
  name: t.name,
  handle: t.handle,
  quote: t.quote,
  memberId: t.memberId,
  sortOrder: t.sortOrder,
  visible: t.visible,
  videoUrl: t.videoUrl,
  durationSeconds: t.durationSeconds,
});

type Props = { initial: AdminTestimonial[]; members: MemberChoice[]; empty: AdminTestimonial };

/** Tab Testimoni & IG (Figma 09b–09f): daftar testimoni + panel tambah/ubah (teks atau video 9:16). */
export function TestimonialManager({ initial, members, empty }: Props) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<AdminTestimonial | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, start] = useTransition();
  const videos = items.filter((t) => t.kind === "video").length;

  const toggle = (t: AdminTestimonial) => {
    const next = !t.visible;
    const apply = (visible: boolean) => setItems((list) => list.map((x) => (x.id === t.id ? { ...x, visible } : x)));
    apply(next);
    start(async () => {
      const result = await setTestimonialVisible(t.id, next);
      if (!result.ok) apply(!next);
      setNotice(result.ok ? { text: result.message } : { text: result.error, error: true });
    });
  };

  const remove = (t: AdminTestimonial) => {
    if (!window.confirm(`Hapus testimoni ${t.name}? Tindakan ini tidak bisa dibatalkan.`)) return;
    start(async () => {
      const result = await deleteTestimonial(t.id);
      if (result.ok) {
        setItems((list) => list.filter((x) => x.id !== t.id));
        if (editing?.id === t.id) setEditing(null);
      }
      setNotice(result.ok ? { text: result.message } : { text: result.error, error: true });
    });
  };

  const saved = (t: AdminTestimonial) => {
    setItems((list) => {
      const exists = list.some((x) => x.id === t.id);
      return (exists ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t]).sort((a, b) => a.sortOrder - b.sortOrder);
    });
    setEditing(t);
  };

  return (
    <div className={styles.layout}>
      <section className={ordersStyles.listCard} aria-label="Testimoni komunitas">
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>Testimoni komunitas</h2>
            <p className={ordersStyles.muted}>
              {items.length} testimoni{videos ? ` (${videos} video)` : ""} · {items.filter((t) => t.visible).length} tampil di homepage · urut sesuai “Urutan tampil”
            </p>
          </div>
          <AdminButton variant="primary" size="sm" icon="plus-bold" onClick={() => setEditing({ ...empty, sortOrder: items.length + 1 })}>
            Tambah testimoni
          </AdminButton>
        </header>
        <ActionNotice notice={notice} />
        {items.length === 0 ? (
          <p className={ordersStyles.empty}>Belum ada testimoni. Tambahkan kutipan atau video member pertama.</p>
        ) : (
          <ul className={styles.list}>
            {items.map((t) => (
              <li key={t.id} className={cx(styles.row, editing?.id === t.id && styles.rowActive, !t.visible && styles.rowOff)}>
                <span className={styles.order} aria-label={`Urutan ${t.sortOrder}`}>
                  {t.sortOrder}
                </span>
                {t.kind === "video" ? (
                  <span className={styles.videoThumb} aria-hidden>
                    <AdminIcon name="arrow-up-right" size={14} />
                    {t.durationSeconds ? <span>{formatDuration(t.durationSeconds)}</span> : null}
                  </span>
                ) : t.avatar ? (
                  <span className={styles.avatar}>
                    <Image src={t.avatar} alt="" fill sizes="40px" />
                  </span>
                ) : (
                  <span className={cx(styles.avatar, styles.initials)} aria-hidden>
                    {initials(t.name)}
                  </span>
                )}
                <button type="button" className={styles.rowText} onClick={() => setEditing(t)}>
                  <span className={ordersStyles.strong}>
                    {t.name}
                    {t.handle && <span className={ordersStyles.muted}> · {t.handle}</span>}
                  </span>
                  <span className={styles.quote}>
                    {t.kind === "video" && `${VIDEO_PLATFORM_LABEL[t.videoPlatform ?? "instagram"]}${t.durationSeconds ? ` ${formatDuration(t.durationSeconds)}` : ""}${t.quote ? " · " : ""}`}
                    {t.quote && `“${t.quote}”`}
                  </span>
                </button>
                <Badge tone={t.kind === "video" ? "lime" : t.memberId ? "indigo" : "neutral"}>{t.kind === "video" ? "Video" : t.memberId ? "Member" : "Manual"}</Badge>
                <button
                  type="button"
                  role="switch"
                  aria-checked={t.visible}
                  aria-label={`Tampilkan testimoni ${t.name}`}
                  className={cx(styles.switch, t.visible && styles.switchOn)}
                  disabled={pending}
                  onClick={() => toggle(t)}
                >
                  <span />
                </button>
                <button type="button" className={ordersStyles.iconLink} aria-label={`Edit testimoni ${t.name}`} onClick={() => setEditing(t)}>
                  <AdminIcon name="pencil-simple" size={18} />
                </button>
                <button type="button" className={cx(ordersStyles.iconLink, styles.danger)} aria-label={`Hapus testimoni ${t.name}`} onClick={() => remove(t)} disabled={pending}>
                  <AdminIcon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && <TestimonialEditor key={editing.id || "new"} testimonial={editing} members={members} onClose={() => setEditing(null)} onSaved={saved} onDelete={() => remove(editing)} />}
    </div>
  );
}

type EditorProps = {
  testimonial: AdminTestimonial;
  members: MemberChoice[];
  onClose: () => void;
  onSaved: (t: AdminTestimonial) => void;
  onDelete: () => void;
};

function TestimonialEditor({ testimonial, members, onClose, onSaved, onDelete }: EditorProps) {
  const isNew = !testimonial.id;
  const [form, setForm] = useState<TestimonialInput>(toInput(testimonial));
  const [source, setSource] = useState<"link" | "upload">(testimonial.videoPlatform === "upload" ? "upload" : "link");
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, start] = useTransition();
  const set = <K extends keyof TestimonialInput>(key: K, value: TestimonialInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const platform = detectVideoPlatform(form.videoUrl ?? "");
  const memberLabel = (m: MemberChoice) => `${m.name} · ${m.code}`;
  const linkedMember = useMemo(() => members.find((m) => m.id === form.memberId), [members, form.memberId]);
  const [memberQuery, setMemberQuery] = useState(linkedMember ? memberLabel(linkedMember) : "");

  const save = () =>
    start(async () => {
      const result = await saveTestimonial(testimonial.id, form);
      setNotice(result.ok ? { text: result.message } : { text: result.error, error: true });
      if (result.ok && result.id) {
        onSaved({
          ...testimonial,
          ...form,
          id: result.id,
          handle: form.handle.trim() ? `@${form.handle.trim().replace(/^@/, "")}` : "",
          videoPlatform: form.kind === "video" ? platform : null,
        });
      }
    });

  return (
    <aside className={styles.panel} aria-label={isNew ? "Tambah testimoni" : `Edit testimoni ${testimonial.name}`}>
      <header className={ordersStyles.panelHead}>
        <div>
          <h2 className={ordersStyles.panelTitle}>{isNew ? "Testimoni baru" : form.kind === "video" ? "Edit testimoni video" : "Edit testimoni"}</h2>
          {!isNew && <p className={ordersStyles.muted}>Tampil di posisi {testimonial.sortOrder}</p>}
        </div>
        <button type="button" className={ordersStyles.close} aria-label="Tutup editor" onClick={onClose}>
          <AdminIcon name="x" size={18} />
        </button>
      </header>

      <div className={styles.form}>
        <fieldset className={styles.fieldset}>
          <legend className={settingsStyles.label}>Jenis testimoni</legend>
          <div className={styles.segment}>
            {(["text", "video"] as const).map((kind) => (
              <button key={kind} type="button" aria-pressed={form.kind === kind} className={cx(styles.segmentOption, form.kind === kind && styles.segmentOn)} onClick={() => set("kind", kind)}>
                <AdminIcon name={kind === "text" ? "chat-circle-text" : "image"} size={16} />
                {kind === "text" ? "Teks" : "Video"}
              </button>
            ))}
          </div>
        </fieldset>

        {form.kind === "video" && (
          <div className={settingsStyles.field}>
            <div className={styles.videoHead}>
              <span className={settingsStyles.label}>Video *</span>
              <span className={styles.sourceTabs} role="group" aria-label="Sumber video">
                <button type="button" aria-pressed={source === "upload"} className={cx(styles.sourceTab, source === "upload" && styles.sourceOn)} onClick={() => setSource("upload")}>
                  Upload file
                </button>
                <button type="button" aria-pressed={source === "link"} className={cx(styles.sourceTab, source === "link" && styles.sourceOn)} onClick={() => setSource("link")}>
                  Link
                </button>
              </span>
            </div>
            {source === "upload" ? (
              <p className={ordersStyles.notice}>Upload video aktif setelah Supabase Storage tersambung. Untuk sekarang, tempel link Reels / TikTok / Shorts.</p>
            ) : (
              <>
                <span className={settingsStyles.affix}>
                  <AdminIcon name="link-simple" size={16} />
                  <input value={form.videoUrl ?? ""} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://www.instagram.com/reel/…" inputMode="url" />
                </span>
                {form.videoUrl ? (
                  platform ? (
                    <span className={styles.detected}>
                      <AdminIcon name="check-circle" size={14} /> {VIDEO_PLATFORM_LABEL[platform]} terdeteksi · tampil vertikal 9:16
                    </span>
                  ) : (
                    <span className={cx(styles.detected, styles.detectedError)}>Link belum dikenali — pakai link Instagram Reels, TikTok, atau YouTube Shorts.</span>
                  )
                ) : null}
                <div className={styles.preview}>
                  <div className={styles.previewFrame} aria-hidden>
                    <span className={styles.previewBadge}>9:16</span>
                    {form.durationSeconds ? <span className={cx(styles.previewBadge, styles.previewRight)}>{formatDuration(form.durationSeconds)}</span> : null}
                    <span className={styles.play}>▶</span>
                  </div>
                  <dl className={styles.previewMeta}>
                    <div>
                      <dt>Platform</dt>
                      <dd>{platform ? VIDEO_PLATFORM_LABEL[platform] : "—"}</dd>
                    </div>
                    <div>
                      <dt>Format</dt>
                      <dd>Vertikal 9:16</dd>
                    </div>
                    <div>
                      <dt>Durasi (detik)</dt>
                      <dd>
                        <input
                          className={styles.durationInput}
                          inputMode="numeric"
                          value={form.durationSeconds ?? ""}
                          placeholder="mis. 42"
                          aria-label="Durasi video dalam detik"
                          onChange={(e) => set("durationSeconds", e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")) : null)}
                        />
                      </dd>
                    </div>
                    {platform && form.videoUrl && (
                      <a href={form.videoUrl} target="_blank" rel="noopener noreferrer" className={styles.openLink}>
                        Buka di {VIDEO_PLATFORM_LABEL[platform].split(" ")[0]} ↗
                      </a>
                    )}
                  </dl>
                </div>
                <p className={ordersStyles.muted}>Didukung: TikTok, Instagram Reels, YouTube Shorts. Video vertikal 9:16, maks 60 detik disarankan.</p>
              </>
            )}
          </div>
        )}

        <label className={settingsStyles.field}>
          <span className={settingsStyles.label}>Nama *</span>
          <input className={settingsStyles.input} value={form.name} maxLength={80} onChange={(e) => set("name", e.target.value)} placeholder="mis. Anitya Ayu Silfia" />
        </label>
        <div className={styles.row2}>
          <label className={settingsStyles.field}>
            <span className={settingsStyles.label}>Instagram</span>
            <input className={settingsStyles.input} value={form.handle} maxLength={40} onChange={(e) => set("handle", e.target.value)} placeholder="@username" />
          </label>
          <label className={settingsStyles.field}>
            <span className={settingsStyles.label}>Urutan tampil</span>
            <span className={settingsStyles.affix}>
              <AdminIcon name="arrows-down-up" size={16} />
              <input inputMode="numeric" value={form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value.replace(/\D/g, "")) || 0)} />
            </span>
          </label>
        </div>
        <label className={settingsStyles.field}>
          <span className={settingsStyles.label}>Hubungkan ke member (opsional)</span>
          <input
            className={settingsStyles.input}
            list="testimonial-members"
            value={memberQuery}
            placeholder="Ketik nama atau no. member"
            onChange={(e) => {
              setMemberQuery(e.target.value);
              set("memberId", members.find((m) => memberLabel(m) === e.target.value)?.id ?? null);
            }}
          />
          <datalist id="testimonial-members">
            {members.map((m) => (
              <option key={m.id} value={memberLabel(m)} />
            ))}
          </datalist>
        </label>
        <TextArea
          label={form.kind === "video" ? "Caption (opsional)" : "Kutipan *"}
          value={form.quote}
          onChange={(v) => set("quote", v)}
          maxLength={200}
          rows={3}
        />
        <p className={ordersStyles.muted}>{form.kind === "video" ? "Tampil di bawah video" : "Tampil di carousel homepage"}</p>
        <Toggle label="Tampil di homepage" hint="Section “The People Make the Game”" checked={form.visible} onChange={(v) => set("visible", v)} />
      </div>

      <ActionNotice notice={notice} />
      <div className={styles.actions}>
        {!isNew && (
          <AdminButton variant="ghost" icon="trash" className={styles.danger} onClick={onDelete} disabled={saving}>
            Hapus
          </AdminButton>
        )}
        <AdminButton onClick={onClose} disabled={saving}>
          Batal
        </AdminButton>
        <AdminButton variant="primary" icon="check-bold" onClick={save} disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan"}
        </AdminButton>
      </div>
    </aside>
  );
}
