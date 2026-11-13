"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { REWARD_CATEGORY_LABEL, TIER_LABEL } from "@/lib/admin-labels";
import { useImageCrop } from "@/components/ui/ImageCropper/ImageCropper";
import { cx } from "@/lib/cx";
import { IMAGE_ASPECT } from "@/lib/image-aspect";
import { shrinkImage } from "@/lib/image-resize";
import { deleteReward, discardRewardUploads, saveReward, uploadRewardPhoto, type RewardInput } from "@/server/admin/actions/points";
import type { AdminReward, RewardCategory, Tier } from "@/server/admin/types";
import ordersStyles from "../orders/Orders.module.css";
import settingsStyles from "../settings/Settings.module.css";
import { TextArea, Toggle } from "../ui/AdminForm";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton } from "../ui/AdminUI";
import styles from "./Points.module.css";
import { RewardThumb } from "./RewardCatalog";
import { toast } from "../ui/Toaster";
import { useUploadCleanup } from "../ui/useUploadCleanup";
import sessionStyles from "../activities/SessionEditor.module.css";

const digits = (v: string) => v.replace(/\D/g, "");

/** Panel tambah/ubah reward (Figma 316:2 kanan). */
export function RewardEditor({ reward, imageOptions, closeHref }: { reward: AdminReward; imageOptions: string[]; closeHref: string }) {
  const router = useRouter();
  const isNew = !reward.id;
  const [form, setForm] = useState({
    name: reward.name,
    description: reward.description,
    category: reward.category,
    minTier: reward.minTier,
    image: reward.image ?? "",
    pointsCost: String(reward.pointsCost),
    stock: reward.stock === null ? "" : String(reward.stock),
    active: reward.active,
  });
  const [saving, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [crop, cropDialog] = useImageCrop();
  const uploads = useUploadCleanup(discardRewardUploads);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const input = (): RewardInput => ({
    name: form.name,
    description: form.description,
    category: form.category,
    minTier: form.minTier,
    image: form.image || null,
    pointsCost: Number(form.pointsCost || 0),
    stock: form.stock === "" ? null : Number(form.stock),
    active: form.active,
  });

  /** Upload langsung ke Storage (crop 4:3 = kartu katalog member); URL tersimpan saat Simpan. */
  const upload = async (picked: File | undefined) => {
    if (!picked || uploading) return;
    const file = await crop(picked, IMAGE_ASPECT.reward, "Foto reward");
    if (!file) return;
    setUploading(true);
    // Foto HP besar diperkecil di browser dulu (Vercel menolak body > 4,5 MB).
    const body = new FormData();
    body.append("file", await shrinkImage(file));
    const result = await uploadRewardPhoto(body).catch(() => ({ ok: false as const, error: "Upload gagal — coba lagi." }));
    setUploading(false);
    if (!result.ok) return toast.error(result.error);
    uploads.track(result.url);
    set("image", result.url);
    toast.success(`Foto terupload — tekan ${isNew ? "Tambah reward" : "Simpan reward"} untuk menerapkannya.`);
  };

  const save = () =>
    start(async () => {
      // Tunggu upload selesai — kalau tidak, reward tersimpan dengan foto lama.
      if (uploading) return;
      const result = await uploads.save(() => saveReward(reward.id, input()), { isNew, stored: [reward.image], current: [form.image || null] });
      toast.result(result);
      if (result.ok && isNew && result.id) router.replace(`/admin/points?reward=${result.id}`, { scroll: false });
    });

  const remove = () => {
    if (!window.confirm(`Hapus ${reward.name} dari katalog?`)) return;
    start(async () => {
      const result = await deleteReward(reward.id);
      if (result.ok) router.replace(closeHref, { scroll: false });
      else toast.error(result.error);
    });
  };

  return (
    <aside className={styles.panel} aria-label={isNew ? "Tambah reward" : `Edit ${reward.name}`}>
      {cropDialog}
      <header className={ordersStyles.panelHead}>
        <div>
          <h2 className={ordersStyles.panelTitle}>{isNew ? "Reward baru" : "Edit reward"}</h2>
          {!isNew && <p className={ordersStyles.muted}>Sudah ditukar {reward.redeemed}×</p>}
        </div>
        <Link href={closeHref} scroll={false} className={ordersStyles.close} aria-label="Tutup editor">
          <AdminIcon name="x" size={18} />
        </Link>
      </header>

      <RewardThumb image={form.image || null} large />

      <div className={styles.form}>
        <label className={settingsStyles.field}>
          <span className={settingsStyles.label}>Nama reward</span>
          <input className={settingsStyles.input} value={form.name} maxLength={80} onChange={(e) => set("name", e.target.value)} placeholder="mis. Kaos A Piece of Bali" />
        </label>

        <div className={styles.row2}>
          <label className={settingsStyles.field}>
            <span className={settingsStyles.label}>Kategori</span>
            <select className={styles.select} value={form.category} onChange={(e) => set("category", e.target.value as RewardCategory)}>
              {Object.entries(REWARD_CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={settingsStyles.field}>
            <span className={settingsStyles.label}>Minimal tier</span>
            <select className={styles.select} value={form.minTier} onChange={(e) => set("minTier", e.target.value as Tier)}>
              {Object.entries(TIER_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.row2}>
          <label className={settingsStyles.field}>
            <span className={settingsStyles.label}>Harga poin</span>
            <span className={settingsStyles.affix}>
              <input inputMode="numeric" value={form.pointsCost} onChange={(e) => set("pointsCost", digits(e.target.value))} />
              <span className={settingsStyles.muted}>pts</span>
            </span>
          </label>
          <label className={settingsStyles.field}>
            <span className={settingsStyles.label}>Stok</span>
            <span className={settingsStyles.affix}>
              <input inputMode="numeric" value={form.stock} placeholder="Tanpa batas" onChange={(e) => set("stock", digits(e.target.value))} />
              <span className={settingsStyles.muted}>pcs</span>
            </span>
          </label>
        </div>

        <div className={settingsStyles.field}>
          <span className={settingsStyles.label}>Foto</span>
          <select aria-label="Pilih foto yang sudah ada" className={styles.select} value={form.image} onChange={(e) => set("image", e.target.value)}>
            <option value="">Tanpa foto (ikon)</option>
            {[...new Set([form.image, ...imageOptions].filter(Boolean))].map((src) => (
              <option key={src} value={src}>
                {src.startsWith("https://") ? `Upload: ${src.split("/").pop()}` : src.replace("/images/", "")}
              </option>
            ))}
          </select>
          <label className={cx(sessionStyles.dropzone, uploading && sessionStyles.dropzoneBusy)}>
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
            <AdminIcon name="upload-simple" size={20} />
            <strong>{uploading ? "Mengupload…" : "Atau upload foto baru"}</strong>
            <span className={settingsStyles.muted}>JPG/PNG/WebP · maks 5 MB · dipotong 4:3</span>
          </label>
        </div>

        <TextArea label="Deskripsi" value={form.description} onChange={(v) => set("description", v)} maxLength={500} rows={3} />
        <Toggle label="Tampil di katalog member" hint="Matikan untuk menyembunyikan tanpa menghapus" checked={form.active} onChange={(v) => set("active", v)} />
      </div>

      

      <div className={styles.buttons}>
        {!isNew && (
          <AdminButton variant="ghost" icon="trash" className={styles.danger} onClick={remove} disabled={saving}>
            Hapus
          </AdminButton>
        )}
        <AdminButton variant="primary" icon="check-bold" onClick={save} disabled={saving || uploading}>
          {saving ? "Menyimpan…" : isNew ? "Tambah reward" : "Simpan reward"}
        </AdminButton>
      </div>
    </aside>
  );
}
