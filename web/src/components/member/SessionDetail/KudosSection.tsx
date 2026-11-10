"use client";

import { Check, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useDialog } from "@/hooks/useDialog";
import { cx } from "@/lib/cx";
import { formatTanggalPendek, type City } from "@/lib/format";
import { KUDOS_GROUP_LABEL, type KudosGroup, type KudosReceiver, type SessionKudos } from "@/lib/kudos";
import { initials } from "@/lib/text";
import { cancelKudos, giveKudos } from "@/server/member/actions";
import base from "./SessionDetail.module.css";
import styles from "./Kudos.module.css";

const GROUPS: KudosGroup[] = ["skill", "attitude"];

/**
 * Bagian kudos (BR-23 · K-8) di atas form review tab Review (atau tab Kudos host yang tidak ikut main):
 * progres "x dari y", daftar peserta hadir, sheet pilih 1 kategori, ganti / batalkan selama jendela kudos (KUDOS_WINDOW_DAYS);
 * setelah itu read-only. Nama pemberi lain tidak pernah dikirim ke sini — hanya kudos milik sendiri.
 */
export function KudosSection({ sessionId, kudos, city, demo = false }: { sessionId: string; kudos: SessionKudos; city: City; demo?: boolean }) {
  const router = useRouter();
  const { dialogRef, open, close, onBackdropClick } = useDialog();
  // Salinan lokal → chip langsung berubah setelah simpan (mode demo: hanya lokal). Data baru dari server
  // (router.refresh: diubah di perangkat lain, dihapus otomatis karena check-in batal) menggantikannya.
  const fromServer = () => Object.fromEntries(kudos.receivers.map((r) => [r.memberId, r.category]));
  const [given, setGiven] = useState<Record<string, string | null>>(fromServer);
  const [seen, setSeen] = useState(kudos.receivers);
  if (seen !== kudos.receivers) {
    setSeen(kudos.receivers);
    setGiven(fromServer());
  }
  const [target, setTarget] = useState<KudosReceiver | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const labels = new Map(kudos.categories.map((c) => [c.key, c.label]));
  const done = kudos.receivers.filter((r) => given[r.memberId]).length;
  const total = kudos.receivers.length;
  const { canEdit } = kudos;

  const pick = (r: KudosReceiver) => {
    setTarget(r);
    setChoice(given[r.memberId] ?? null);
    setError(null);
    open();
  };

  const save = (category: string | null) =>
    startBusy(async () => {
      if (!target) return;
      const had = given[target.memberId];
      if (!demo) {
        const result = category ? await giveKudos(sessionId, target.memberId, category) : await cancelKudos(sessionId, target.memberId);
        if (!result.ok) return setError(result.error);
      }
      setGiven((g) => ({ ...g, [target.memberId]: category }));
      setNotice(
        category
          ? had
            ? `Kudos untuk ${target.name} diganti jadi ${labels.get(category) ?? category}.`
            : `Kudos ${labels.get(category) ?? category} terkirim ke ${target.name} · +1 Slay Point`
          : `Kudos untuk ${target.name} dibatalkan · −1 Slay Point`,
      );
      setError(null);
      close();
      if (!demo) router.refresh();
    });

  return (
    <section className={base.card} aria-labelledby="kudos-title">
      <header className={base.cardHead}>
        <div>
          <h2 id="kudos-title" className={base.cardTitle}>
            Kasih kudos ke teman main
          </h2>
          <p className={base.muted}>Apresiasi kekuatan teman main — anonim, penerima hanya melihat jumlah per kategori.</p>
        </div>
      </header>

      <div className={styles.progress}>
        <span>
          <strong>
            {done} dari {total}
          </strong>{" "}
          sudah dikasih kudos
        </span>
        <span className={styles.progressBar} aria-hidden>
          <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </span>
      </div>

      {notice && (
        <p className={base.reviewThanks} role="status">
          <Check size={16} aria-hidden /> {notice}
        </p>
      )}
      <p className={canEdit ? base.small : styles.closed}>
        {canEdit ? `+1 Slay Point per kudos · bisa diganti / dibatalkan sampai ${formatTanggalPendek(kudos.windowClosesAt, city, "dateTime")}.` : "Masa kasih kudos sudah berakhir."}
      </p>

      {total === 0 ? (
        <p className={base.muted}>Belum ada peserta hadir lain di sesi ini.</p>
      ) : (
        <ul className={base.people}>
          {kudos.receivers.map((r, i) => {
            const category = given[r.memberId];
            return (
              <li key={r.memberId} className={base.person}>
                <span className={cx(base.personAvatar, base[`face${i % 4}`])} aria-hidden>
                  {initials(r.name)}
                </span>
                <span className={base.personText}>
                  <strong>{r.name}</strong>
                  <small>{r.role === "host" ? "Host · hanya kudos Sikap" : "Peserta hadir"}</small>
                  {category && (
                    <span className={styles.chip}>
                      <Sparkles size={12} aria-hidden />
                      {labels.get(category) ?? category}
                    </span>
                  )}
                </span>
                {canEdit ? (
                  <button type="button" className={base.btnOutlineSm} onClick={() => pick(r)} aria-label={category ? `Ganti atau batalkan kudos untuk ${r.name}` : `Kasih kudos ke ${r.name}`}>
                    {category ? "Ubah" : "Kasih kudos"}
                  </button>
                ) : (
                  !category && <span className={base.small}>—</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <dialog ref={dialogRef} className={cx(base.qrDialog, styles.sheet)} aria-labelledby="kudos-sheet-title" onClick={onBackdropClick}>
          {target && (
            <div className={base.qrPanel}>
              <header className={base.qrHead}>
                <div>
                  <h2 id="kudos-sheet-title">Kudos untuk {target.name}</h2>
                  <span className={base.muted}>Pilih 1 kekuatan yang paling menonjol hari ini.</span>
                </div>
                <button type="button" className={base.qrClose} onClick={close} aria-label="Tutup">
                  <X size={18} />
                </button>
              </header>
              {GROUPS.map((group) => {
                const list = kudos.categories.filter((c) => c.group === group);
                const locked = group === "skill" && target.role === "host";
                if (!list.length) return null;
                return (
                  <fieldset key={group} className={styles.group} disabled={locked}>
                    <legend>
                      {KUDOS_GROUP_LABEL[group]}
                      {locked && <small> · tidak untuk host yang tidak ikut main</small>}
                    </legend>
                    {!locked && (
                      <div className={styles.options}>
                        {list.map((c) => (
                          <button key={c.key} type="button" role="radio" aria-checked={choice === c.key} className={cx(base.reasonChip, choice === c.key && base.reasonChipOn)} onClick={() => setChoice(c.key)}>
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </fieldset>
                );
              })}
              {error && (
                <p className={base.formError} role="alert">
                  {error}
                </p>
              )}
              <div className={base.qrActions}>
                {given[target.memberId] ? (
                  <button type="button" className={cx(base.btnOutline, styles.danger)} onClick={() => save(null)} disabled={busy}>
                    Batalkan kudos
                  </button>
                ) : (
                  <button type="button" className={base.btnOutline} onClick={close}>
                    Batal
                  </button>
                )}
                <button type="button" className={base.btnLime} onClick={() => choice && save(choice)} disabled={busy || !choice || choice === given[target.memberId]}>
                  {busy ? "Menyimpan…" : "Simpan"}
                </button>
              </div>
            </div>
          )}
        </dialog>
      )}
    </section>
  );
}
