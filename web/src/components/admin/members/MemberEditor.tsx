"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { cx } from "@/lib/cx";
import { adjustPoints, updateMember } from "@/server/admin/actions/members";
import type { MemberForm } from "@/server/admin/types";
import styles from "../activities/SessionEditor.module.css";
import { FormCard, Toggle } from "../ui/AdminForm";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton } from "../ui/AdminUI";
import { toast } from "../ui/Toaster";

const LEVELS = [
  ["beginner", "Beginner"],
  ["beginner_intermediate", "Beginner–Intermediate"],
  ["intermediate", "Intermediate"],
  ["intermediate_advanced", "Intermediate–Advanced"],
  ["advanced", "Advanced"],
];
const FREQUENCIES = [
  ["rarely", "First time / Rarely"],
  ["monthly", "1–2x / bulan"],
  ["weekly", "1x / minggu"],
  ["twice_weekly", "2–3x / minggu"],
  ["often", "4x+ / minggu"],
];
const FORMATS = [
  ["singles", "Singles"],
  ["doubles", "Doubles"],
  ["both", "Keduanya"],
];
const HANDS = [
  ["right", "Kanan"],
  ["left", "Kiri"],
  ["both", "Keduanya"],
];
const GENDERS = [
  ["female", "Perempuan"],
  ["male", "Laki-laki"],
  ["undisclosed", "Tidak disebutkan"],
];

/** Edit data member + penyesuaian Slay Point manual. */
export function MemberEditor({ initial }: { initial: MemberForm }) {
  const [m, setM] = useState(initial);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [saving, start] = useTransition();
  const set = <K extends keyof MemberForm>(key: K, value: MemberForm[K]) => setM((prev) => ({ ...prev, [key]: value }));

  const save = () =>
    start(async () => {
      const result = await updateMember(m);
      toast.result(result);
    });

  const savePoints = () =>
    start(async () => {
      const result = await adjustPoints(m.id, Number(delta), reason);
      if (result.ok) {
        setDelta("");
        setReason("");
        set("pointsBalance", m.pointsBalance + Number(delta));
      }
      toast.result(result);
    });

  const text = (label: string, key: keyof MemberForm, props: { type?: string; placeholder?: string } = {}) => (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input className={styles.input} type={props.type ?? "text"} placeholder={props.placeholder} value={String(m[key] ?? "")} onChange={(e) => set(key, e.target.value as never)} />
    </label>
  );
  const select = (label: string, key: keyof MemberForm, options: string[][]) => (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.selectWrap}>
        <select className={cx(styles.input, styles.select)} value={String(m[key] ?? "")} onChange={(e) => set(key, e.target.value as never)}>
          <option value="">—</option>
          {options.map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
        <AdminIcon name="caret-down" size={14} />
      </span>
    </label>
  );

  return (
    <div className={styles.editor}>
      <div className={styles.bar}>
        <div className={styles.barLeft}>
          <Link href={`/admin/members/${m.id}`} className={styles.back}>
            <AdminIcon name="caret-left" size={16} />
            Detail member
          </Link>
        </div>
        <div className={styles.barActions}>
          <AdminButton variant="primary" size="sm" icon="check-bold" onClick={save} disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan perubahan"}
          </AdminButton>
        </div>
      </div>


      <div className={styles.grid}>
        <div className={styles.main}>
          <FormCard title="Akun & kontak" subtitle={`Email login: ${m.email} (diubah member sendiri)`}>
            <div className={styles.cols2}>
              {text("Nama lengkap *", "fullName")}
              {text("No. WhatsApp", "phone", { placeholder: "81234567890" })}
              {text("Kota", "city")}
              {text("Tanggal lahir", "birthDate", { type: "date" })}
              {select("Gender", "gender", GENDERS)}
              {text("Kuy ID", "kuyId")}
              {text("Instagram", "instagram", { placeholder: "tanpa @" })}
            </div>
          </FormCard>
          <FormCard title="Tennis profile">
            <div className={styles.cols2}>
              {select("Level", "level", LEVELS)}
              {select("Frekuensi main", "playFrequency", FREQUENCIES)}
              {select("Format", "playFormat", FORMATS)}
              {select("Tangan dominan", "hand", HANDS)}
              {text("Main sejak", "playingSince", { placeholder: "mis. 1–3 tahun" })}
            </div>
          </FormCard>
        </div>

        <aside className={styles.side}>
          <FormCard title="Status akun">
            <Toggle
              label="Tangguhkan member"
              hint="Member tidak bisa booking sesi & belanja"
              checked={m.status === "suspended"}
              onChange={(on) => set("status", on ? "suspended" : "active")}
            />
          </FormCard>
          <FormCard title="Slay Point" subtitle={`Saldo sekarang ${m.pointsBalance.toLocaleString("id-ID")} poin`}>
            <label className={styles.field}>
              <span className={styles.label}>Tambah / kurangi</span>
              <span className={styles.affix}>
                <input inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ""))} placeholder="mis. 50 atau -50" />
                <span className={styles.muted}>poin</span>
              </span>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Alasan</span>
              <input className={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Kompensasi sesi batal" />
            </label>
            <AdminButton size="sm" onClick={savePoints} disabled={saving || !Number(delta) || !reason.trim()}>
              Simpan poin
            </AdminButton>
          </FormCard>
        </aside>
      </div>
    </div>
  );
}
