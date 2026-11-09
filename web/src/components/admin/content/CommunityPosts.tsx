"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { normalizeHandle, POST_PLATFORM_KEYS, POST_PLATFORMS, postLinkError, type PostPlatform } from "@/lib/community-posts";
import { cx } from "@/lib/cx";
import { shrinkImage } from "@/lib/image-resize";
import { deleteInstagramPost, discardPostImages, fetchPostPhoto, saveInstagramPost, setInstagramPostVisible, uploadPostImage, type PostInput } from "@/server/admin/actions/content";
import type { CommunityPost, MemberChoice } from "@/server/admin/types";
import ordersStyles from "../orders/Orders.module.css";
import settingsStyles from "../settings/Settings.module.css";
import { TextArea, Toggle } from "../ui/AdminForm";
import { AdminIcon, type AdminIconName } from "../ui/AdminIcon";
import { AdminButton, Badge, type BadgeTone } from "../ui/AdminUI";
import { useConfirm } from "../ui/ConfirmDialog";
import { MemberLinkField } from "./MemberLinkField";
import styles from "./Content.module.css";
import t from "./Testimonials.module.css";
import { toast } from "../ui/Toaster";
import { useImageCrop } from "@/components/ui/ImageCropper/ImageCropper";

/** Label, link & foto per platform dari POST_PLATFORMS; di sini hanya ikon & warna badge admin. */
const KIND: Record<PostPlatform, { icon: AdminIconName; tone: BadgeTone }> = {
  instagram: { icon: "instagram-logo", tone: "pink" },
  tiktok: { icon: "tiktok-logo", tone: "neutral" },
  threads: { icon: "threads-logo", tone: "indigo" },
};

const EMPTY: CommunityPost = { id: "", platform: "instagram", handle: "", text: "", href: "", visible: true };

/** Tab Testimoni & IG: post Instagram, TikTok & Threads di feed "See You on the Court!" homepage — tambah / ubah / hapus. */
export function CommunityPosts({ initial, members }: { initial: CommunityPost[]; members: MemberChoice[] }) {
  const [posts, setPosts] = useState(initial);
  const [filter, setFilter] = useState<"all" | "visible" | "hidden">("all");
  const [editing, setEditing] = useState<CommunityPost | null>(null);
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

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

  const remove = async (p: CommunityPost) => {
    const ok = await confirm({ title: `Hapus post ${p.handle}?`, body: <p>Post hilang dari feed website. Tindakan ini tidak bisa dibatalkan.</p>, confirmLabel: "Hapus post" });
    if (!ok) return;
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
      {confirmDialog}
      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Post Instagram, TikTok & Threads</h2>
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
          <p className={ordersStyles.empty}>{posts.length ? "Tidak ada post dengan filter ini." : "Belum ada post. Tambahkan post Instagram, TikTok atau Threads pertama."}</p>
        ) : (
          <ul className={styles.posts}>
            {shown.map((p) => {
              const kind = { ...KIND[p.platform], ...POST_PLATFORMS[p.platform] };
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
  // imageAuto tidak disimpan di form — dihitung saat Simpan dari autoImage (sumber kebenarannya).
  const [form, setForm] = useState<Omit<PostInput, "imageAuto">>({
    platform: post.platform,
    handle: post.handle,
    text: post.text,
    href: post.href,
    image: post.image ?? "",
    visible: post.visible,
    memberId: post.memberId ?? null,
  });
  const [saving, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [crop, cropDialog] = useImageCrop();
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const kind = { ...KIND[form.platform], ...POST_PLATFORMS[form.platform] };
  const linkError = form.href.trim() ? postLinkError(form.platform, form.href) : null;


  // Foto yang diambil / diupload di editor ini. Yang tidak jadi dipakai (diganti, Batal, pindah post)
  // dibuang dari Storage — server hanya menghapus file yang tidak dipakai post mana pun.
  const pendingImages = useRef<string[]>([]);
  const mounted = useRef(true);
  useEffect(() => {
    const list = pendingImages.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (list.length) void discardPostImages(list.splice(0)).catch(() => undefined);
    };
  }, []);

  // Foto otomatis dari link (foto preview Instagram / TikTok). Hanya mengganti foto yang kosong atau
  // yang juga diambil otomatis (termasuk foto otomatis yang sudah tersimpan) — upload manual tidak ditimpa.
  const [fetching, setFetching] = useState<"idle" | "busy" | "failed">("idle");
  const autoImage = useRef<string | null>(post.imageAuto ? (post.image ?? null) : null);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSeq = useRef(0);
  /** Batalkan pengambilan yang sedang berjalan — hasilnya tidak lagi dipakai. */
  const cancelFetch = () => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    fetchSeq.current += 1;
    setFetching("idle");
  };
  const autoFetch = (platform: PostPlatform, href: string, image: string) => {
    cancelFetch();
    // Threads tidak pakai foto (kartu navy berisi kutipan) — link hanya untuk membuka post-nya.
    if (!POST_PLATFORMS[platform].usesImage || postLinkError(platform, href) || (image && image !== autoImage.current)) return;
    setFetching("busy");
    const seq = fetchSeq.current;
    fetchTimer.current = setTimeout(async () => {
      const r = await fetchPostPhoto(platform, href).catch(() => ({ ok: false as const, error: "" }));
      if (r.ok) {
        // Editor sudah ditutup saat foto selesai diambil → langsung dibuang.
        if (!mounted.current) return void discardPostImages([r.url]).catch(() => undefined);
        pendingImages.current.push(r.url);
      }
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

  const upload = async (picked: File | undefined) => {
    if (!picked || uploading) return;
    // Crop sesuai kartu post di website (313 : 391).
    const file = await crop(picked, 313 / 391, "Foto post");
    if (!file) return;
    setUploading(true);
    const body = new FormData();
    body.append("file", await shrinkImage(file));
    const result = await uploadPostImage(body).catch(() => ({ ok: false as const, error: "Upload gagal — coba lagi." }));
    setUploading(false);
    if (!result.ok) return toast.error(result.error);
    pendingImages.current.push(result.url);
    cancelFetch();
    autoImage.current = null;
    set("image", result.url);
  };

  const save = () =>
    start(async () => {
      const result = await saveInstagramPost(post.id, { ...form, imageAuto: Boolean(form.image) && form.image === autoImage.current });
      toast.result(result);
      if (result.ok && result.post) {
        // Foto lama yang diganti + foto percobaan yang tidak dipakai → dibuang (yang dipakai tetap).
        const unused = [...pendingImages.current.splice(0), ...(post.image ? [post.image] : [])];
        if (unused.length) void discardPostImages(unused).catch(() => undefined);
        onSaved(result.post);
      }
    });

  return (
    <aside className={t.panel} aria-label={isNew ? "Tambah post" : `Edit post ${post.handle}`}>
      {cropDialog}
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
            {POST_PLATFORM_KEYS.map((p) => (
              <button key={p} type="button" aria-pressed={form.platform === p} className={cx(t.segmentOption, form.platform === p && t.segmentOn)} onClick={() => changePlatform(p)}>
                <AdminIcon name={KIND[p].icon} size={16} />
                {POST_PLATFORMS[p].label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className={settingsStyles.field}>
          <span className={settingsStyles.label}>{kind.linkLabel} *</span>
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

        <MemberLinkField members={members} value={form.memberId} onChange={(id) => set("memberId", id)} />

        {!kind.usesImage ? (
          <p className={ordersStyles.muted}>Post {kind.label} tampil sebagai kartu navy berisi kutipan (tanpa foto). Link hanya untuk membuka post di {kind.label}.</p>
        ) : (
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
                  cancelFetch();
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
        <AdminButton variant="primary" icon="check-bold" onClick={save} disabled={saving || uploading || fetching === "busy"}>
          {saving ? "Menyimpan…" : "Simpan"}
        </AdminButton>
      </div>
    </aside>
  );
}
