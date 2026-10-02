"use client";

import { useEffect, useState } from "react";
import { scrollToElement } from "@/animations";
import { ProgressBar } from "@/components/ui";
import { profilePage } from "@/content/member";
import { cx } from "@/lib/cx";
import styles from "./ProfileForm.module.css";

type ProfileSummaryProps = {
  percent: number;
  sections: { id: string; title: string; missing: number }[];
};

/** Figma: card/profile-summary — kelengkapan profil + navigasi section (aktif mengikuti scroll). */
export function ProfileSummary({ percent, sections }: ProfileSummaryProps) {
  const [active, setActive] = useState(sections[0]?.id);
  const { summary } = profilePage;
  const ids = sections.map((section) => section.id).join();

  useEffect(() => {
    const targets = ids
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((target): target is HTMLElement => target !== null);
    // Section yang melewati garis 35% tinggi layar dianggap aktif.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length) setActive(visible[0].target.id);
      },
      { rootMargin: "-35% 0px -60% 0px" },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [ids]);

  return (
    <aside className={styles.summary} aria-labelledby="profile-summary-title">
      <header className={styles.cardHeader}>
        <h2 id="profile-summary-title" className={styles.summaryTitle}>
          {summary.title}
        </h2>
        <p className={styles.hint}>{summary.subtitle}</p>
      </header>

      <div className={styles.completion}>
        <p className={styles.completionLabel}>
          <span>{summary.completion}</span>
          <span className={styles.completionValue}>{percent}%</span>
        </p>
        <ProgressBar value={percent} max={100} label={summary.completion} />
      </div>

      <nav aria-label="Bagian profil">
        <ol className={styles.steps}>
          {sections.map((section, index) => {
            const done = section.missing === 0;
            return (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className={cx(styles.step, active === section.id && styles.stepActive)}
                  aria-current={active === section.id ? "step" : undefined}
                  onClick={(event) => {
                    const target = document.getElementById(section.id);
                    if (!target) return;
                    event.preventDefault();
                    setActive(section.id);
                    scrollToElement(target);
                  }}
                >
                  <span className={cx(styles.stepNumber, done && styles.stepDone)}>{index + 1}</span>
                  <span className={styles.stepText}>
                    <span className={styles.stepTitle}>{section.title}</span>
                    <span className={styles.hint}>{done ? "Lengkap" : `${section.missing} belum diisi`}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}
