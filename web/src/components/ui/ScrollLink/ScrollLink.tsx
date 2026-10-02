"use client";

import type { ReactNode } from "react";
import { scrollToElement } from "@/animations";

type ScrollLinkProps = {
  /** Anchor di halaman yang sama, mis. "#koleksi". */
  href: `#${string}`;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
};

/** Link anchor yang scroll halus — lewat ScrollSmoother bila aktif (anchor native meleset di dalamnya). */
export function ScrollLink({ href, className, children, ...rest }: ScrollLinkProps) {
  return (
    <a
      href={href}
      className={className}
      {...rest}
      onClick={(event) => {
        const target = document.querySelector<HTMLElement>(href);
        if (!target) return;
        event.preventDefault();
        scrollToElement(target, 0);
      }}
    >
      {children}
    </a>
  );
}
