import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_NOW, TIERS } from "./demo-data";
import type { AdminModule, AppSettings, AuditEntry, Integration, ModuleAccess, RolePermissions, StaffMember } from "./types";

/**
 * Data Settings & Roles (staff_members, roles, role_permissions, integrations, app_settings,
 * admin_audit_log). Matriks izin sama dengan seed di migration.
 */

const HOUR = 3_600_000;
const ago = (hours: number) => new Date(DEMO_NOW.getTime() - hours * HOUR).toISOString();

export const ADMIN_MODULES: { key: AdminModule; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "members", label: "Members (CRM)" },
  { key: "activities", label: "Activities & absensi" },
  { key: "venues", label: "Venues" },
  { key: "products", label: "Products" },
  { key: "orders", label: "Orders" },
  { key: "content", label: "Konten & galeri" },
  { key: "settings", label: "Settings & roles" },
];

const all = (access: ModuleAccess) => Object.fromEntries(ADMIN_MODULES.map((m) => [m.key, access])) as Record<AdminModule, ModuleAccess>;

export async function listRoles(): Promise<RolePermissions[]> {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("roles").select("name, is_system, created_at, role_permissions(module, access)").order("created_at");
    return (data ?? []).map((r) => ({
      name: r.name as string,
      isSystem: r.is_system as boolean,
      access: { ...all("none"), ...Object.fromEntries((r.role_permissions as { module: AdminModule; access: ModuleAccess }[]).map((p) => [p.module, p.access])) },
    }));
  }
  return [
    { name: "Super Admin", isSystem: true, access: all("edit") },
    { name: "Admin", isSystem: true, access: { ...all("edit"), settings: "view" } },
    { name: "Community Manager", isSystem: true, access: { ...all("none"), overview: "view", members: "edit", activities: "edit", venues: "view", content: "edit" } },
    { name: "Coach", isSystem: true, access: { ...all("none"), overview: "view", members: "view", activities: "edit", venues: "view" } },
    { name: "Fotografer", isSystem: true, access: { ...all("none"), activities: "view", content: "edit" } },
    { name: "Kasir Shop", isSystem: true, access: { ...all("none"), overview: "view", members: "view", products: "edit", orders: "edit" } },
  ];
}

export async function listStaff(): Promise<StaffMember[]> {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("staff_members").select("user_id, full_name, email, status, last_active_at, invited_at, roles(name)").order("invited_at");
    return (data ?? []).map((s) => ({
      id: s.user_id as string,
      name: s.full_name as string,
      email: s.email as string,
      role: (s.roles as unknown as { name: string } | null)?.name ?? "—",
      status: s.status as StaffMember["status"],
      lastActiveAt: (s.last_active_at as string | null) ?? null,
    }));
  }
  return [
    { id: "st1", name: "Rara Anindya", email: "rara@soslay.com", role: "Super Admin", status: "active", lastActiveAt: ago(0) },
    { id: "st2", name: "Gilang Hermawan", email: "gilang@soslay.com", role: "Admin", status: "active", lastActiveAt: ago(1) },
    { id: "st3", name: "Putri Saraswati", email: "putri@soslay.com", role: "Community Manager", status: "active", lastActiveAt: ago(5) },
    { id: "st4", name: "Bima Pratama", email: "bima@soslay.com", role: "Coach", status: "active", lastActiveAt: ago(26) },
    { id: "st5", name: "Lia Oktaviani", email: "lia@soslay.com", role: "Fotografer", status: "active", lastActiveAt: ago(24 * 6) },
    { id: "st6", name: "Dewa Ketut", email: "dewa@soslay.com", role: "Community Manager", status: "invited", lastActiveAt: null },
    { id: "st7", name: "Salsa Nabila", email: "salsa@soslay.com", role: "Kasir Shop", status: "invited", lastActiveAt: null },
  ];
}

const INTEGRATION_INFO: Record<string, string> = {
  kuy: "Sinkron booking & Kuy ID member",
  reclub: "Import member & riwayat main",
  payment: "QRIS, VA, e-wallet",
  whatsapp: "Reminder sesi & QR check-in",
  instagram: "Feed “See You on the Court!”",
};

export async function listIntegrations(): Promise<Integration[]> {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("integrations").select("key, label, status, last_sync_at");
    const order = Object.keys(INTEGRATION_INFO);
    return (data ?? [])
      .map((i) => ({
        key: i.key as string,
        label: i.label as string,
        description: INTEGRATION_INFO[i.key as string] ?? "",
        status: i.status as Integration["status"],
        lastSyncAt: (i.last_sync_at as string | null) ?? null,
      }))
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }
  return [
    { key: "kuy", label: "Kuy", description: "Sinkron booking & Kuy ID member", status: "connected", lastSyncAt: ago(0.2) },
    { key: "reclub", label: "Reclub", description: "Import member & riwayat main", status: "connected", lastSyncAt: ago(3) },
    { key: "payment", label: "Payment gateway", description: "QRIS, VA, e-wallet", status: "connected", lastSyncAt: ago(0.1) },
    { key: "whatsapp", label: "WhatsApp Business", description: "Reminder sesi & QR check-in", status: "connected", lastSyncAt: ago(0.5) },
    { key: "instagram", label: "Instagram", description: "Feed “See You on the Court!”", status: "needs_reauth", lastSyncAt: ago(24 * 9) },
  ];
}

export async function listAuditLog(): Promise<AuditEntry[]> {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const since = new Date(Date.now() - 7 * 24 * HOUR).toISOString();
    const { data } = await supabase
      .from("admin_audit_log")
      .select("action, created_at, staff_members(full_name)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20);
    return (data ?? []).map((e) => ({
      actor: ((e.staff_members as unknown as { full_name: string } | null)?.full_name ?? "Sistem").split(" ")[0],
      action: e.action as string,
      at: e.created_at as string,
    }));
  }
  return [
    { actor: "Rara", action: "mengubah Hero homepage", at: ago(2) },
    { actor: "Gilang", action: "menandai #SOS-2301 dikirim", at: ago(5) },
    { actor: "Putri", action: "membuat sesi Weekly MABAR 17 Okt", at: ago(20) },
    { actor: "Bima", action: "check-in 18 peserta Beginner Coaching", at: ago(40) },
    { actor: "Lia", action: "upload 86 foto ke album Weekly MABAR", at: ago(52) },
    { actor: "Rara", action: "mengundang Salsa Nabila sebagai Kasir Shop", at: ago(80) },
  ];
}

export async function getSettings(): Promise<AppSettings> {
  const base = demoSettings();
  if (!isSupabaseConfigured) return base;
  const supabase = await createSupabaseServerClient();
  const [{ data: rows }, { data: tiers }] = await Promise.all([
    supabase.from("app_settings").select("key, value"),
    supabase.from("membership_tiers").select("tier, label, min_points").order("sort_order"),
  ]);
  const value = new Map((rows ?? []).map((r) => [r.key as string, r.value as unknown]));
  return {
    ...base,
    monthlySessionTarget: Number(value.get("monthly_session_target") ?? base.monthlySessionTarget),
    rupiahPerPoint: Number(value.get("rupiah_per_point") ?? base.rupiahPerPoint),
    annualTargets: (value.get("annual_targets") as AppSettings["annualTargets"]) ?? base.annualTargets,
    tiers: tiers?.length ? tiers.map((t) => ({ tier: t.tier as AppSettings["tiers"][number]["tier"], label: t.label as string, minPoints: t.min_points as number })) : base.tiers,
  };
}

/** Pengaturan yang belum punya tabel sendiri (profil klub, pembayaran, notifikasi). */
function demoSettings(): AppSettings {
  return {
    clubName: "Social Slay Tennis Club",
    contactEmail: "hello@soslay.com",
    whatsapp: "+62 812 0000 2026",
    timezone: "Asia/Jakarta (WIB)",
    monthlySessionTarget: 16,
    rupiahPerPoint: 10_000,
    annualTargets: { sessions: 96, hours: 150, venues: 10 },
    tiers: TIERS,
    paymentMethods: [
      { key: "qris", label: "QRIS", enabled: true, fee: "0,7%" },
      { key: "va", label: "Virtual Account (BCA, Mandiri, BNI)", enabled: true, fee: "Rp4.000" },
      { key: "ewallet", label: "E-wallet (GoPay, OVO, ShopeePay)", enabled: true, fee: "1,5%" },
      { key: "card", label: "Kartu kredit", enabled: false, fee: "2,9% + Rp2.000" },
    ],
    bookingPaymentDeadlineHours: 2,
    notifications: [
      { key: "reminder", label: "Reminder H-1 sesi", hint: "Dikirim jam 19.00 sehari sebelum sesi", channel: "WhatsApp", enabled: true },
      { key: "qr", label: "QR check-in", hint: "Dikirim 2 jam sebelum sesi mulai", channel: "WhatsApp", enabled: true },
      { key: "waitlist", label: "Slot waitlist terbuka", hint: "Saat peserta membatalkan booking", channel: "WhatsApp + email", enabled: true },
      { key: "order", label: "Status order shop", hint: "Dibayar, dikirim, diterima", channel: "Email", enabled: true },
      { key: "tier", label: "Naik tier membership", hint: "Ucapan selamat + benefit baru", channel: "Email", enabled: false },
      { key: "admin_order", label: "Order baru (untuk admin)", hint: "Ke Kasir Shop & Admin", channel: "Email", enabled: true },
    ],
  };
}
