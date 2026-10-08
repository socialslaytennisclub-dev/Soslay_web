import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { formatRupiahPlain, formatRupiahShort, formatShortDate, LEVEL_LABEL, TIER_LABEL } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import type { OverviewData } from "@/server/admin/types";
import { AdminIcon, type AdminIconName } from "../ui/AdminIcon";
import {
  Badge,
  Card,
  CardLink,
  DateBox,
  Delta,
  desktopOnlyClass,
  MemberAvatar,
  MobileCard,
  MobileCardList,
  OrderStatusBadge,
  PaymentBadge,
  TierBadge,
} from "../ui/AdminUI";
import styles from "./Overview.module.css";

const num = (n: number) => n.toLocaleString("id-ID");

function PersonCell({ name, meta }: { name: string; meta: string }) {
  return (
    <span className={styles.person}>
      <MemberAvatar name={name} size={40} />
      <span className={styles.personText}>
        <span className={styles.personName}>{name}</span>
        <span className={styles.personMeta}>{meta}</span>
      </span>
    </span>
  );
}

// ── KPI ─────────────────────────────────────────────────────────────────────
export function Kpi({ icon, label, value, delta, note }: { icon: AdminIconName; label: string; value: string; delta?: number; note: string }) {
  return (
    <div className={styles.kpi}>
      <p className={styles.kpiLabel}>
        <span className={styles.kpiIcon}>
          <AdminIcon name={icon} size={18} />
        </span>
        {label}
      </p>
      <p className={styles.kpiValue}>
        {value} {delta !== undefined && <Delta value={delta} />}
      </p>
      <p className={styles.kpiNote}>{note}</p>
    </div>
  );
}

export function KpiRow({ data, monthLabel }: { data: OverviewData; monthLabel: string }) {
  const { kpis } = data;
  return (
    <div className={styles.kpis}>
      <Kpi icon="users-three" label="Member aktif" value={num(kpis.activeMembers)} delta={kpis.activeMembersDelta} note={`+${kpis.newMembersThisMonth} member bulan ini`} />
      <Kpi icon="calendar-dots" label="Booking 7 hari terakhir" value={num(kpis.bookingsThisWeek)} delta={kpis.bookingsDelta} note={`Kapasitas terisi ${kpis.capacityFilled}%`} />
      <Kpi icon="receipt" label={`Penjualan shop · ${monthLabel}`} value={formatRupiahShort(kpis.salesThisMonth)} delta={kpis.salesDelta} note={`${kpis.ordersThisMonth} pesanan`} />
      <Kpi icon="check-circle" label="Tingkat kehadiran" value={`${kpis.attendanceRate}%`} delta={kpis.attendanceDelta} note={`${kpis.noShowsThisWeek} no-show minggu ini`} />
    </div>
  );
}

// ── Grafik booking per minggu ───────────────────────────────────────────────
const RANGES = [
  { value: 4, label: "4 mgg" },
  { value: 12, label: "12 mgg" },
  { value: 52, label: "Tahun" },
];

export function WeeklyBookings({ data, range }: { data: OverviewData; range: number }) {
  const weeks = data.weeklyBookings;
  const total = weeks.reduce((sum, w) => sum + w.count, 0);
  const max = Math.max(...weeks.map((w) => w.count), 1);
  const scale = Math.ceil(max / 40) * 40; // sumbu Y kelipatan 40 (0 · 80 · 160)
  const dense = weeks.length > 16;

  return (
    <Card
      title="Booking per minggu"
      subtitle={`Semua sesi · ${weeks.length} minggu terakhir`}
      action={
        <nav className={styles.segmented} aria-label="Rentang grafik">
          {RANGES.map((r) => (
            <Link
              key={r.value}
              href={`/admin?range=${r.value}`}
              scroll={false}
              className={cx(styles.segment, r.value === range && styles.segmentActive)}
              aria-current={r.value === range ? "true" : undefined}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      }
      className={styles.chartCard}
    >
      <p className={styles.chartTotal}>
        {num(total)} <span>booking · rata-rata {num(Math.round(total / weeks.length))}/minggu</span>
      </p>
      <div className={styles.chart} role="img" aria-label={`Grafik booking ${weeks.length} minggu, total ${total}`}>
        <div className={styles.yAxis} aria-hidden>
          <span>{scale}</span>
          <span>{scale / 2}</span>
          <span>0</span>
        </div>
        <div className={cx(styles.bars, dense && styles.barsDense)}>
          {weeks.map((week, i) => {
            const last = i === weeks.length - 1;
            return (
              <div key={week.weekStart} className={styles.barCol} title={`${formatShortDate(week.weekStart)}: ${week.count} booking`}>
                <div className={styles.barTrack}>
                  <div className={cx(styles.bar, last && styles.barCurrent)} style={{ "--h": `${(week.count / scale) * 100}%`, "--i": i } as CSSProperties}>
                    {last && <span className={styles.barValue}>{week.count}</span>}
                  </div>
                </div>
                {(!dense || i % 4 === 3 || last) && <span className={cx(styles.barLabel, last && styles.barLabelCurrent)}>{formatShortDate(week.weekStart)}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ── Sesi mendatang ──────────────────────────────────────────────────────────
export function UpcomingSessions({ data }: { data: OverviewData }) {
  return (
    <Card title="Sesi mendatang" subtitle={`${data.upcomingCount} sesi · 7 hari ke depan`} action={<CardLink href="/admin/activities?range=7">Semua</CardLink>}>
      <ul className={styles.sessions}>
        {data.upcomingSessions.map((session) => {
          const fill = session.booked / session.capacity;
          const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(session.startsAt));
          return (
            <li key={session.id} className={styles.session}>
              <DateBox iso={session.startsAt} />
              <div className={styles.sessionBody}>
                <p className={styles.sessionHead}>
                  <span className={styles.sessionTitle}>{session.title}</span>
                  {fill >= 0.85 ? <Badge tone="pink" dot>Hampir penuh</Badge> : <Badge tone="lime" dot>Buka</Badge>}
                </p>
                <p className={styles.sessionMeta}>
                  {session.venueName} · {time}
                </p>
                <div className={styles.fillRow}>
                  <span className={styles.fillTrack}>
                    <span className={styles.fillBar} style={{ width: `${Math.min(fill, 1) * 100}%` }} />
                  </span>
                  <span className={styles.fillText}>
                    {session.booked}/{session.capacity}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ── Member terbaru ──────────────────────────────────────────────────────────
export function NewestMembers({ data }: { data: OverviewData }) {
  return (
    <Card title="Member terbaru" subtitle={`${data.kpis.newMembersThisMonth} member bergabung bulan ini`} action={<CardLink href="/admin/members?tab=new">Kelola member</CardLink>}>
      <div className={cx(styles.tableWrap, desktopOnlyClass)}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Member</th>
              <th>Level</th>
              <th>Bergabung</th>
              <th>Tier</th>
            </tr>
          </thead>
          <tbody>
            {data.newestMembers.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/admin/members/${m.id}`} className={styles.person}>
                    <MemberAvatar name={m.fullName} />
                    <span>
                      <span className={styles.personName}>{m.fullName}</span>
                      <span className={styles.personMeta}>
                        @{m.instagram} · {m.city}
                      </span>
                    </span>
                  </Link>
                </td>
                <td>{LEVEL_LABEL[m.level]}</td>
                <td>{formatShortDate(m.joinedAt)}</td>
                <td>
                  <TierBadge tier={m.tier} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* HP: tabel berubah jadi kartu — tidak perlu scroll horizontal */}
      <MobileCardList label="Member terbaru">
        {data.newestMembers.map((m) => (
          <MobileCard
            key={m.id}
            href={`/admin/members/${m.id}`}
            title={<PersonCell name={m.fullName} meta={`@${m.instagram} · ${m.city}`} />}
            aside={<TierBadge tier={m.tier} />}
            meta={[
              { label: "Level", value: LEVEL_LABEL[m.level] },
              { label: "Bergabung", value: formatShortDate(m.joinedAt) },
            ]}
          />
        ))}
      </MobileCardList>
    </Card>
  );
}

// ── Distribusi tier & level ─────────────────────────────────────────────────
const TIER_COLOR = { basic: "var(--color-indigo-200)", silver: "var(--color-indigo-500)", gold: "var(--color-indigo-700)", platinum: "var(--color-navy-900)" };

export function Distribution({ data }: { data: OverviewData }) {
  const total = data.tierDistribution.reduce((s, t) => s + t.count, 0);
  const maxLevel = Math.max(...data.levelDistribution.map((l) => l.count), 1);
  return (
    <Card title="Distribusi tier" subtitle={`${num(total)} member`}>
      <div className={styles.stack} role="img" aria-label="Proporsi member per tier">
        {data.tierDistribution.map((t) => (
          <span key={t.tier} style={{ width: `${(t.count / total) * 100}%`, background: TIER_COLOR[t.tier] }} />
        ))}
      </div>
      <ul className={styles.legend}>
        {data.tierDistribution.map((t) => (
          <li key={t.tier}>
            <span className={styles.legendSwatch} style={{ background: TIER_COLOR[t.tier] }} aria-hidden />
            <span className={styles.legendLabel}>{TIER_LABEL[t.tier]}</span>
            <span className={styles.legendValue}>{num(t.count)}</span>
            <span className={styles.legendPct}>{Math.round((t.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
      <div>
        <h3 className={styles.subheading}>Level tenis</h3>
        <ul className={styles.levels}>
          {data.levelDistribution.map((l) => (
            <li key={l.level}>
              <span className={styles.levelLabel}>{LEVEL_LABEL[l.level]}</span>
              <span className={styles.levelTrack}>
                <span className={styles.levelBar} style={{ width: `${(l.count / maxLevel) * 100}%` }} />
              </span>
              <span className={styles.levelValue}>{num(l.count)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

// ── Pesanan terbaru ─────────────────────────────────────────────────────────
export function RecentOrders({ data }: { data: OverviewData }) {
  return (
    <Card title="Pesanan terbaru" subtitle={`${data.ordersToProcess} pesanan perlu diproses`} action={<CardLink href="/admin/orders">Semua order</CardLink>}>
      <MobileCardList label="Pesanan terbaru">
        {data.recentOrders.map((o) => (
          <MobileCard
            key={o.code}
            href={`/admin/orders?order=${o.code}`}
            title={
              <>
                <span className={styles.cardCode}>#{o.code}</span>
                <span className={styles.personName}>{o.customer}</span>
                <span className={styles.personMeta}>{o.items}</span>
              </>
            }
            aside={<span className={styles.strong}>{formatRupiahPlain(o.total)}</span>}
            meta={[
              { label: "Bayar", value: <PaymentBadge status={o.payment} /> },
              { label: "Pengiriman", value: <OrderStatusBadge status={o.status} /> },
            ]}
          />
        ))}
      </MobileCardList>
      <div className={cx(styles.tableWrap, desktopOnlyClass)}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer &amp; produk</th>
              <th>Total</th>
              <th>Bayar</th>
              <th>Pengiriman</th>
            </tr>
          </thead>
          <tbody>
            {data.recentOrders.map((o) => (
              <tr key={o.code}>
                <td className={styles.code}>
                  <Link href={`/admin/orders?order=${o.code}`} className={styles.orderLink}>
                    #{o.code}
                  </Link>
                </td>
                <td>
                  <span className={styles.personName}>{o.customer}</span>
                  <span className={styles.personMeta}>{o.items}</span>
                </td>
                <td className={styles.strong}>{formatRupiahPlain(o.total)}</td>
                <td>
                  <PaymentBadge status={o.payment} />
                </td>
                <td>
                  <OrderStatusBadge status={o.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Produk terlaris ─────────────────────────────────────────────────────────
export function TopProducts({ data, monthLabel }: { data: OverviewData; monthLabel: string }) {
  return (
    <Card title="Produk terlaris" subtitle={monthLabel}>
      <ol className={styles.products}>
        {data.topProducts.map((p, i) => (
          <li key={p.name}>
            <span className={styles.rank}>{i + 1}</span>
            <span className={styles.thumb}>
              <Image src={p.image} alt="" fill sizes="44px" />
            </span>
            <span className={styles.productText}>
              <span className={styles.personName}>{p.name}</span>
              <span className={styles.personMeta}>{p.sold} terjual</span>
            </span>
            <span className={styles.strong}>{formatRupiahShort(p.revenue)}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
