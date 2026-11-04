import type { Metadata } from "next";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import styles from "@/components/admin/finance/Finance.module.css";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { cx } from "@/lib/cx";
import { getFinanceAccess } from "@/server/admin/finance-repo";
import pageStyles from "../page.module.css";

export const metadata: Metadata = { title: { default: "Keuangan", template: "%s · Keuangan — Admin SOSLAY" } };

/** Modul Keuangan (ADM-18). Role tanpa izin finance → 12u "Akses ditolak" (menu juga tidak tampil). */
export default async function FinanceLayout({ children }: LayoutProps<"/admin/keuangan">) {
  const { role } = await getFinanceAccess();
  if (role) return children;
  return (
    <>
      <AdminTopbar breadcrumb="Keuangan" title="Keuangan" />
      <div className={pageStyles.content}>
        <section className={styles.panel}>
          <div className={styles.empty}>
            <span className={cx(styles.emptyIcon, styles.emptyIconPink)}>
              <AdminIcon name="shield-check" size={26} />
            </span>
            <p className={styles.emptyTitle}>Tidak punya akses Keuangan</p>
            <p>Menu Keuangan hanya untuk Super Admin dan Pencatat keuangan. Hubungi pemilik klub jika kamu memerlukan akses.</p>
            <AdminButton variant="primary" href="/admin">
              Kembali ke Overview
            </AdminButton>
          </div>
        </section>
      </div>
    </>
  );
}
