import { LEVEL_LABEL, TIER_LABEL } from "@/lib/admin-labels";
import { parseMembersQuery } from "@/server/admin/query";
import { exportMembers } from "@/server/admin/repo";

/** GET /admin/members/export?<filter Members> → CSV semua member yang lolos filter. */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const rows = await exportMembers(parseMembersQuery(params));
  const header = ["Member ID", "Nama", "Email", "Kuy ID", "Instagram", "Level", "Kota", "Sesi", "Poin", "Tier", "Status", "Bergabung", "Terakhir main"];
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [
    header,
    ...rows.map((m) => [m.memberCode, m.fullName, m.email, m.kuyId, m.instagram, LEVEL_LABEL[m.level], m.city, m.sessionsAttended, m.pointsBalance, TIER_LABEL[m.tier], m.status, m.joinedAt.slice(0, 10), m.lastPlayedAt?.slice(0, 10) ?? ""]),
  ]
    .map((row) => row.map(escape).join(","))
    .join("\n");

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="soslay-members-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
