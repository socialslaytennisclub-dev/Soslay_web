"use client";

import { useState } from "react";
import { cx } from "@/lib/cx";
import type { AdminModule, ModuleAccess, RolePermissions, StaffMember } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, Badge, desktopOnlyClass, MemberAvatar, MobileCard, MobileCardList } from "../ui/AdminUI";
import styles from "./Settings.module.css";

const rtf = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });
const dayFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

/** "Sekarang", "1 jam lalu", "Kemarin", "20 Sep" — relatif ke waktu data (`now`). */
function lastActive(iso: string | null, now: string) {
  if (!iso) return "—";
  const hours = (new Date(now).getTime() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 0.5) return "Sekarang";
  if (hours < 12) return rtf.format(-Math.round(hours), "hour");
  if (hours < 48) return rtf.format(-Math.round(hours / 24), "day").replace(/^./, (c) => c.toUpperCase());
  return dayFmt.format(new Date(iso));
}

const STATUS = {
  active: { label: "Aktif", tone: "lime" },
  invited: { label: "Diundang", tone: "indigo" },
  disabled: { label: "Nonaktif", tone: "neutral" },
} as const;

/** Anggota tim (staff_members) — ganti role masih demo sampai Supabase Auth tersambung. */
export function TeamTable({ staff, roles, now }: { staff: StaffMember[]; roles: string[]; now: string }) {
  const [rows, setRows] = useState(staff);
  const changed = rows.some((r, i) => r.role !== staff[i].role);
  const invited = rows.filter((r) => r.status === "invited").length;

  const roleSelect = (s: StaffMember) => (
    <label className={styles.roleSelect}>
      <span className="visually-hidden">Role {s.name}</span>
      <select value={s.role} disabled={s.role === "Super Admin"} onChange={(e) => setRows((list) => list.map((r) => (r.id === s.id ? { ...r, role: e.target.value } : r)))}>
        {roles.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <AdminIcon name="caret-down" size={12} />
    </label>
  );

  const person = (s: StaffMember) => (
    <span className={styles.person}>
      <MemberAvatar name={s.name} size={32} />
      <span className={styles.personText}>
        <span className={styles.strong}>{s.name}</span>
        <span className={styles.muted}>{s.email}</span>
      </span>
    </span>
  );

  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>Anggota tim</h2>
          <p className={styles.muted}>
            {rows.length} orang · {invited} undangan tertunda
          </p>
        </div>
        <AdminButton variant="primary" size="sm" icon="user-plus" disabled title="Aktif setelah Supabase Auth tersambung">
          Undang anggota
        </AdminButton>
      </header>

      {changed && (
        <p className={styles.notice} role="status">
          Mode demo: perubahan role belum tersimpan karena database (Supabase) belum tersambung.
        </p>
      )}

      <MobileCardList label="Anggota tim">
        {rows.map((s) => (
          <MobileCard
            key={s.id}
            title={person(s)}
            aside={<Badge tone={STATUS[s.status].tone} dot>{STATUS[s.status].label}</Badge>}
            meta={[
              { label: "Role", value: roleSelect(s) },
              { label: "Terakhir aktif", value: lastActive(s.lastActiveAt, now) },
            ]}
          />
        ))}
      </MobileCardList>

      <div className={cx(styles.tableWrap, desktopOnlyClass)}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Role</th>
              <th>Terakhir aktif</th>
              <th>Status</th>
              <th aria-label="Aksi" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{person(s)}</td>
                <td>{roleSelect(s)}</td>
                <td>{lastActive(s.lastActiveAt, now)}</td>
                <td>
                  <Badge tone={STATUS[s.status].tone} dot>
                    {STATUS[s.status].label}
                  </Badge>
                </td>
                <td>
                  <button type="button" className={styles.iconButton} disabled title="Kirim ulang undangan / nonaktifkan — butuh database" aria-label={`Aksi untuk ${s.name}`}>
                    <AdminIcon name="dots-three-vertical-bold" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const ACCESS: Record<ModuleAccess, { label: string; icon?: "pencil-simple" | "eye" }> = {
  edit: { label: "Ubah", icon: "pencil-simple" },
  view: { label: "Lihat", icon: "eye" },
  none: { label: "—" },
};
const NEXT: Record<ModuleAccess, ModuleAccess> = { edit: "view", view: "none", none: "edit" };
const SHORT: Record<string, string> = { "Community Manager": "Community", "Kasir Shop": "Kasir" };

/** Matriks izin role × modul. Klik sel untuk mengganti Ubah → Lihat → tidak ada (demo). */
export function RolesMatrix({ roles, modules }: { roles: RolePermissions[]; modules: { key: AdminModule; label: string }[] }) {
  const [matrix, setMatrix] = useState(roles);
  const changed = JSON.stringify(matrix) !== JSON.stringify(roles);

  const cell = (role: RolePermissions, module: AdminModule) => {
    const access = role.access[module];
    // Super Admin selalu punya akses penuh supaya tidak ada yang terkunci dari Settings.
    const locked = role.name === "Super Admin";
    return (
      <button
        type="button"
        disabled={locked}
        className={cx(styles.access, styles[`access-${access}`])}
        aria-label={`${role.name} · ${modules.find((m) => m.key === module)?.label}: ${ACCESS[access].label === "—" ? "tidak ada akses" : ACCESS[access].label}`}
        title={locked ? "Super Admin selalu punya akses penuh" : "Klik untuk mengganti akses"}
        onClick={() => setMatrix((list) => list.map((r) => (r.name === role.name ? { ...r, access: { ...r.access, [module]: NEXT[access] } } : r)))}
      >
        {ACCESS[access].icon && <AdminIcon name={ACCESS[access].icon} size={12} />}
        {ACCESS[access].label}
      </button>
    );
  };

  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>Role & izin akses</h2>
          <p className={styles.muted}>Atur modul yang bisa dilihat dan diubah setiap role</p>
        </div>
        <AdminButton size="sm" icon="plus-bold" disabled title="Butuh database">
          Buat role
        </AdminButton>
      </header>

      {changed && (
        <p className={styles.notice} role="status">
          Mode demo: izin belum tersimpan karena database (Supabase) belum tersambung.
          <button type="button" className={styles.reset} onClick={() => setMatrix(roles)}>
            Kembalikan
          </button>
        </p>
      )}

      <MobileCardList label="Role">
        {matrix.map((role) => (
          <li key={role.name} className={styles.roleCard}>
            <span className={styles.strong}>{role.name}</span>
            <dl className={styles.roleModules}>
              {modules.map((m) => (
                <div key={m.key}>
                  <dt>{m.label}</dt>
                  <dd>{cell(role, m.key)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </MobileCardList>

      <div className={cx(styles.tableWrap, desktopOnlyClass)}>
        <table className={cx(styles.table, styles.matrix)}>
          <thead>
            <tr>
              <th>Modul</th>
              {matrix.map((r) => (
                <th key={r.name}>{SHORT[r.name] ?? r.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m.key}>
                <td>{m.label}</td>
                {matrix.map((r) => (
                  <td key={r.name}>{cell(r, m.key)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.muted}>Ubah = bisa membuat, mengedit & menghapus · Lihat = hanya membaca · — = tidak ada akses</p>
    </section>
  );
}
