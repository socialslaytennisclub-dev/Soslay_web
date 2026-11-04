import type { Metadata } from "next";
import { ImportWizard } from "@/components/admin/finance/ImportWizard";
import { PageHead } from "@/components/admin/finance/FinanceUI";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { dupKey } from "@/lib/finance/journal";
import { posted, systemCategory } from "@/lib/finance/reports";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { financePage } from "@/server/admin/finance-page";
import pageStyles from "../../../page.module.css";

export const metadata: Metadata = { title: "Import jurnal" };

const AUTO_TICKET = new Set(["ticket", "ticket_manual_paid", "kuyy_import"]);

/** Admin / 13a–13j — Import jurnal Excel (data lama sebelum go-live). Khusus Super Admin. */
export default async function ImportJournalPage() {
  const ctx = await financePage("full");
  if (!ctx) return null;
  const { data } = ctx;
  const txs = posted(data);
  return (
    <>
      <AdminTopbar breadcrumb="Keuangan / Transaksi / Import jurnal" title="Keuangan" />
      <div className={pageStyles.content}>
        <PageHead back={{ href: "/admin/keuangan/transaksi", label: "Kembali ke Transaksi" }} title="Import jurnal dari Excel" subtitle="Masukkan data lama (Sep 2025 – Nov 2026) dari jurnal Excel, satu file per bulan." />
        <ImportWizard
          categories={data.categories}
          autoTicketMonths={[...new Set(txs.filter((t) => AUTO_TICKET.has(t.source)).map((t) => t.recognizedOn.slice(0, 7)))]}
          existingKeys={txs.map((t) => dupKey(t.date, t.description, t.amount))}
          goLiveDate={data.settings.goLiveDate}
          ticketCategoryId={systemCategory(data, "ticket")?.id ?? null}
          today={data.today}
          canSave={isSupabaseConfigured}
        />
      </div>
    </>
  );
}
