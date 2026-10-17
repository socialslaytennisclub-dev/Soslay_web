import type { Metadata } from "next";
import Link from "next/link";
import { Kpi } from "@/components/admin/overview/Overview";
import overviewStyles from "@/components/admin/overview/Overview.module.css";
import ordersStyles from "@/components/admin/orders/Orders.module.css";
import { LedgerTable } from "@/components/admin/points/LedgerTable";
import styles from "@/components/admin/points/Points.module.css";
import { RedemptionPanel, NewRedemptionPanel } from "@/components/admin/points/RedemptionPanel";
import { RedemptionTable } from "@/components/admin/points/RedemptionTable";
import { RewardCatalog } from "@/components/admin/points/RewardCatalog";
import { RewardEditor } from "@/components/admin/points/RewardEditor";
import { BulkBonus, RulesForm } from "@/components/admin/points/RulesForm";
import { TierCards } from "@/components/admin/points/TierCards";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import { POINTS_REASON_LABEL, REDEMPTION_STATUS_LABEL } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { siteImageOptions } from "@/server/admin/catalog-repo";
import { adminNow } from "@/server/admin/dataset";
import {
  emptyReward,
  getPointRules,
  getPointsOverview,
  listLedger,
  listRedemptions,
  listRewards,
  listTierBenefits,
} from "@/server/admin/points-repo";
import { one } from "@/server/admin/query";
import { listSegments, memberChoices, segmentMemberIds } from "@/server/admin/repo";
import { activityTypeOptions } from "@/server/admin/sessions-repo";
import type { PointsReason, RedemptionStatus } from "@/server/admin/types";
import pageStyles from "../page.module.css";

export const metadata: Metadata = { title: "Slay Point & Reward" };

const TABS = [
  { value: "catalog", label: "Katalog reward" },
  { value: "redemptions", label: "Penukaran" },
  { value: "rules", label: "Aturan poin" },
  { value: "history", label: "Riwayat & tier" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const tabHref = (tab: Tab, extra: Record<string, string | undefined> = {}) => {
  const params = new URLSearchParams();
  if (tab !== "catalog") params.set("tab", tab);
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  const qs = params.toString();
  return `/admin/points${qs ? `?${qs}` : ""}`;
};

/** Admin / 11 Slay Point & Reward (Figma 316:2 · 317:37 · 317:482 · 322:2). */
export default async function AdminPointsPage({ searchParams }: PageProps<"/admin/points">) {
  const raw = await searchParams;
  const tab: Tab = TABS.find((t) => t.value === one(raw.tab))?.value ?? "catalog";
  const [overview, redemptions] = await Promise.all([getPointsOverview(), listRedemptions()]);
  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Jakarta" }).format(adminNow());

  return (
    <>
      <AdminTopbar breadcrumb={`CRM / Slay Point & Reward / ${TABS.find((t) => t.value === tab)!.label}`} title="Slay Point & Reward" />
      <div className={pageStyles.content}>
        <div className={styles.toolbar}>
          <nav className={styles.pills} aria-label="Bagian Slay Point">
            {TABS.map((t) => (
              <Link key={t.value} href={tabHref(t.value)} className={cx(styles.pill, tab === t.value && styles.pillActive)} aria-current={tab === t.value ? "page" : undefined}>
                {t.label}
                {t.value === "redemptions" && overview.pending > 0 && <span className={styles.pillCount}>{overview.pending}</span>}
              </Link>
            ))}
          </nav>
          <div className={styles.actions}>
            {tab === "catalog" && (
              <AdminButton variant="primary" icon="plus-bold" href={tabHref("catalog", { reward: "new" })} scroll={false}>
                Tambah reward
              </AdminButton>
            )}
            {tab === "redemptions" && (
              <AdminButton variant="primary" icon="plus-bold" href={tabHref("redemptions", { code: "new" })} scroll={false}>
                Catat penukaran
              </AdminButton>
            )}
            {tab === "history" && (
              <AdminButton icon="download-simple" href={`/admin/points/export${one(raw.reason) ? `?reason=${one(raw.reason)}` : ""}`} prefetch={false}>
                Export CSV
              </AdminButton>
            )}
          </div>
        </div>

        <div className={overviewStyles.kpis}>
          <Kpi icon="coins" label="Poin beredar" value={overview.circulating.toLocaleString("id-ID")} note="Saldo semua member" />
          <Kpi
            icon="shopping-bag-open"
            label={`Ditukar · ${monthLabel}`}
            value={overview.redeemedThisMonth.toLocaleString("id-ID")}
            delta={overview.redemptionsDelta ?? undefined}
            note={`${overview.redemptionsThisMonth} penukaran`}
          />
          <Kpi icon="crown-simple" label="Reward aktif" value={String(overview.activeRewards)} note={overview.lowStock ? `${overview.lowStock} stok menipis` : "Stok aman"} />
          <Kpi icon="clock" label="Menunggu diproses" value={String(overview.pending)} note={overview.pendingOverdue ? `${overview.pendingOverdue} lewat 24 jam` : "Semua di bawah 24 jam"} />
        </div>

        {tab === "catalog" && <CatalogTab selected={one(raw.reward)} />}
        {tab === "redemptions" && <RedemptionsTab all={redemptions} status={one(raw.status)} selected={one(raw.code)} />}
        {tab === "rules" && <RulesTab />}
        {tab === "history" && <HistoryTab reason={one(raw.reason)} />}
      </div>
    </>
  );
}

async function CatalogTab({ selected }: { selected?: string }) {
  const rewards = await listRewards();
  const reward = selected === "new" ? emptyReward() : rewards.find((r) => r.id === selected);
  return (
    <div className={styles.layout}>
      <section className={ordersStyles.listCard} aria-label="Katalog reward">
        <header className={styles.listHead}>
          <h2 className={styles.listTitle}>{rewards.length} reward</h2>
          <span className={styles.hint}>Klik reward untuk mengubah harga, stok, atau menyembunyikannya</span>
        </header>
        <RewardCatalog rewards={rewards} selected={reward?.id} hrefFor={(id) => tabHref("catalog", { reward: id })} />
      </section>
      {reward && <RewardEditor key={reward.id || "new"} reward={reward} imageOptions={siteImageOptions()} closeHref={tabHref("catalog")} />}
    </div>
  );
}

const STATUS_TABS: (RedemptionStatus | "all")[] = ["all", "pending", "approved", "fulfilled", "rejected"];

async function RedemptionsTab({ all, status: rawStatus, selected }: { all: Awaited<ReturnType<typeof listRedemptions>>; status?: string; selected?: string }) {
  const status = STATUS_TABS.find((s) => s === rawStatus) ?? "all";
  const items = status === "all" ? all : all.filter((r) => r.status === status);
  const redemption = all.find((r) => r.code === selected);
  const closeHref = tabHref("redemptions", { status: status === "all" ? undefined : status });
  const newForm = selected === "new" ? await Promise.all([memberChoices(), listRewards()]) : null;

  return (
    <div className={styles.layout}>
      <section className={ordersStyles.listCard} aria-label="Penukaran poin">
        <nav className={ordersStyles.tabs} aria-label="Status penukaran">
          {STATUS_TABS.map((s) => (
            <Link
              key={s}
              href={tabHref("redemptions", { status: s === "all" ? undefined : s })}
              scroll={false}
              className={cx(ordersStyles.tab, status === s && ordersStyles.tabActive)}
              aria-current={status === s ? "page" : undefined}
            >
              {s === "all" ? "Semua" : REDEMPTION_STATUS_LABEL[s]}
              <span className={ordersStyles.tabCount}>{s === "all" ? all.length : all.filter((r) => r.status === s).length}</span>
            </Link>
          ))}
        </nav>
        <RedemptionTable items={items} selected={redemption?.code} hrefFor={(code) => tabHref("redemptions", { status: status === "all" ? undefined : status, code })} />
      </section>
      {redemption && <RedemptionPanel key={redemption.code} redemption={redemption} closeHref={closeHref} />}
      {newForm && <NewRedemptionPanel members={newForm[0]} rewards={newForm[1].filter((r) => r.active)} closeHref={closeHref} />}
    </div>
  );
}

async function RulesTab() {
  const [rules, segments] = await Promise.all([getPointRules(), listSegments()]);
  // Jumlah penerima sebenarnya (member yang disuspend tidak ikut).
  const recipients = await Promise.all(segments.map(async (s) => ({ id: s.id, name: s.name, count: (await segmentMemberIds(s.id))?.length ?? 0 })));
  return (
    <>
      <RulesForm initial={rules} types={activityTypeOptions()} />
      <BulkBonus segments={recipients} />
    </>
  );
}

const REASONS = Object.keys(POINTS_REASON_LABEL) as PointsReason[];

async function HistoryTab({ reason: rawReason }: { reason?: string }) {
  const reason = REASONS.find((r) => r === rawReason);
  const [tiers, ledger] = await Promise.all([listTierBenefits(), listLedger(reason)]);
  return (
    <>
      <TierCards tiers={tiers} />
      <section className={ordersStyles.listCard} aria-label="Riwayat poin">
        <header className={styles.listHead}>
          <div>
            <h2 className={styles.listTitle}>Riwayat poin</h2>
            <p className={styles.hint}>Semua poin masuk & keluar dari seluruh member · terbaru di atas</p>
          </div>
          <nav className={styles.filters} aria-label="Filter alasan">
            {[undefined, ...REASONS].map((r) => (
              <Link
                key={r ?? "all"}
                href={tabHref("history", { reason: r })}
                scroll={false}
                className={cx(styles.filter, reason === r && styles.filterActive)}
                aria-current={reason === r ? "page" : undefined}
              >
                {r ? POINTS_REASON_LABEL[r] : "Semua"}
              </Link>
            ))}
          </nav>
        </header>
        <LedgerTable entries={ledger.entries} />
        <p className={styles.hint}>
          Menampilkan {ledger.entries.length.toLocaleString("id-ID")} dari {ledger.matching.toLocaleString("id-ID")} transaksi
          {reason ? ` ${POINTS_REASON_LABEL[reason].toLowerCase()}` : ""} · {ledger.total.toLocaleString("id-ID")} transaksi tercatat
        </p>
      </section>
    </>
  );
}
