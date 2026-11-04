import Link from "next/link";
import { cx } from "@/lib/cx";
import { jt, MONTHS_SHORT, rpShort } from "@/lib/finance/format";
import styles from "./Finance.module.css";

const INDIGO = "var(--color-indigo-600)";
const LIGHT = "var(--color-indigo-150, #c9cbff)";
const NAVY = "var(--color-navy-900)";

/** Skala sumbu Y yang bulat (kelipatan 50 jt / 100 jt). */
function niceMax(v: number) {
  if (v <= 0) return 1_000_000;
  const step = v > 300_000_000 ? 100_000_000 : v > 60_000_000 ? 50_000_000 : v > 10_000_000 ? 10_000_000 : 1_000_000;
  return Math.ceil(v / step) * step;
}

/** 12a — Pendapatan vs pengeluaran 6 bulan, laba bersih di bawah tiap bulan. */
export function TrendChart({ months, current }: { months: { ym: string; revenue: number; expense: number; net: number }[]; current: string }) {
  const W = 680;
  const H = 210;
  const left = 44;
  const bottom = 26;
  const max = niceMax(Math.max(...months.map((m) => Math.max(m.revenue, m.expense))));
  const y = (v: number) => H - bottom - (Math.max(v, 0) / max) * (H - bottom - 10);
  const slot = (W - left) / months.length;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label="Pendapatan vs pengeluaran 6 bulan terakhir">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={left} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--color-indigo-border)" />
            <text x={0} y={y(max * f) + 4}>
              {f === 0 ? "0" : jt(max * f)}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx0 = left + slot * i + slot / 2;
          const bw = Math.min(28, slot / 4);
          return (
            <g key={m.ym}>
              <rect x={cx0 - bw - 2} y={y(m.revenue)} width={bw} height={H - bottom - y(m.revenue)} rx={4} fill={m.ym === current ? NAVY : INDIGO}>
                <title>{`Pendapatan ${rpShort(m.revenue)}`}</title>
              </rect>
              <rect x={cx0 + 2} y={y(m.expense)} width={bw} height={H - bottom - y(m.expense)} rx={4} fill={LIGHT}>
                <title>{`Pengeluaran ${rpShort(m.expense)}`}</title>
              </rect>
              <text x={cx0} y={H - 6} textAnchor="middle" style={m.ym === current ? { fill: NAVY, fontWeight: 600 } : undefined}>
                {MONTHS_SHORT[Number(m.ym.slice(5)) - 1]}
              </text>
            </g>
          );
        })}
      </svg>
      <div className={styles.chartPills} style={{ gridTemplateColumns: `${(left / W) * 100}% repeat(${months.length}, 1fr)` }}>
        <span />
        {months.map((m) => (
          <span key={m.ym} className={cx(styles.chartPill, m.net < 0 && styles.chartPillNeg)} style={m.ym === current ? { background: "var(--color-lime-500)" } : undefined}>
            {m.net < 0 ? "−" : "+"}
            {(Math.abs(m.net) / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt
          </span>
        ))}
      </div>
    </div>
  );
}

/** 12f — Tren bulanan: batang pendapatan & biaya, garis laba bersih tahun ini + tahun lalu (putus-putus). */
export function YearChart({ months, compare, hrefFor }: { months: { ym: string; revenue: number; cost: number; net: number; prevNet: number | null; started: boolean }[]; compare: boolean; hrefFor: (ym: string) => string }) {
  const W = 1040;
  const H = 240;
  const left = 46;
  const bottom = 26;
  const max = niceMax(Math.max(1, ...months.map((m) => Math.max(m.revenue, m.cost))));
  const y = (v: number) => H - bottom - (Math.max(v, 0) / max) * (H - bottom - 12);
  const slot = (W - left) / 12;
  const cx0 = (i: number) => left + slot * i + slot / 2;
  const started = months.filter((m) => m.started);
  const line = (pts: [number, number][]) => pts.map(([x, yy], i) => `${i ? "L" : "M"}${x},${yy}`).join(" ");
  const last = started.at(-1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label="Tren bulanan pendapatan, biaya dan laba bersih">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={left} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--color-indigo-border)" />
          <text x={0} y={y(max * f) + 4}>
            {f === 0 ? "0" : jt(max * f)}
          </text>
        </g>
      ))}
      {months.map((m, i) => {
        const bw = Math.min(26, slot / 3.4);
        return (
          <Link key={m.ym} href={hrefFor(m.ym)} aria-label={`Laba rugi ${m.ym}`}>
            {m.started ? (
              <>
                <rect x={cx0(i) - bw - 2} y={y(m.revenue)} width={bw} height={H - bottom - y(m.revenue)} rx={4} fill={INDIGO}>
                  <title>{`Pendapatan ${rpShort(m.revenue)}`}</title>
                </rect>
                <rect x={cx0(i) + 2} y={y(m.cost)} width={bw} height={H - bottom - y(m.cost)} rx={4} fill={LIGHT}>
                  <title>{`Biaya ${rpShort(m.cost)}`}</title>
                </rect>
              </>
            ) : (
              <rect x={cx0(i) - slot / 3} y={y(max * 0.55)} width={(slot * 2) / 3} height={H - bottom - y(max * 0.55)} fill="none" stroke="var(--color-indigo-200)" strokeDasharray="4 4" />
            )}
            <text x={cx0(i)} y={H - 6} textAnchor="middle" style={m.started ? { fill: NAVY } : undefined}>
              {MONTHS_SHORT[i]}
            </text>
          </Link>
        );
      })}
      {compare && (
        <path
          d={line(months.flatMap((m, i) => (m.started && m.prevNet !== null ? [[cx0(i), y(m.prevNet)] as [number, number]] : [])))}
          fill="none"
          stroke="var(--color-indigo-500)"
          strokeWidth={2}
          strokeDasharray="6 5"
        />
      )}
      <path d={line(started.map((m, i) => [cx0(i), y(m.net)]))} fill="none" stroke={NAVY} strokeWidth={2.5} />
      {started.map((m, i) => (
        <circle key={m.ym} cx={cx0(i)} cy={y(m.net)} r={4} fill={m === last ? "var(--color-lime-500)" : "white"} stroke={NAVY} strokeWidth={2}>
          <title>{`Laba bersih ${rpShort(m.net)}`}</title>
        </circle>
      ))}
    </svg>
  );
}
