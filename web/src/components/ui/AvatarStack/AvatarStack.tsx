import { cx } from "@/lib/cx";
import styles from "./AvatarStack.module.css";

export type AvatarStackItem = {
  /** Label untuk screen reader, mis. "@dimasf". */
  label: string;
  initial: string;
  tone: "lime" | "pink" | "indigo";
};

type AvatarStackProps = {
  items: AvatarStackItem[];
  size?: "sm" | "md";
  className?: string;
};

/** Figma: avatar inisial bertumpuk (galeri venue, lightbox). Warna: lime / pink / indigo. */
export function AvatarStack({ items, size = "md", className }: AvatarStackProps) {
  return (
    <ul className={cx(styles.stack, styles[size], className)} aria-label={`Di foto: ${items.map((i) => i.label).join(", ")}`}>
      {items.map((item) => (
        <li key={item.label} className={cx(styles.avatar, styles[item.tone])} aria-hidden>
          {item.initial}
        </li>
      ))}
    </ul>
  );
}
