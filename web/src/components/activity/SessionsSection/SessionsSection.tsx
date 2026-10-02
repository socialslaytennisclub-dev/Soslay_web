import { Container, FilterChips, Text, type FilterChip } from "@/components/ui";
import { activityPage, activityTypes, type ActivityTypeSlug, type Session } from "@/content/activity";
import { SessionGrid } from "../SessionGrid/SessionGrid";
import styles from "./SessionsSection.module.css";

type SessionsSectionProps = {
  thisWeek: Session[];
  later: Session[];
  activeType?: ActivityTypeSlug;
};

/** Daftar sesi: filter jenis aktivitas + grup "minggu ini" & "mendatang". */
export function SessionsSection({ thisWeek, later, activeType }: SessionsSectionProps) {
  const chips: FilterChip[] = [
    { label: "Semua", href: "/activity", active: !activeType },
    ...activityTypes.map((type) => ({
      label: type.label,
      href: `/activity?type=${type.slug}`,
      active: type.slug === activeType,
    })),
  ];
  const isEmpty = thisWeek.length === 0 && later.length === 0;

  return (
    <section className={styles.section} aria-label="Jadwal sesi" id="jadwal">
      <Container className={styles.inner}>
        <FilterChips items={chips} label="Filter jenis aktivitas" />

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
          <>
            <SessionGrid id="sessions-this-week" {...activityPage.thisWeek} sessions={thisWeek} />
            <SessionGrid id="sessions-upcoming" {...activityPage.upcoming} sessions={later} />
          </>
        )}
      </Container>
    </section>
  );
}
