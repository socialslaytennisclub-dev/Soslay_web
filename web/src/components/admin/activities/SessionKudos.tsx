"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cx } from "@/lib/cx";
import { KUDOS_WINDOW_DAYS } from "@/lib/kudos";
import { deleteKudos } from "@/server/admin/actions/kudos";
import type { SessionKudosEntry } from "@/server/admin/types";
import { FormCard } from "../ui/AdminForm";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, Badge } from "../ui/AdminUI";
import confirmStyles from "../ui/ConfirmDialog.module.css";
import { toast } from "../ui/Toaster";
import { formatTanggalPendek } from "@/lib/format";
import editor from "./SessionEditor.module.css";
import styles from "./SessionReviews.module.css";


const DELETED_BY = { giver: "dibatalkan pemberi", admin: "dihapus admin", system: "otomatis (check-in batal)" } as const;

/**
 * Admin / Edit activity selesai — section Kudos (BR-23 · K-8 / K-10): pemberi, penerima, kategori, waktu,
 * aksi Hapus dengan alasan wajib (poin pemberi ditarik, tercatat di Log aktivitas). Hanya admin yang
 * melihat pemberi; member tidak pernah.
 */
export function SessionKudos({ sessionId, kudos }: { sessionId: string; kudos: SessionKudosEntry[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<SessionKudosEntry | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const active = kudos.filter((k) => !k.deleted);
  const deleted = kudos.length - active.length;
  const rows = showDeleted ? kudos : active;
  const givers = new Set(active.map((k) => k.giver?.id ?? k.id)).size;

  return (
    <FormCard
      title="Kudos"
      subtitle={active.length ? `${active.length} kudos dari ${givers} pemberi · anonim untuk member, hanya admin yang melihat pemberi` : `Kudos dibuka setelah activity diakhiri, selama ${KUDOS_WINDOW_DAYS} hari`}
      action={
        deleted > 0 ? (
          <AdminButton size="sm" onClick={() => setShowDeleted((v) => !v)}>
            {showDeleted ? "Sembunyikan yang dihapus" : `Tampilkan ${deleted} yang dihapus`}
          </AdminButton>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className={styles.empty}>Belum ada kudos.</p>
      ) : (
        <div className={editor.tableWrap}>
          <table className={editor.table}>
            <thead>
              <tr>
                <th scope="col">Pemberi</th>
                <th scope="col">Penerima</th>
                <th scope="col">Kategori</th>
                <th scope="col">Waktu</th>
                <th scope="col">
                  <span className="visually-hidden">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id} style={k.deleted ? { opacity: 0.55 } : undefined}>
                  <td>{k.giver?.name ?? <em>Akun terhapus</em>}</td>
                  <td>
                    {k.receiver.name} {k.receiverRole === "host" && <Badge tone="lime">Host</Badge>}
                  </td>
                  <td>
                    <Badge tone="neutral">{k.category}</Badge>
                  </td>
                  <td>{formatTanggalPendek(k.at, "Jakarta", "dateTime")}</td>
                  <td>
                    {k.deleted ? (
                      <span className={editor.muted} title={k.deleted.reason ?? undefined}>
                        {DELETED_BY[k.deleted.source]}
                        {k.deleted.reason && k.deleted.source === "admin" ? ` · ${k.deleted.reason}` : ""}
                      </span>
                    ) : (
                      <AdminButton size="sm" icon="trash" onClick={() => setTarget(k)}>
                        Hapus
                      </AdminButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {target && (
        <DeleteKudosDialog
          entry={target}
          onClose={() => setTarget(null)}
          onDelete={async (reason) => {
            const result = await deleteKudos(sessionId, target.id, reason);
            toast.result(result);
            if (result.ok) router.refresh();
            return result.ok;
          }}
        />
      )}
    </FormCard>
  );
}

function DeleteKudosDialog({ entry, onClose, onDelete }: { entry: SessionKudosEntry; onClose: () => void; onDelete: (reason: string) => Promise<boolean> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [busy, startBusy] = useTransition();
  const ready = reason.trim().length > 0;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={confirmStyles.dialog}
      aria-labelledby="kudos-delete-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className={confirmStyles.panel}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) startBusy(async () => void ((await onDelete(reason)) && onClose()));
        }}
      >
        <span className={confirmStyles.icon}>
          <AdminIcon name="warning-circle" size={22} />
        </span>
        <h2 id="kudos-delete-title" className={confirmStyles.title}>
          Hapus kudos {entry.category}?
        </h2>
        <div className={confirmStyles.body}>
          <p>
            Dari <strong>{entry.giver?.name ?? "akun terhapus"}</strong> ke <strong>{entry.receiver.name}</strong>. Slay Point pemberi ditarik (−1) dan penghapusan tercatat di Log aktivitas.
          </p>
        </div>
        <label className={confirmStyles.typeField}>
          <span>Alasan (wajib)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus placeholder="mis. Kudos salah orang" />
        </label>
        <div className={confirmStyles.actions}>
          <AdminButton type="button" onClick={onClose}>
            Batal
          </AdminButton>
          <AdminButton type="submit" variant="primary" icon="trash" className={cx(confirmStyles.danger)} disabled={!ready || busy}>
            {busy ? "Menghapus…" : "Hapus kudos"}
          </AdminButton>
        </div>
      </form>
    </dialog>
  );
}
