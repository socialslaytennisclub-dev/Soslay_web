"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type DragEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import type { ContentSection } from "@/server/admin/types";
import { TextArea, Toggle } from "../ui/AdminForm";
import { AdminIcon, type AdminIconName } from "../ui/AdminIcon";
import { AdminButton, Badge } from "../ui/AdminUI";
import styles from "./Content.module.css";

const clock = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/**
 * Tab Homepage (Figma 25:5873): urutan section (seret atau tombol naik/turun), aktif/nonaktif,
 * dan panel edit. Publikasikan masih demo sampai content_sections tersambung ke Supabase.
 */
export function HomepageEditor({ initial, tabs }: { initial: ContentSection[]; tabs: ReactNode }) {
  const [sections, setSections] = useState(initial);
  const [selectedKey, setSelectedKey] = useState<string | null>(initial[0]?.key ?? null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = sections.find((s) => s.key === selectedKey) ?? null;
  const dirty = savedAt !== null;

  // Di HP panel ada di bawah daftar: bawa ke layar saat section dipilih.
  const select = (key: string) => {
    setSelectedKey(key);
    if (window.matchMedia("(max-width: 1199px)").matches) {
      requestAnimationFrame(() => document.getElementById("section-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const touch = () => setSavedAt(new Date());
  const patch = (key: string, change: Partial<ContentSection>) => {
    setSections((list) => list.map((s) => (s.key === key ? { ...s, ...change } : s)));
    touch();
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= sections.length || from === to) return;
    setSections((list) => {
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    touch();
  };

  const onDragOver = (e: DragEvent, overKey: string) => {
    e.preventDefault();
    if (!dragKey || dragKey === overKey) return;
    move(
      sections.findIndex((s) => s.key === dragKey),
      sections.findIndex((s) => s.key === overKey),
    );
  };

  return (
    <>
      <div className={styles.toolbar}>
        {tabs}
        <div className={styles.toolbarActions}>
          <span className={styles.muted}>{dirty ? `Draft diubah · ${clock.format(savedAt)}` : "Sesuai versi live"}</span>
          <AdminButton href="/" target="_blank" icon="eye">
            Preview
          </AdminButton>
          <AdminButton
            variant="primary"
            icon="globe-simple"
            disabled={!dirty}
            onClick={() => setNotice("Mode demo: homepage belum dipublikasikan karena database (Supabase) belum tersambung.")}
          >
            Publikasikan
          </AdminButton>
        </div>
      </div>

      {notice && (
        <p className={styles.notice} role="status">
          <AdminIcon name="warning-circle" size={18} />
          {notice}
          <button type="button" className={styles.noticeClose} aria-label="Tutup" onClick={() => setNotice(null)}>
            <AdminIcon name="x" size={14} />
          </button>
        </p>
      )}

      <div className={styles.homeGrid}>
        <section className={styles.card}>
          <header className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Section homepage</h2>
              <p className={styles.muted}>Seret untuk mengatur urutan · {sections.length} section</p>
            </div>
            <AdminButton size="sm" icon="plus-bold" disabled title="Butuh database">
              Tambah section
            </AdminButton>
          </header>

          <ol className={styles.sections}>
            {sections.map((s, i) => (
              <li
                key={s.key}
                draggable
                onDragStart={() => setDragKey(s.key)}
                onDragOver={(e) => onDragOver(e, s.key)}
                onDragEnd={() => setDragKey(null)}
                className={cx(styles.section, s.key === selectedKey && styles.sectionSelected, s.key === dragKey && styles.sectionDragging, !s.enabled && styles.sectionOff)}
              >
                <span className={styles.handle} aria-hidden="true">
                  <AdminIcon name="dots-six-vertical" size={18} />
                </span>
                <span className={styles.sectionIcon}>
                  <AdminIcon name={s.icon as AdminIconName} size={18} />
                </span>
                <button type="button" className={styles.sectionText} onClick={() => select(s.key)} aria-pressed={s.key === selectedKey}>
                  <span className={styles.sectionName}>{s.name}</span>
                  <span className={styles.sectionSummary}>{s.summary}</span>
                </button>
                <span className={styles.sectionActions}>
                  {!s.enabled && (
                    <span className={styles.offBadge}>
                      <Badge tone="neutral" dot>
                        Nonaktif
                      </Badge>
                    </span>
                  )}
                  <span className={styles.reorder}>
                    <button type="button" aria-label={`Naikkan ${s.name}`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                      <AdminIcon name="caret-down" size={14} className={styles.flip} />
                    </button>
                    <button type="button" aria-label={`Turunkan ${s.name}`} disabled={i === sections.length - 1} onClick={() => move(i, i + 1)}>
                      <AdminIcon name="caret-down" size={14} />
                    </button>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={s.enabled}
                    aria-label={`Tampilkan ${s.name}`}
                    className={cx(styles.switch, s.enabled && styles.switchOn)}
                    onClick={() => patch(s.key, { enabled: !s.enabled })}
                  >
                    <span />
                  </button>
                  <button type="button" className={cx(styles.iconButton, styles.editButton)} aria-label={`Edit ${s.name}`} onClick={() => select(s.key)}>
                    <AdminIcon name="pencil-simple" size={16} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {selected && <SectionPanel key={selected.key} section={selected} onChange={(change) => patch(selected.key, change)} onClose={() => setSelectedKey(null)} />}
      </div>
    </>
  );
}

function SectionPanel({ section, onChange, onClose }: { section: ContentSection; onChange: (change: Partial<ContentSection>) => void; onClose: () => void }) {
  return (
    <aside id="section-panel" className={cx(styles.card, styles.panel)} aria-label={`Edit section ${section.name}`}>
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>Edit section: {section.name}</h2>
          <p className={styles.muted}>{section.scheduleNote ?? "Perubahan masuk draft sampai dipublikasikan"}</p>
        </div>
        <button type="button" className={styles.iconButton} aria-label="Tutup" onClick={onClose}>
          <AdminIcon name="x" size={18} />
        </button>
      </header>

      {section.image && (
        <div className={styles.heroPreview}>
          <Image src={section.image} alt="" fill sizes="(min-width: 1200px) 320px, 100vw" />
          {section.overlay && <span className={styles.heroOverlay} />}
          <strong className={styles.heroTitle}>{section.title}</strong>
          <span className={styles.changePhoto} title="Upload aktif setelah Supabase Storage tersambung">
            <AdminIcon name="image" size={14} />
            Ganti foto
          </span>
        </div>
      )}

      <label className={styles.field}>
        <span className={styles.label}>Judul *</span>
        <input className={styles.input} value={section.title} onChange={(e) => onChange({ title: e.target.value })} />
      </label>

      {section.key !== "marquee" && (
        <TextArea label="Deskripsi" value={section.description} onChange={(description) => onChange({ description })} maxLength={section.maxLength} rows={5} />
      )}

      {section.cta && (
        <div className={styles.ctaRow}>
          <label className={styles.field}>
            <span className={styles.label}>Label tombol</span>
            <input className={styles.input} value={section.cta.label} onChange={(e) => onChange({ cta: { ...section.cta!, label: e.target.value } })} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Link</span>
            <span className={styles.affix}>
              <AdminIcon name="link-simple" size={16} />
              <input value={section.cta.href} onChange={(e) => onChange({ cta: { ...section.cta!, href: e.target.value } })} />
            </span>
          </label>
        </div>
      )}

      {section.overlay !== undefined && (
        <Toggle label="Overlay gelap di foto" hint="Menjaga teks tetap terbaca" checked={section.overlay} onChange={(overlay) => onChange({ overlay })} />
      )}

      {section.source && (
        <p className={styles.source}>
          <AdminIcon name="arrow-up-right" size={16} />
          <span>
            Isi kartu diambil otomatis dari{" "}
            <Link href={section.source.href} className={styles.link}>
              {section.source.label}
            </Link>
            .
          </span>
        </p>
      )}
    </aside>
  );
}
