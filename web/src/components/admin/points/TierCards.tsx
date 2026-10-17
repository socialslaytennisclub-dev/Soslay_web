"use client";

import { useState, useTransition } from "react";
import { formatPoints } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { saveTier } from "@/server/admin/actions/points";
import type { TierBenefits } from "@/server/admin/types";
import settingsStyles from "../settings/Settings.module.css";
import { AdminButton } from "../ui/AdminUI";
import { ActionNotice, type Notice } from "./ActionNotice";
import styles from "./Points.module.css";

/** Kartu tier + benefit, bisa diedit di tempat (Figma 322:2 atas). */
export function TierCards({ tiers }: { tiers: TierBenefits[] }) {
  const total = Math.max(1, tiers.reduce((sum, t) => sum + t.members, 0));
  return (
    <div className={styles.tiers}>
      {tiers.map((t) => (
        <TierCard key={t.tier} tier={t} share={t.members / total} />
      ))}
    </div>
  );
}

function TierCard({ tier: t, share }: { tier: TierBenefits; share: number }) {
  const [editing, setEditing] = useState(false);
  const [minPoints, setMinPoints] = useState(String(t.minPoints));
  const [benefits, setBenefits] = useState(t.benefits.join("\n"));
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, start] = useTransition();

  const save = () =>
    start(async () => {
      const result = await saveTier(t.tier, Number(minPoints || 0), benefits.split("\n"));
      setNotice(result.ok ? { text: result.message } : { text: result.error, error: true });
      if (result.ok) setEditing(false);
    });

  return (
    <section className={styles.tierCard} aria-label={`Tier ${t.label}`}>
      <header className={styles.tierHead}>
        <h3 className={styles.tierName}>
          <span className={cx(styles.tierDot, styles[`dot-${t.tier}`])} aria-hidden />
          {t.label}
        </h3>
        <p className={styles.hint}>
          {t.tier === "basic" ? "0 pts" : `≥ ${formatPoints(t.minPoints)}`} · {t.members.toLocaleString("id-ID")} member
        </p>
      </header>
      <div className={styles.share} role="img" aria-label={`${Math.round(share * 100)}% member`}>
        <span className={styles[`dot-${t.tier}`]} style={{ width: `${Math.max(2, share * 100)}%` }} />
      </div>

      {editing ? (
        <div className={styles.form}>
          <label className={settingsStyles.field}>
            <span className={settingsStyles.label}>Batas poin (total seumur hidup)</span>
            <span className={settingsStyles.affix}>
              <input inputMode="numeric" value={minPoints} disabled={t.tier === "basic"} onChange={(e) => setMinPoints(e.target.value.replace(/\D/g, ""))} />
              <span className={settingsStyles.muted}>pts</span>
            </span>
          </label>
          <label className={settingsStyles.field}>
            <span className={settingsStyles.label}>Benefit (satu per baris)</span>
            <textarea className={settingsStyles.input} rows={5} value={benefits} onChange={(e) => setBenefits(e.target.value)} />
          </label>
        </div>
      ) : (
        <ul className={styles.benefits}>
          {t.benefits.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}

      <ActionNotice notice={notice} />

      {editing ? (
        <div className={styles.buttons}>
          <AdminButton size="sm" onClick={() => setEditing(false)} disabled={saving}>
            Batal
          </AdminButton>
          <AdminButton size="sm" variant="primary" icon="check-bold" onClick={save} disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan"}
          </AdminButton>
        </div>
      ) : (
        <AdminButton size="sm" icon="pencil-simple" onClick={() => setEditing(true)}>
          Edit tier & benefit
        </AdminButton>
      )}
    </section>
  );
}
