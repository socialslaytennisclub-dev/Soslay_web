import { Container } from "@/components/ui";
import { cx } from "@/lib/cx";
import styles from "./MemberSkeleton.module.css";

/**
 * Kerangka loading portal member (loading.tsx) — pola sama dengan AdminSkeleton: blok indigo pucat dengan
 * kilau lewat. Tampil seketika saat pindah halaman / tab, data menyusul.
 *  - tabs   : header profil + tab + daftar (masuk /akun dari luar)
 *  - list   : isi tab (chip filter, kartu ringkas, baris avatar)
 *  - detail : halaman sesi (judul, tab, kolom kartu)
 *  - trip   : halaman trip (hero + kartu paket + daftar rundown)
 */
type Variant = "tabs" | "list" | "detail" | "trip";

const Bone = ({ w, h = 12, round, className }: { w?: string | number; h?: number; round?: boolean; className?: string }) => (
  <span className={cx(styles.bone, className)} style={{ width: w, height: h, borderRadius: round ? 999 : undefined }} />
);

function Rows({ count = 7 }: { count?: number }) {
  return (
    <div className={styles.card}>
      <div className={styles.fields}>
        <Bone h={36} className={styles.wide} />
        <Bone h={36} />
        <Bone h={36} />
        <Bone h={36} />
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.row}>
          <Bone w={40} h={40} round />
          <span className={styles.lines}>
            <Bone w={`${52 + ((i * 17) % 30)}%`} h={12} />
            <Bone w={`${30 + ((i * 23) % 25)}%`} h={9} />
          </span>
          <Bone w={44} h={22} round className={styles.pill} />
        </div>
      ))}
    </div>
  );
}

function List() {
  return (
    <>
      <div className={styles.chips}>
        <Bone w={92} h={30} round />
        <Bone w={80} h={30} round />
        <Bone w={76} h={30} round />
        <Bone w={104} h={30} round />
      </div>
      <Rows />
    </>
  );
}

export function MemberSkeleton({ variant = "list" }: { variant?: Variant }) {
  if (variant === "trip") {
    return (
      <div aria-busy="true" aria-label="Memuat trip">
        <span className={cx(styles.bone, styles.hero)} />
        <Container className={styles.stack}>
          <div className={styles.card}>
            <Bone w={90} />
            <Bone w="55%" h={20} />
            <Bone w="80%" />
            <div className={styles.split}>
              <Bone w="70%" h={18} />
              <Bone w="70%" h={18} />
            </div>
            <Bone w="100%" h={44} round />
          </div>
          <List />
        </Container>
      </div>
    );
  }
  if (variant === "detail") {
    return (
      <div aria-busy="true" aria-label="Memuat sesi">
        <div className={styles.head}>
          <Container className={styles.stack}>
            <Bone w={160} h={10} />
            <Bone w="45%" h={28} />
            <Bone w="35%" />
            <div className={styles.tabs}>
              {[48, 64, 40, 92, 56].map((w) => (
                <Bone key={w} w={w} h={12} />
              ))}
            </div>
          </Container>
        </div>
        <Container className={styles.columns}>
          <div className={styles.stack}>
            <div className={cx(styles.card, styles.tall)} />
            <Rows count={4} />
          </div>
          <div className={styles.stack}>
            <div className={cx(styles.card, styles.mid)} />
            <div className={cx(styles.card, styles.mid)} />
          </div>
        </Container>
      </div>
    );
  }
  return (
    <div aria-busy="true" aria-label="Memuat">
      {variant === "tabs" && (
        <div className={styles.head}>
          <Container className={styles.profile}>
            <Bone w={96} h={96} round />
            <span className={styles.lines}>
              <Bone w="40%" h={28} />
              <Bone w="25%" />
              <Bone w={110} h={22} round />
            </span>
          </Container>
          <Container className={styles.tabs}>
            {[84, 70, 104, 60].map((w) => (
              <Bone key={w} w={w} h={12} />
            ))}
          </Container>
        </div>
      )}
      <Container className={cx(styles.stack, styles.section)}>
        <List />
      </Container>
    </div>
  );
}
