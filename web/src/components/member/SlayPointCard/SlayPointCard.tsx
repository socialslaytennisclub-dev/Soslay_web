import { Chip } from "@/components/ui";
import type { MemberDashboard } from "@/content/member";
import { formatAngka } from "@/lib/format";
import { SummaryCard, SummaryProgress } from "../SummaryCard/SummaryCard";
import styles from "./SlayPointCard.module.css";

/** Figma 25:2699 — saldo poin, progress ke tier berikutnya, tombol Tukar. */
export function SlayPointCard({ data }: { data: MemberDashboard["points"] }) {
  const { balance, earned, earnedThisWeek, nextTier, redeemCopy } = data;
  // Tier naik dari poin kumulatif (lifetime earned), bukan saldo yang bisa berkurang saat ditukar.
  const remaining = nextTier ? Math.max(nextTier.threshold - earned, 0) : 0;

  return (
    <SummaryCard
      title="Slay Point"
      tone="lime"
      badge={<Chip tone="navy">+{formatAngka(earnedThisWeek)} minggu ini</Chip>}
      value={formatAngka(balance)}
      unit="pts"
    >
      <SummaryProgress
        label={nextTier ? `${formatAngka(remaining)} pts lagi ke ${nextTier.name}` : "Tier tertinggi tercapai"}
        valueLabel={nextTier ? `${formatAngka(earned)}/${formatAngka(nextTier.threshold)}` : formatAngka(earned)}
        value={nextTier ? earned : 1}
        max={nextTier ? nextTier.threshold : 1}
        tone="navy"
      />
      <div className={styles.footer}>
        <p className={styles.copy}>{redeemCopy}</p>
        {/* Katalog penukaran belum ada (PRD: Settings → Membership & poin) */}
        <button type="button" className={styles.redeem} disabled title="Segera hadir">
          Tukar
        </button>
      </div>
    </SummaryCard>
  );
}
