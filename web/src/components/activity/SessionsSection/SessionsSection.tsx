import type { ReactNode } from "react";
import { Container, Text } from "@/components/ui";
import { activityPage, type Session } from "@/content/activity";
import { cx } from "@/lib/cx";
import { GuidePrompt } from "../GuidePrompt/GuidePrompt";
import { SessionGrid } from "../SessionGrid/SessionGrid";
import styles from "./SessionsSection.module.css";

type SessionsSectionProps = {
  upcoming: Session[];
  past: Session[];
  /** Konten di atas daftar upcoming, mis. chip filter jenis aktivitas di /activity. */
  filter?: ReactNode;
};

/** Daftar sesi: section "mendatang" (bisa booking) & section "lama" (lihat venue). */
export function SessionsSection({ upcoming, past, filter }: SessionsSectionProps) {
  const isEmpty = upcoming.length === 0 && past.length === 0;

  return (
    <>
      <section className={styles.section} aria-label="Upcoming sessions" id="jadwal">
        <Container className={styles.inner}>
          {filter}

          {isEmpty ? (
            <div className={styles.empty} role="status">
              <Text variant="title-24" tone="primary">
                {activityPage.empty.title}
              </Text>
              <Text variant="body-16" tone="primary" muted>
                {activityPage.empty.description}
              </Text>
            </div>
          ) : (
            <SessionGrid id="sessions-upcoming" {...activityPage.upcoming} sessions={upcoming} aside={<GuidePrompt />} />
          )}
        </Container>
      </section>

      {past.length > 0 && (
        <section className={cx(styles.section, styles.past)} aria-label="Previous sessions">
          <Container className={styles.inner}>
            <SessionGrid id="sessions-past" {...activityPage.past} sessions={past} variant="past" />
          </Container>
        </section>
      )}
    </>
  );
}
