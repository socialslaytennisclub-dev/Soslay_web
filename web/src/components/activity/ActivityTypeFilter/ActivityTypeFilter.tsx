import { FilterChips, type FilterChip } from "@/components/ui";
import { activityTypeHref, activityTypes } from "@/content/activity";

/** Chip filter jenis aktivitas di halaman /activity ("All" aktif + link ke halaman tiap tipe). */
export function ActivityTypeFilter() {
  const chips: FilterChip[] = [
    { label: "All", href: "/activity", active: true },
    ...activityTypes.map((type) => ({ label: type.label, href: activityTypeHref(type.slug) })),
  ];
  return <FilterChips items={chips} label="Filter by activity type" />;
}
