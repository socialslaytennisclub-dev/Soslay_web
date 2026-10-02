import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./Text.module.css";

/**
 * Text style mengikuti nama text style di Figma:
 * `Heading/52 Poppins ExtraBold` → variant "heading-52", dst.
 */
export type TextVariant =
  | "wordmark"
  | "heading-52"
  | "heading-48"
  | "heading-42"
  | "title-28"
  | "title-24"
  | "subtitle-20"
  | "subtitle-20-semibold"
  | "body-18"
  | "body-18-ui"
  | "body-16"
  | "body-16-bold"
  | "body-14"
  | "body-14-bold";

export type TextTone = "primary" | "secondary" | "accent" | "on-inverse" | "white" | "inherit";

type TextProps = Omit<HTMLAttributes<HTMLElement>, "className" | "children"> & {
  as?: ElementType;
  variant: TextVariant;
  tone?: TextTone;
  align?: "start" | "center" | "end";
  /** Figma sering memakai opacity 80% untuk body copy. */
  muted?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
};

export function Text({
  as: Component = "p",
  variant,
  tone = "inherit",
  align,
  muted,
  id,
  className,
  children,
  ...rest
}: TextProps) {
  return (
    <Component
      {...rest}
      id={id}
      className={cx(
        styles[variant],
        styles[`tone-${tone}`],
        align && styles[`align-${align}`],
        muted && styles.muted,
        className,
      )}
    >
      {children}
    </Component>
  );
}
