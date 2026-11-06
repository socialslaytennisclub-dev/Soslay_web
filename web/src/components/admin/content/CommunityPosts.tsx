"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { normalizeHandle, postLinkError, type PostPlatform } from "@/lib/community-posts";
import { cx } from "@/lib/cx";
import { shrinkImage } from "@/lib/image-resize";
import { deleteInstagramPost, saveInstagramPost, setInstagramPostVisible, uploadPostImage, type PostInput } from "@/server/admin/actions/content";
import type { CommunityPost } from "@/server/admin/types";
import ordersStyles from "../orders/Orders.module.css";
import settingsStyles from "../settings/Settings.module.css";
import { TextArea, Toggle } from "../ui/AdminForm";
import { AdminIcon, type AdminIconName } from "../ui/AdminIcon";
import { AdminButton, Badge, type BadgeTone } from "../ui/AdminUI";
import styles from "./Content.module.css";
import t from "./Testimonials.module.css";
import { toast } from "../ui/Toaster";

const KIND: Record<PostPlatform, { label: string; icon: AdminIconName; tone: BadgeTone; link: string; placeholder: string }> = {
  instagram: { label: "Instagram", icon: "instagram-logo", tone: "pink", link: "Link post Instagram", placeholder: "https://www.instagram.com/p/…" },
  threads: { label: "Threads", icon: "chat-circle-text", tone: "neutral", link: "Link Threads", placeholder: "https://www.threads.net/@user/post/…" },
};

const EMPTY: CommunityPost = { id: "", platform: "instagram", handle: "", text: "", href: "", visible: true };

/** Tab Testimoni & IG: post Instagram & Threads di feed "See You on the Court!" homepage — tambah / ubah / hapus. */
export function CommunityPosts({ initial }: { initial: CommunityPost[] }) {
  const [posts, setPosts] = useState(initial);
  const [filter, setFilter] = useState<"all" | "visible" | "hidden">("all");
  const [editing, setEditing] = useState<CommunityPost | null>(null);
  const [pending, start] = useTransition();

  const toggle = (p: CommunityPost) => {
    const next = !p.visible;
    const apply = (visible: boolean) => setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, visible } : x)));
    apply(next);
    start(async () => {
      const result = await setInstagramPostVisible(p.id, next);
      if (!result.ok) apply(!next);
      toast.result(result);
    });
  };

  const remove = (p: CommunityPost) => {
    if (!window.confirm(`Hapus post ${p.handle}? Tindakan ini tidak bisa dibatalkan.`)) return;
    start(async () => {
      const result = await deleteInstagramPost(p.id);
      if (result.ok) {
        setPosts((list) => list.filter((x) => x.id !== p.id));
        if (editing?.id === p.id) setEditing(null);
      }
      toast.result(result);
    });
  };

  const saved = (p: CommunityPost) => {
    setPosts((list) => (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]));
    setEditing(p);
  };

  const shown = posts.filter((p) => filter === "all" || (filter === "visible") === p.visible);

  return (
    <div className={t.layout}>
      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Post Instagram & Threads</h2>
            <p className={styles.muted}>{posts.filter((p) => p.visible).length} tampil di homepage · langsung tersimpan</p>
          </div>
          <div className={styles.filterPills} role="group" aria-label="Filter">
            {(
              [
                ["all", "Semua"],
                ["visible", "Tampil"],
                ["hidden", "Disembunyikan"],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value} className={cx(styles.pill, filter === value && styles.pillOn)} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
            <AdminButton variant="primary" size="sm" icon="plus-bold" onClick={() => setEditing(EMPTY)}>
              Tambah post
            </AdminButton>
          </div>
        </header>
        {shown.length === 0 ? (
          <p className={ordersStyles.empty}>{posts.length ? "Tidak ada post dengan filter ini." : "Belum ada post. Tambahkan post Instagram atau Threads pertama."}</p>
        ) : (
          <ul className={styles.posts}>
            {shown.map((p) => {
              const kind = KIND[p.platform];
              return (
                <li key={p.id} className={cx(styles.post, !p.visible && styles.sectionOff, editing?.id === p.id && t.rowActive)}>
                  {p.image ? (
                    <span className={styles.postImage}>
                      <Image src={p.image} alt="" fill sizes="64px" />
                    </span>
                  ) : (
                    <span className={cx(styles.postImage, styles.postQuote)}>
                      <AdminIcon name={kind.icon} size={20} />
                    </span>
                  )}
                  <button type="button" className={cx(styles.postText, t.rowText)} onClick={() => setEditing(p)}>
                    <span className={styles.postMeta}>
                      <Badge tone={kind.tone}>{kind.label}</Badge>
                      <span className={styles.sectionName}>{p.handle}</span>
                    </span>
                    <span className={styles.postQuoteText}>“{p.text}”</span>
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={p.visible}
                    aria-label={`Tampilkan post ${p.handle}`}
                    className={cx(styles.switch, p.visible && styles.switchOn)}
                    disabled={pending}
                    onClick={() => toggle(p)}
                  >
                    <span />
                  </button>
                  <button type="button" className={ordersStyles.iconLink} aria-label={`Edit post ${p.handle}`} onClick={() => setEditing(p)}>
                    <AdminIcon name="pencil-simple" size={18} />
                  </button>
                  <button type="button" className={cx(ordersStyles.iconLink, t.danger)} aria-label={`Hapus post ${p.handle}`} onClick={() => remove(p)} disabled={pending}>
                    <AdminIcon name="trash" size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editing && <PostEditor key={editing.id || "new"} post={editing} onClose={() => setEditing(null)} onSaved={saved} onDelete={() => remove(editing)} />}
    </div>
  );
}

function PostEditor({ post, onClose, onSaved, onDelete }: { post: CommunityPost; onClose: () => void; onSaved: (p: CommunityPost) => void; onDelete: () => void }) {
  const isNew = !post.id;
  const [form, setForm] = useState<PostInput>({ platform: post.platform, handle: post.handle, text: post.text, href: post.href, image: post.image ?? "", visible: post.visible });
  const [saving, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof PostInput>(key: K, value: PostInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const kind = KIND[form.platform];
  const linkError = form.href.trim() ? postLinkError(form.platform, form.href) : null;

  const upload = async (file: File | undefined) => {
    if (!file || uploading) return;
    setUploading(true);
    const body = new FormData();
    body.append("file", await shrinkImage(file));
    const result = await uploadPostImage(body).catch(() => ({ ok: false as const, error: "Upload gagal — coba lagi." }));
    setUploading(false);
    if (!result.ok) return toast.error(result.error);
    set("image", result.url);
  };

  const save = () =>
    start(async () => {
      const result = await saveInstagramPost(post.id, form);
      toast.result(result);
      if (result.ok && result.post) onSaved(result.post);
    });

  return (
    <aside className={t.panel} aria-label={isNew ? "Tambah post" : `Edit post ${post.handle}`}>
      <header className={ordersStyles.panelHead}>
        <div>
          <h2 className={ordersStyles.panelTitle}>{isNew ? "Post baru" : "Edit post"}</h2>
          <p className={ordersStyles.muted}>Feed “See You on the Court!” di homepage</p>
        </div>
        <button type="button" className={ordersStyles.close} aria-label="Tutup editor" onClick={onClose}>
          <AdminIcon name="x" size={18} />
        </button>
      </header>

      <div className={t.form}>
        <fieldset className={t.fieldset}>
          <legend className={settingsStyles.label}>Jenis post</legend>
          <div className={t.segment}>
            {(["instagram", "threads"] as const).map((p) => (
              <button key={p} type="button" aria-pressed={form.platform === p} className={cx(t.segmentOption, form.platform === p && t.segmentOn)} onClick={() => set("platform", p)}>
                <AdminIcon name={KIND[p].icon} size={16} />
                {KIND[p].label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className={settingsStyles.field}>
          <span className={settingsStyles.label}>{kind.link} *</span>
          <span className={settingsStyles.affix}>
            <AdminIcon name="link-simple" size={16} />
            <input value={form.href} onChange={(e) => set("href", e.target.value)} placeholder={kind.placeholder} inputMode="url" />
          </span>
          {linkError ? (
            <span className={cx(t.detected, t.detectedError)}>{linkError}</span>
          ) : form.href.trim() ? (
            <a href={form.href} target="_blank" rel="noopener noreferrer" className={t.openLink}>
              Buka di {kind.label} ↗
            </a>
          ) : null}
        </label>

        <label className={settingsStyles.field}>
          <span className={settingsStyles.label}>Akun *</span>
          <input
            className={settingsStyles.input}
            value={form.handle}
            maxLength={40}
            onChange={(e) => set("handle", e.target.value)}
            onBlur={() => set("handle", normalizeHandle(form.handle))}
            placeholder="@username"
          />
        </label>

        <TextArea label="Kutipan *" value={form.text} onChange={(v) => set("text", v)} maxLength={280} rows={4} />

        {form.platform === "instagram" ? (
          <div className={settingsStyles.field}>
            <span className={settingsStyles.label}>Foto post</span>
            {form.image ? (
              <div className={t.preview}>
                <span className={styles.postImage}>
                  <Image src={form.image} alt="" fill sizes="64px" />
                </span>
                <AdminButton size="sm" icon="trash" onClick={() => set("image", "")}>
                  Hapus foto
                </AdminButton>
              </div>
            ) : null}
            <label className={ordersStyles.notice}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="visually-hidden"
                disabled={uploading}
                onChange={(e) => {
                  upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <AdminIcon name="upload-simple" size={16} /> {uploading ? "Mengupload…" : form.image ? "Ganti foto" : "Upload foto post"} · JPG/PNG/WebP, maks 5 MB
            </label>
          </div>
        ) : (
          <p className={ordersStyles.muted}>Post Threads tampil sebagai kartu navy berisi kutipan (tanpa foto).</p>
        )}

        <Toggle label="Tampil di homepage" hint="Feed “See You on the Court!”" checked={form.visible} onChange={(v) => set("visible", v)} />
      </div>

      <div className={t.actions}>
        {!isNew && (
          <AdminButton variant="ghost" icon="trash" className={t.danger} onClick={onDelete} disabled={saving}>
            Hapus
          </AdminButton>
        )}
        <AdminButton onClick={onClose} disabled={saving}>
          Batal
        </AdminButton>
        <AdminButton variant="primary" icon="check-bold" onClick={save} disabled={saving || uploading}>
          {saving ? "Menyimpan…" : "Simpan"}
        </AdminButton>
      </div>
    </aside>
  );
}
