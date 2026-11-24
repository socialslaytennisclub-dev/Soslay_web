"use client";

import { formatRupiahPlain } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { memberInviteWaLink } from "@/lib/wa-invite";
import type { KuyImportPreviewRow } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { Badge, MemberAvatar } from "../ui/AdminUI";
import styles from "./Play.module.css";
import { WaInviteLink } from "./WaInviteLink";

export const phoneLabel = (phone: string) => (phone ? `0${phone.replace(/^0/, "")}` : "");

/**
 * Preview peserta dari file Kuyy (centang yang diimpor) — dipakai drawer Tambah peserta dan halaman
 * Import activity. Member Soslay ditandai; yang belum daftar dicatat sebagai ghost member.
 */
export function KuyPreviewTable({
  rows,
  picked,
  onPickedChange,
  sessionTitle,
}: {
  rows: KuyImportPreviewRow[];
  picked: Set<string>;
  onPickedChange: (next: Set<string>) => void;
  sessionTitle: string;
}) {
  const selectable = rows.filter((r) => !r.skipReason && !r.existing);
  const togglePick = (regNo: string) => {
    const next = new Set(picked);
    if (next.has(regNo)) next.delete(regNo);
    else next.add(regNo);
    onPickedChange(next);
  };

  return (
    <div className={styles.previewWrap}>
      <table className={styles.previewTable}>
        <thead>
          <tr>
            <th className={styles.pickCell}>
              <input
                type="checkbox"
                aria-label="Pilih semua peserta"
                checked={selectable.length > 0 && selectable.every((r) => picked.has(r.regNo))}
                onChange={(e) => onPickedChange(e.target.checked ? new Set(selectable.map((r) => r.regNo)) : new Set())}
              />
            </th>
            <th>Peserta & kontak</th>
            <th>Member Soslay</th>
            <th>Tiket & harga</th>
            <th>Dibayar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const disabled = Boolean(r.skipReason) || r.existing;
            const name = r.member?.name || r.name || "(tanpa nama)";
            return (
              <tr key={r.regNo} className={cx(disabled && styles.rowMuted)}>
                <td className={styles.pickCell}>
                  <input type="checkbox" aria-label={`Pilih ${name}`} checked={picked.has(r.regNo)} disabled={disabled} onChange={() => togglePick(r.regNo)} />
                </td>
                <td>
                  <span className={styles.person}>
                    <MemberAvatar name={name} size={32} />
                    <span className={styles.importMeta}>
                      <strong>{name}</strong>
                      {r.member && r.name && r.name.trim().toLowerCase() !== r.member.name.trim().toLowerCase() && <span>Nama di Kuyy: {r.name}</span>}
                      {r.phone && (
                        <span className={styles.contact}>
                          <AdminIcon name="whatsapp-logo" size={12} />
                          {phoneLabel(r.phone)}
                        </span>
                      )}
                      {r.email && (
                        <span className={styles.contact}>
                          <AdminIcon name="envelope-simple" size={12} />
                          {r.email}
                        </span>
                      )}
                    </span>
                  </span>
                </td>
                <td>
                  {r.member ? (
                    <span className={styles.importMeta}>
                      <span className={cx(styles.username, styles.memberLabel)}>
                        <AdminIcon name="verified" size={16} label="Member Soslay terverifikasi" className={styles.verified} />
                        Member
                      </span>
                      <span>{r.member.code}</span>
                    </span>
                  ) : (
                    <span className={styles.importMeta}>
                      <span className={cx(styles.username, styles.memberLabel)}>
                        <span className={styles.ghostDot} aria-hidden />
                        Bukan member
                      </span>
                      <span>{r.ghost ? `Ghost · ${r.ghost.activities} aktivitas` : "Ghost baru"}</span>
                      {r.invite === "whatsapp" && <WaInviteLink href={memberInviteWaLink(r, sessionTitle)} />}
                    </span>
                  )}
                </td>
                <td>
                  <span className={styles.importMeta}>
                    <strong>{r.ticket || "—"}</strong>
                    {r.ticketPrice > 0 && <span>{formatRupiahPlain(r.ticketPrice)}</span>}
                  </span>
                </td>
                <td>
                  {r.skipReason ? (
                    <Badge tone="pink">{r.skipReason}</Badge>
                  ) : r.existing ? (
                    <Badge tone="neutral">Sudah terdaftar</Badge>
                  ) : (
                    <strong className={styles.paid}>{r.amount ? formatRupiahPlain(r.amount) : "—"}</strong>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
