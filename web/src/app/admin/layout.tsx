import type { Metadata } from "next";
import Link from "next/link";
import { AdminSidebar } from "@/components/admin/shell/AdminSidebar";
import { getSidebarCounts } from "@/server/admin/repo";
import { canAccess, getAdminSession } from "@/server/admin/session";
import type { AdminModule } from "@/server/admin/types";
import { signOut } from "@/server/auth/actions";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: { default: "Admin — SOSLAY", template: "%s — Admin SOSLAY" },
  robots: { index: false, follow: false },
};

const MODULE_HREF: Record<AdminModule, string> = {
  overview: "/admin",
  members: "/admin/members",
  activities: "/admin/activities",
  venues: "/admin/venues",
  products: "/admin/products",
  orders: "/admin/orders",
  content: "/admin/konten",
  settings: "/admin/settings",
};

/**
 * Admin CMS & CRM (Figma 25:3056). Mode demo tanpa Supabase; setelah tersambung hanya staf
 * aktif (staff_members) yang bisa masuk, dan menu mengikuti izin role-nya. RLS tetap
 * menjadi penjaga utama di database.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await getAdminSession();

  if (session.mode === "denied") {
    return (
      <main className={styles.denied}>
        <h1>Akses admin belum aktif</h1>
        <p>
          {session.email ? `Akun ${session.email} belum terdaftar sebagai tim Soslay.` : "Masuk dulu dengan akun tim Soslay."} Minta Super Admin
          mengundang kamu dari Settings & Roles.
        </p>
        <div className={styles.deniedActions}>
          <Link href="/">Kembali ke website</Link>
          <form action={signOut}>
            <button type="submit">Masuk dengan akun lain</button>
          </form>
        </div>
      </main>
    );
  }

  const counts = await getSidebarCounts();
  const hiddenHrefs = (Object.keys(MODULE_HREF) as AdminModule[]).filter((m) => !canAccess(session, m)).map((m) => MODULE_HREF[m]);

  return (
    <div className={styles.shell}>
      <AdminSidebar
        memberCount={counts.members}
        ordersToProcess={counts.ordersToProcess}
        user={{ name: session.name, role: session.role }}
        hiddenHrefs={hiddenHrefs}
        canSignOut={session.mode === "live"}
      />
      <div className={styles.main}>{children}</div>
    </div>
  );
}
