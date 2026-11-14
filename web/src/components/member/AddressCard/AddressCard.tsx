"use client";

import { useState, useTransition } from "react";
import { Button, SelectField, TextField } from "@/components/ui";
import { MapPicker } from "@/components/ui/MapPicker/MapPicker";
import { citiesOf, PROVINCE_NAMES, provinceOf } from "@/content/wilayah";
import { saveMyAddress } from "@/server/member/actions";
import type { MemberAddress } from "@/server/shop/types";
import formStyles from "../ProfileForm/ProfileForm.module.css";
import styles from "./AddressCard.module.css";

const DEMO: MemberAddress = {
  name: "Arya Putra Dewangga",
  phone: "0812-3456-7890",
  address: "Jl. Kemang Raya No. 12, Bangka, Mampang Prapatan",
  city: "Kota Jakarta Selatan",
  postalCode: "12730",
  pin: null,
};

/**
 * Tab Profile › Alamat pengiriman: dipakai otomatis di checkout Shop. Titik peta dibutuhkan untuk
 * pengiriman Instant (ongkir dihitung dari jarak gudang → titik ini).
 */
export function AddressCard({ initial }: { initial: MemberAddress | null }) {
  const live = Boolean(initial);
  const [saved, setSaved] = useState<MemberAddress>(initial ?? DEMO);
  const [a, setA] = useState<MemberAddress>(initial ?? DEMO);
  const [province, setProvince] = useState(() => provinceOf((initial ?? DEMO).city));
  const [status, setStatus] = useState<string>();
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(a) !== JSON.stringify(saved);
  const set = <K extends keyof MemberAddress>(k: K, v: MemberAddress[K]) => {
    setA((p) => ({ ...p, [k]: v }));
    setStatus(undefined);
  };

  const save = () =>
    start(async () => {
      if (!live) {
        setSaved(a);
        setStatus("Alamat tersimpan (mode demo).");
        return;
      }
      const r = await saveMyAddress(a);
      if (!r.ok) return setStatus(r.error);
      setSaved(a);
      setStatus("Alamat tersimpan — otomatis terisi saat checkout.");
    });

  return (
    <section id="alamat-pengiriman" className={`${formStyles.card} ${styles.card}`} aria-labelledby="alamat-pengiriman-title">
      <header className={formStyles.cardHeader}>
        <h2 id="alamat-pengiriman-title" className={formStyles.cardTitle}>
          Alamat Pengiriman
        </h2>
        <p className={formStyles.hint}>Untuk pengiriman pesanan Shop. Otomatis terisi saat checkout, dan tetap bisa diganti per pesanan.</p>
      </header>
      <div className={formStyles.fields}>
        <div className={formStyles.grid}>
          <TextField label="Nama penerima" required value={a.name} autoComplete="name" onChange={(e) => set("name", e.target.value)} />
          <TextField label="No. HP penerima" required type="tel" inputMode="tel" autoComplete="tel" value={a.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <label className={styles.field}>
          <span className={formStyles.label}>
            Alamat lengkap <span aria-hidden>*</span>
          </span>
          <textarea className={styles.textarea} rows={3} value={a.address} autoComplete="street-address" placeholder="Nama jalan, nomor, RT/RW, kelurahan, kecamatan" onChange={(e) => set("address", e.target.value)} />
        </label>
        <div className={formStyles.grid}>
          <SelectField
            label="Provinsi"
            required
            options={PROVINCE_NAMES}
            value={province}
            placeholder="Pilih provinsi"
            onChange={(v) => {
              setProvince(v);
              set("city", "");
            }}
          />
          <SelectField label="Kabupaten / kota" required options={citiesOf(province)} value={a.city} placeholder={province ? "Pilih kabupaten / kota" : "Pilih provinsi dulu"} onChange={(v) => set("city", v)} />
          <TextField label="Kode pos" required inputMode="numeric" autoComplete="postal-code" value={a.postalCode} onChange={(e) => set("postalCode", e.target.value.replace(/\D/g, "").slice(0, 5))} />
        </div>
        <div className={styles.field}>
          <span className={formStyles.label}>Titik lokasi di peta</span>
          <span className={formStyles.hint}>Dibutuhkan untuk pengiriman Instant (Jakarta). Pastikan pin tepat di depan rumah / gedung.</span>
          <MapPicker value={a.pin} onChange={(pin) => set("pin", pin)} height={280} />
          {a.pin && (
            <button type="button" className={styles.clear} onClick={() => set("pin", null)}>
              Hapus titik lokasi
            </button>
          )}
        </div>
      </div>
      <div className={styles.footer}>
        <p className={formStyles.label} role="status">
          {status ?? ""}
        </p>
        <div className={styles.buttons}>
          <Button
            variant="outline"
            onClick={() => {
              setA(saved);
              setProvince(provinceOf(saved.city));
            }}
            disabled={!dirty || pending}
          >
            Batal
          </Button>
          <Button variant="primary" onClick={save} disabled={!dirty || pending}>
            {pending ? "Menyimpan…" : "Simpan Alamat"}
          </Button>
        </div>
      </div>
    </section>
  );
}
