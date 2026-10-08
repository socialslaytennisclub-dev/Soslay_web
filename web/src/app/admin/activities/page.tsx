import type { Metadata } from "next";
import Link from "next/link";
import { ActivitiesFilters } from "@/components/admin/activities/ActivitiesFilters";
import styles from "@/components/admin/activities/Activities.module.css";
import { SessionsTable } from "@/components/admin/activities/SessionsTable";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import { cx } from "@/lib/cx";
import { listSessions } from "@/server/admin/sessions-repo";
import type { SessionsQuery } from "@/server/admin/types";
import { one } from "@/server/admin/query";
import pageStyles from "../page.module.css";

export const metadata: Metadata = { title: "Activities" };

const TABS = ["upcoming", "completed", "draft", "archived"] as const;
const RANGES = ["7", "30", "90", "all"] as const;

/** Admin / 04 Activities (Figma 25:4725). */
export default async function AdminActivitiesPage({ searchParams }: PageProps<"/admin/activities">) {
  const raw = await searchParams;
  const tab = TABS.find((t) => t === one(raw.tab)) ?? "upcoming";
  const query: SessionsQuery = {
    tab,
    q: one(raw.q),
    type: one(raw.type),
    venue: one(raw.venue),
    city: one(raw.city),
    range: RANGES.find((r) => r === one(raw.range)),
  };
  const result = await listSessions(query);

  const short = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
  const rangeLabel = result.range ? `${short.format(new Date(result.range.from))} – ${short.format(new Date(result.range.to))}` : "Semua tanggal";

  const tabs = [
    { value: "upcoming", label: "Mendatang", count: result.counts.upcoming },
    { value: "completed", label: "Selesai", count: result.counts.completed },
    { value: "draft", label: "Draft", count: result.counts.draft },
    { value: "archived", label: "Arsip", count: result.counts.archived },
  ];

  return (
    <>
      <AdminTopbar breadcrumb="CMS / Activities" title="Activities" />
      <div className={pageStyles.content}>
        <div className={styles.toolbar}>
          <nav className={styles.tabs} aria-label="Status sesi">
            {tabs.map((t) => (
              <Link
                key={t.value}
                href={t.value === "upcoming" ? "/admin/activities" : `/admin/activities?tab=${t.value}`}
                className={cx(styles.tab, tab === t.value && styles.tabActive)}
                aria-current={tab === t.value ? "page" : undefined}
              >
                {t.label}
                <span className={styles.tabCount}>{t.count}</span>
              </Link>
            ))}
          </nav>
          <div className={styles.actions}>
            <span className={styles.viewToggle} aria-label="Tampilan">
              <span className={styles.viewActive} title="Tampilan daftar">
                <AdminIcon name="list-bullets" size={18} />
              </span>
              <span className={styles.viewDisabled} title="Tampilan kalender — segera">
                <AdminIcon name="calendar-dots" size={18} />
              </span>
            </span>
            <AdminButton href="/admin/activities/new" variant="primary" icon="plus-bold">
              Buat sesi
            </AdminButton>
          </div>
        </div>

        <ActivitiesFilters
          types={result.types}
          venues={result.venues}
          ranges={[
            { value: "7", label: "7 hari ke depan" },
            { value: "30", label: "30 hari ke depan" },
            { value: "90", label: "90 hari ke depan" },
            { value: "all", label: "Semua tanggal" },
          ]}
        />
        <p className={pageStyles.summary}>
          {result.items.length} sesi · {rangeLabel}
        </p>

        <section className={cx(styles.panel, styles.panelMobile)} aria-label="Daftar sesi">
          <SessionsTable items={result.items} />
        </section>
      </div>
    </>
  );
}
