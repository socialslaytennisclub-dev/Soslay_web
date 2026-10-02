"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Container } from "@/components/ui";
import { memberTabs } from "@/content/member";
import { cx } from "@/lib/cx";
import styles from "./MemberTabs.module.css";

/**
 * Figma: tabs — 4 tab sama lebar, aktif = Poppins Bold navy + garis indigo 3px.
 * Tiap tab adalah halaman sendiri (/akun/...), jadi pakai <nav> + aria-current, bukan role="tablist".
 */
export function MemberTabs() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // Mobile: deretan tab bisa di-scroll — pastikan tab aktif terlihat (tanpa menggeser halaman).
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>("[aria-current='page']");
    if (!nav || !active) return;
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);

  return (
    <Container>
      <nav ref={navRef} className={styles.tabs} aria-label="Menu member">
        {memberTabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              scroll={false}
              className={cx(styles.tab, active && styles.active)}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </Container>
  );
}
