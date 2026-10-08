import { LEVEL_LABEL, TIER_LABEL } from "@/lib/admin-labels";
import type { MembersQuery, TennisLevel, Tier } from "./types";

type RawParams = Record<string, string | string[] | undefined>;

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** searchParams → MembersQuery (nilai tak dikenal diabaikan). */
export function parseMembersQuery(raw: RawParams): MembersQuery {
  const tab = one(raw.tab);
  const tier = one(raw.tier);
  const level = one(raw.level);
  const sort = one(raw.sort);
  const page = Number(one(raw.page));
  return {
    tab: tab === "active" || tab === "new" || tab === "inactive" ? tab : "all",
    q: one(raw.q),
    tier: tier && tier in TIER_LABEL ? (tier as Tier) : undefined,
    level: level && level in LEVEL_LABEL ? (level as TennisLevel) : undefined,
    city: one(raw.city),
    frequency: one(raw.frequency),
    interest: one(raw.interest),
    sort: sort === "name" || sort === "points" || sort === "joined" ? sort : "last_played",
    dir: one(raw.dir) === "asc" ? "asc" : "desc",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** MembersQuery → query string (tanpa nilai default). */
export function membersHref(query: MembersQuery, overrides: Partial<MembersQuery> = {}): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (merged.tab && merged.tab !== "all") params.set("tab", merged.tab);
  for (const key of ["q", "tier", "level", "city", "frequency", "interest"] as const) {
    if (merged[key]) params.set(key, String(merged[key]));
  }
  if (merged.sort && merged.sort !== "last_played") params.set("sort", merged.sort);
  if (merged.dir === "asc") params.set("dir", "asc");
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));
  const qs = params.toString();
  return `/admin/members${qs ? `?${qs}` : ""}`;
}
