import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { openSessionsEndAfter, sessionClosesAt } from "@/lib/session-close";
import { DAY, startOfTodayWib } from "./time";
import { getDataset } from "./dataset";
import type { AdminIconName } from "@/components/admin/ui/AdminIcon";
import { canAccess, type AdminSession } from "./session";

/** Satu baris di lonceng notifikasi admin: antrean yang perlu ditindaklanjuti. */
export type AdminNotification = {
  key: "members" | "orders" | "redemptions" | "close";
  icon: AdminIconName;
  title: string;
  detail: string;
  href: string;
  count: number;
};

/** Activity lama yang tidak pernah ditutup tidak dihitung selamanya — hanya yang selesai 14 hari terakhir. */
const CLOSE_LOOKBACK_DAYS = 14;

type Counts = { newMembers: number; toClose: { count: number; first: { id: string; title: string } | null } };

async function liveCounts(now: Date, wantMembers: boolean, wantClose: boolean): Promise<Counts> {
  const client = await createSupabaseServerClient();
  const since = new Date(startOfTodayWib(now).getTime() - 1).toISOString();
  const [members, close] = await Promise.all([
    wantMembers ? client.from("profiles").select("id", { count: "exact", head: true }).gt("joined_at", since) : null,
    wantClose
      ? client
          .from("sessions")
          .select("id, title", { count: "exact" })
          .eq("status", "published")
          .is("ended_at", null)
          .lt("ends_at", openSessionsEndAfter(now.getTime()))
          .gt("ends_at", new Date(now.getTime() - CLOSE_LOOKBACK_DAYS * DAY).toISOString())
          .order("ends_at", { ascending: false })
          .limit(1)
      : null,
  ]);
  const first = (close?.data?.[0] as { id: string; title: string } | undefined) ?? null;
  return { newMembers: members?.count ?? 0, toClose: { count: close?.count ?? 0, first } };
}

async function demoCounts(): Promise<Counts> {
  const d = await getDataset();
  const now = d.now.getTime();
  const open = d.sessions
    .filter((s) => s.status === "published" && sessionClosesAt(s.endsAt) < now && s.endsAt.getTime() > now - CLOSE_LOOKBACK_DAYS * DAY).sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
  return {
    newMembers: d.members.filter((m) => m.joinedAt.getTime() >= startOfTodayWib(d.now).getTime()).length,
    toClose: { count: open.length, first: open[0] ? { id: open[0].id, title: open[0].title } : null },
  };
}

/**
 * Isi lonceng notifikasi (diminta 10 Nov): member baru hari ini, order perlu diproses, penukaran reward
 * menunggu, activity yang sudah lewat batas tutup (selesai + 30 menit, maks. 14 hari lalu) tapi belum ditutup. Hanya modul yang boleh diakses.
 * Hitungan order & penukaran = promise badge sidebar dari layout — dipakai bersama, tidak di-query ulang.
 */
export async function getAdminNotifications(
  session: AdminSession,
  ordersPending: Promise<number>,
  redemptionsPending: Promise<number>,
): Promise<AdminNotification[]> {
  const wantMembers = canAccess(session, "members");
  const wantClose = canAccess(session, "activities");
  let counts: Counts = { newMembers: 0, toClose: { count: 0, first: null } };
  try {
    counts = isSupabaseConfigured ? await liveCounts(new Date(), wantMembers, wantClose) : await demoCounts();
  } catch {
    // Lonceng saja — jangan sampai gagal memuat notifikasi membuat seluruh admin error.
  }
  const [ordersToProcess, pendingRedemptions] = await Promise.all([ordersPending.catch(() => 0), redemptionsPending]);
  const items: AdminNotification[] = [];
  if (wantClose && counts.toClose.count > 0) {
    const { count, first } = counts.toClose;
    items.push({
      key: "close",
      icon: "check-circle",
      title: `${count} activity perlu ditutup`,
      detail: count === 1 && first ? `${first.title} sudah lewat jam selesai — isi hasil & absen.` : "Sudah lewat jam selesai — isi hasil & absen lalu selesaikan.",
      href: count === 1 && first ? `/admin/activities/${first.id}` : "/admin/activities?tab=completed",
      count,
    });
  }
  if (canAccess(session, "orders") && ordersToProcess > 0) {
    items.push({ key: "orders", icon: "shopping-bag-open", title: `${ordersToProcess} order perlu diproses`, detail: "Transfer menunggu dicek atau pesanan siap dikirim.", href: "/admin/orders", count: ordersToProcess });
  }
  if (wantMembers && pendingRedemptions > 0) {
    items.push({ key: "redemptions", icon: "crown-simple", title: `${pendingRedemptions} penukaran reward menunggu`, detail: "Permintaan tukar Slay Point belum diproses.", href: "/admin/points?tab=redemptions", count: pendingRedemptions });
  }
  if (wantMembers && counts.newMembers > 0) {
    items.push({ key: "members", icon: "user-plus", title: `${counts.newMembers} member baru hari ini`, detail: "Daftar akun hari ini (WIB).", href: "/admin/members?tab=today", count: counts.newMembers });
  }
  return items;
}
