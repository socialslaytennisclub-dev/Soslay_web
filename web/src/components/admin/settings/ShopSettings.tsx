"use client";

import { useState, useTransition, type ReactNode } from "react";
import { MapPicker } from "@/components/ui/MapPicker/MapPicker";
import { citiesOf, PROVINCE_NAMES } from "@/content/wilayah";
import { saveShopSettings } from "@/server/admin/actions/shop-settings";
import type { ShopSettings } from "@/server/shop/settings";
import { FormCard } from "../ui/AdminForm";
import { AdminButton } from "../ui/AdminUI";
import { toast } from "../ui/Toaster";
import styles from "./Settings.module.css";

const num = (v: string) => Number(v.replace(/[^\d]/g, "")) || 0;
const dec = (v: string) => {
  const n = Number(v.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Settings › Shop & pengiriman: rekening tujuan transfer, alamat gudang (titik peta), ongkir Instant & J&T. */
export function ShopSettingsForm({ initial }: { initial: ShopSettings }) {
  const [s, setS] = useState(initial);
  const [saving, start] = useTransition();
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const bank = (k: keyof ShopSettings["bank"], v: string) => setS((p) => ({ ...p, bank: { ...p.bank, [k]: v } }));
  const inst = <K extends keyof ShopSettings["instant"]>(k: K, v: ShopSettings["instant"][K]) => setS((p) => ({ ...p, instant: { ...p.instant, [k]: v } }));
  const rate = (i: number, patch: Partial<ShopSettings["rates"][number]>) => setS((p) => ({ ...p, rates: p.rates.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const save = () =>
    start(async () => {
      toast.result(await saveShopSettings(s));
    });

  return (
    <div className={styles.formStack}>
      <FormCard title="Rekening tujuan transfer" subtitle="Tampil di halaman pembayaran pesanan Shop. Member transfer ke rekening ini lalu upload bukti.">
        <div className={styles.cols2}>
          <Field label="Nama bank">
            <input className={styles.input} value={s.bank.bank} onChange={(e) => bank("bank", e.target.value)} placeholder="Bank Central Asia (BCA)" />
          </Field>
          <Field label="Singkatan bank" hint="Tampil di logo kecil, mis. BCA">
            <input className={styles.input} value={s.bank.short} maxLength={12} onChange={(e) => bank("short", e.target.value)} />
          </Field>
          <Field label="Nomor rekening">
            <input className={styles.input} inputMode="numeric" value={s.bank.accountNo} onChange={(e) => bank("accountNo", e.target.value.replace(/[^\d\s-]/g, ""))} />
          </Field>
          <Field label="Nama pemilik rekening (a.n.)">
            <input className={styles.input} value={s.bank.accountName} onChange={(e) => bank("accountName", e.target.value)} />
          </Field>
          <Field label="Kode bank" hint="Untuk transfer antarbank, mis. 014 (BCA)">
            <input className={styles.input} inputMode="numeric" maxLength={3} value={s.bank.bankCode} onChange={(e) => bank("bankCode", e.target.value.replace(/\D/g, "").slice(0, 3))} />
          </Field>
        </div>
      </FormCard>

      <FormCard title="Alamat gudang / pengirim" subtitle="Titik awal pengiriman. Ongkir Instant dihitung dari titik ini ke titik alamat member.">
        <Field label="Alamat gudang">
          <textarea className={styles.input} rows={2} value={s.instant.originAddress} onChange={(e) => inst("originAddress", e.target.value)} placeholder="Nama jalan, nomor, kelurahan, kecamatan, kota" />
        </Field>
        <div className={styles.field}>
          <span className={styles.label}>Titik lokasi gudang</span>
          <MapPicker
            value={{ lat: s.instant.originLat, lng: s.instant.originLng }}
            onChange={(p) => setS((prev) => ({ ...prev, instant: { ...prev.instant, originLat: p.lat, originLng: p.lng } }))}
            hint="Klik peta atau geser pin ke lokasi gudang"
            height={300}
          />
        </div>
      </FormCard>

      <FormCard title="Ongkir Instant (Jakarta)" subtitle="Ongkir = tarif dasar + (jarak − km dasar, dibulatkan ke atas) × tarif per km, dibulatkan ke Rp1.000.">
        <div className={styles.cols2}>
          <Field label="Tarif dasar">
            <span className={styles.affix}>
              <span className={styles.muted}>Rp</span>
              <input inputMode="numeric" value={s.instant.baseFee} onChange={(e) => inst("baseFee", num(e.target.value))} />
            </span>
          </Field>
          <Field label="Termasuk jarak">
            <span className={styles.affix}>
              <input inputMode="decimal" value={s.instant.baseKm} onChange={(e) => inst("baseKm", dec(e.target.value))} />
              <span className={styles.muted}>km pertama</span>
            </span>
          </Field>
          <Field label="Tarif per km tambahan">
            <span className={styles.affix}>
              <span className={styles.muted}>Rp</span>
              <input inputMode="numeric" value={s.instant.perKmFee} onChange={(e) => inst("perKmFee", num(e.target.value))} />
              <span className={styles.muted}>/ km</span>
            </span>
          </Field>
          <Field label="Jarak maksimal">
            <span className={styles.affix}>
              <input inputMode="decimal" value={s.instant.maxKm} onChange={(e) => inst("maxKm", dec(e.target.value))} />
              <span className={styles.muted}>km</span>
            </span>
          </Field>
          <Field label="Batas jam kirim hari ini" hint="Pembayaran terverifikasi sebelum jam ini → dikirim hari itu">
            <input type="time" className={styles.input} value={s.instant.cutoff} onChange={(e) => inst("cutoff", e.target.value)} />
          </Field>
        </div>
      </FormCard>

      <FormCard
        title="Ongkir J&T per kota"
        subtitle="Ongkir = tarif per kg × berat pesanan (dibulatkan ke atas, min 1 kg). Kota yang tidak ada / nonaktif tidak bisa memilih J&T."
        action={
          <AdminButton size="sm" icon="plus-bold" onClick={() => setS((p) => ({ ...p, rates: [...p.rates, { city: "", province: "", perKg: 0, eta: "2–3", active: true }] }))}>
            Tambah kota
          </AdminButton>
        }
      >
        <div className={styles.rateTable} role="table" aria-label="Tarif J&T per kota">
          <div className={styles.rateHead} role="row">
            <span role="columnheader">Provinsi</span>
            <span role="columnheader">Kabupaten / kota</span>
            <span role="columnheader">Tarif / kg</span>
            <span role="columnheader">Estimasi (hari)</span>
            <span role="columnheader">Aktif</span>
            <span role="columnheader" className="visually-hidden">
              Hapus
            </span>
          </div>
          {s.rates.map((r, i) => (
            <div key={i} className={styles.rateRow} role="row">
              <select className={styles.input} aria-label="Provinsi" value={r.province} onChange={(e) => rate(i, { province: e.target.value, city: "" })}>
                <option value="">Pilih provinsi</option>
                {/* Nama lama yang tidak ada di daftar tetap tampil supaya bisa diganti. */}
                {r.province && !PROVINCE_NAMES.includes(r.province) && <option value={r.province}>{r.province} (nama lama)</option>}
                {PROVINCE_NAMES.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
              <select className={styles.input} aria-label="Kabupaten / kota" value={r.city} disabled={!r.province} onChange={(e) => rate(i, { city: e.target.value })}>
                <option value="">{r.province ? "Pilih kabupaten / kota" : "Pilih provinsi dulu"}</option>
                {r.city && !citiesOf(r.province).includes(r.city) && <option value={r.city}>{r.city} (nama lama)</option>}
                {citiesOf(r.province).map((c) => (
                  <option key={c} disabled={s.rates.some((x, j) => j !== i && x.city === c)}>
                    {c}
                  </option>
                ))}
              </select>
              <span className={styles.affix}>
                <span className={styles.muted}>Rp</span>
                <input inputMode="numeric" aria-label="Tarif per kg" value={r.perKg} onChange={(e) => rate(i, { perKg: num(e.target.value) })} />
              </span>
              <input className={styles.input} aria-label="Estimasi hari" value={r.eta} onChange={(e) => rate(i, { eta: e.target.value })} />
              <label className={styles.rateActive}>
                <input type="checkbox" checked={r.active} onChange={(e) => rate(i, { active: e.target.checked })} />
                <span className="visually-hidden">Aktif</span>
              </label>
              <AdminButton size="sm" variant="ghost" icon="trash" onClick={() => setS((p) => ({ ...p, rates: p.rates.filter((_, j) => j !== i) }))}>
                <span className="visually-hidden">Hapus {r.city || "baris"}</span>
              </AdminButton>
            </div>
          ))}
        </div>
        <p className={styles.muted}>Catatan: ongkir Instant hanya untuk kota di provinsi &quot;DKI Jakarta&quot;.</p>
      </FormCard>

      <div className={styles.formFooter}>
        <div className={styles.formActions}>
          <AdminButton disabled={!dirty} onClick={() => setS(initial)}>
            Batalkan
          </AdminButton>
          <AdminButton variant="primary" icon="check-bold" disabled={!dirty || saving} onClick={save}>
            {saving ? "Menyimpan…" : "Simpan pengaturan"}
          </AdminButton>
        </div>
      </div>
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
