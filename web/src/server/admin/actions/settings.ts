"use server";

import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminModule, AppSettings, ModuleAccess } from "../types";
import { audit, done, fail, refreshPaths, requireEditor, type ActionResult } from "./common";

/** Settings & Roles: tim, role & izin, undangan, dan pengaturan aplikasi. */

const MODULES: AdminModule[] = ["overview", "members", "activities", "venues", "products", "orders", "content", "settings"];
const ACCESS: ModuleAccess[] = ["none", "view", "edit"];
const SUPER_ADMIN = "Super Admin";

function refreshSettings() {
  refreshPaths("/admin/settings");
}

async function roleId(name: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("roles").select("id").eq("name", name).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// ── Tim ─────────────────────────────────────────────────────────────────────
export async function changeStaffRole(userId: string, role: string): Promise<ActionResult> {
  const auth = await requireEditor("settings");
  if ("error" in auth) return fail(auth.error);
  if (userId === auth.userId) return fail("Kamu tidak bisa mengubah role akunmu sendiri.");
  const id = await roleId(role);
  if (!id) return fail("Role tidak ditemukan.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("staff_members").update({ role_id: id }).eq("user_id", userId).select("full_name");
  if (error || !data?.length) return fail(`Gagal mengubah role: ${error?.message ?? "staf tidak ditemukan"}`);
  await audit(auth.userId, `mengubah role ${data[0].full_name} → ${role}`, "staff", userId);
  refreshSettings();
  return done(`${data[0].full_name} sekarang ${role}.`);
}

export async function setStaffActive(userId: string, active: boolean): Promise<ActionResult> {
  const auth = await requireEditor("settings");
  if ("error" in auth) return fail(auth.error);
  if (userId === auth.userId) return fail("Kamu tidak bisa menonaktifkan akunmu sendiri.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("staff_members").update({ status: active ? "active" : "disabled" }).eq("user_id", userId).select("full_name");
  if (error || !data?.length) return fail(`Gagal mengubah status: ${error?.message ?? "staf tidak ditemukan"}`);
  await audit(auth.userId, `${active ? "mengaktifkan" : "menonaktifkan"} akses admin ${data[0].full_name}`, "staff", userId);
  refreshSettings();
  return done(active ? `${data[0].full_name} bisa masuk admin lagi.` : `Akses admin ${data[0].full_name} dinonaktifkan.`);
}

/**
 * Undang anggota tim: buat akun Auth + kirim email undangan (butuh SUPABASE_SERVICE_ROLE_KEY),
 * lalu catat di staff_members dengan status "Diundang" (aktif saat login pertama).
 */
export async function inviteStaff(input: { name: string; email: string; role: string }): Promise<ActionResult> {
  const auth = await requireEditor("settings");
  if ("error" in auth) return fail(auth.error);
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return fail("Isi nama anggota tim.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Email tidak valid.");
  const id = await roleId(input.role);
  if (!id) return fail("Pilih role.");

  const admin = createSupabaseAdminClient();
  if (!admin) return fail("Undangan belum aktif: SUPABASE_SERVICE_ROLE_KEY belum dipasang di server (lihat docs/04-DATABASE.md).");

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/auth/undangan`, data: { full_name: name } });

  let userId = invited?.user?.id;
  if (error) {
    // Sudah punya akun (mis. member) → cukup beri akses admin.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (!userId) return fail(`Gagal mengirim undangan: ${error.message}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error: staffError } = await supabase
    .from("staff_members")
    .upsert({ user_id: userId, role_id: id, full_name: name, email, status: error ? "active" : "invited", invited_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (staffError) return fail(`Akun dibuat, tapi gagal menambah ke tim: ${staffError.message}`);
  await audit(auth.userId, `mengundang ${name} sebagai ${input.role}`, "staff", userId);
  refreshSettings();
  return done(error ? `${name} sudah punya akun — akses ${input.role} langsung aktif.` : `Undangan terkirim ke ${email}. ${name} tinggal klik link di email dan buat password.`);
}

// ── Role & izin ─────────────────────────────────────────────────────────────
export async function savePermissions(changes: { role: string; module: AdminModule; access: ModuleAccess }[]): Promise<ActionResult> {
  const auth = await requireEditor("settings");
  if ("error" in auth) return fail(auth.error);
  if (changes.some((c) => c.role === SUPER_ADMIN)) return fail("Izin Super Admin tidak bisa diubah.");
  if (changes.some((c) => !MODULES.includes(c.module) || !ACCESS.includes(c.access))) return fail("Data izin tidak valid.");
  const supabase = await createSupabaseServerClient();
  const { data: roles } = await supabase.from("roles").select("id, name").in("name", [...new Set(changes.map((c) => c.role))]);
  const idByName = new Map((roles ?? []).map((r) => [r.name as string, r.id as string]));
  const rows = changes.flatMap((c) => (idByName.has(c.role) ? [{ role_id: idByName.get(c.role), module: c.module, access: c.access }] : []));
  if (!rows.length) return fail("Tidak ada perubahan.");
  const { error } = await supabase.from("role_permissions").upsert(rows, { onConflict: "role_id,module" });
  if (error) return fail(`Gagal menyimpan izin: ${error.message}`);
  await audit(auth.userId, `mengubah izin ${[...idByName.keys()].join(", ")}`, "role");
  refreshSettings();
  return done("Izin role tersimpan — berlaku saat anggota tim membuka halaman berikutnya.");
}

export async function createRole(name: string): Promise<ActionResult> {
  const auth = await requireEditor("settings");
  if ("error" in auth) return fail(auth.error);
  const clean = name.trim().slice(0, 40);
  if (!clean) return fail("Beri nama role.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("roles").insert({ name: clean, is_system: false }).select("id").single();
  if (error) return fail(error.code === "23505" ? "Role dengan nama ini sudah ada." : `Gagal membuat role: ${error.message}`);
  // Mulai dari "lihat Overview" saja; atur sisanya di matriks.
  await supabase.from("role_permissions").insert(MODULES.map((module) => ({ role_id: data.id, module, access: module === "overview" ? "view" : "none" })));
  await audit(auth.userId, `membuat role ${clean}`, "role", data.id as string);
  refreshSettings();
  return done(`Role "${clean}" dibuat — atur izinnya di matriks.`);
}

// ── Pengaturan aplikasi ─────────────────────────────────────────────────────
export async function saveAppSettings(tab: "general" | "membership" | "payment" | "notifications", s: AppSettings): Promise<ActionResult> {
  const auth = await requireEditor("settings");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createSupabaseServerClient();
  const upsert = (key: string, value: unknown) => supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (tab === "general") {
    if (!s.clubName.trim()) return fail("Nama klub wajib diisi.");
    const { error } = await upsert("club_profile", { clubName: s.clubName.trim(), contactEmail: s.contactEmail.trim(), whatsapp: s.whatsapp.trim() });
    if (error) return fail(`Gagal menyimpan: ${error.message}`);
  } else if (tab === "membership") {
    const mins = s.tiers.map((t) => t.minPoints);
    if (mins.some((m, i) => i > 0 && m <= mins[i - 1])) return fail("Batas poin tiap tier harus naik berurutan (Basic < Silver < Gold < Platinum).");
    if (s.rupiahPerPoint < 1000) return fail("Belanja per poin minimal Rp1.000.");
    const results = await Promise.all([
      upsert("rupiah_per_point", s.rupiahPerPoint),
      upsert("monthly_session_target", s.monthlySessionTarget),
      upsert("annual_targets", s.annualTargets),
      ...s.tiers.map((t) => supabase.from("membership_tiers").update({ min_points: t.minPoints }).eq("tier", t.tier)),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) return fail(`Gagal menyimpan: ${failed.error.message}`);
  } else if (tab === "payment") {
    if (s.bookingPaymentDeadlineHours < 1 || s.bookingPaymentDeadlineHours > 72) return fail("Batas bayar 1–72 jam.");
    const { error } = await upsert("payment", { paymentMethods: s.paymentMethods, bookingPaymentDeadlineHours: s.bookingPaymentDeadlineHours });
    if (error) return fail(`Gagal menyimpan: ${error.message}`);
  } else {
    const { error } = await upsert("notifications", s.notifications);
    if (error) return fail(`Gagal menyimpan: ${error.message}`);
  }
  await audit(auth.userId, `mengubah pengaturan ${{ general: "umum", membership: "membership & poin", payment: "pembayaran", notifications: "notifikasi" }[tab]}`, "settings", tab);
  refreshSettings();
  return done("Pengaturan tersimpan.");
}
