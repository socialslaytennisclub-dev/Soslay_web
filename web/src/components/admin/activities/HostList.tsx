"use client";

import type { ReactNode } from "react";
import { CREW_ROLE_LABEL, CREW_ROLES, type CrewRole } from "@/lib/crew";
import type { SessionHost } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { MemberAvatar } from "../ui/AdminUI";
import styles from "./SessionEditor.module.css";

/**
 * Daftar host & fotografer member (Edit activity & editor trip). Tanpa `onChange` = hanya tampil
 * (activity trip: crew diatur di editor trip). `children` = baris tambahan di daftar yang sama (crew staf).
 */
export function HostList({ hosts, onChange, children }: { hosts: SessionHost[]; onChange?: (hosts: SessionHost[]) => void; children?: ReactNode }) {
  if (!hosts.length && !children) return null;
  const setRole = (memberId: string, role: CrewRole) => onChange?.(hosts.map((h) => (h.memberId === memberId ? { ...h, role } : h)));
  return (
    <ul className={styles.crew}>
      {hosts.map((h) => (
        <li key={h.memberId}>
          <MemberAvatar name={h.name} size={32} />
          <span className={styles.personText}>
            <span className={styles.personName}>{h.name}</span>
            <span className={styles.crewMeta}>
              {onChange ? (
                <label className={styles.roleSelect}>
                  <span className="visually-hidden">Peran {h.name}</span>
                  <select value={h.role} onChange={(e) => setRole(h.memberId, e.target.value as CrewRole)}>
                    {CREW_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {CREW_ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <AdminIcon name="caret-down" size={12} className={styles.roleCaret} />
                </label>
              ) : (
                <span className={styles.muted}>{CREW_ROLE_LABEL[h.role]}</span>
              )}
              {h.code && <span className={styles.muted}>member {h.code}</span>}
            </span>
          </span>
          {onChange && (
            <button type="button" className={styles.iconButton} aria-label={`Hapus ${h.name}`} onClick={() => onChange(hosts.filter((x) => x.memberId !== h.memberId))}>
              <AdminIcon name="x" size={14} />
            </button>
          )}
        </li>
      ))}
      {children}
    </ul>
  );
}
