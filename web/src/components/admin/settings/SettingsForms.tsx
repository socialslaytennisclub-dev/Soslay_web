"use client";

import { useState, type ReactNode } from "react";
import { formatRupiahPlain } from "@/lib/admin-labels";
import type { AppSettings } from "@/server/admin/types";
import { FormCard, Toggle } from "../ui/AdminForm";
import { AdminButton, TierBadge } from "../ui/AdminUI";
import styles from "./Settings.module.css";

type Tab = "general" | "membership" | "payment" | "notifications";

/** Tab Umum / Membership & poin / Pembayaran / Notifikasi (app_settings). Simpan masih demo. */
export function SettingsForms({ tab, initial }: { tab: Tab; initial: AppSettings }) {
  const [s, setS] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setS((prev) => ({ ...prev, [key]: value }));
  const num = (v: string) => Number(v.replace(/\D/g, "")) || 0;

  const footer = (
    <div className={styles.formFooter}>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      <div className={styles.formActions}>
        <AdminButton disabled={!dirty} onClick={() => {
            setS(initial);
            setNotice(null);
          }}>
          Batalkan
        </AdminButton>
        <AdminButton variant="primary" icon="check-bold" disabled={!dirty} onClick={() => setNotice("Mode demo: pengaturan belum tersimpan karena database (Supabase) belum tersambung.")}>
          Simpan pengaturan
        </AdminButton>
      </div>
    </div>
  );

  if (tab === "general") {
    return (
      <div className={styles.formStack}>
        <FormCard title="Profil klub" subtitle="Tampil di footer website, email, dan pesan WhatsApp">
          <div className={styles.cols2}>
            <Field label="Nama klub">
              <input className={styles.input} value={s.clubName} onChange={(e) => set("clubName", e.target.value)} />
            </Field>
            <Field label="Email kontak">
              <input type="email" className={styles.input} value={s.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
            </Field>
            <Field label="WhatsApp admin">
              <input className={styles.input} value={s.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
            </Field>
            <Field label="Zona waktu">
              <input className={styles.input} value={s.timezone} readOnly aria-readonly />
            </Field>
          </div>
        </FormCard>
        {footer}
      </div>
    );
  }

  if (tab === "membership") {
    return (
      <div className={styles.formStack}>
        <FormCard title="Tier membership" subtitle="Tier member naik otomatis saat total Slay Point mencapai batas ini">
          <ul className={styles.tiers}>
            {s.tiers.map((t, i) => (
              <li key={t.tier}>
                <TierBadge tier={t.tier} />
                <label className={styles.affix}>
                  <span className="visually-hidden">Minimal poin {t.label}</span>
                  <input
                    inputMode="numeric"
                    value={t.minPoints}
                    disabled={i === 0}
                    onChange={(e) => set("tiers", s.tiers.map((x) => (x.tier === t.tier ? { ...x, minPoints: num(e.target.value) } : x)))}
                  />
                  <span className={styles.muted}>poin</span>
                </label>
              </li>
            ))}
          </ul>
        </FormCard>
        <FormCard title="Slay Point & target" subtitle="Dipakai di member dashboard">
          <div className={styles.cols2}>
            <Field label="Belanja per 1 poin" hint={`${formatRupiahPlain(s.rupiahPerPoint)} = 1 poin`}>
              <span className={styles.affix}>
                <span className={styles.muted}>Rp</span>
                <input inputMode="numeric" value={s.rupiahPerPoint} onChange={(e) => set("rupiahPerPoint", num(e.target.value))} />
              </span>
            </Field>
            <Field label="Target sesi per bulan">
              <span className={styles.affix}>
                <input inputMode="numeric" value={s.monthlySessionTarget} onChange={(e) => set("monthlySessionTarget", num(e.target.value))} />
                <span className={styles.muted}>sesi</span>
              </span>
            </Field>
            <Field label="Target tahunan · sesi">
              <input inputMode="numeric" className={styles.input} value={s.annualTargets.sessions} onChange={(e) => set("annualTargets", { ...s.annualTargets, sessions: num(e.target.value) })} />
            </Field>
            <Field label="Target tahunan · jam main">
              <input inputMode="numeric" className={styles.input} value={s.annualTargets.hours} onChange={(e) => set("annualTargets", { ...s.annualTargets, hours: num(e.target.value) })} />
            </Field>
          </div>
        </FormCard>
        {footer}
      </div>
    );
  }

  if (tab === "payment") {
    return (
      <div className={styles.formStack}>
        <FormCard title="Metode pembayaran" subtitle="Lewat payment gateway · biaya ditanggung klub">
          {s.paymentMethods.map((m) => (
            <Toggle
              key={m.key}
              label={m.label}
              hint={`Biaya ${m.fee}`}
              checked={m.enabled}
              onChange={(enabled) => set("paymentMethods", s.paymentMethods.map((x) => (x.key === m.key ? { ...x, enabled } : x)))}
            />
          ))}
        </FormCard>
        <FormCard title="Batas waktu bayar booking" subtitle="Booking yang belum dibayar dibatalkan otomatis dan slot kembali ke waitlist">
          <Field label="Batas waktu">
            <span className={styles.affix}>
              <input inputMode="numeric" value={s.bookingPaymentDeadlineHours} onChange={(e) => set("bookingPaymentDeadlineHours", num(e.target.value))} />
              <span className={styles.muted}>jam setelah booking</span>
            </span>
          </Field>
        </FormCard>
        {footer}
      </div>
    );
  }

  return (
    <div className={styles.formStack}>
      <FormCard title="Notifikasi otomatis" subtitle="Template pesan diatur di WhatsApp Business">
        {s.notifications.map((n) => (
          <Toggle
            key={n.key}
            label={`${n.label} · ${n.channel}`}
            hint={n.hint}
            checked={n.enabled}
            onChange={(enabled) => set("notifications", s.notifications.map((x) => (x.key === n.key ? { ...x, enabled } : x)))}
          />
        ))}
      </FormCard>
      {footer}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
      {hint && <span className={styles.muted}>{hint}</span>}
    </label>
  );
}
