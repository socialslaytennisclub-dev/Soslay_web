import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

const DAY = 86_400_000;
const NEW_MEMBER_DAYS = 7;

type Counts = { newMembers: number; toClose: { count: number; first: { id: string; title: string } | null } };

async function liveCounts(now: Date, wantMembers: boolean, wantClose: boolean): Promise<Counts> {
  const client = await createSupabaseServerClient();
  const since = new Date(now.getTime() - NEW_MEMBER_DAYS * DAY).toISOString();
  const [members, close] = await Promise.all([
    wantMembers ? client.from("admin_member_list").select("id", { count: "exact", head: true }).gt("joined_at", since) : null,
    wantClose
      ? client
          .from("sessions")
          .select("id, title", { count: "exact" })
          .eq("status", "published")
          .is("ended_at", null)
          .lt("ends_at", now.toISOString())
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
  const open = d.sessions.filter((s) => s.status === "published" && s.endsAt.getTime() < now).sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
  return {
    newMembers: d.members.filter((m) => m.joinedAt.getTime() > now - NEW_MEMBER_DAYS * DAY).length,
    toClose: { count: open.length, first: open[0] ? { id: open[0].id, title: open[0].title } : null },
  };
}

/**
 * Isi lonceng notifikasi (diminta 10 Nov): member baru 7 hari, order perlu diproses, penukaran reward
 * menunggu, activity yang sudah lewat jam selesai tapi belum ditutup. Hanya modul yang boleh diakses.
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
    items.push({ key: "members", icon: "user-plus", title: `${counts.newMembers} member baru`, detail: `Daftar dalam ${NEW_MEMBER_DAYS} hari terakhir.`, href: "/admin/members?tab=new", count: counts.newMembers });
  }
  return items;
}
