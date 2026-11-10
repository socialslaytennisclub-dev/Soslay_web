"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KUDOS_GROUP_LABEL, type KudosGroup } from "@/lib/kudos";
import { saveKudosCategory } from "@/server/admin/actions/kudos";
import type { AdminKudosCategory } from "@/server/admin/session-kudos";
import settingsStyles from "../settings/Settings.module.css";
import { FormCard } from "../ui/AdminForm";
import { AdminButton, Badge } from "../ui/AdminUI";
import { toast } from "../ui/Toaster";
import styles from "./KudosCategories.module.css";

const GROUPS: KudosGroup[] = ["skill", "attitude"];

/**
 * Slay Point → Aturan poin · Kategori kudos (BR-23 · K-5): tambah, ganti nama, aktif / nonaktif — tanpa deploy.
 * Nonaktif = tidak bisa dipilih lagi saat memberi kudos; kudos lama tetap terhitung di profil.
 */
export function KudosCategories({ initial, canEdit }: { initial: AdminKudosCategory[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState<KudosGroup>("skill");
  const [editing, setEditing] = useState<{ key: string; label: string } | null>(null);

  const run = (input: Parameters<typeof saveKudosCategory>[0], after?: () => void) =>
    start(async () => {
      const r = await saveKudosCategory(input);
      toast.result(r);
      if (!r.ok) return;
      after?.();
      router.refresh();
    });

  return (
    <FormCard title="Kategori kudos" subtitle="Pilihan saat member memberi kudos. Nonaktif = tidak bisa dipilih lagi; kudos lama tetap terhitung.">
      {GROUPS.map((g) => (
        <div key={g} className={styles.group}>
          <h3 className={styles.groupTitle}>{KUDOS_GROUP_LABEL[g]}</h3>
          <ul className={styles.list}>
            {initial
              .filter((c) => c.group === g)
              .map((c) => (
                <li key={c.key} className={styles.item}>
                  {editing?.key === c.key ? (
                    <input
                      className={settingsStyles.input}
                      value={editing.label}
                      maxLength={40}
                      autoFocus
                      aria-label={`Nama kategori ${c.label}`}
                      onChange={(e) => setEditing({ key: c.key, label: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditing(null);
                        if (e.key === "Enter") run({ key: c.key, label: editing.label, group: c.group, active: c.active }, () => setEditing(null));
                      }}
                    />
                  ) : (
                    <span className={c.active ? undefined : styles.off}>{c.label}</span>
                  )}
                  {!c.active && <Badge>Nonaktif</Badge>}
                  {canEdit && (
                    <span className={styles.actions}>
                      {editing?.key === c.key ? (
                        <>
                          <AdminButton size="sm" variant="primary" disabled={pending} onClick={() => run({ key: c.key, label: editing.label, group: c.group, active: c.active }, () => setEditing(null))}>
                            Simpan
                          </AdminButton>
                          <AdminButton size="sm" onClick={() => setEditing(null)}>
                            Batal
                          </AdminButton>
                        </>
                      ) : (
                        <>
                          <AdminButton size="sm" onClick={() => setEditing({ key: c.key, label: c.label })}>
                            Ganti nama
                          </AdminButton>
                          <AdminButton size="sm" disabled={pending} onClick={() => run({ key: c.key, label: c.label, group: c.group, active: !c.active })}>
                            {c.active ? "Nonaktifkan" : "Aktifkan"}
                          </AdminButton>
                        </>
                      )}
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
      {canEdit ? (
        <form
          className={styles.add}
          onSubmit={(e) => {
            e.preventDefault();
            run({ label, group, active: true }, () => setLabel(""));
          }}
        >
          <input className={settingsStyles.input} value={label} maxLength={40} placeholder="Kategori baru, mis. Smash" aria-label="Nama kategori baru" onChange={(e) => setLabel(e.target.value)} />
          <select className={settingsStyles.input} value={group} aria-label="Grup kategori baru" onChange={(e) => setGroup(e.target.value as KudosGroup)}>
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {KUDOS_GROUP_LABEL[g]}
              </option>
            ))}
          </select>
          <AdminButton type="submit" icon="plus-bold" disabled={pending || !label.trim()}>
            Tambah
          </AdminButton>
        </form>
      ) : (
        <p className={styles.hint}>Hanya admin dengan akses Settings yang bisa mengubah kategori.</p>
      )}
    </FormCard>
  );
}
