"use client";

import { useEffect, useRef, useState } from "react";

/** True setelah elemen pertama kali terlihat di viewport (sekali saja). */
export function useInView<T extends Element>(options: IntersectionObserverInit = { threshold: 0.3 }) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const { root, rootMargin, threshold } = options;

  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { root, rootMargin, threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, root, rootMargin, threshold]);

  return { ref, inView };
}
