import { Chip } from "@/components/ui";
import { slayPoint } from "@/content/member";
import { formatAngka } from "@/lib/format";
import { SummaryCard, SummaryProgress } from "../SummaryCard/SummaryCard";
import styles from "./SlayPointCard.module.css";

/** Figma 25:2699 — saldo poin, progress ke tier berikutnya, tombol Tukar. */
export function SlayPointCard() {
  const { balance, earnedThisWeek, nextTier, redeemCopy } = slayPoint;
  const remaining = Math.max(nextTier.threshold - balance, 0);

  return (
    <SummaryCard
      title="Slay Point"
      tone="lime"
      badge={<Chip tone="navy">+{formatAngka(earnedThisWeek)} minggu ini</Chip>}
      value={formatAngka(balance)}
      unit="pts"
    >
      <SummaryProgress
        label={`${formatAngka(remaining)} pts lagi ke ${nextTier.name}`}
        valueLabel={`${formatAngka(balance)}/${formatAngka(nextTier.threshold)}`}
        value={balance}
        max={nextTier.threshold}
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
