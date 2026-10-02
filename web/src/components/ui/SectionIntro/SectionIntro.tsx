import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Text, type TextTone, type TextVariant } from "../Text/Text";
import styles from "./SectionIntro.module.css";

type SectionIntroProps = {
  title: ReactNode;
  description?: ReactNode;
  titleVariant?: Extract<TextVariant, "heading-52" | "heading-42">;
  titleTone?: TextTone;
  descriptionTone?: TextTone;
  align?: "start" | "center";
  /** id judul, dipakai sebagai aria-labelledby section. */
  id?: string;
  className?: string;
};

/** Pola judul + deskripsi yang berulang di setiap section homepage. */
export function SectionIntro({
  title,
  description,
  titleVariant = "heading-42",
  titleTone = "primary",
  descriptionTone = "primary",
  align = "start",
  id,
  className,
}: SectionIntroProps) {
  return (
    <div className={cx(styles.intro, styles[align], className)}>
      <Text as="h2" id={id} variant={titleVariant} tone={titleTone} align={align} data-anim="split">
        {title}
      </Text>
      {description && (
        <Text variant="body-16" tone={descriptionTone} align={align} muted data-anim="fade-up">
          {description}
        </Text>
      )}
    </div>
  );
}
