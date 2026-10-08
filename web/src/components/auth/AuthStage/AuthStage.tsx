import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { authBackground } from "@/content/auth";
import { blurProps } from "@/lib/image";
import styles from "./AuthStage.module.css";

type AuthStageProps = {
  id: string;
  title: string;
  description: string;
  /** Teks + link pindah halaman di bawah form ("Sudah punya akun? Masuk"). */
  switchTo: { prompt: string; label: string; href: string };
  children: ReactNode;
};

/**
 * Figma 25:1851 "stage": foto komunitas layar penuh + overlay/login,
 * kartu putih (radius 16, padding 32) di tengah berisi judul Title/36 + form.
 */
export function AuthStage({ id, title, description, switchTo, children }: AuthStageProps) {
  return (
    <section className={styles.stage} aria-labelledby={id}>
      <Image
        className={styles.photo}
        src={authBackground.src}
        alt={authBackground.alt}
        fill
        preload
        sizes="(min-width: 1200px) 186vw, 100vw"
        {...blurProps(authBackground.src)}
      />
      <span className={styles.overlay} aria-hidden />

      <div className={styles.card}>
        <header className={styles.header}>
          <h1 id={id} className={styles.title}>
            {title}
          </h1>
          <p className={styles.description}>{description}</p>
        </header>
        {children}
        <p className={styles.switch}>
          {switchTo.prompt}{" "}
          <Link href={switchTo.href} className={styles.switchLink}>
            {switchTo.label}
          </Link>
        </p>
      </div>
    </section>
  );
}
