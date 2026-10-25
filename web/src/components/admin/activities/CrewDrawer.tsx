"use client";

import { useState } from "react";
import { useDialog } from "@/hooks/useDialog";
import { TIER_LABEL } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import type { MemberChoice, SessionHost } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, MemberAvatar } from "../ui/AdminUI";
import { Drawer } from "../ui/Drawer";
import { toast } from "../ui/Toaster";
import editor from "./SessionEditor.module.css";
import styles from "./Play.module.css";

const ROLES = [
  { value: "host", label: "Host" },
  { value: "photographer", label: "Fotografer" },
] as const;

/** Hak host di member web (Figma 05k) — pengaturan format, tiket & menutup sesi tetap di admin. */
const HOST_ACCESS = ["Input & verifikasi skor court", "Tinjau skor berbeda", "Atur line-up saat live", "Check-in peserta"];

/**
 * "Tambah crew" (Figma ADM-13 · 05k): cari member, pilih peran Host / Fotografer. Hasilnya masuk
 * ke daftar Host & fotografer dan tersimpan bersama "Simpan perubahan".
 */
export function CrewDrawer({
  sessionTitle,
  sessionWhen,
  members,
  participantIds,
  exclude,
  onAdd,
}: {
  sessionTitle: string;
  sessionWhen: string;
  members: MemberChoice[];
  /** Member yang sudah terdaftar sebagai peserta sesi ini (label "Terdaftar di sesi ini"). */
  participantIds: Set<string>;
  exclude: Set<string>;
  onAdd: (crew: SessionHost) => void;
}) {
  const dialog = useDialog();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<MemberChoice | null>(null);
  const [role, setRole] = useState<SessionHost["role"]>("host");

  const q = query.trim().toLowerCase();
  const results = q.length < 2 ? [] : members.filter((m) => !exclude.has(m.id) && (m.name.toLowerCase().includes(q) || m.code.toLowerCase().replace(/\s/g, "").includes(q.replace(/\s/g, "")))).slice(0, 6);

  const close = () => {
    dialog.close();
    setQuery("");
    setChosen(null);
    setRole("host");
  };
  const add = () => {
    if (!chosen) return;
    onAdd({ memberId: chosen.id, name: chosen.name, code: chosen.code, role });
    toast.success(`${chosen.name} ditambahkan sebagai ${role === "host" ? "host" : "fotografer"} — tekan "Simpan perubahan" untuk menerapkan.`);
    close();
  };

  return (
    <>
      <button type="button" className={editor.addCrew} onClick={dialog.open}>
        <AdminIcon name="plus-bold" size={14} />
        Tambah crew
      </button>
      <Drawer
        dialogRef={dialog.dialogRef}
        title="Tambah host / fotografer"
        subtitle={`${sessionTitle} · ${sessionWhen}`}
        onClose={close}
        onBackdropClick={dialog.onBackdropClick}
        footer={
          <>
            <AdminButton onClick={close}>Batal</AdminButton>
            <AdminButton variant="primary" onClick={add} disabled={!chosen}>
              Tambahkan sebagai {role === "host" ? "host" : "fotografer"}
            </AdminButton>
          </>
        }
      >
        <div className={styles.importBody}>
          <label className={editor.field}>
            <span className={editor.label}>Cari member</span>
            <span className={editor.affix}>
              <AdminIcon name="magnifying-glass" size={16} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setChosen(null);
                }}
                placeholder="Nama atau ID Soslay…"
                autoComplete="off"
                autoFocus
              />
            </span>
          </label>

          {results.length > 0 && (
            <ul className={styles.crewResults} role="radiogroup" aria-label="Hasil pencarian member">
              {results.map((m) => (
                <li key={m.id}>
                  <button type="button" role="radio" aria-checked={chosen?.id === m.id} className={cx(styles.crewOption, chosen?.id === m.id && styles.crewOptionOn)} onClick={() => setChosen(m)}>
                    <span className={styles.radioDot} />
                    <MemberAvatar name={m.name} size={34} />
                    <span className={styles.importMeta}>
                      <strong>{m.name}</strong>
                      <span>
                        {m.code} · {TIER_LABEL[m.tier]} Member
                      </span>
                    </span>
                    {participantIds.has(m.id) && <span className={styles.registered}>Terdaftar di sesi ini</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.length >= 2 && results.length === 0 && <span className={editor.muted}>Member tidak ditemukan.</span>}

          <fieldset className={editor.fieldset}>
            <legend className={editor.label}>Peran</legend>
            <div className={editor.segmentWrap}>
              {ROLES.map((r) => (
                <button key={r.value} type="button" aria-pressed={role === r.value} className={cx(editor.option, role === r.value && editor.optionOn)} onClick={() => setRole(r.value)}>
                  {r.label}
                </button>
              ))}
            </div>
          </fieldset>

          {role === "host" ? (
            <div className={styles.readBox}>
              <strong>Akses host di member web</strong>
              <ul className={styles.accessList}>
                {HOST_ACCESS.map((a) => (
                  <li key={a}>
                    <AdminIcon name="check-bold" size={14} />
                    {a}
                  </li>
                ))}
              </ul>
              <span className={editor.muted}>Pengaturan format, tiket & menutup sesi tetap di admin. Akses berakhir otomatis saat sesi diakhiri.</span>
            </div>
          ) : (
            <p className={styles.info}>
              <AdminIcon name="image" size={16} />
              Fotografer tercantum di sesi & halaman foto member. Tidak mendapat akses Panel Host.
            </p>
          )}
        </div>
      </Drawer>
    </>
  );
}
