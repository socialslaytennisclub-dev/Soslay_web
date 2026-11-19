"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Text } from "@/components/ui";
import { cx } from "@/lib/cx";
import { Court3D, type Palette } from "./court3d";
import { BONUSES, Game, START_LIVES, type BonusId } from "./engine";
import { Sound } from "./sound";
import styles from "./SlayRally.module.css";

type Phase = "intro" | "bonuses" | "countdown" | "playing" | "paused" | "over";

const BEST_KEY = "soslay-rally-best";

/** Token warna tiap bonus — dipakai lencana di layar bonus dan lencana 3D yang jatuh. */
const BONUS_TOKEN: Record<BonusId, string> = {
  net: "--color-indigo-200",
  multi: "--color-pink-400",
  smash: "--color-pink-500",
  big: "--color-lime-100",
  wide: "--color-lime-500",
  double: "--color-white",
};

function readBest(): number {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Canvas tidak bisa membaca var(--…), jadi nilai token diambil dari CSS saat mount. */
function readPalette(el: HTMLElement): Palette {
  const css = getComputedStyle(el);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    courtInner: token("--color-indigo-500"),
    brickBase: token("--color-blue-600"),
    courtTop: token("--color-indigo-700"),
    courtBottom: token("--color-navy-800"),
    line: token("--color-white"),
    ball: token("--color-lime-neon"),
    felt: token("--color-lime-400"),
    seam: token("--color-lime-50"),
    racket: token("--color-lime-500"),
    brick: token("--color-indigo-200"),
    seat: token("--color-indigo-500"),
    ink: token("--color-navy-900"),
    wall: token("--color-indigo-700"),
    ground: token("--color-navy-950"),
    font: css.fontFamily,
    bonus: Object.fromEntries(
      Object.entries(BONUS_TOKEN).map(([id, name]) => [id, token(name)]),
    ) as Record<BonusId, string>,
  };
}

/** Slay Rally — mini-game brick-breaker di lapangan tenis (halaman /game). */
export function SlayRally() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const courtRef = useRef<Court3D | null>(null);
  const soundRef = useRef<Sound | null>(null);
  const phaseRef = useRef<Phase>("intro");

  const [phase, setPhaseState] = useState<Phase>("intro");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(START_LIVES);
  const [level, setLevel] = useState(1);
  const [count, setCount] = useState(3);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState<{ id: BonusId; key: number } | null>(null);

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  // Mesin game + loop gambar.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setBest(readBest());
    const sound = new Sound();
    soundRef.current = sound;

    const palette = readPalette(canvas);
    let court: Court3D;
    try {
      court = new Court3D(canvas, palette);
    } catch {
      // WebGL tidak tersedia di perangkat ini.
      queueMicrotask(() => setUnsupported(true));
      return () => sound.dispose();
    }
    courtRef.current = court;

    const game = new Game({
      onScore: setScore,
      onLives: setLives,
      onLevel: setLevel,
      onBonus: (id) => setToast({ id, key: Date.now() }),
      onSound: (kind) => sound.play(kind),
      onGameOver: (finalScore) => {
        const previous = readBest();
        if (finalScore > previous) {
          try {
            window.localStorage.setItem(BEST_KEY, String(finalScore));
          } catch {
            // Penyimpanan diblokir (mode privat) — skor terbaik cukup untuk sesi ini.
          }
          setBest(finalScore);
          setNewBest(true);
        }
        setPhase("over");
      },
    });
    gameRef.current = game;

    const resize = () => {
      court.resize(
        canvas.clientWidth,
        canvas.clientHeight,
        Math.min(window.devicePixelRatio || 1, 2),
      );
      court.render(game, 0); // ganti ukuran mengosongkan buffer — langsung gambar ulang
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;
      const current = phaseRef.current;
      if (current === "playing") game.update(dt);
      // Di layar lain adegannya diam — gambar ulang hanya bila ada yang berubah (ukuran, font).
      if (current === "playing" || current === "countdown" || court.dirty)
        court.render(game, dt);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // Pindah tab saat bermain → jeda otomatis.
    const onHide = () => {
      sound.setSuspended(document.hidden);
      if (document.hidden && phaseRef.current === "playing") setPhase("paused");
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onHide);
      gameRef.current = null;
      courtRef.current = null;
      soundRef.current = null;
      court.dispose();
      sound.dispose();
    };
  }, [setPhase]);

  // Musik penuh saat bermain, diredam di layar lain, diam saat jeda.
  useEffect(() => {
    const level =
      phase === "playing" || phase === "countdown"
        ? 1
        : phase === "paused"
          ? 0
          : 0.45;
    soundRef.current?.setMusicLevel(level);
  }, [phase]);

  // Hitung mundur 3-2-1 sebelum bola diluncurkan.
  useEffect(() => {
    if (phase !== "countdown") return;
    const timer = window.setTimeout(() => {
      if (count > 1) setCount(count - 1);
      else setPhase("playing");
    }, 700);
    return () => window.clearTimeout(timer);
  }, [phase, count, setPhase]);

  // Label bonus menghilang sendiri.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Keyboard: panah / A-D menggerakkan raket, Spasi / P untuk jeda.
  useEffect(() => {
    const held = new Set<string>();
    const steer = () => {
      const left = held.has("ArrowLeft") || held.has("a");
      const right = held.has("ArrowRight") || held.has("d");
      gameRef.current?.steer(left === right ? 0 : left ? -1 : 1);
    };
    const onDown = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === " " || key === "p") {
        // Spasi di tombol/link yang sedang fokus sudah mengaktifkan elemen itu sendiri;
        // kalau ikut ditangani di sini, jeda berubah dua kali dan terasa tidak merespons.
        const onControl =
          event.target instanceof Element &&
          event.target.closest("button, a, input, select, textarea");
        if (key === " " && onControl) return;
        if (phaseRef.current === "playing") {
          event.preventDefault();
          setPhase("paused");
        } else if (phaseRef.current === "paused") {
          event.preventDefault();
          setPhase("playing");
        }
        return;
      }
      if (["ArrowLeft", "ArrowRight", "a", "d"].includes(key)) {
        if (phaseRef.current === "playing") event.preventDefault();
        held.add(key);
        steer();
      }
    };
    const onUp = (event: KeyboardEvent) => {
      held.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
      steer();
    };
    // Pindah jendela/tab sambil menahan tombol: keyup tidak pernah datang, jadi lepaskan semuanya.
    const release = () => {
      held.clear();
      steer();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, [setPhase]);

  const onPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const x = courtRef.current?.pointerToX(event.clientX, event.clientY);
    if (x != null) gameRef.current?.pointTo(x);
  };

  const toggleMuted = () => {
    const next = !muted;
    setMuted(next);
    soundRef.current?.setMuted(next);
  };

  const startRound = () => {
    soundRef.current?.unlock();
    gameRef.current?.reset();
    setNewBest(false);
    setToast(null);
    setCount(3);
    setPhase("countdown");
  };

  const inGame =
    phase === "countdown" || phase === "playing" || phase === "paused";
  const toastMeta = toast && BONUSES.find((bonus) => bonus.id === toast.id);

  return (
    <section className={styles.section} aria-label="Slay Rally">
      <div className={styles.court}>
        <canvas
          ref={canvasRef}
          className={cx(
            styles.canvas,
            (phase === "playing" || phase === "countdown") && styles.canvasLive,
          )}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onPointer(event);
          }}
          onPointerMove={onPointer}
          aria-label="Slay Rally game court"
          role="img"
        />

        <div className={styles.hud}>
          <div className={styles.hudGroup}>
            <span className={styles.hudLabel}>Lives</span>
            <span
              className={styles.lives}
              role="img"
              aria-label={`${lives} lives left`}
            >
              {Array.from({ length: START_LIVES }, (_, i) => (
                <span
                  key={i}
                  className={cx(styles.life, i >= lives && styles.lifeLost)}
                />
              ))}
            </span>
          </div>
          <div className={styles.hudGroup}>
            <span className={styles.hudLabel}>Level {level}</span>
            <span className={styles.score} aria-live="off">
              {score}
            </span>
          </div>
          <div className={styles.hudButtons}>
            <button
              type="button"
              className={styles.pause}
              onClick={toggleMuted}
              aria-label={muted ? "Turn sound on" : "Turn sound off"}
              aria-pressed={!muted}
            >
              <svg className={styles.soundIcon} viewBox="0 0 24 24" aria-hidden>
                <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
                {muted ? (
                  <path
                    d="M16 9l5 6M21 9l-5 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none"
                  />
                ) : (
                  <path
                    d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none"
                  />
                )}
              </svg>
            </button>
            <button
              type="button"
              className={styles.pause}
              onClick={() =>
                setPhase(phase === "paused" ? "playing" : "paused")
              }
              disabled={phase !== "playing" && phase !== "paused"}
              aria-label={phase === "paused" ? "Resume game" : "Pause game"}
            >
              <span
                className={cx(
                  styles.pauseIcon,
                  phase === "paused" && styles.pauseIconPlay,
                )}
                aria-hidden
              />
            </button>
          </div>
        </div>

        {inGame && (
          <Text
            variant="body-14"
            tone="on-inverse"
            align="center"
            muted
            className={styles.help}
          >
            Move your mouse or drag to steer · ← → also work · Space to pause
          </Text>
        )}

        {toastMeta && phase === "playing" && (
          <div key={toast.key} className={styles.toast} role="status">
            {toastMeta.label}
          </div>
        )}

        {unsupported && (
          <div className={styles.overlay} role="alert">
            <Text variant="body-16" tone="on-inverse" align="center">
              This game needs 3D graphics (WebGL), which isn&apos;t available in
              this browser.
            </Text>
          </div>
        )}

        {phase === "intro" && !unsupported && (
          <div className={styles.overlay}>
            <Text
              as="p"
              variant="body-14-bold"
              tone="accent"
              className={styles.overline}
            >
              Soslay mini game
            </Text>
            <Text as="h1" variant="heading-48" tone="white" align="center">
              Slay Rally
            </Text>
            <Text variant="body-16" tone="on-inverse" align="center" muted>
              Keep the rally alive, clear every block on court, and beat your
              best score.
            </Text>
            <Button
              variant="arrow"
              onClick={() => {
                soundRef.current?.unlock();
                setPhase("bonuses");
              }}
            >
              Play
            </Button>
            {best > 0 && (
              <Text variant="body-14" tone="on-inverse" muted>
                Your best: {best}
              </Text>
            )}
          </div>
        )}

        {phase === "bonuses" && (
          <div className={styles.overlay}>
            <Text as="h2" variant="title-24" tone="white" align="center">
              6 bonuses to{" "}
              <span className={styles.accent}>boost your rally</span>
            </Text>
            <ul className={styles.bonusGrid}>
              {BONUSES.map((bonus) => (
                <li key={bonus.id} className={styles.bonus}>
                  <span
                    className={styles.bonusBadge}
                    style={{ background: `var(${BONUS_TOKEN[bonus.id]})` }}
                    aria-hidden
                  >
                    {bonus.glyph}
                  </span>
                  <span className={styles.bonusLabel}>{bonus.label}</span>
                  <span className={styles.bonusHint}>{bonus.hint}</span>
                </li>
              ))}
            </ul>
            <Button variant="arrow" onClick={startRound}>
              Start game
            </Button>
          </div>
        )}

        {phase === "countdown" && (
          <div
            className={cx(styles.overlay, styles.overlayClear)}
            aria-live="assertive"
          >
            <span key={count} className={styles.count}>
              {count}
            </span>
            <Text
              variant="body-16-bold"
              tone="accent"
              align="center"
              className={styles.overline}
            >
              Move to steer the racket
            </Text>
          </div>
        )}

        {phase === "paused" && (
          <div className={styles.overlay}>
            <Text as="h2" variant="heading-42" tone="white" align="center">
              Paused
            </Text>
            <Button variant="primary" onClick={() => setPhase("playing")}>
              Resume
            </Button>
            <Button variant="outline-light" size="sm" onClick={startRound}>
              Restart
            </Button>
          </div>
        )}

        {phase === "over" && (
          <div className={styles.overlay} role="status">
            <Text
              variant="body-14-bold"
              tone="accent"
              className={styles.overline}
            >
              {newBest ? "New personal best" : "Game over"}
            </Text>
            <span className={styles.finalScore}>{score}</span>
            <Text variant="body-16" tone="on-inverse" align="center" muted>
              {newBest
                ? `You reached level ${level}. That's a slay.`
                : `Level ${level} · Your best: ${best}`}
            </Text>
            <Button variant="arrow" onClick={startRound}>
              Play again
            </Button>
            <Button variant="outline-light" size="sm" href="/activity">
              Play for real
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
