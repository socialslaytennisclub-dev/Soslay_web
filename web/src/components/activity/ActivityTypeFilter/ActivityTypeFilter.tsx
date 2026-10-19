import { FilterChips, type FilterChip } from "@/components/ui";
import { activityTypeHref, activityTypes, type ActivityTypeSlug } from "@/content/activity";

/** Chip filter jenis aktivitas di halaman /activity ("All" + tiap tipe). */
export function ActivityTypeFilter({ activeType }: { activeType?: ActivityTypeSlug }) {
  const chips: FilterChip[] = [
    { label: "All", href: "/activity", active: !activeType },
    ...activityTypes.map((type) => ({
      label: type.label,
      href: activityTypeHref(type.slug),
      active: type.slug === activeType,
    })),
  ];
  return <FilterChips items={chips} label="Filter by activity type" />;
}
