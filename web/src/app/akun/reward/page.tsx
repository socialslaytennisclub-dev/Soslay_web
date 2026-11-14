import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RewardShop } from "@/components/member/Rewards/RewardShop";
import styles from "@/components/checkout/Checkout.module.css";
import { getRewardPage } from "@/server/member/rewards";
import { getShipContext } from "@/server/shop/orders";

export const metadata: Metadata = { title: "Tukar Slay Point — SOSLAY" };

/** Tukar Slay Point: katalog reward, pengiriman (Produk / Merch) & kode voucher (Voucher / Sesi / Pengalaman). */
export default async function RewardPage() {
  const [page, ship] = await Promise.all([getRewardPage(), getShipContext()]);
  if (!page) redirect("/masuk?next=/akun/reward");
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link href="/akun" className={styles.back}>
          ‹ Dashboard
        </Link>
        <div className={styles.headRow}>
          <div>
            <h1 className={styles.title}>Tukar Slay Point</h1>
            <p className={styles.subtitle}>Tukar poin dengan merch, produk partner, sesi, voucher & pengalaman.</p>
          </div>
        </div>
      </header>
      <RewardShop page={page} ship={ship} />
    </div>
  );
}
