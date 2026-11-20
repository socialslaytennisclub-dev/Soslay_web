"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon, Text } from "@/components/ui";
import { useMemberUser } from "@/hooks/useMemberUser";
import { cx } from "@/lib/cx";
import { TENNIS_FREE_GAMES, TENNIS_GATE_KEY, TENNIS_GATE_TTL_MS, TENNIS_WIN_POINTS, type TennisGateSave, type TennisReport } from "@/lib/tennis";
import { joinTennisMatch, openTennisMatch, reportTennisMatch } from "@/server/tennis";
import { Sound } from "../SlayRally/sound";
import { canShareStory, STORY_TYPE } from "../SlayRally/storyCard";
import { CourtView, type TennisPalette } from "./scene3d";
import { pointLabel, TennisGame, type ShotKind, type Side, type Snapshot, type TennisSound } from "./engine";
import { cleanRoomCode, newClientId, newRoomCode, openRoom, type RoomLink, type RoomMsg } from "./link";
import { MoveZone, PadControls } from "./PadControls";
import { renderTennisStory, TENNIS_STORY_FILENAME } from "./tennisStory";
import styles from "./SlayTennis.module.css";

type Screen = "menu" | "signin" | "lobby" | "joining" | "play" | "paused" | "gate" | "resume" | "over";
/** solo = lawan komputer · host = menjalankan pertandingan vs member · guest = layar lawan. */
type Role = "solo" | "host" | "guest";

const PATH = "/gameoncourt";
const GAMES_TO_WIN = 2;
const SNAP_MS = 66;
const STALE_INPUT_MS = 700;
const GONE_MS = 8000;
/** Teks ajakan di gambar Story. */
const STORY_LINK = "slayclub.id/gameoncourt";

const SOUND_MAP: Record<TennisSound, Parameters<Sound["play"]>[0]> = {
  hit: "racket",
  serve: "racket",
  bounce: "wall",
  point: "bonus",
  win: "level",
  lose: "over",
};

const KEY_SHOTS: Record<string, ShotKind> = { j: "flat", z: "flat", " ": "flat", k: "lob", x: "lob", l: "drop", c: "drop" };

/** Pertandingan tamu (lawan komputer) yang berhenti di gerbang game 2 — dilanjutkan setelah masuk. */
function readGateSave(): TennisGateSave | null {
  try {
    const raw = window.localStorage.getItem(TENNIS_GATE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as TennisGateSave;
    if (!save || !Array.isArray(save.games) || Date.now() - save.savedAt > TENNIS_GATE_TTL_MS) {
      window.localStorage.removeItem(TENNIS_GATE_KEY);
      return null;
    }
    return save;
  } catch {
    return null;
  }
}

function writeGateSave(save: TennisGateSave | null) {
  try {
    if (save) window.localStorage.setItem(TENNIS_GATE_KEY, JSON.stringify(save));
    else window.localStorage.removeItem(TENNIS_GATE_KEY);
  } catch {
    // Penyimpanan diblokir — lanjut tetap bisa di tab ini selama halaman tidak ditutup.
  }
}

const REPORT_NOTE: Record<NonNullable<Extract<TennisReport, { ok: true }>["reason"]>, string> = {
  disputed: "The two results didn't match, so no Slay Point was given.",
  too_short: "That match was too short to count for a Slay Point.",
  daily_cap: "You've reached today's Slay Point limit from Slay Tennis.",
  pair_cap: "You two have reached today's limit together — play someone else for more.",
};

function readPalette(el: HTMLElement): TennisPalette {
  const css = getComputedStyle(el);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    sky: token("--color-navy-950"),
    ground: token("--color-navy-900"),
    court: token("--color-indigo-500"),
    courtAlt: token("--color-indigo-700"),
    line: token("--color-white"),
    ball: token("--color-lime-neon"),
    ink: token("--color-navy-950"),
    post: token("--color-lime-neon"),
  };
}

/** Slay Tennis — tenis arcade: lawan komputer, atau lawan member lewat link yang sama (halaman /gameoncourt). */
export function SlayTennis() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<TennisGame | null>(null);
  const soundRef = useRef<Sound | null>(null);
  const linkRef = useRef<RoomLink | null>(null);
  const idRef = useRef("");
  const roleRef = useRef<Role>("solo");
  const screenRef = useRef<Screen>("menu");
  const snapRef = useRef<Snapshot | null>(null);
  /** Input perangkat ini (keyboard / sentuh). */
  const localRef = useRef({ mx: 0, my: 0 });
  /** Input dari jaringan per sisi: HP controller atau layar lawan. */
  const remoteRef = useRef([
    { mx: 0, my: 0, at: 0 },
    { mx: 0, my: 0, at: 0 },
  ]);
  const padSeenRef = useRef([0, 0]);
  const guestRef = useRef<{ id: string; name: string; at: number } | null>(null);
  const hostSeenRef = useRef(0);
  const nameRef = useRef("Player");
  const memberRef = useRef(false);
  /** Catatan pertandingan member vs member di server (untuk Slay Point pemenang). */
  const matchRef = useRef<string | null>(null);
  const reportedRef = useRef<string | null>(null);

  const member = useMemberUser();
  const isMember = Boolean(member);

  const [screen, setScreenState] = useState<Screen>("menu");
  const [role, setRoleState] = useState<Role>("solo");
  const [hud, setHud] = useState<Snapshot | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [rival, setRival] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [padQr, setPadQr] = useState<string | null>(null);
  const [padOn, setPadOn] = useState(false);
  const [copied, setCopied] = useState(false);
  const [touch, setTouch] = useState(false);
  const [muted, setMuted] = useState(false);
  const [checked, setChecked] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [saved, setSaved] = useState<TennisGateSave | null>(null);
  const [result, setResult] = useState<TennisReport | null>(null);
  /** Gambar Story hasil pertandingan — disiapkan lebih dulu di HP supaya share tetap di dalam klik (iOS). */
  const [story, setStory] = useState<Blob | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const setScreen = useCallback((next: Screen) => {
    screenRef.current = next;
    setScreenState(next);
  }, []);
  const setRole = useCallback((next: Role) => {
    roleRef.current = next;
    setRoleState(next);
  }, []);

  useEffect(() => {
    nameRef.current = member?.name.split(" ")[0] || "Player";
    memberRef.current = isMember;
  }, [member, isMember]);

  /** Laporkan hasil pertandingan member vs member (sekali per pertandingan), lalu tunggu laporan lawan. */
  const reportResult = useCallback((hostWon: boolean) => {
    const id = matchRef.current;
    if (!id || reportedRef.current === id) return;
    reportedRef.current = id;
    const iAmHost = roleRef.current === "host";
    const failed: TennisReport = { ok: false, error: "Couldn't reach the server. This match won't count for Slay Points." };
    const attempt = (left: number) => {
      void reportTennisMatch(id, hostWon, iAmHost)
        .catch(() => failed)
        .then((next) => {
          if (matchRef.current !== id) return;
          setResult(next);
          // Poin baru keluar setelah lawan juga melapor — cek lagi sebentar.
          if (next.ok && next.pending && left > 0) window.setTimeout(() => attempt(left - 1), 2500);
        });
    };
    attempt(5);
  }, []);

  const mySide: Side = role === "guest" ? 1 : 0;

  // ── Pertandingan ──────────────────────────────────────────────

  const newGame = useCallback(
    (ai: Side | null) => {
      const game = new TennisGame(
        {
          onSound: (kind) => soundRef.current?.play(SOUND_MAP[kind]),
          onOver: (winner) => {
            writeGateSave(null);
            setSaved(null);
            setScreen("over");
            if (roleRef.current === "host") reportResult(winner === 0);
          },
          // Lawan komputer tanpa akun: hanya game 1. Game berikutnya wajib masuk.
          canStartGame: (n) => roleRef.current !== "solo" || memberRef.current || n <= TENNIS_FREE_GAMES,
          onHold: (state) => {
            const save: TennisGateSave = { ...state, savedAt: Date.now() };
            writeGateSave(save);
            setSaved(save);
            setScreen("gate");
          },
        },
        { ai, gamesToWin: GAMES_TO_WIN },
      );
      gameRef.current = game;
      snapRef.current = game.snapshot();
      return game;
    },
    [reportResult, setScreen],
  );

  const startMatch = useCallback(() => {
    soundRef.current?.unlock();
    setNotice(null);
    setResult(null);
    setStory(null);
    setShareNote(null);
    matchRef.current = null;
    newGame(roleRef.current === "host" ? null : 1);
    if (roleRef.current === "host") {
      linkRef.current?.send({ t: "start", match: null });
      // Catatan pertandingan di server (untuk Slay Point pemenang) — id-nya ikut di detak host
      // supaya lawan bisa bergabung walau pesan pertama terlewat.
      const game = gameRef.current;
      void openTennisMatch()
        .catch(() => null)
        .then((opened) => {
          if (gameRef.current !== game || !opened?.ok) return;
          matchRef.current = opened.matchId;
          linkRef.current?.send({ t: "start", match: opened.matchId });
        });
    } else {
      writeGateSave(null);
      setSaved(null);
    }
    setScreen("play");
  }, [newGame, setScreen]);

  // ── Room (lawan member & HP controller) ───────────────────────

  const onMessage = useCallback(
    (msg: RoomMsg) => {
      const now = Date.now();
      const currentRole = roleRef.current;
      if (currentRole === "guest") {
        // Pertandingan baru dari host → bergabung ke catatannya di server (sekali per id).
        if ((msg.t === "host" || msg.t === "start") && msg.match && msg.match !== matchRef.current) {
          matchRef.current = msg.match;
          setResult(null);
          void joinTennisMatch(msg.match).catch(() => {});
        }
        if (msg.t === "host") {
          hostSeenRef.current = now;
          setRival(msg.name);
        } else if (msg.t === "snap") {
          hostSeenRef.current = now;
          const prev = snapRef.current;
          snapRef.current = msg.s;
          // Suara di layar lawan diturunkan dari perubahan snapshot.
          if (prev && prev.phase === "rally" && msg.s.phase === "point") soundRef.current?.play("bonus");
          if (msg.s.phase === "over") {
            if (screenRef.current !== "over") setScreen("over");
            // Host = sisi 0.
            if (msg.s.won !== null) reportResult(msg.s.won === 0);
          } else if (screenRef.current !== "play") setScreen("play");
        } else if (msg.t === "start") {
          setNotice(null);
          setScreen("play");
        } else if (msg.t === "pad" && msg.side === 1) {
          padSeenRef.current[1] = now;
        }
        return;
      }
      // Host (vs member) atau solo dengan HP controller.
      const vs = currentRole === "host";
      switch (msg.t) {
        case "who":
          linkRef.current?.send({ t: "host", id: idRef.current, name: nameRef.current, guest: guestRef.current?.name ?? null, mode: vs ? "vs" : "ai", match: matchRef.current });
          break;
        case "join":
          if (!vs) break;
          if (guestRef.current && guestRef.current.id !== msg.id) break; // room penuh
          if (!guestRef.current) {
            guestRef.current = { id: msg.id, name: msg.name, at: now };
            setRival(msg.name);
            startMatch();
          } else guestRef.current.at = now;
          break;
        case "leave":
          if (guestRef.current?.id === msg.id) guestRef.current.at = 0;
          break;
        case "pad":
          padSeenRef.current[msg.side] = now;
          break;
        case "in":
          if (msg.side === 1 && !vs) break;
          remoteRef.current[msg.side] = { mx: msg.mx, my: msg.my, at: now };
          break;
        case "shot":
          if (msg.side === 1 && !vs) break;
          soundRef.current?.unlock();
          if (screenRef.current === "play") gameRef.current?.shot(msg.side, msg.kind);
          break;
      }
    },
    [reportResult, setScreen, startMatch],
  );

  const closeRoom = useCallback(() => {
    linkRef.current?.send({ t: "leave", id: idRef.current });
    linkRef.current?.close();
    linkRef.current = null;
    guestRef.current = null;
    setRoom(null);
    setRival(null);
    setPadOn(false);
  }, []);

  const connect = useCallback(
    (code: string) => {
      linkRef.current?.close();
      const link = openRoom(code);
      linkRef.current = link;
      link.listen(onMessage);
      setRoom(code);
      link.ready.catch(() => setNotice("Couldn't connect. Check your internet and try again."));
      return link;
    },
    [onMessage],
  );

  /** Buat room baru sebagai host dan tunggu lawan lewat link. */
  const hostRoom = useCallback(
    (code = newRoomCode()) => {
      setRole("host");
      guestRef.current = null;
      setRival(null);
      connect(code);
      window.history.replaceState(null, "", `${PATH}?room=${code}`);
      setScreen("lobby");
    },
    [connect, setRole, setScreen],
  );

  /** Buka link room: kalau sudah ada host → jadi lawannya; kalau belum → jadi host. */
  const joinRoom = useCallback(
    (code: string) => {
      setScreen("joining");
      setRole("guest");
      hostSeenRef.current = 0;
      const link = connect(code);
      let decided = false;
      const stop = link.listen((msg) => {
        if (decided || msg.t !== "host") return;
        decided = true;
        stop();
        if (msg.mode !== "vs" || (msg.guest && msg.guest !== nameRef.current)) {
          closeRoom();
          setRole("solo");
          setNotice(msg.mode === "vs" ? "That match already has two players." : "That link is a solo game.");
          window.history.replaceState(null, "", PATH);
          setScreen("menu");
          return;
        }
        setRival(msg.name);
        link.send({ t: "join", id: idRef.current, name: nameRef.current });
      });
      void link.ready.then(() => link.send({ t: "who", id: idRef.current })).catch(() => {});
      window.setTimeout(() => {
        if (decided || linkRef.current !== link) return;
        decided = true;
        stop();
        hostRoom(code);
      }, 1800);
    },
    [closeRoom, connect, hostRoom, setRole, setScreen],
  );

  // Link dengan ?room= → gabung setelah status login diketahui.
  useEffect(() => {
    const timer = window.setTimeout(() => setChecked(true), 500);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!checked || linkRef.current) return;
    const code = cleanRoomCode(new URLSearchParams(window.location.search).get("room"));
    if (!code) return;
    queueMicrotask(() => {
      if (isMember) joinRoom(code);
      else {
        setRoom(code);
        setScreen("signin");
      }
    });
  }, [checked, isMember, joinRoom, setScreen]);

  // Kembali dari Masuk / Daftar dengan pertandingan tamu tersimpan → tawarkan lanjut.
  useEffect(() => {
    if (!checked || !isMember || screenRef.current !== "menu" || linkRef.current) return;
    if (new URLSearchParams(window.location.search).has("room")) return;
    const save = readGateSave();
    if (!save) return;
    queueMicrotask(() => {
      setSaved(save);
      setScreen("resume");
    });
  }, [checked, isMember, setScreen]);

  // Detak room: host mengumumkan diri, lawan menandai masih ada, dan deteksi yang pergi.
  useEffect(() => {
    const beat = window.setInterval(() => {
      const link = linkRef.current;
      if (!link) return;
      const now = Date.now();
      if (roleRef.current === "guest") {
        link.send({ t: "join", id: idRef.current, name: nameRef.current });
        if (hostSeenRef.current && now - hostSeenRef.current > GONE_MS && screenRef.current !== "menu") {
          setNotice("The host left the match.");
          setScreen("joining");
        }
      } else {
        link.send({ t: "host", id: idRef.current, name: nameRef.current, guest: guestRef.current?.name ?? null, mode: roleRef.current === "host" ? "vs" : "ai", match: matchRef.current });
        const guest = guestRef.current;
        if (guest && now - guest.at > GONE_MS) {
          guestRef.current = null;
          setRival(null);
          setNotice("Your opponent left the match.");
          setScreen("lobby");
        }
      }
      setPadOn(now - padSeenRef.current[roleRef.current === "guest" ? 1 : 0] < 1500);
    }, 1500);
    return () => window.clearInterval(beat);
  }, [setScreen]);

  // ── Kanvas & loop ─────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    idRef.current = newClientId();
    queueMicrotask(() => setTouch(window.matchMedia("(pointer: coarse)").matches));
    const sound = new Sound();
    soundRef.current = sound;
    let view: CourtView;
    try {
      view = new CourtView(canvas, readPalette(canvas));
    } catch {
      // WebGL tidak tersedia di perangkat ini.
      queueMicrotask(() => setUnsupported(true));
      soundRef.current = null;
      sound.dispose();
      return;
    }
    // Latar menu: lapangan dengan pemain di posisi servis.
    snapRef.current = new TennisGame({}, { ai: 1, gamesToWin: GAMES_TO_WIN }).snapshot();

    const resize = () => view.resize(canvas.clientWidth, canvas.clientHeight, Math.min(window.devicePixelRatio || 1, 2));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    let last = performance.now();
    let lastSnap = 0;
    let hudKey = "";
    const tick = (now: number) => {
      // Dijadwalkan lebih dulu: satu frame yang gagal tidak boleh menghentikan permainan.
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;
      const currentRole = roleRef.current;
      const game = gameRef.current;
      const playing = screenRef.current === "play";
      if (currentRole !== "guest" && game && playing) {
        const stamp = Date.now();
        const local = localRef.current;
        const pad = remoteRef.current[0];
        const padFresh = stamp - pad.at < STALE_INPUT_MS;
        const useLocal = local.mx !== 0 || local.my !== 0 || !padFresh;
        game.setInput(0, useLocal ? local.mx : pad.mx, useLocal ? local.my : pad.my);
        if (currentRole === "host") {
          const far = remoteRef.current[1];
          const fresh = stamp - far.at < STALE_INPUT_MS;
          game.setInput(1, fresh ? far.mx : 0, fresh ? far.my : 0);
        }
        game.update(dt);
      }
      // Keadaan terakhir selalu diambil dari mesin (juga di layar hasil / jeda), supaya papan skor
      // dan snapshot untuk lawan tidak tertinggal satu langkah.
      if (currentRole !== "guest" && game) snapRef.current = game.snapshot();
      const snap = snapRef.current;
      if (snap) {
        if (currentRole === "host" && linkRef.current && guestRef.current && now - lastSnap > SNAP_MS && (playing || screenRef.current === "over")) {
          lastSnap = now;
          linkRef.current.send({ t: "snap", s: snap, live: playing });
        }
        view.render(snap, currentRole === "guest" ? 1 : 0, dt, currentRole === "guest" ? 0.4 : 1);
        const key = `${snap.pts}|${snap.games}|${snap.phase}|${snap.note}|${snap.server}|${snap.won}|${snap.second}`;
        if (key !== hudKey) {
          hudKey = key;
          setHud(snap);
        }
      }
    };
    frame = requestAnimationFrame(tick);

    const onHide = () => {
      sound.setSuspended(document.hidden);
      // Lawan komputer: jeda otomatis saat pindah tab. Lawan member: pertandingan jalan terus.
      if (document.hidden && roleRef.current === "solo" && screenRef.current === "play") setScreen("paused");
    };
    document.addEventListener("visibilitychange", onHide);
    const onLeave = () => linkRef.current?.send({ t: "leave", id: idRef.current });
    window.addEventListener("pagehide", onLeave);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
      onLeave();
      linkRef.current?.close();
      linkRef.current = null;
      gameRef.current = null;
      soundRef.current = null;
      sound.dispose();
      view.dispose();
    };
  }, [setScreen]);

  // HP mendatar (layar pendek): mode layar penuh tanpa navbar — lihat SlayTennis.module.css.
  useEffect(() => {
    const query = window.matchMedia("(orientation: landscape) and (max-height: 540px)");
    const apply = () => {
      if (query.matches) {
        document.documentElement.dataset.gameFull = "";
        window.scrollTo(0, 0);
      } else delete document.documentElement.dataset.gameFull;
    };
    apply();
    query.addEventListener("change", apply);
    return () => {
      query.removeEventListener("change", apply);
      delete document.documentElement.dataset.gameFull;
    };
  }, []);

  useEffect(() => {
    soundRef.current?.setMusicLevel(screen === "play" ? 1 : screen === "paused" ? 0 : 0.45);
  }, [screen]);

  // ── Input perangkat ini ───────────────────────────────────────

  const move = useCallback((mx: number, my: number) => {
    localRef.current = { mx, my };
    if (roleRef.current === "guest") linkRef.current?.send({ t: "in", side: 1, mx, my });
  }, []);

  const shot = useCallback((kind: ShotKind) => {
    soundRef.current?.unlock();
    if (screenRef.current !== "play") return;
    if (roleRef.current === "guest") linkRef.current?.send({ t: "shot", side: 1, kind });
    else gameRef.current?.shot(0, kind);
  }, []);

  // Layar lawan: ulangi arah terakhir (pesan bisa hilang, dan host menganggap input basi setelah 0,7 dtk).
  useEffect(() => {
    if (role !== "guest") return;
    const timer = window.setInterval(() => linkRef.current?.send({ t: "in", side: 1, ...localRef.current }), 150);
    return () => window.clearInterval(timer);
  }, [role]);

  useEffect(() => {
    const held = new Set<string>();
    const steer = () => {
      const axis = (neg: string[], pos: string[]) => Number(pos.some((k) => held.has(k))) - Number(neg.some((k) => held.has(k)));
      move(axis(["ArrowLeft", "a"], ["ArrowRight", "d"]), axis(["ArrowDown", "s"], ["ArrowUp", "w"]));
    };
    const norm = (event: KeyboardEvent) => (event.key.length === 1 ? event.key.toLowerCase() : event.key);
    const onDown = (event: KeyboardEvent) => {
      if (event.repeat || screenRef.current !== "play") return;
      const onControl = event.target instanceof Element && event.target.closest("button, a, input, select, textarea");
      const key = norm(event);
      if (key in KEY_SHOTS && !(key === " " && onControl)) {
        event.preventDefault();
        shot(KEY_SHOTS[key]);
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s"].includes(key)) {
        event.preventDefault();
        held.add(key);
        steer();
      }
    };
    const onUp = (event: KeyboardEvent) => {
      held.delete(norm(event));
      steer();
    };
    const release = () => {
      held.clear();
      steer();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", release);
    };
  }, [move, shot]);

  // ── HP sebagai controller ─────────────────────────────────────

  const padUrl = room && typeof window !== "undefined" ? `${window.location.origin}${PATH}/pad?room=${room}&side=${mySide}` : null;

  const openPad = () => {
    // Lawan komputer belum punya room → buat (tanpa mengubah alamat halaman).
    if (!linkRef.current) connect(newRoomCode());
    setPadOpen(true);
  };

  useEffect(() => {
    if (!padOpen || !padUrl) return;
    let cancelled = false;
    void import("qrcode")
      .then((mod) => mod.default.toDataURL(padUrl, { margin: 1, width: 440, color: { dark: "#0a084a", light: "#ffffff" } }))
      .then((url) => {
        if (!cancelled) setPadQr(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [padOpen, padUrl]);

  // ── Aksi menu ─────────────────────────────────────────────────

  const playSolo = () => {
    if (roleRef.current !== "solo") {
      closeRoom();
      window.history.replaceState(null, "", PATH);
    }
    setRole("solo");
    startMatch();
  };

  const playVersus = () => {
    soundRef.current?.unlock();
    setNotice(null);
    if (!isMember) return setScreen("signin");
    closeRoom();
    hostRoom();
  };

  /** Lanjut ke game berikutnya setelah masuk — dari gerbang di tab ini atau dari simpanan. */
  const continueSaved = () => {
    soundRef.current?.unlock();
    if (screenRef.current === "gate" && gameRef.current) gameRef.current.continueMatch();
    else if (saved) newGame(1).restore(saved);
    else return;
    writeGateSave(null);
    setSaved(null);
    setScreen("play");
  };

  const discardSaved = () => {
    writeGateSave(null);
    setSaved(null);
    gameRef.current = null;
    setScreen("menu");
  };

  const backToMenu = () => {
    closeRoom();
    setRole("solo");
    matchRef.current = null;
    setResult(null);
    gameRef.current = null;
    window.history.replaceState(null, "", PATH);
    setScreen("menu");
  };

  // ── Share ke Instagram Story ──────────────────────────────────

  /** Hasil poin sudah final (lawan komputer: langsung; lawan member: setelah laporan selesai). */
  const resultSettled = role === "solo" || (result !== null && (!result.ok || !result.pending));

  const storyData = () => {
    const snap = snapRef.current;
    const mine: Side = roleRef.current === "guest" ? 1 : 0;
    const theirs: Side = mine === 0 ? 1 : 0;
    return {
      me: member ? nameRef.current : "You",
      foe: roleRef.current === "solo" ? "Ghostslay" : (rival ?? "Opponent"),
      won: snap?.won === mine,
      games: [snap?.games[mine] ?? 0, snap?.games[theirs] ?? 0] as [number, number],
      points: result?.ok ? result.points : 0,
      link: STORY_LINK,
    };
  };

  useEffect(() => {
    if (screen !== "over" || !resultSettled || !canShareStory()) return;
    let cancelled = false;
    renderTennisStory(storyData())
      .then((blob) => {
        if (!cancelled) setStory(blob);
      })
      .catch(() => {
        // Gagal membuat gambar (memori / WebGL) — tombol tetap ada dan mencoba lagi saat diklik.
      });
    return () => {
      cancelled = true;
    };
    // Sekali per hasil pertandingan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, resultSettled]);

  const downloadStory = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = TENNIS_STORY_FILENAME;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setShareNote("Image saved. Open Instagram, add to your Story, and pick this image.");
  };

  /** HP: lembar share bawaan (pilih Instagram → Stories). Desktop: gambar dibuat lalu diunduh. */
  const shareStory = async () => {
    if (story && canShareStory()) {
      try {
        await navigator.share({ files: [new File([story], TENNIS_STORY_FILENAME, { type: STORY_TYPE })] });
        setShareNote(null);
      } catch (error) {
        if ((error as DOMException)?.name !== "AbortError") downloadStory(story);
      }
      return;
    }
    setSharing(true);
    try {
      downloadStory(story ?? (await renderTennisStory(storyData())));
    } catch {
      setShareNote("Couldn't create the image. Please try again.");
    } finally {
      setSharing(false);
    }
  };

  const inviteUrl = room && typeof window !== "undefined" ? `${window.location.origin}${PATH}?room=${room}` : "";
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice("Couldn't copy. Long-press the link to copy it.");
    }
  };
  const shareInvite = () => void navigator.share?.({ title: "Slay Tennis", text: "Play Slay Tennis with me!", url: inviteUrl }).catch(() => {});

  const toggleMuted = () => {
    const next = !muted;
    setMuted(next);
    soundRef.current?.setMuted(next);
  };

  const next = encodeURIComponent(room && screen === "signin" ? `${PATH}?room=${room}` : PATH);
  const me = mySide;
  const foe: Side = me === 0 ? 1 : 0;
  const foeName = role === "solo" ? "Ghost" : (rival ?? "Opponent");
  const youWon = hud?.won === me;
  const inPlay = screen === "play";

  return (
    <section className={styles.section} aria-label="Slay Tennis">
      <div className={styles.court}>
        <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label="Slay Tennis court" />

        <div className={styles.hud}>
          <div className={styles.scoreboard} aria-live="off">
            <span className={styles.side}>
              {hud?.server === me && inPlay && <span className={styles.serveDot} aria-label="serving" />}
              You
            </span>
            <span className={styles.games}>
              {hud?.games[me] ?? 0} – {hud?.games[foe] ?? 0}
            </span>
            <span className={cx(styles.side, styles.sideFoe)}>
              {foeName}
              {hud?.server === foe && inPlay && <span className={styles.serveDot} aria-label="serving" />}
            </span>
          </div>
          {inPlay && hud && <span className={styles.points}>{pointLabel(hud.pts, me).replace("opponent", foeName)}</span>}
          <div className={styles.hudButtons}>
            <button type="button" className={styles.round} onClick={openPad} aria-label="Use your phone as controller" title="Use your phone as controller">
              <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden>
                <rect x="7" y="2.5" width="10" height="19" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="17.5" r="1.2" fill="currentColor" />
              </svg>
              {padOn && <span className={styles.padDot} />}
            </button>
            <button type="button" className={styles.round} onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>
              <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden>
                <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
                {muted ? (
                  <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                ) : (
                  <path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {inPlay && hud?.phase === "point" && hud.note && (
          <div
            key={`${hud.pts}${hud.note}`}
            className={cx(styles.flash, hud.won === null ? undefined : youWon ? styles.flashWin : styles.flashLose)}
            role="status"
          >
            <span className={styles.flashNote}>{hud.note}</span>
            {/* Fault pertama belum menghasilkan poin — servis diulang. */}
            <span>{hud.won === null ? "Second serve" : youWon ? "Your point" : `${foeName}'s point`}</span>
          </div>
        )}
        {inPlay && hud?.phase === "serve" && (
          <div className={styles.hint} role="status">
            {hud.server === me
              ? `${hud.second ? "Second serve" : "Your serve"} — press Hit · aim into the service box`
              : `${foeName} is serving${hud.second ? " (second serve)" : ""}`}
          </div>
        )}
        {inPlay && !touch && !padOn && (
          <Text variant="body-14" tone="on-inverse" align="center" muted className={styles.help}>
            Move: arrows / WASD · Hit: J or Space · Lob: K · Drop: L · hold a direction to aim
          </Text>
        )}
        {inPlay && touch && !padOn && (
          <>
            <MoveZone onMove={move} />
            <PadControls variant="overlay" stick={false} onMove={move} onShot={shot} />
          </>
        )}
        {unsupported && (
          <div className={styles.overlay} role="alert">
            <Text variant="body-16" tone="on-inverse" align="center">
              This game needs 3D graphics (WebGL), which isn&apos;t available in this browser.
            </Text>
          </div>
        )}

        {screen === "menu" && !unsupported && (
          <div className={styles.overlay}>
            <Text as="p" variant="body-14-bold" tone="accent" className={styles.overline}>
              Soslay mini game
            </Text>
            <Text as="h1" variant="heading-48" tone="white" align="center">
              Slay Tennis
            </Text>
            <Text variant="body-16" tone="on-inverse" align="center" muted>
              Rally against Ghostslay, or send a link and play a member one on one. First to {GAMES_TO_WIN} games wins — beat a
              member to earn {TENNIS_WIN_POINTS} Slay Point.
            </Text>
            {notice && (
              <Text variant="body-14-bold" tone="accent" align="center" role="status">
                {notice}
              </Text>
            )}
            <div className={styles.actions}>
              <Button variant="arrow" onClick={playSolo}>
                Play vs computer
              </Button>
              <Button variant="outline-light" onClick={playVersus}>
                Play vs a member
              </Button>
            </div>
            <button type="button" className={styles.textButton} onClick={openPad}>
              Use your phone as the controller
            </button>
            <Text variant="body-14" tone="on-inverse" align="center" muted className={styles.rotateHint}>
              On a phone? Turn it sideways for a full-screen court.
            </Text>
          </div>
        )}

        {screen === "gate" && saved && (
          <div className={styles.overlay} role="dialog" aria-labelledby="tennis-gate-title">
            <Text as="p" variant="body-14-bold" tone="accent" className={styles.overline}>
              Game {saved.games[0] + saved.games[1]} done
            </Text>
            <span className={styles.finalScore}>
              {saved.games[0]} – {saved.games[1]}
            </span>
            <Text as="h2" id="tennis-gate-title" variant="title-24" tone="white" align="center">
              {isMember ? (
                <>
                  Ready for <span className={styles.accent}>game {saved.games[0] + saved.games[1] + 1}</span>?
                </>
              ) : (
                <>
                  Sign in to play <span className={styles.accent}>game {saved.games[0] + saved.games[1] + 1}</span>
                </>
              )}
            </Text>
            {!isMember && (
              <Text variant="body-16" tone="on-inverse" align="center" muted>
                The first game is free. Sign in (or sign up free) to finish this match — your score is saved — and to play
                members for Slay Points.
              </Text>
            )}
            <div className={styles.actions}>
              {isMember ? (
                <Button variant="arrow" onClick={continueSaved}>
                  Continue
                </Button>
              ) : (
                <>
                  <Button variant="arrow" href={`/masuk?next=${next}`}>
                    Sign in
                  </Button>
                  <Button variant="outline-light" href={`/daftar?next=${next}`}>
                    Sign up
                  </Button>
                </>
              )}
            </div>
            <button type="button" className={styles.textButton} onClick={discardSaved}>
              Back to menu
            </button>
          </div>
        )}

        {screen === "resume" && saved && (
          <div className={styles.overlay}>
            <Text as="p" variant="body-14-bold" tone="accent" className={styles.overline}>
              Welcome{member ? `, ${member.name.split(" ")[0]}` : ""}
            </Text>
            <Text as="h2" variant="title-24" tone="white" align="center">
              Your match is waiting at{" "}
              <span className={styles.accent}>
                {saved.games[0]} – {saved.games[1]}
              </span>
            </Text>
            <div className={styles.actions}>
              <Button variant="arrow" onClick={continueSaved}>
                Continue game {saved.games[0] + saved.games[1] + 1}
              </Button>
              <Button variant="outline-light" onClick={discardSaved}>
                Start over
              </Button>
            </div>
          </div>
        )}

        {screen === "signin" && (
          <div className={styles.overlay}>
            <Text as="h2" variant="title-24" tone="white" align="center">
              Sign in to play <span className={styles.accent}>member vs member</span>
            </Text>
            <Text variant="body-16" tone="on-inverse" align="center" muted>
              Matches by link are for Slay members. It&apos;s free to join, and you&apos;ll come right back to this match.
            </Text>
            <div className={styles.actions}>
              <Button variant="arrow" href={`/masuk?next=${next}`}>
                Sign in
              </Button>
              <Button variant="outline-light" href={`/daftar?next=${next}`}>
                Sign up
              </Button>
            </div>
            <button type="button" className={styles.textButton} onClick={backToMenu}>
              Back
            </button>
          </div>
        )}

        {screen === "lobby" && (
          <div className={styles.overlay}>
            <Text as="p" variant="body-14-bold" tone="accent" className={styles.overline}>
              Match room {room}
            </Text>
            <Text as="h2" variant="title-24" tone="white" align="center">
              Send this link to your opponent
            </Text>
            <code className={styles.link}>{inviteUrl}</code>
            <div className={styles.actions}>
              <Button variant="primary" onClick={copyInvite}>
                {copied ? "Copied!" : "Copy link"}
              </Button>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <Button variant="outline-light" onClick={shareInvite}>
                  Share
                </Button>
              )}
            </div>
            <Text variant="body-14" tone="on-inverse" align="center" muted role="status">
              {notice ?? "Waiting for your opponent… The match starts as soon as they open the link and sign in."}
            </Text>
            <button type="button" className={styles.textButton} onClick={backToMenu}>
              Cancel
            </button>
          </div>
        )}

        {screen === "joining" && (
          <div className={styles.overlay} role="status">
            <Text as="h2" variant="title-24" tone="white" align="center">
              {notice ?? "Joining the match…"}
            </Text>
            <button type="button" className={styles.textButton} onClick={backToMenu}>
              Leave
            </button>
          </div>
        )}

        {screen === "paused" && (
          <div className={styles.overlay}>
            <Text as="h2" variant="heading-42" tone="white" align="center">
              Paused
            </Text>
            <Button variant="primary" onClick={() => setScreen("play")}>
              Resume
            </Button>
            <button type="button" className={styles.textButton} onClick={backToMenu}>
              Quit match
            </button>
          </div>
        )}

        {screen === "over" && hud && (
          <div className={styles.overlay} role="status">
            <Text variant="body-14-bold" tone="accent" className={styles.overline}>
              {youWon ? "Game, set, slay" : "Match over"}
            </Text>
            <Text as="h2" variant="heading-48" tone="white" align="center">
              {youWon ? "You win!" : `${foeName} wins`}
            </Text>
            <span className={styles.finalScore}>
              {hud.games[me]} – {hud.games[foe]}
            </span>
            <Text variant="body-14-bold" tone="on-inverse" align="center" className={styles.pointsNote} aria-live="polite">
              {role === "solo"
                ? `Slay Points come from member matches: beat a member to earn ${TENNIS_WIN_POINTS}.`
                : !result
                  ? "Saving the result…"
                  : !result.ok
                    ? result.error
                    : result.pending
                      ? `Waiting for ${foeName}'s screen to confirm the result…`
                      : result.points > 0
                        ? `+${result.points} Slay Point added to your account`
                        : result.reason
                          ? REPORT_NOTE[result.reason]
                          : `No Slay Point this time — beat ${foeName} to earn ${TENNIS_WIN_POINTS}.`}
            </Text>
            <div className={styles.actions}>
              {role === "guest" ? (
                <Text variant="body-14" tone="on-inverse" muted>
                  Waiting for {foeName} to start a rematch…
                </Text>
              ) : (
                <Button variant="arrow" onClick={startMatch}>
                  {role === "host" ? "Rematch" : "Play again"}
                </Button>
              )}
              <Button variant="outline-light" size="sm" href="/activity">
                Play for real
              </Button>
            </div>
            {resultSettled && (
              <div className={styles.share}>
                <button type="button" className={styles.shareButton} onClick={shareStory} disabled={sharing}>
                  <Icon name="instagram-logo" size={22} />
                  {sharing ? "Creating image…" : "Add to Instagram Story"}
                </button>
                {shareNote && (
                  <Text variant="body-14" tone="on-inverse" align="center" muted role="status">
                    {shareNote}
                  </Text>
                )}
              </div>
            )}
            <button type="button" className={styles.textButton} onClick={backToMenu}>
              Back to menu
            </button>
          </div>
        )}

        {padOpen && (
          <div className={cx(styles.overlay, styles.padSheet)} role="dialog" aria-labelledby="tennis-pad-title">
            <Text as="h2" id="tennis-pad-title" variant="title-24" tone="white" align="center">
              Your phone is the <span className={styles.accent}>controller</span>
            </Text>
            <Text variant="body-14" tone="on-inverse" align="center" muted>
              Scan with your phone camera. Keep this screen open — the game shows here, you play on your phone.
            </Text>
            {padQr ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL QR, tidak perlu optimasi next/image
              <img src={padQr} alt="QR code to open the controller on your phone" className={styles.qr} />
            ) : (
              <span className={styles.qr} aria-hidden />
            )}
            {padUrl && <code className={styles.link}>{padUrl}</code>}
            <Text variant="body-14-bold" tone={padOn ? "accent" : "on-inverse"} align="center" role="status">
              {padOn ? "Phone connected ✓" : "Waiting for your phone…"}
            </Text>
            <Button variant="primary" onClick={() => setPadOpen(false)}>
              {padOn ? "Let's play" : "Close"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
