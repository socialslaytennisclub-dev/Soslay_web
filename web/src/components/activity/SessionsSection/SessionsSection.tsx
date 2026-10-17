import { Container, FilterChips, Text, type FilterChip } from "@/components/ui";
import { activityPage, activityTypeHref, activityTypes, type ActivityTypeSlug, type Session } from "@/content/activity";
import { GuidePrompt } from "../GuidePrompt/GuidePrompt";
import { SessionGrid } from "../SessionGrid/SessionGrid";
import styles from "./SessionsSection.module.css";

type SessionsSectionProps = {
  upcoming: Session[];
  past: Session[];
  activeType?: ActivityTypeSlug;
};

/** Daftar sesi: filter jenis aktivitas + grup "mendatang" (bisa booking) & "lama" (lihat venue). */
export function SessionsSection({ upcoming, past, activeType }: SessionsSectionProps) {
  const chips: FilterChip[] = [
    { label: "All", href: "/activity", active: !activeType },
    ...activityTypes.map((type) => ({
      label: type.label,
      href: activityTypeHref(type.slug),
      active: type.slug === activeType,
    })),
  ];
  const isEmpty = upcoming.length === 0 && past.length === 0;

  return (
    <section className={styles.section} aria-label="Session schedule" id="jadwal">
      <Container className={styles.inner}>
        <FilterChips items={chips} label="Filter by activity type" />

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
            <SessionGrid id="sessions-upcoming" {...activityPage.upcoming} sessions={upcoming} aside={<GuidePrompt />} />
            <SessionGrid id="sessions-past" {...activityPage.past} sessions={past} variant="past" />
          </>
        )}
      </Container>
    </section>
  );
}
