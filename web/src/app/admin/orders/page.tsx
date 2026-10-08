import type { Metadata } from "next";
import Link from "next/link";
import { OrderPanel } from "@/components/admin/orders/OrderPanel";
import styles from "@/components/admin/orders/Orders.module.css";
import { OrdersFilters } from "@/components/admin/orders/OrdersFilters";
import { OrdersTable } from "@/components/admin/orders/OrdersTable";
import { Kpi } from "@/components/admin/overview/Overview";
import overviewStyles from "@/components/admin/overview/Overview.module.css";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { formatRupiahShort, PAYMENT_LABEL } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { getOrder, listOrders } from "@/server/admin/orders-repo";
import type { OrdersQuery, OrdersTab, PaymentStatus } from "@/server/admin/types";
import { one } from "@/server/admin/query";
import pageStyles from "../page.module.css";

export const metadata: Metadata = { title: "Orders" };

const TABS: { value: OrdersTab; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "to_process", label: "Perlu diproses" },
  { value: "shipped", label: "Dikirim" },
  { value: "completed", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
];

function href(query: OrdersQuery, overrides: Partial<OrdersQuery>) {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (merged.tab && merged.tab !== "all") params.set("tab", merged.tab);
  for (const key of ["q", "payment", "month", "order"] as const) if (merged[key]) params.set(key, merged[key]);
  const qs = params.toString();
  return `/admin/orders${qs ? `?${qs}` : ""}`;
}

/** Admin / 07 Orders (Figma 25:5560). */
export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const raw = await searchParams;
  const payment = one(raw.payment);
  const month = one(raw.month);
  const query: OrdersQuery = {
    tab: TABS.find((t) => t.value === one(raw.tab))?.value ?? "all",
    q: one(raw.q),
    payment: payment && payment in PAYMENT_LABEL ? (payment as PaymentStatus) : undefined,
    month: month && /^\d{4}-\d{2}$/.test(month) ? month : undefined,
    order: one(raw.order),
  };
  const result = await listOrders(query);
  // Tanpa ?order= panel menampilkan order teratas, tapi hanya di desktop.
  const selectedCode = query.order ?? result.items[0]?.code;
  const order = selectedCode ? await getOrder(selectedCode) : null;
  const { kpis } = result;

  return (
    <>
      <AdminTopbar breadcrumb="CMS / Shop / Orders" title="Orders" />
      <div className={pageStyles.content}>
        <div className={overviewStyles.kpis}>
          <Kpi icon="package" label="Perlu diproses" value={String(kpis.toProcess)} note={kpis.overdue ? `${kpis.overdue} lewat 24 jam` : "Semua di bawah 24 jam"} />
          <Kpi icon="truck" label="Dalam pengiriman" value={String(kpis.inTransit)} note="JNE, SiCepat, J&T" />
          <Kpi icon="check-circle" label={`Selesai · ${kpis.monthLabel}`} value={String(kpis.completedThisMonth)} note="Order diterima customer" />
          <Kpi icon="coins" label={`Pendapatan · ${kpis.monthLabel}`} value={formatRupiahShort(kpis.revenueThisMonth)} delta={kpis.revenueDelta} note={`vs periode sama ${kpis.prevMonthLabel}`} />
        </div>

        <div className={styles.layout}>
          <section className={styles.listCard} aria-label="Daftar order">
            <nav className={styles.tabs} aria-label="Status order">
              {TABS.map((t) => (
                <Link
                  key={t.value}
                  href={href(query, { tab: t.value, order: undefined })}
                  scroll={false}
                  className={cx(styles.tab, query.tab === t.value && styles.tabActive)}
                  aria-current={query.tab === t.value ? "page" : undefined}
                >
                  {t.label}
                  <span className={styles.tabCount}>{result.counts[t.value]}</span>
                </Link>
              ))}
            </nav>
            <OrdersFilters months={result.months} />
            <OrdersTable items={result.items} selected={selectedCode} auto={!query.order} hrefFor={(code) => href(query, { order: code })} />
          </section>

          {order && (
            <div className={cx(styles.panelSlot, !query.order && styles.panelAuto)}>
              <OrderPanel key={order.code} order={order} closeHref={query.order ? href(query, { order: undefined }) : undefined} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
