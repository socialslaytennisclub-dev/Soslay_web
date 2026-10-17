import { POINTS_REASON_LABEL, TIER_LABEL } from "@/lib/admin-labels";
import { exportLedger } from "@/server/admin/points-repo";
import type { PointsReason } from "@/server/admin/types";

/** GET /admin/points/export?reason= → CSV riwayat poin (Riwayat & tier). */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("reason");
  const reason = raw && raw in POINTS_REASON_LABEL ? (raw as PointsReason) : undefined;
  const rows = await exportLedger(reason);
  // "2026-10-12 19:30" dalam WIB (sv-SE = format ISO).
  const wib = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" });
  const header = ["Tanggal (WIB)", "Member", "Tier", "Alasan", "Keterangan", "Poin", "Saldo", "Oleh"];
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [
    header,
    ...rows.map((e) => [wib.format(new Date(e.at)), e.memberName, TIER_LABEL[e.memberTier], POINTS_REASON_LABEL[e.reason], e.note, e.delta, e.balanceAfter, e.by]),
  ]
    .map((row) => row.map(escape).join(","))
    .join("\n");

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="soslay-slay-point-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
