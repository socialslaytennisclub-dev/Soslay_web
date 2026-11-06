"use client";

import Image from "next/image";
import { useMemo, useRef, useState, useTransition } from "react";
import { normalizeHandle, postLinkError, type PostPlatform } from "@/lib/community-posts";
import { cx } from "@/lib/cx";
import { shrinkImage } from "@/lib/image-resize";
import { deleteInstagramPost, fetchPostPhoto, saveInstagramPost, setInstagramPostVisible, uploadPostImage, type PostInput } from "@/server/admin/actions/content";
import type { CommunityPost, MemberChoice } from "@/server/admin/types";
import ordersStyles from "../orders/Orders.module.css";
import settingsStyles from "../settings/Settings.module.css";
import { TextArea, Toggle } from "../ui/AdminForm";
import { AdminIcon, type AdminIconName } from "../ui/AdminIcon";
import { AdminButton, Badge, type BadgeTone } from "../ui/AdminUI";
import styles from "./Content.module.css";
import t from "./Testimonials.module.css";
import { toast } from "../ui/Toaster";

type KindMeta = { label: string; icon: AdminIconName; tone: BadgeTone; link: string; placeholder: string };
const KIND: Record<PostPlatform, KindMeta> = {
  instagram: { label: "Instagram", icon: "instagram-logo", tone: "pink", link: "Link post Instagram", placeholder: "https://www.instagram.com/p/…" },
  tiktok: { label: "TikTok", icon: "tiktok-logo", tone: "neutral", link: "Link video TikTok", placeholder: "https://www.tiktok.com/@user/video/…" },
};
/** Post lama dari Threads (sebelum diganti TikTok) — tetap tampil; saat diedit pilih Instagram / TikTok. */
const LEGACY_THREADS: KindMeta = { label: "Threads", icon: "chat-circle-text", tone: "neutral", link: "", placeholder: "" };
const kindOf = (platform: CommunityPost["platform"]) => (platform === "threads" ? LEGACY_THREADS : KIND[platform]);

const EMPTY: CommunityPost = { id: "", platform: "instagram", handle: "", text: "", href: "", visible: true };

/** Tab Testimoni & IG: post Instagram & TikTok di feed "See You on the Court!" homepage — tambah / ubah / hapus. */
export function CommunityPosts({ initial, members }: { initial: CommunityPost[]; members: MemberChoice[] }) {
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
            <h2 className={styles.cardTitle}>Post Instagram & TikTok</h2>
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
          <p className={ordersStyles.empty}>{posts.length ? "Tidak ada post dengan filter ini." : "Belum ada post. Tambahkan post Instagram atau TikTok pertama."}</p>
        ) : (
          <ul className={styles.posts}>
            {shown.map((p) => {
              const kind = kindOf(p.platform);
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
                      {p.memberId && <Badge tone="indigo">Member</Badge>}
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

      {editing && <PostEditor key={editing.id || "new"} post={editing} members={members} onClose={() => setEditing(null)} onSaved={saved} onDelete={() => remove(editing)} />}
    </div>
  );
}

function PostEditor({ post, members, onClose, onSaved, onDelete }: { post: CommunityPost; members: MemberChoice[]; onClose: () => void; onSaved: (p: CommunityPost) => void; onDelete: () => void }) {
  const isNew = !post.id;
  const [form, setForm] = useState<PostInput>({
    platform: post.platform === "threads" ? "instagram" : post.platform,
    handle: post.handle,
    text: post.text,
    href: post.href,
    image: post.image ?? "",
    visible: post.visible,
    memberId: post.memberId ?? null,
  });
  const [saving, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof PostInput>(key: K, value: PostInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const kind = KIND[form.platform];
  const linkError = form.href.trim() ? postLinkError(form.platform, form.href) : null;

  const memberLabel = (m: MemberChoice) => `${m.name} · ${m.code}`;
  const linkedMember = useMemo(() => members.find((m) => m.id === form.memberId), [members, form.memberId]);
  const [memberQuery, setMemberQuery] = useState(linkedMember ? memberLabel(linkedMember) : "");

  // Foto otomatis dari link (foto preview Instagram / TikTok). Hanya mengganti foto yang kosong atau
  // yang sebelumnya juga diambil otomatis — foto upload manual tidak ditimpa.
  const [fetching, setFetching] = useState<"idle" | "busy" | "failed">("idle");
  const autoImage = useRef<string | null>(null);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSeq = useRef(0);
  const autoFetch = (platform: PostPlatform, href: string, image: string) => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    if (postLinkError(platform, href) || (image && image !== autoImage.current)) return setFetching("idle");
    setFetching("busy");
    const seq = ++fetchSeq.current;
    fetchTimer.current = setTimeout(async () => {
      const r = await fetchPostPhoto(platform, href).catch(() => ({ ok: false as const, error: "" }));
      if (seq !== fetchSeq.current) return;
      if (!r.ok) return setFetching("failed");
      autoImage.current = r.url;
      setFetching("idle");
      setForm((f) => ({ ...f, image: r.url }));
    }, 600);
  };
  const changeLink = (href: string) => {
    set("href", href);
    autoFetch(form.platform, href, form.image);
  };
  const changePlatform = (platform: PostPlatform) => {
    set("platform", platform);
    autoFetch(platform, form.href, form.image);
  };

  const upload = async (file: File | undefined) => {
    if (!file || uploading) return;
    setUploading(true);
    const body = new FormData();
    body.append("file", await shrinkImage(file));
    const result = await uploadPostImage(body).catch(() => ({ ok: false as const, error: "Upload gagal — coba lagi." }));
    setUploading(false);
    if (!result.ok) return toast.error(result.error);
    autoImage.current = null;
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
            {(["instagram", "tiktok"] as const).map((p) => (
              <button key={p} type="button" aria-pressed={form.platform === p} className={cx(t.segmentOption, form.platform === p && t.segmentOn)} onClick={() => changePlatform(p)}>
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
            <input value={form.href} onChange={(e) => changeLink(e.target.value)} placeholder={kind.placeholder} inputMode="url" />
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

        <label className={settingsStyles.field}>
          <span className={settingsStyles.label}>Hubungkan ke member (opsional)</span>
          <input
            className={settingsStyles.input}
            list="post-members"
            value={memberQuery}
            placeholder="Ketik nama atau no. member"
            onChange={(e) => {
              setMemberQuery(e.target.value);
              set("memberId", members.find((m) => memberLabel(m) === e.target.value)?.id ?? null);
            }}
          />
          <datalist id="post-members">
            {members.map((m) => (
              <option key={m.id} value={memberLabel(m)} />
            ))}
          </datalist>
        </label>

        <div className={settingsStyles.field}>
          <span className={settingsStyles.label}>Foto post</span>
          {fetching === "busy" ? (
            <span className={t.detected}>Mengambil foto dari {kind.label}…</span>
          ) : fetching === "failed" ? (
            <span className={cx(t.detected, t.detectedError)}>Foto tidak bisa diambil otomatis dari {kind.label} (akun private / perlu login) — upload foto manual.</span>
          ) : !form.image ? (
            <span className={ordersStyles.muted}>Terisi otomatis dari link post. Tanpa foto, post tampil sebagai kartu navy berisi kutipan.</span>
          ) : null}
          {form.image ? (
            <div className={t.preview}>
              <span className={styles.postImage}>
                <Image src={form.image} alt="" fill sizes="64px" />
              </span>
              <AdminButton
                size="sm"
                icon="trash"
                onClick={() => {
                  autoImage.current = null;
                  set("image", "");
                }}
              >
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
            <AdminIcon name="upload-simple" size={16} /> {uploading ? "Mengupload…" : form.image ? "Ganti dengan foto sendiri" : "Upload foto manual"} · JPG/PNG/WebP, maks 5 MB
          </label>
        </div>

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
        <AdminButton variant="primary" icon="check-bold" onClick={save} disabled={saving || uploading || fetching === "busy"}>
          {saving ? "Menyimpan…" : "Simpan"}
        </AdminButton>
      </div>
    </aside>
  );
}
