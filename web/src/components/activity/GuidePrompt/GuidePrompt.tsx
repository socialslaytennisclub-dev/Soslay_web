import Link from "next/link";
import { Icon } from "@/components/ui";
import { guidePrompt } from "@/content/guides";
import styles from "./GuidePrompt.module.css";

/** Pill kecil di samping filter Activity → Participant Guide. Sengaja ringan supaya tidak bersaing dengan filter & kartu sesi. */
export function GuidePrompt() {
  return (
    <p className={styles.prompt}>
      <span className={styles.question}>{guidePrompt.question}</span>
      <Link href={guidePrompt.href} className={styles.link}>
        {guidePrompt.label}
        <Icon name="arrow-up-right-bold" size={14} className={styles.arrow} />
      </Link>
    </p>
  );
}
