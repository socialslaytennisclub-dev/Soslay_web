"use client";

import { useRef, useState } from "react";
import { cx } from "@/lib/cx";
import type { ShotKind } from "./engine";
import styles from "./PadControls.module.css";

const SHOTS: { kind: ShotKind; label: string; hint: string }[] = [
  { kind: "lob", label: "Lob", hint: "High & deep" },
  { kind: "flat", label: "Hit", hint: "Fast" },
  { kind: "drop", label: "Drop", hint: "Short" },
];

type PadControlsProps = {
  onMove: (mx: number, my: number) => void;
  onShot: (kind: ShotKind) => void;
  /** `overlay` = menumpang di atas lapangan (HP sebagai layar sekaligus controller). */
  variant?: "full" | "overlay";
  /** false = hanya tombol pukulan; geraknya memakai <MoveZone> (geser di separuh kiri layar). */
  stick?: boolean;
};

/** Kontrol sentuh Slay Tennis: joystick untuk bergerak / membidik + tiga tombol pukulan. */
export function PadControls({
  onMove,
  onShot,
  variant = "full",
  stick: showStick = true,
}: PadControlsProps) {
  const stick = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [pressed, setPressed] = useState<ShotKind | null>(null);

  const track = (event: React.PointerEvent) => {
    const el = stick.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const radius = box.width / 2;
    let x = (event.clientX - (box.left + radius)) / (radius * 0.7);
    let y = (event.clientY - (box.top + radius)) / (radius * 0.7);
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    setKnob({ x, y });
    // Layar: bawah = +y; permainan: maju ke net = +my.
    onMove(Math.abs(x) < 0.18 ? 0 : x, Math.abs(y) < 0.18 ? 0 : -y);
  };

  const release = (event: React.PointerEvent) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };

  const hit = (kind: ShotKind) => {
    setPressed(kind);
    window.setTimeout(
      () => setPressed((current) => (current === kind ? null : current)),
      140,
    );
    try {
      navigator.vibrate?.(18);
    } catch {
      // Getar tidak didukung / diblokir.
    }
    onShot(kind);
  };

  return (
    <div
      className={cx(
        styles.pad,
        styles[variant],
        !showStick && styles.shotsOnly,
      )}
    >
      {showStick && (
        <div
          ref={stick}
          className={styles.stick}
          onPointerDown={(event) => {
            pointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            track(event);
          }}
          onPointerMove={(event) =>
            pointer.current === event.pointerId && track(event)
          }
          onPointerUp={release}
          onPointerCancel={release}
          role="group"
          aria-label="Move joystick"
        >
          <span
            className={styles.knob}
            style={{ transform: `translate(${knob.x * 32}%, ${knob.y * 32}%)` }}
          />
        </div>
      )}

      <div className={styles.shots}>
        {SHOTS.map((shot) => (
          <button
            key={shot.kind}
            type="button"
            className={cx(
              styles.shot,
              styles[shot.kind],
              pressed === shot.kind && styles.shotPressed,
            )}
            onPointerDown={(event) => {
              event.preventDefault();
              hit(shot.kind);
            }}
            // Keyboard / pembaca layar: pointerdown tidak terpicu.
            onClick={(event) => event.detail === 0 && hit(shot.kind)}
          >
            <span className={styles.shotLabel}>{shot.label}</span>
            <span className={styles.shotHint}>{shot.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const ZONE_RADIUS = 56;

/**
 * Joystick mengambang untuk main langsung di HP: sentuh di mana saja di separuh kiri lapangan lalu
 * geser — titik sentuh pertama menjadi pusat joystick.
 */
export function MoveZone({
  onMove,
}: {
  onMove: (mx: number, my: number) => void;
}) {
  const pointer = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const [stick, setStick] = useState<{
    x: number;
    y: number;
    dx: number;
    dy: number;
  } | null>(null);

  const track = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    let dx = (event.clientX - origin.current.x) / ZONE_RADIUS;
    let dy = (event.clientY - origin.current.y) / ZONE_RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    setStick({
      x: origin.current.x - box.left,
      y: origin.current.y - box.top,
      dx,
      dy,
    });
    onMove(Math.abs(dx) < 0.2 ? 0 : dx, Math.abs(dy) < 0.2 ? 0 : -dy);
  };
  const release = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    setStick(null);
    onMove(0, 0);
  };

  return (
    <div
      className={styles.zone}
      onPointerDown={(event) => {
        if (pointer.current !== null) return;
        pointer.current = event.pointerId;
        origin.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
        track(event);
      }}
      onPointerMove={(event) =>
        pointer.current === event.pointerId && track(event)
      }
      onPointerUp={release}
      onPointerCancel={release}
      role="group"
      aria-label="Drag to move"
    >
      {stick ? (
        <span
          className={styles.zoneRing}
          style={{ left: stick.x, top: stick.y }}
        >
          <span
            className={styles.zoneKnob}
            style={{
              transform: `translate(${stick.dx * ZONE_RADIUS * 0.6}px, ${stick.dy * ZONE_RADIUS * 0.6}px)`,
            }}
          />
        </span>
      ) : (
        <span className={styles.zoneHint}>Drag here to move</span>
      )}
    </div>
  );
}
