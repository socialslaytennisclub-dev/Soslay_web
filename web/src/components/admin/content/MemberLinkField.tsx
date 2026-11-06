"use client";

import { useId, useState } from "react";
import type { MemberChoice } from "@/server/admin/types";
import settingsStyles from "../settings/Settings.module.css";

const memberLabel = (m: MemberChoice) => `${m.name} · ${m.code}`;

/** "Hubungkan ke member (opsional)" — ketik nama / no. member lalu pilih (testimoni & post sosial). */
export function MemberLinkField({ members, value, onChange }: { members: MemberChoice[]; value: string | null; onChange: (memberId: string | null) => void }) {
  const listId = useId();
  const [query, setQuery] = useState(() => {
    const linked = members.find((m) => m.id === value);
    return linked ? memberLabel(linked) : "";
  });
  return (
    <label className={settingsStyles.field}>
      <span className={settingsStyles.label}>Hubungkan ke member (opsional)</span>
      <input
        className={settingsStyles.input}
        list={listId}
        value={query}
        placeholder="Ketik nama atau no. member"
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(members.find((m) => memberLabel(m) === e.target.value)?.id ?? null);
        }}
      />
      <datalist id={listId}>
        {members.map((m) => (
          <option key={m.id} value={memberLabel(m)} />
        ))}
      </datalist>
    </label>
  );
}
