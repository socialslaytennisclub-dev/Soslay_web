import type { Metadata } from "next";
import { FinanceSettingsView } from "@/components/admin/finance/FinanceSettings";
import { PageHead } from "@/components/admin/finance/FinanceUI";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { accountBalances } from "@/lib/finance/reports";
import { financePage } from "@/server/admin/finance-page";
import pageStyles from "../../page.module.css";

export const metadata: Metadata = { title: "Pengaturan keuangan" };

/** Admin / 12r — Pengaturan keuangan (khusus Super Admin). */
export default async function FinanceSettingsPage() {
  const ctx = await financePage("full");
  if (!ctx) return null;
  const { data } = ctx;
  const balances = Object.fromEntries(accountBalances(data, data.today));
  const usage: Record<string, number> = {};
  for (const t of data.transactions) if (t.categoryId) usage[t.categoryId] = (usage[t.categoryId] ?? 0) + 1;
  return (
    <>
      <AdminTopbar breadcrumb="Keuangan / Pengaturan" title="Keuangan" />
      <div className={pageStyles.content}>
        <PageHead back={{ href: "/admin/keuangan", label: "Kembali ke Ringkasan" }} title="Pengaturan keuangan" subtitle="Akun kas & bank, kategori, pajak dan pencatatan otomatis. Hanya Super Admin." />
        <FinanceSettingsView accounts={data.accounts} balances={balances} categories={data.categories} usage={usage} settings={data.settings} />
      </div>
    </>
  );
}
