"use client";

import { useEffect, useRef } from "react";

/**
 * Geser kontainer horizontal dengan drag mouse (desktop).
 * Sentuhan (touch) tetap memakai scroll native. Klik dibatalkan jika pengguna sedang drag.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startScroll = 0;
    let isDown = false;
    let moved = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      isDown = true;
      moved = false;
      startX = event.clientX;
      startScroll = el.scrollLeft;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!isDown) return;
      const delta = event.clientX - startX;
      if (!moved && Math.abs(delta) > 5) {
        moved = true;
        el.setPointerCapture(event.pointerId);
        el.dataset.dragging = "true";
      }
      if (moved) el.scrollLeft = startScroll - delta;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!isDown) return;
      isDown = false;
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
      delete el.dataset.dragging;
    };

    // Batalkan klik link setelah drag supaya tidak membuka post secara tak sengaja.
    const onClickCapture = (event: MouseEvent) => {
      if (moved) {
        event.preventDefault();
        event.stopPropagation();
        moved = false;
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("click", onClickCapture, true);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  return ref;
}
