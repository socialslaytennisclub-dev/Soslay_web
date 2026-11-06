import { Container } from "@/components/ui";
import { Navbar } from "../Navbar/Navbar";
import bones from "@/components/member/MemberSkeleton/MemberSkeleton.module.css";
import { cx } from "@/lib/cx";
import styles from "./PageSkeleton.module.css";

/**
 * Kerangka loading halaman publik (loading.tsx Activity, Venue, Shop): navbar + hero navy + chip &
 * kartu. Tampil seketika saat link diklik bila halaman belum siap, isi asli menyusul.
 */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <>
      <Navbar variant="overlay" />
      <main aria-busy="true" aria-label={label}>
        <section className={styles.hero}>
          <Container className={styles.heroInner}>
            <span className={cx(bones.bone, styles.dark)} style={{ width: 120, height: 14 }} />
            <span className={cx(bones.bone, styles.dark)} style={{ width: "min(560px, 90%)", height: 48 }} />
            <span className={cx(bones.bone, styles.dark)} style={{ width: "min(420px, 70%)", height: 16 }} />
          </Container>
        </section>
        <section className={styles.body}>
          <Container className={styles.bodyInner}>
            <div className={styles.chips}>
              {[64, 120, 132, 116].map((w, i) => (
                <span key={i} className={bones.bone} style={{ width: w, height: 36, borderRadius: 999 }} />
              ))}
            </div>
            <div className={styles.grid}>
              {Array.from({ length: 3 }, (_, i) => (
                <span key={i} className={cx(bones.bone, styles.card)} />
              ))}
            </div>
          </Container>
        </section>
      </main>
    </>
  );
}
