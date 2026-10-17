import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FREQUENCY } from "./dataset";
import { DAY } from "./time";
import type { MemberListItem, MembersQuery, MembersResult, TennisLevel } from "./types";

/**
 * Daftar member versi live: filter, cari, urut & halaman dikerjakan Postgres lewat view
 * `admin_member_list` — tidak memuat semua member/booking/order ke server app per ketikan.
 * Mode demo tetap memakai filter di memori (repo.ts); keduanya mengikuti aturan yang sama.
 */

type Row = {
  id: string; member_code: string; full_name: string; email: string; kuy_id: string; instagram: string; city: string;
  tennis_level: TennisLevel; play_frequency: string | null; looking_for: string[]; event_types: string[];
  tier: MemberListItem["tier"]; status: MemberListItem["status"]; joined_at: string;
  sessions_attended: number; points_balance: number; last_played_at: string | null;
};

const VIEW = "admin_member_list";
const COLUMNS = "id, member_code, full_name, email, kuy_id, instagram, city, tennis_level, play_frequency, looking_for, event_types, tier, status, joined_at, sessions_attended, points_balance, last_played_at";
const SORT_COLUMN = { name: "full_name", points: "points_balance", joined: "joined_at", last_played: "last_played_at" } as const;
const FREQUENCY_VALUE = Object.fromEntries(Object.entries(FREQUENCY).map(([value, label]) => [label, value]));

/** Nilai di dalam filter `or=(…)` PostgREST: kutip supaya spasi/koma/kurung aman. */
const quote = (value: string) => `"${value.replace(/[\\"]/g, "\\$&")}"`;
/** Wildcard LIKE dari ketikan admin (%, _) dianggap huruf biasa. */
const likeEscape = (value: string) => value.replace(/[\\%_]/g, "\\$&");

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
/** Bagian builder PostgREST yang dipakai di sini — tipe lengkap supabase-js terlalu dalam untuk di-generik-kan. */
interface ViewQuery extends PromiseLike<{ data: unknown[] | null; count: number | null; error: { message: string } | null }> {
  eq(column: string, value: string): ViewQuery;
  gt(column: string, value: string): ViewQuery;
  like(column: string, pattern: string): ViewQuery;
  or(filters: string): ViewQuery;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): ViewQuery;
  range(from: number, to: number): ViewQuery;
}
const memberView = (client: Client, columns: string, options?: { count: "exact"; head?: boolean }) =>
  (client.from(VIEW) as unknown as { select(columns: string, options?: object): ViewQuery }).select(columns, options);

function applyQuery(builder: ViewQuery, query: MembersQuery, now: Date): ViewQuery {
  let b = builder;
  if (query.tab === "active" || query.tab === "inactive") b = b.eq("status", query.tab);
  if (query.tab === "new") b = b.gt("joined_at", new Date(now.getTime() - 30 * DAY).toISOString());
  const q = query.q?.trim().toLowerCase();
  if (q) b = b.like("search", `%${likeEscape(q)}%`);
  if (query.tier) b = b.eq("tier", query.tier);
  if (query.level) b = b.eq("tennis_level", query.level);
  if (query.city) b = b.like("city", `${likeEscape(query.city)}%`);
  if (query.frequency) b = b.eq("play_frequency", FREQUENCY_VALUE[query.frequency] ?? "");
  if (query.interest) b = b.or(`looking_for.cs.{${quote(query.interest)}},event_types.cs.{${quote(query.interest)}}`);
  return b;
}

const toItem = (r: Row): MemberListItem => ({
  id: r.id,
  memberCode: r.member_code,
  fullName: r.full_name,
  email: r.email,
  kuyId: r.kuy_id,
  instagram: r.instagram,
  city: r.city,
  level: r.tennis_level,
  tier: r.tier,
  status: r.status,
  joinedAt: new Date(r.joined_at).toISOString(),
  sessionsAttended: Number(r.sessions_attended),
  pointsBalance: Number(r.points_balance),
  lastPlayedAt: r.last_played_at ? new Date(r.last_played_at).toISOString() : null,
  lookingFor: r.looking_for ?? [],
  eventTypes: r.event_types ?? [],
  playFrequency: FREQUENCY[r.play_frequency ?? ""] ?? "",
});

async function count(client: Client, query: MembersQuery, now: Date) {
  const { count: n, error } = await applyQuery(memberView(client, "id", { count: "exact", head: true }), query, now);
  if (error) throw new Error(`Gagal menghitung member: ${error.message}`);
  return n ?? 0;
}

export async function listMembersLive(query: MembersQuery, pageSize: number): Promise<MembersResult> {
  const client = await createSupabaseServerClient();
  const now = new Date();
  const sort = SORT_COLUMN[query.sort ?? "last_played"];
  const ascending = (query.dir ?? "desc") === "asc";

  const fetchPage = (page: number) =>
    applyQuery(memberView(client, COLUMNS, { count: "exact" }), query, now)
      .order(sort, { ascending, nullsFirst: ascending })
      .order("id")
      .range((page - 1) * pageSize, page * pageSize - 1);

  const requested = Math.max(1, query.page ?? 1);
  const [first, all, active, fresh, inactive, cityRows] = await Promise.all([
    fetchPage(requested),
    count(client, {}, now),
    count(client, { tab: "active" }, now),
    count(client, { tab: "new" }, now),
    count(client, { tab: "inactive" }, now),
    client.from("profiles").select("city").not("city", "is", null),
  ]);
  if (first.error) throw new Error(`Gagal memuat member: ${first.error.message}`);

  const total = first.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Halaman di URL melewati jumlah halaman (mis. setelah filter) → tampilkan halaman terakhir.
  const page = Math.min(requested, pageCount);
  const rows = page === requested ? first.data : (await fetchPage(page)).data;

  return {
    items: ((rows ?? []) as Row[]).map(toItem),
    total,
    page,
    pageSize,
    pageCount,
    counts: { all, active, new: fresh, inactive },
    cities: [...new Set((cityRows.data ?? []).map((r) => r.city as string).filter(Boolean))].sort(),
  };
}

/** Jumlah member per segmen — satu hitungan Postgres per segmen, paralel. */
export async function countSegmentsLive(queries: MembersQuery[]): Promise<number[]> {
  const client = await createSupabaseServerClient();
  const now = new Date();
  return Promise.all(queries.map((q) => count(client, q, now)));
}

/** Badge sidebar: jumlah member + order yang perlu diproses, tanpa memuat dataset admin. */
export async function sidebarCountsLive() {
  const client = await createSupabaseServerClient();
  const [members, orders] = await Promise.all([
    client.from("profiles").select("id", { count: "exact", head: true }),
    client.from("orders").select("code", { count: "exact", head: true }).or("status.eq.processing,and(status.eq.pending,payment_status.eq.paid)"),
  ]);
  return { members: members.count ?? 0, ordersToProcess: orders.count ?? 0 };
}
