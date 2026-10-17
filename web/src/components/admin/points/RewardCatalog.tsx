import Image from "next/image";
import Link from "next/link";
import { formatPoints, REWARD_CATEGORY_LABEL, TIER_LABEL } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import type { AdminReward } from "@/server/admin/types";
import ordersStyles from "../orders/Orders.module.css";
import { AdminIcon } from "../ui/AdminIcon";
import { Badge, desktopOnlyClass, MobileCard, MobileCardList } from "../ui/AdminUI";
import styles from "./Points.module.css";

export function RewardThumb({ image, large }: { image: string | null; large?: boolean }) {
  return (
    <span className={cx(styles.thumb, large && styles.thumbLarge)}>
      {image ? <Image src={image} alt="" fill sizes={large ? "340px" : "40px"} /> : <AdminIcon name="package" size={large ? 32 : 18} />}
    </span>
  );
}

function stockLabel(r: AdminReward) {
  if (r.stock === null) return <span className={ordersStyles.muted}>Tanpa batas</span>;
  return <span className={cx(ordersStyles.strong, r.stock <= 3 && styles.stockLow)}>{r.stock === 0 ? "Habis" : `${r.stock} tersisa`}</span>;
}

/** Katalog reward (Figma 316:2). `hrefFor` membuka editor lewat ?reward=. */
export function RewardCatalog({ rewards, selected, hrefFor }: { rewards: AdminReward[]; selected?: string; hrefFor: (id: string) => string }) {
  if (rewards.length === 0) return <p className={ordersStyles.empty}>Belum ada reward. Tambahkan reward pertama untuk member.</p>;

  const identity = (r: AdminReward) => (
    <span className={ordersStyles.customer}>
      <RewardThumb image={r.image} />
      <span className={ordersStyles.customerText}>
        <span className={ordersStyles.strong}>{r.name}</span>
        <span className={ordersStyles.muted}>
          {REWARD_CATEGORY_LABEL[r.category]}
          {r.minTier !== "basic" && ` · ${TIER_LABEL[r.minTier]}+`}
          {!r.active && " · Disembunyikan"}
        </span>
      </span>
    </span>
  );

  return (
    <>
      <div className={ordersStyles.mobileList}>
        <MobileCardList label="Katalog reward">
          {rewards.map((r) => (
            <MobileCard
              key={r.id}
              href={hrefFor(r.id)}
              selected={r.id === selected}
              title={identity(r)}
              aside={<span className={styles.ptsPill}>{formatPoints(r.pointsCost)}</span>}
              meta={[
                { label: "Stok", value: stockLabel(r) },
                { label: "Ditukar", value: <span className={ordersStyles.strong}>{r.redeemed}×</span> },
              ]}
            />
          ))}
        </MobileCardList>
      </div>

      <div className={cx(ordersStyles.tableWrap, desktopOnlyClass)}>
        <table className={ordersStyles.table}>
          <thead>
            <tr>
              <th>Reward</th>
              <th>Kategori</th>
              <th>Harga</th>
              <th>Stok</th>
              <th className={styles.right}>Ditukar</th>
            </tr>
          </thead>
          <tbody>
            {rewards.map((r) => (
              <tr key={r.id} className={cx(r.id === selected && ordersStyles.rowSelected, !r.active && styles.inactiveRow)}>
                <td>
                  <Link href={hrefFor(r.id)} scroll={false} className={ordersStyles.rowLink} aria-current={r.id === selected ? "true" : undefined}>
                    {identity(r)}
                  </Link>
                </td>
                <td>
                  <Badge tone={r.category === "session" ? "indigo" : r.category === "experience" ? "pink" : "neutral"}>{REWARD_CATEGORY_LABEL[r.category]}</Badge>
                </td>
                <td>
                  <span className={styles.ptsPill}>{formatPoints(r.pointsCost)}</span>
                </td>
                <td>{stockLabel(r)}</td>
                <td className={cx(ordersStyles.strong, styles.right)}>{r.redeemed}×</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
