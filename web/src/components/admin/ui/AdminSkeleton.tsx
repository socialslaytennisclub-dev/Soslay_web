import { AdminTopbar } from "../shell/AdminTopbar";
import pageStyles from "@/app/admin/page.module.css";
import styles from "./AdminSkeleton.module.css";

type Variant = "dashboard" | "table" | "detail" | "form";

type AdminSkeletonProps = {
  breadcrumb: string;
  title: string;
  variant?: Variant;
};

const Bone = ({ w, h = 12, round }: { w?: string | number; h?: number; round?: boolean }) => (
  <span className={styles.bone} style={{ width: w, height: h, borderRadius: round ? 999 : undefined }} />
);

/**
 * Kerangka halaman admin untuk loading.tsx: topbar asli (judul langsung tampil) + blok shimmer
 * berbentuk konten. Dirender seketika saat pindah menu (di-prefetch), data menyusul.
 */
export function AdminSkeleton({ breadcrumb, title, variant = "table" }: AdminSkeletonProps) {
  return (
    <>
      <AdminTopbar breadcrumb={breadcrumb} title={title} />
      <div className={pageStyles.content} aria-busy="true" aria-label={`Memuat ${title}`}>
        {variant === "dashboard" && <Dashboard />}
        {variant === "table" && <Table />}
        {variant === "detail" && <Detail />}
        {variant === "form" && <Form />}
      </div>
    </>
  );
}

function Dashboard() {
  return (
    <>
      <div className={styles.row}>
        <div className={styles.stack}>
          <Bone w={220} h={20} />
          <Bone w={300} />
        </div>
        <Bone w={150} h={40} round />
      </div>
      <div className={styles.stats}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={styles.card}>
            <Bone w="45%" />
            <Bone w="60%" h={28} />
            <Bone w="35%" h={10} />
          </div>
        ))}
      </div>
      <div className={styles.columns}>
        <div className={styles.card}>
          <Bone w={180} h={16} />
          <span className={styles.chart} />
        </div>
        <div className={styles.card}>
          <Bone w={140} h={16} />
          <Rows count={5} />
        </div>
      </div>
    </>
  );
}

function Table() {
  return (
    <>
      <div className={styles.row}>
        <div className={styles.chips}>
          {[96, 84, 78, 104].map((w, i) => (
            <Bone key={i} w={w} h={36} round />
          ))}
        </div>
        <Bone w={150} h={40} round />
      </div>
      <div className={styles.card}>
        <div className={styles.chips}>
          <Bone w={280} h={40} />
          {[120, 120, 120].map((w, i) => (
            <Bone key={i} w={w} h={40} />
          ))}
        </div>
        <Rows count={8} />
      </div>
    </>
  );
}

function Detail() {
  return (
    <>
      <div className={styles.card}>
        <div className={styles.profile}>
          <Bone w={72} h={72} round />
          <div className={styles.stack}>
            <Bone w={220} h={20} />
            <Bone w={160} />
            <Bone w={120} h={22} round />
          </div>
        </div>
      </div>
      <div className={styles.columns}>
        <div className={styles.card}>
          <Bone w={160} h={16} />
          <Rows count={5} />
        </div>
        <div className={styles.card}>
          <Bone w={120} h={16} />
          <Fields count={4} />
        </div>
      </div>
    </>
  );
}

function Form() {
  return (
    <div className={styles.card}>
      <Bone w={200} h={18} />
      <div className={styles.formGrid}>
        <Fields count={6} />
      </div>
      <span className={styles.textarea} />
      <div className={styles.row}>
        <span />
        <Bone w={160} h={44} round />
      </div>
    </div>
  );
}

function Rows({ count }: { count: number }) {
  return (
    <div className={styles.rows}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.tableRow}>
          <Bone w={36} h={36} round />
          <div className={styles.stack}>
            <Bone w={`${55 + ((i * 17) % 30)}%`} />
            <Bone w={`${35 + ((i * 11) % 25)}%`} h={10} />
          </div>
          <Bone w={70} h={22} round />
        </div>
      ))}
    </div>
  );
}

function Fields({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.stack}>
          <Bone w={90} h={10} />
          <Bone w="100%" h={44} />
        </div>
      ))}
    </>
  );
}
