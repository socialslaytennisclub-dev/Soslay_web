"use client";

import { useEffect, useRef, useState } from "react";
import { Text } from "@/components/ui";
import type { ShotKind } from "./engine";
import { cleanRoomCode, openRoom, type RoomLink } from "./link";
import { PadControls } from "./PadControls";
import styles from "./TennisPad.module.css";

type Status = "connecting" | "waiting" | "connected" | "failed" | "invalid";

/**
 * HP sebagai controller Slay Tennis (halaman /gameoncourt/pad?room=KODE). KODE = kanal controller
 * milik satu layar (dari QR-nya), bukan room pertandingan — hanya layar itu yang menerima inputnya.
 */
export function TennisPad() {
  const linkRef = useRef<RoomLink | null>(null);
  const moveRef = useRef({ mx: 0, my: 0 });
  const [status, setStatus] = useState<Status>("connecting");
  const [code, setCode] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = cleanRoomCode(params.get("room"));
    if (!room) {
      queueMicrotask(() => setStatus("invalid"));
      return;
    }
    // Layar pemilik yang menentukan sisinya; `side` di pesan hanya pengisi bentuk.
    const side = 0;
    queueMicrotask(() => setCode(room));

    const link = openRoom(room);
    linkRef.current = link;
    let lastHost = 0;
    const stop = link.listen((msg) => {
      if (msg.t === "host" || msg.t === "snap") {
        lastHost = Date.now();
        setStatus("connected");
      }
    });
    link.ready.then(
      () => setStatus((current) => (current === "connecting" ? "waiting" : current)),
      () => setStatus("failed"),
    );
    // Tanda "controller masih ada" + ulangi arah terakhir (pesan bisa hilang di jaringan).
    const beat = window.setInterval(() => {
      link.send({ t: "pad" });
      link.send({ t: "in", side, ...moveRef.current });
      if (lastHost && Date.now() - lastHost > 6000) setStatus("waiting");
    }, 180);

    // Layar HP jangan tidur selama jadi controller (bila didukung).
    let wake: { release: () => Promise<void> } | null = null;
    const keepAwake = () => {
      const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
      nav.wakeLock?.request("screen").then(
        (lock) => {
          wake = lock;
        },
        () => {},
      );
    };
    keepAwake();
    const onVisible = () => document.visibilityState === "visible" && keepAwake();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(beat);
      document.removeEventListener("visibilitychange", onVisible);
      void wake?.release().catch(() => {});
      stop();
      link.send({ t: "in", side, mx: 0, my: 0 });
      link.close();
      linkRef.current = null;
    };
  }, []);

  const move = (mx: number, my: number) => {
    moveRef.current = { mx, my };
    linkRef.current?.send({ t: "in", side: 0, mx, my });
  };
  const shot = (kind: ShotKind) => linkRef.current?.send({ t: "shot", side: 0, kind });

  const message: Record<Status, string> = {
    connecting: "Connecting…",
    waiting: "Waiting for the game screen…",
    connected: "Connected — play on the big screen",
    failed: "Couldn't connect. Check your internet and reload.",
    invalid: "This controller link isn't valid. Scan the QR code on the game screen again.",
  };

  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <Text as="p" variant="body-14-bold" tone="accent" className={styles.title}>
          Slay Tennis controller
        </Text>
        <span className={styles.status} data-state={status} role="status">
          <span className={styles.dot} aria-hidden />
          {message[status]}
          {code && status !== "invalid" ? ` · ${code}` : ""}
        </span>
      </header>
      {status !== "invalid" && <PadControls onMove={move} onShot={shot} />}
    </main>
  );
}
