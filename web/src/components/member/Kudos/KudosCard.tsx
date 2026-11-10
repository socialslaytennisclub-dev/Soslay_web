import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { formatAngka } from "@/lib/format";
import { KUDOS_GROUP_LABEL, topKudos, type KudosGroup, type MemberKudos } from "@/lib/kudos";
import { cx } from "@/lib/cx";
import styles from "../SessionDetail/Kudos.module.css";

/** Kartu Kudos di profil (BR-23 · K-8): total, jumlah pemberi, 3 kategori teratas (seri → terbaru diterima). */
export function KudosCard({ kudos }: { kudos: MemberKudos }) {
  const top = topKudos(kudos);
  return (
    <section className={styles.card} aria-labelledby="kudos-card-title">
      <header className={styles.cardHead}>
        <div>
          <h2 id="kudos-card-title">Kudos</h2>
          <p className={styles.muted}>Kekuatan kamu menurut teman main — anonim, dari sesi yang sudah selesai.</p>
        </div>
        {kudos.total > 0 && (
          <Link href="/akun/kudos" className={styles.link}>
            Lihat semua
            <ChevronRight size={14} aria-hidden />
          </Link>
        )}
      </header>
      <div className={styles.stats}>
        <div>
          <strong>{formatAngka(kudos.total)}</strong>
          <span>total kudos</span>
        </div>
        <div>
          <strong>{formatAngka(kudos.uniqueGivers)}</strong>
          <span>orang memberi</span>
        </div>
      </div>
      {top.length ? (
        <p className={styles.top} aria-label="3 kudos teratas">
          {top.map((c) => (
            <span key={c.key} className={styles.chip}>
              <Sparkles size={12} aria-hidden />
              {c.label} {formatAngka(c.count)}
            </span>
          ))}
        </p>
      ) : (
        <p className={styles.muted}>Belum ada kudos. Ikut sesi & kasih kudos ke teman main — mereka juga bisa memberimu kudos.</p>
      )}
    </section>
  );
}

/** Halaman detail: semua kategori per grup (Skill, Sikap); kategori bernilai 0 redup. */
export function KudosDetail({ kudos }: { kudos: MemberKudos }) {
  return (
    <section className={styles.card} aria-labelledby="kudos-detail-title">
      <header className={styles.cardHead}>
        <div>
          <h2 id="kudos-detail-title">Semua kudos</h2>
          <p className={styles.muted}>
            {formatAngka(kudos.total)} kudos dari {formatAngka(kudos.uniqueGivers)} orang · nama pemberi tidak ditampilkan.
          </p>
        </div>
      </header>
      {(["skill", "attitude"] as KudosGroup[]).map((group) => (
        <div key={group} className={styles.detailGroup}>
          <h3>{KUDOS_GROUP_LABEL[group]}</h3>
          <ul className={styles.grid}>
            {kudos.categories
              .filter((c) => c.group === group)
              .map((c) => (
                <li key={c.key} className={cx(c.count === 0 && styles.zero)}>
                  <span>{c.label}</span>
                  <strong>{formatAngka(c.count)}</strong>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
