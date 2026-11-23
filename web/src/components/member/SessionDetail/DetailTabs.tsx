"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { Container } from "@/components/ui";
import { cx } from "@/lib/cx";
import styles from "./SessionDetail.module.css";

/**
 * Tab detail sesi di browser: semua isi tab sudah dirender server sekali (datanya sama untuk semua tab), jadi
 * pindah tab cukup ganti panel + URL (?tab=, history.replaceState — tersinkron dengan useSearchParams) tanpa
 * memuat ulang data sesi dari server. Link "?tab=…" di dalam isi (mis. "Lihat peserta") ikut ditangani di sini.
 */
export function DetailTabs<T extends string>({
  tabs,
  labels,
  head,
  panels,
}: {
  tabs: T[];
  labels: Record<T, string>;
  /** Judul, status & meta di atas tab. */
  head: ReactNode;
  /** Isi tiap tab (sudah dirender server); hanya tab aktif yang dipasang. */
  panels: Record<T, ReactNode>;
}) {
  const query = useSearchParams().get("tab");
  const tab = tabs.find((t) => t === query) ?? tabs[0];
  // Tab pertama tanpa ?tab= (URL bersih).
  const search = (t: T) => (t === tabs[0] ? "" : `?tab=${t}`);

  const select = (t: T) => {
    const url = new URL(window.location.href);
    url.search = search(t);
    window.history.replaceState(null, "", url);
  };

  // Klik link "?…" ke tab lain (di nav atau di dalam isi tab) → pindah di browser; tombol modifier
  // (buka di tab baru) tetap ke perilaku link biasa.
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
    if (!href?.startsWith("?")) return;
    const params = new URLSearchParams(href.slice(1));
    const next = tabs.find((t) => t === (params.get("tab") ?? tabs[0]));
    if (!next || [...params.keys()].some((k) => k !== "tab")) return;
    e.preventDefault();
    select(next);
  };

  return (
    <div onClickCapture={onClickCapture}>
      <header className={styles.top}>
        <Container className={styles.topInner}>
          {head}
          <nav className={styles.tabs} aria-label="Bagian detail sesi">
            {tabs.map((t) => (
              // Klik biasa ditangani onClickCapture; Link hanya untuk buka di tab baru / tanpa JS.
              <Link key={t} href={search(t) || "?"} className={cx(styles.tab, tab === t && styles.tabOn)} aria-current={tab === t ? "page" : undefined}>
                {labels[t]}
              </Link>
            ))}
          </nav>
        </Container>
      </header>
      {panels[tab]}
    </div>
  );
}
