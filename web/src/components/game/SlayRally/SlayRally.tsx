"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon, Text } from "@/components/ui";
import { useMemberUser } from "@/hooks/useMemberUser";
import { loginPage, registerPage, withNext } from "@/content/auth";
import { cx } from "@/lib/cx";
import {
  FREE_ROUNDS,
  GAME_RANK_PRIZES,
  GATE_SAVE_KEY,
  GATE_SAVE_TTL_MS,
  CONNECTION_LOST,
  nextRankPrize,
  NOT_MEMBER,
  slayPointsLabel,
  type GateSave,
  type LeaderboardRow,
  type StartSessionResult,
  type SubmitScoreResult,
} from "@/lib/game";
import { firstName } from "@/lib/text";
import {
  getGameLeaderboard,
  startGameSession,
  submitGameScore,
} from "@/server/game";
import { Court3D, type Palette } from "./court3d";
import { BONUSES, Game, START_LIVES, type BonusId } from "./engine";
import { Sound } from "./sound";
import {
  canShareStory,
  renderStoryCard,
  STORY_FILENAME,
  STORY_TYPE,
} from "./storyCard";
import styles from "./SlayRally.module.css";

type Phase =
  | "intro"
  | "resume"
  | "bonuses"
  | "countdown"
  | "playing"
  | "paused"
  | "gate"
  | "over";

const GAME_PATH = "/game";
/** Teks ajakan di gambar Story — domain publik + path game. */
const STORY_LINK = "slayclub.id/game";
const SIGN_UP_HREF = withNext(loginPage.switch.href, GAME_PATH);
const SIGN_IN_HREF = withNext(registerPage.switch.href, GAME_PATH);

/** Kalimat hasil simpan skor member di layar game over. */
function pointsMessage(score: number, result: SubmitScoreResult | null) {
  if (score === 0) return "Overtake a player in the top 3 to win Slay Points.";
  if (!result) return "Saving your score…";
  if (!result.ok) return result.error;
  if (result.prize > 0)
    return `You overtook to #${result.rank}! +${slayPointsLabel(result.prize)} added to your account`;
  const ahead = nextRankPrize(result.rank, result.claimed);
  if (result.rank === 1) return "You're #1 on the leaderboard. Defend your spot!";
  if (result.rank && result.rank <= GAME_RANK_PRIZES.length)
    return ahead > 0
      ? `You're #${result.rank} on the leaderboard. Climb higher to win up to ${slayPointsLabel(ahead)}.`
      : `You're #${result.rank} on the leaderboard.`;
  return ahead > 0
    ? `Score saved. Overtake a player in the top 3 to win up to ${slayPointsLabel(ahead)}.`
    : "Score saved. You've already won every leaderboard prize.";
}

/** "20 / 10 / 5 Slay Points" — hadiah menyalip ke peringkat 1–3. */
const PRIZES_TEXT = `${GAME_RANK_PRIZES.join(" / ")} Slay Points`;

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

/** Game tamu yang berhenti di gerbang ronde 2 — dilanjutkan setelah daftar / masuk. */
function readGateSave(): GateSave | null {
  try {
    const raw = window.localStorage.getItem(GATE_SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as GateSave;
    if (!save || Date.now() - save.savedAt > GATE_SAVE_TTL_MS) {
      window.localStorage.removeItem(GATE_SAVE_KEY);
      return null;
    }
    return save;
  } catch {
    return null;
  }
}

function writeGateSave(save: GateSave | null) {
  try {
    if (save) window.localStorage.setItem(GATE_SAVE_KEY, JSON.stringify(save));
    else window.localStorage.removeItem(GATE_SAVE_KEY);
  } catch {
    // Penyimpanan diblokir — lanjut ronde 2 tetap bisa di tab ini selama halaman tidak ditutup.
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
  const member = useMemberUser();
  /** useMemberUser membuat objek baru tiap tab dibuka lagi — efek bergantung pada status login saja. */
  const isMember = Boolean(member);
  const memberRef = useRef(false);
  /** Sesi game di server (waktu mulai dicatat server) — skor game ini dikirim dengan id sesi ini. */
  const sessionRef = useRef<Promise<StartSessionResult> | null>(null);
  /** Kiriman skor untuk game over yang sedang tampil (null = belum dikirim). */
  const submitRef = useRef<Promise<SubmitScoreResult | null> | null>(null);

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
  const [saved, setSaved] = useState<GateSave | null>(null);
  const [result, setResult] = useState<SubmitScoreResult | null>(null);
  /** null = memuat, "error" = server tidak terjangkau. */
  const [board, setBoard] = useState<LeaderboardRow[] | "error" | null>(null);
  /** Gambar Story 1080×1920 untuk game over ini — dibuat lebih dulu supaya share tetap di dalam klik (iOS). */
  const [story, setStory] = useState<Blob | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    memberRef.current = isMember;
  }, [isMember]);

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
      // Tamu hanya boleh main ronde 1; ronde berikutnya wajib akun.
      canEnterLevel: (next) => memberRef.current || next <= FREE_ROUNDS,
      onGate: (state) => {
        const save = { ...state, savedAt: Date.now() };
        writeGateSave(save);
        setSaved(save);
        setPhase("gate");
      },
      onBonus: (id) => setToast({ id, key: Date.now() }),
      onSound: (kind) => sound.play(kind),
      onGameOver: (finalScore) => {
        writeGateSave(null);
        setSaved(null);
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

  // Kembali dari Daftar / Masuk dengan game tamu tersimpan → tawarkan lanjut ronde 2.
  useEffect(() => {
    if (!isMember || phaseRef.current !== "intro") return;
    const save = readGateSave();
    if (!save) return;
    queueMicrotask(() => {
      setSaved(save);
      setPhase("resume");
    });
  }, [isMember, setPhase]);

  // Game over: member → skor disimpan (→ Slay Point), lalu leaderboard dimuat (sudah termasuk skor ini).
  useEffect(() => {
    if (phase !== "over") return;
    let cancelled = false;
    const finalScore = score;
    const finalLevel = level;
    // Skor dikirim sekali per game over walau efek ini jalan dua kali (StrictMode): run kedua
    // menunggu kiriman yang sama, bukan mengira sesinya tidak ada.
    submitRef.current ??= (async (): Promise<SubmitScoreResult | null> => {
      const pending = sessionRef.current;
      sessionRef.current = null;
      if (!member || finalScore <= 0) return null;
      const started = pending ? await pending : null;
      if (!started) return { ok: false, error: NOT_MEMBER };
      if (!started.ok) return started;
      return submitGameScore({
        sessionId: started.sessionId,
        score: finalScore,
        level: finalLevel,
      }).catch(() => ({ ok: false as const, error: CONNECTION_LOST }));
    })();
    const submitted = submitRef.current;
    const run = async () => {
      const saveResult = await submitted;
      if (cancelled) return;
      if (saveResult) setResult(saveResult);
      const rows = await getGameLeaderboard(
        saveResult?.ok ? finalScore : undefined,
      ).catch(() => "error" as const);
      if (!cancelled) setBoard(rows);
    };
    void run();
    return () => {
      cancelled = true;
    };
    // Sekali per game over — skor & status login dibaca saat itu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const storyData = () => ({
    score,
    level,
    newBest,
    // Dari leaderboard bila termuat; kalau gagal, peringkat dari hasil simpan skor.
    rank:
      (Array.isArray(board) ? board.find((row) => row.isMe)?.rank : null) ??
      (result?.ok ? result.rank : null),
    points: result?.ok ? result.prize : null,
    link: STORY_LINK,
  });

  // HP dengan share file: gambar Story disiapkan setelah leaderboard dimuat, supaya navigator.share
  // tetap dipanggil langsung di klik (iOS menolak share setelah kerja async). Perangkat lain (desktop)
  // membuat gambar hanya saat tombol diklik.
  useEffect(() => {
    if (phase !== "over" || board === null || !canShareStory()) return;
    let cancelled = false;
    renderStoryCard(storyData())
      .then((blob) => {
        if (!cancelled) setStory(blob);
      })
      .catch(() => {
        // Canvas gagal (memori / browser lama) — tombol share tidak ditampilkan.
      });
    return () => {
      cancelled = true;
    };
    // Sekali per game over, setelah leaderboard & hasil simpan skor tersedia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, board]);

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

  const beginCountdown = () => {
    soundRef.current?.unlock();
    setNewBest(false);
    setToast(null);
    setResult(null);
    setBoard(null);
    setStory(null);
    setShareNote(null);
    setCount(3);
    setPhase("countdown");
    // Member: waktu mulai dicatat server sekarang (dipakai untuk menilai skor saat game over).
    submitRef.current = null;
    sessionRef.current = memberRef.current
      ? startGameSession().catch(() => ({
          ok: false as const,
          error: CONNECTION_LOST,
        }))
      : null;
  };

  /** Simpanan tamu dibuang (penyimpanan + state) — dipakai setiap kali game baru / lanjutan dimulai. */
  const clearGateSave = () => {
    writeGateSave(null);
    setSaved(null);
  };

  const startRound = () => {
    gameRef.current?.reset();
    clearGateSave();
    beginCountdown();
  };

  /** Lanjut ke ronde 2 setelah daftar / masuk — dari gerbang di tab ini atau dari simpanan. */
  const continueSaved = () => {
    const game = gameRef.current;
    if (!game || !saved) return;
    game.restore(saved);
    clearGateSave();
    beginCountdown();
  };

  const downloadStory = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = STORY_FILENAME;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setShareNote(
      "Image saved. Open Instagram, add to your Story, and pick this image.",
    );
  };

  /**
   * HP: lembar share bawaan (pilih Instagram → Stories). Desktop / browser tanpa share file:
   * gambar diunduh. navigator.share dipanggil langsung di klik — gambar sudah siap sebelumnya.
   */
  const shareStory = async () => {
    if (story) {
      const file = new File([story], STORY_FILENAME, { type: STORY_TYPE });
      try {
        await navigator.share({ files: [file] });
        setShareNote(null);
      } catch (error) {
        // Dibatalkan pengguna → diam; gagal lainnya → unduh saja.
        if ((error as DOMException)?.name !== "AbortError")
          downloadStory(story);
      }
      return;
    }
    // Tanpa share file (desktop): buat gambar sekarang lalu unduh.
    setSharing(true);
    try {
      downloadStory(await renderStoryCard(storyData()));
    } catch {
      setShareNote("Couldn't create the image. Please try again.");
    } finally {
      setSharing(false);
    }
  };

  /** Mulai game baru dari layar "Round 2 is unlocked": simpanan tamu dibuang supaya tidak ditawarkan lagi. */
  const discardSaved = () => {
    clearGateSave();
    setPhase("intro");
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

        {phase === "resume" && saved && (
          <div className={styles.overlay}>
            <Text
              as="p"
              variant="body-14-bold"
              tone="accent"
              className={styles.overline}
            >
              Welcome{member ? `, ${firstName(member.name)}` : ""}
            </Text>
            <Text as="h2" variant="heading-42" tone="white" align="center">
              Round {saved.level} is{" "}
              <span className={styles.accent}>unlocked</span>
            </Text>
            <Text variant="body-16" tone="on-inverse" align="center" muted>
              Your Round 1 score of {saved.score} is saved. Overtake a player
              into #1, #2 or #3 to win {PRIZES_TEXT}.
            </Text>
            <Button variant="arrow" onClick={continueSaved}>
              Continue to Round {saved.level}
            </Button>
            <Button variant="outline-light" size="sm" onClick={discardSaved}>
              Start a new game
            </Button>
          </div>
        )}

        {phase === "gate" && saved && (
          <div
            className={styles.overlay}
            role="dialog"
            aria-labelledby="rally-gate-title"
          >
            <Text
              as="p"
              variant="body-14-bold"
              tone="accent"
              className={styles.overline}
            >
              Round {saved.level - 1} cleared
            </Text>
            <span className={styles.finalScore}>{saved.score}</span>
            <Text
              as="h2"
              id="rally-gate-title"
              variant="title-24"
              tone="white"
              align="center"
            >
              {member ? (
                <>
                  Ready for{" "}
                  <span className={styles.accent}>Round {saved.level}</span>?
                </>
              ) : (
                <>
                  Sign up free to play{" "}
                  <span className={styles.accent}>Round {saved.level}</span>
                </>
              )}
            </Text>
            {!member && (
              <ul className={styles.perks}>
                <li>Keep your score and continue right where you stopped</li>
                <li>Get your name on the Slay Rally leaderboard</li>
                <li>Overtake into the top 3 to win {PRIZES_TEXT}</li>
              </ul>
            )}
            {member ? (
              <Button variant="arrow" onClick={continueSaved}>
                Continue
              </Button>
            ) : (
              <>
                <Button variant="arrow" href={SIGN_UP_HREF}>
                  Sign up &amp; continue
                </Button>
                <Text variant="body-14" tone="on-inverse" muted>
                  Already a member?{" "}
                  <a className={styles.link} href={SIGN_IN_HREF}>
                    Sign in
                  </a>
                </Text>
                {/* Tamu yang belum mau daftar tetap bisa main ronde 1 lagi tanpa memuat ulang halaman. */}
                <Button variant="outline-light" size="sm" onClick={startRound}>
                  Play Round 1 again
                </Button>
              </>
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
          <div className={cx(styles.overlay, styles.overlayOver)} role="status">
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

            {member ? (
              <Text
                variant="body-14-bold"
                tone="on-inverse"
                align="center"
                className={styles.points}
                aria-live="polite"
              >
                {pointsMessage(score, result)}
              </Text>
            ) : (
              <Text variant="body-14" tone="on-inverse" align="center" muted>
                <a className={styles.link} href={SIGN_UP_HREF}>
                  Sign up
                </a>{" "}
                to save your score — overtake into the top 3 to win{" "}
                {PRIZES_TEXT}.
              </Text>
            )}

            <div className={styles.board} aria-label="Slay Rally leaderboard">
              <Text
                as="h3"
                variant="body-14-bold"
                tone="accent"
                className={styles.overline}
              >
                Leaderboard
              </Text>
              {!board ? (
                <Text variant="body-14" tone="on-inverse" muted>
                  Loading…
                </Text>
              ) : board === "error" ? (
                <Text variant="body-14" tone="on-inverse" muted>
                  Couldn&apos;t load the leaderboard. Reload the page to try
                  again.
                </Text>
              ) : board.length === 0 ? (
                <Text variant="body-14" tone="on-inverse" muted>
                  No scores yet — be the first on the board.
                </Text>
              ) : (
                <ol className={styles.boardList}>
                  {board.map((row) => (
                    <li
                      key={row.rank}
                      className={cx(
                        styles.boardRow,
                        row.rank <= 3 && styles[`podium${row.rank}`],
                        row.isMe && styles.boardMe,
                        row.isMe && row.rank > 6 && styles.boardGap,
                      )}
                    >
                      <span className={styles.boardRank}>{row.rank}</span>
                      <span className={styles.boardName}>
                        {row.name}
                        {row.isMe && " (you)"}
                      </span>
                      <span className={styles.boardScore}>{row.best}</span>
                    </li>
                  ))}
                </ol>
              )}
              <Text variant="body-14" tone="on-inverse" align="center" muted>
                Overtake a player into #1 / #2 / #3 to win {PRIZES_TEXT} (once
                per spot).
              </Text>
            </div>

            <div className={styles.actions}>
              <Button variant="arrow" onClick={startRound}>
                Play again
              </Button>
              <Button variant="outline-light" size="sm" href="/activity">
                Play for real
              </Button>
            </div>

            {(story || (board !== null && !canShareStory())) && (
              <div className={styles.share}>
                <button
                  type="button"
                  className={styles.shareButton}
                  onClick={shareStory}
                  disabled={sharing}
                >
                  <Icon name="instagram-logo" size={22} />
                  Share to Instagram Story
                </button>
                {shareNote && (
                  <Text
                    variant="body-14"
                    tone="on-inverse"
                    align="center"
                    muted
                    role="status"
                  >
                    {shareNote}
                  </Text>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
