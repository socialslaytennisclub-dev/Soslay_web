import type { ElementType, ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./Container.module.css";

type ContainerProps = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
};

/** Lebar konten 1440 dengan gutter responsif (64px di desktop, sesuai Figma). */
export function Container({ as: Component = "div", className, children }: ContainerProps) {
  return <Component className={cx(styles.container, className)}>{children}</Component>;
}
