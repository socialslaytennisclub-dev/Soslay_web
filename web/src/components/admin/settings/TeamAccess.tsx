"use client";

import { useState, useTransition } from "react";
import { cx } from "@/lib/cx";
import { changeStaffRole, createRole, inviteStaff, savePermissions, setStaffActive } from "@/server/admin/actions/settings";
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

/** Anggota tim (staff_members): ganti role, aktif/nonaktif, undang anggota baru. */
export function TeamTable({ staff, roles, now, currentUserId }: { staff: StaffMember[]; roles: string[]; now: string; currentUserId?: string }) {
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "", role: roles.find((r) => r !== "Super Admin") ?? roles[0] ?? "" });
  const [pending, start] = useTransition();
  const invited = staff.filter((r) => r.status === "invited").length;

  const run = (action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      const result = await action();
      setNotice(result.ok ? { text: result.message } : { text: result.error, error: true });
      if (result.ok) after?.();
    });

  const roleSelect = (s: StaffMember) => (
    <label className={styles.roleSelect}>
      <span className="visually-hidden">Role {s.name}</span>
      <select
        value={s.role}
        disabled={s.id === currentUserId || pending}
        title={s.id === currentUserId ? "Role akunmu sendiri tidak bisa diubah" : undefined}
        onChange={(e) => {
          const role = e.target.value;
          if (window.confirm(`Ubah role ${s.name} menjadi ${role}?`)) run(() => changeStaffRole(s.id, role));
        }}
      >
        {roles.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <AdminIcon name="caret-down" size={12} />
    </label>
  );

  const statusToggle = (s: StaffMember) =>
    s.id === currentUserId ? null : (
      <button
        type="button"
        className={styles.textButton}
        disabled={pending}
        onClick={() => {
          const active = s.status === "disabled";
          if (window.confirm(`${active ? "Aktifkan lagi" : "Nonaktifkan"} akses admin ${s.name}?`)) run(() => setStaffActive(s.id, active));
        }}
      >
        {s.status === "disabled" ? "Aktifkan" : "Nonaktifkan"}
      </button>
    );

  const person = (s: StaffMember) => (
    <span className={styles.person}>
      <MemberAvatar name={s.name} size={32} />
      <span className={styles.personText}>
        <span className={styles.strong}>
          {s.name}
          {s.id === currentUserId && " (kamu)"}
        </span>
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
            {staff.length} orang · {invited} undangan tertunda
          </p>
        </div>
        <AdminButton variant="primary" size="sm" icon="user-plus" onClick={() => setInviting((v) => !v)}>
          Undang anggota
        </AdminButton>
      </header>

      {inviting && (
        <form
          className={styles.inviteForm}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => inviteStaff(invite), () => {
              setInviting(false);
              setInvite((v) => ({ ...v, name: "", email: "" }));
            });
          }}
        >
          <input className={styles.input} placeholder="Nama" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} aria-label="Nama anggota" />
          <input className={styles.input} type="email" placeholder="email@domain.com" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} aria-label="Email anggota" />
          <label className={styles.roleSelect}>
            <span className="visually-hidden">Role</span>
            <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
              {roles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <AdminIcon name="caret-down" size={12} />
          </label>
          <AdminButton type="submit" variant="primary" size="sm" disabled={pending}>
            {pending ? "Mengirim…" : "Kirim undangan"}
          </AdminButton>
        </form>
      )}

      {notice && (
        <p className={cx(styles.notice, notice.error && styles.noticeError)} role={notice.error ? "alert" : "status"}>
          {notice.text}
        </p>
      )}

      <MobileCardList label="Anggota tim">
        {staff.map((s) => (
          <MobileCard
            key={s.id}
            title={person(s)}
            aside={<Badge tone={STATUS[s.status].tone} dot>{STATUS[s.status].label}</Badge>}
            meta={[
              { label: "Role", value: roleSelect(s) },
              { label: "Terakhir aktif", value: lastActive(s.lastActiveAt, now) },
              { label: "Akses", value: statusToggle(s) ?? "—" },
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
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{person(s)}</td>
                <td>{roleSelect(s)}</td>
                <td>{lastActive(s.lastActiveAt, now)}</td>
                <td>
                  <Badge tone={STATUS[s.status].tone} dot>
                    {STATUS[s.status].label}
                  </Badge>
                </td>
                <td>{statusToggle(s)}</td>
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

/** Matriks izin role × modul. Klik sel untuk mengganti Ubah → Lihat → tidak ada, lalu Simpan. */
export function RolesMatrix({ roles, modules }: { roles: RolePermissions[]; modules: { key: AdminModule; label: string }[] }) {
  const [matrix, setMatrix] = useState(roles);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const changes = matrix.flatMap((r) => {
    const before = roles.find((x) => x.name === r.name);
    return modules.filter((m) => before && before.access[m.key] !== r.access[m.key]).map((m) => ({ role: r.name, module: m.key, access: r.access[m.key] }));
  });
  const changed = changes.length > 0;

  const save = () =>
    start(async () => {
      const result = await savePermissions(changes);
      setNotice(result.ok ? { text: result.message } : { text: result.error, error: true });
    });
  const addRole = () => {
    const name = window.prompt("Nama role baru (mis. Event Crew):");
    if (!name?.trim()) return;
    start(async () => {
      const result = await createRole(name);
      setNotice(result.ok ? { text: result.message } : { text: result.error, error: true });
    });
  };

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
        <AdminButton size="sm" icon="plus-bold" onClick={addRole} disabled={pending}>
          Buat role
        </AdminButton>
      </header>

      {changed && (
        <p className={styles.notice} role="status">
          {changes.length} perubahan izin belum disimpan.
          <button type="button" className={styles.reset} onClick={() => setMatrix(roles)} disabled={pending}>
            Kembalikan
          </button>
          <AdminButton size="sm" variant="primary" onClick={save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan izin"}
          </AdminButton>
        </p>
      )}
      {notice && !changed && (
        <p className={cx(styles.notice, notice.error && styles.noticeError)} role={notice.error ? "alert" : "status"}>
          {notice.text}
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
