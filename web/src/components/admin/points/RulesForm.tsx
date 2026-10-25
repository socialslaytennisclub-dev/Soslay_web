"use client";

import { useState, useTransition, type ReactNode } from "react";
import { BONUS_LABEL, formatRupiahPlain } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { savePointRules, sendBulkBonus } from "@/server/admin/actions/points";
import type { PointRules } from "@/server/admin/types";
import settingsStyles from "../settings/Settings.module.css";
import { FormCard } from "../ui/AdminForm";
import formStyles from "../ui/AdminForm.module.css";
import { AdminButton, Badge } from "../ui/AdminUI";
import styles from "./Points.module.css";
import { toast } from "../ui/Toaster";

const digits = (v: string) => Number(v.replace(/\D/g, "")) || 0;

/** Input angka bebas ("175 pts") — angka bulat berapa saja, tidak harus kelipatan. */
function Pts({ value, unit = "pts", label, onChange, prefix }: { value: number; unit?: string; label: string; onChange: (n: number) => void; prefix?: string }) {
  return (
    <label className={styles.pts}>
      <span className="visually-hidden">{label}</span>
      {prefix && <span>{prefix}</span>}
      <input inputMode="numeric" value={value.toLocaleString("id-ID")} onChange={(e) => onChange(digits(e.target.value))} />
      <span>{unit}</span>
    </label>
  );
}

/** `soon` = tersimpan, tapi belum dijalankan sistem (butuh jadwal harian / checkout poin). */
function Rule({ label, hint, soon, children }: { label: string; hint?: string; soon?: boolean; children: ReactNode }) {
  return (
    <div className={styles.rule}>
      <span className={styles.ruleText}>
        <span>
          {label} {soon && <Badge tone="neutral">Segera</Badge>}
        </span>
        {hint && <span className={styles.hint}>{hint}</span>}
      </span>
      <span className={styles.ruleControls}>{children}</span>
    </div>
  );
}

/** Switch tanpa label teks (label ada di baris aturan). */
function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={cx(formStyles.switch, checked && formStyles.switchOn)} onClick={() => onChange(!checked)}>
      <span className={formStyles.switchKnob} />
    </button>
  );
}

/** Aturan poin (Figma 317:482). Semua angka bisa diisi bebas. */
export function RulesForm({ initial, types }: { initial: PointRules; types: { slug: string; label: string }[] }) {
  const [r, setR] = useState(initial);
  const [saving, start] = useTransition();
  const dirty = JSON.stringify(r) !== JSON.stringify(initial);
  const set = <K extends keyof PointRules>(key: K, value: PointRules[K]) => setR((prev) => ({ ...prev, [key]: value }));

  const save = () =>
    start(async () => {
      const result = await savePointRules(r);
      toast.result(result);
    });

  return (
    <>
      <div className={styles.rulesGrid}>
        <div className={styles.rulesCol}>
          <FormCard title="Poin kehadiran per tipe sesi" subtitle="Ketik angka berapa saja · default saat membuat sesi, bisa diubah per sesi">
            <div>
              {types.map((t) => (
                <Rule key={t.slug} label={t.label}>
                  <Pts label={`Poin ${t.label}`} value={r.attendance[t.slug] ?? 0} onChange={(n) => set("attendance", { ...r.attendance, [t.slug]: n })} />
                </Rule>
              ))}
              <Rule label="Poin hanya untuk peserta yang check-in" hint="No-show tidak dapat poin">
                <Badge tone="lime">Selalu aktif</Badge>
              </Rule>
            </div>
          </FormCard>

          <FormCard title="Poin dari belanja Shop" subtitle="Dihitung dari total produk (tanpa ongkir) saat order selesai">
            <div>
              <Rule label="Setiap belanja" hint={`${formatRupiahPlain(r.rupiahPerPoint)} = 1 poin`}>
                <Pts label="Rupiah per poin" prefix="Rp" unit="/ poin" value={r.rupiahPerPoint} onChange={(n) => set("rupiahPerPoint", n)} />
              </Rule>
              <Rule label="Poin juga untuk produk diskon" hint="Produk dengan harga coret" soon>
                <Switch label="Poin untuk produk diskon" checked={r.discountedProducts} onChange={(v) => set("discountedProducts", v)} />
              </Rule>
              <Rule label="Poin bisa jadi potongan belanja" hint={`Maks ${r.redeemDiscount.maxPercent}% dari total order`} soon>
                <Pts label="Rupiah per poin saat ditukar" prefix="Rp" unit="/ poin" value={r.redeemDiscount.rupiahPerPoint} onChange={(n) => set("redeemDiscount", { ...r.redeemDiscount, rupiahPerPoint: n })} />
                <Switch label="Poin sebagai potongan belanja" checked={r.redeemDiscount.enabled} onChange={(v) => set("redeemDiscount", { ...r.redeemDiscount, enabled: v })} />
              </Rule>
              <Rule label="Batas potongan" hint="Persen dari total order" soon>
                <Pts label="Batas potongan persen" unit="%" value={r.redeemDiscount.maxPercent} onChange={(n) => set("redeemDiscount", { ...r.redeemDiscount, maxPercent: n })} />
              </Rule>
            </div>
          </FormCard>
        </div>

        <div className={styles.rulesCol}>
          <FormCard title="Bonus otomatis" subtitle="Ketik angka berapa saja · bertanda Segera tersimpan, berjalan otomatis di tahap berikutnya">
            <div>
              {r.bonuses.map((b) => (
                <Rule key={b.key} label={BONUS_LABEL[b.key].label} hint={BONUS_LABEL[b.key].hint} soon={b.key !== "signup"}>
                  <Pts label={`Poin ${BONUS_LABEL[b.key].label}`} value={b.points} onChange={(n) => set("bonuses", r.bonuses.map((x) => (x.key === b.key ? { ...x, points: n } : x)))} />
                  <Switch label={BONUS_LABEL[b.key].label} checked={b.enabled} onChange={(v) => set("bonuses", r.bonuses.map((x) => (x.key === b.key ? { ...x, enabled: v } : x)))} />
                </Rule>
              ))}
            </div>
          </FormCard>

          <FormCard title="Masa berlaku poin" subtitle="Segera: poin hangus & pengingat butuh jadwal harian — pengaturan sudah bisa disimpan">
            <div>
              <Rule label="Poin berlaku" hint="Dihitung dari tanggal poin didapat">
                <Pts label="Masa berlaku bulan" unit="bulan" value={r.expiry.months} onChange={(n) => set("expiry", { ...r.expiry, months: n })} />
              </Rule>
              <Rule label="Ingatkan sebelum hangus" hint="WhatsApp & email 30 hari sebelumnya">
                <Switch label="Ingatkan sebelum hangus" checked={r.expiry.remind} onChange={(v) => set("expiry", { ...r.expiry, remind: v })} />
              </Rule>
              <Rule label="Poin tier tidak ikut hangus" hint="Tier dihitung dari total poin seumur hidup">
                <Switch label="Poin tier tidak ikut hangus" checked={r.expiry.tierKeeps} onChange={(v) => set("expiry", { ...r.expiry, tierKeeps: v })} />
              </Rule>
            </div>
          </FormCard>
        </div>
      </div>

      <div className={styles.footer}>
        
        <span className={styles.hint}>Perubahan berlaku untuk poin berikutnya</span>
        <AdminButton
          disabled={!dirty || saving}
          onClick={() => {
            setR(initial);
          }}
        >
          Batalkan
        </AdminButton>
        <AdminButton variant="primary" icon="check-bold" disabled={!dirty || saving} onClick={save}>
          {saving ? "Menyimpan…" : "Simpan aturan"}
        </AdminButton>
      </div>
    </>
  );
}

/** Kirim poin sekaligus ke satu segmen (Figma 317:482 bawah). */
export function BulkBonus({ segments }: { segments: { id: string; name: string; count: number }[] }) {
  const [segmentId, setSegmentId] = useState(segments[0]?.id ?? "");
  const [points, setPoints] = useState(100);
  const [reason, setReason] = useState("");
  const [saving, start] = useTransition();
  const segment = segments.find((s) => s.id === segmentId);

  const send = () => {
    if (!segment || !window.confirm(`Kirim +${points.toLocaleString("id-ID")} pts ke ${segment.count} member "${segment.name}"?`)) return;
    start(async () => {
      const result = await sendBulkBonus(segmentId, points, reason);
      toast.result(result);
      if (result.ok) setReason("");
    });
  };

  return (
    <FormCard title="Bonus massal" subtitle="Kirim poin sekaligus ke satu segmen member — tercatat di riwayat poin">
      <div className={styles.bulk}>
        <label className={settingsStyles.field}>
          <span className={settingsStyles.label}>Segmen penerima</span>
          <select className={styles.select} value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.count} member
              </option>
            ))}
          </select>
        </label>
        <label className={settingsStyles.field}>
          <span className={settingsStyles.label}>Jumlah poin</span>
          <span className={settingsStyles.affix}>
            <span className={settingsStyles.muted}>+</span>
            <input inputMode="numeric" value={points.toLocaleString("id-ID")} onChange={(e) => setPoints(digits(e.target.value))} />
            <span className={settingsStyles.muted}>pts</span>
          </span>
        </label>
        <label className={settingsStyles.field}>
          <span className={settingsStyles.label}>Alasan (tampil di riwayat member)</span>
          <input className={settingsStyles.input} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="mis. Terima kasih sudah aktif di Oktober" />
        </label>
        <AdminButton variant="primary" icon="plus-bold" onClick={send} disabled={saving || !segment?.count || !points || !reason.trim()}>
          {saving ? "Mengirim…" : `Kirim ke ${segment?.count ?? 0} member`}
        </AdminButton>
      </div>
      
    </FormCard>
  );
}
