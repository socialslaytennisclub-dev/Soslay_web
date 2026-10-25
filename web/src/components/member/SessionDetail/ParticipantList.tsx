"use client";

import { ChevronDown, Search } from "lucide-react";
import { useState } from "react";
import { cx } from "@/lib/cx";
import { initials } from "@/lib/text";
import type { DetailPerson } from "@/server/member/session-detail";
import styles from "./SessionDetail.module.css";

const PAGE = 8;

/** Tab Peserta (Figma 2a): cari nama, daftar peserta + level & sumber daftar, "Lihat N lainnya". */
export function ParticipantList({ people }: { people: DetailPerson[] }) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const q = query.trim().toLowerCase();
  const found = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  const shown = all || q ? found : found.slice(0, PAGE);

  return (
    <>
      <label className={styles.search}>
        <Search size={16} aria-hidden />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama peserta…" aria-label="Cari nama peserta" />
      </label>
      <ul className={styles.people}>
        {shown.map((p, i) => (
          <li key={p.id} className={styles.person}>
            <span className={cx(styles.personAvatar, styles[`face${i % 4}`])} aria-hidden>
              {initials(p.name)}
            </span>
            <span className={styles.personText}>
              <strong>
                {p.name}
                {p.me && <small> (kamu)</small>}
              </strong>
              <small>
                {p.level} · via {p.source}
              </small>
            </span>
            <span className={cx(styles.pill, p.checkedIn && styles.pillOk)}>{p.checkedIn ? "Hadir" : "Terdaftar"}</span>
          </li>
        ))}
        {found.length === 0 && <li className={styles.muted}>Tidak ada peserta dengan nama itu.</li>}
      </ul>
      {!all && !q && found.length > PAGE && (
        <button type="button" className={styles.link} onClick={() => setAll(true)}>
          Lihat {found.length - PAGE} peserta lainnya
          <ChevronDown size={14} aria-hidden />
        </button>
      )}
    </>
  );
}
