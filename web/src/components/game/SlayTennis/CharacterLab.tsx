"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Text } from "@/components/ui";
import { cx } from "@/lib/cx";
import { createGhostslay, createMinslay, type Character, type Motion } from "./characters3d";
import styles from "./CharacterLab.module.css";

const MOTIONS: { id: Motion; label: string }[] = [
  { id: "idle", label: "Ready stance" },
  { id: "shuffle", label: "Side shuffle" },
  { id: "run", label: "Run" },
  { id: "forehand", label: "Forehand" },
  { id: "backhand", label: "Backhand" },
  { id: "serve", label: "Serve" },
  { id: "win", label: "Win" },
  { id: "lose", label: "Lose" },
];

/**
 * Ruang pratinjau karakter 3D Slay Tennis (/gameoncourt/characters): Minslay & Ghostslay berdiri
 * berdampingan, bisa diputar dengan geser, dan tiap gerakan bisa dicoba lewat tombol.
 */
export function CharacterLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const charactersRef = useRef<Character[]>([]);
  const turnRef = useRef({ angle: 0.5, spin: true, dragging: false, lastX: 0, slow: false });
  /** ?turn=<radian>&motion=<gerakan> membuka pratinjau pada sudut & gerakan tertentu (untuk dibagikan). */
  const [motion, setMotion] = useState<Motion>("idle");
  const [spin, setSpin] = useState(true);
  const [slow, setSlow] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      queueMicrotask(() => setUnsupported(true));
      return;
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a8a, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2.5, 5, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -3;
    sun.shadow.camera.right = sun.shadow.camera.top = 3;
    scene.add(sun);

    const css = getComputedStyle(canvas);
    const floorGeometry = new THREE.CircleGeometry(2.6, 64);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: css.getPropertyValue("--color-indigo-500").trim() || "#4035de", roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const minslay = createMinslay();
    const ghostslay = createGhostslay();
    minslay.root.scale.setScalar(1.12);
    ghostslay.root.scale.setScalar(1.2);
    const stage = new THREE.Group();
    scene.add(stage);
    const spots: [Character, number][] = [
      [minslay, -0.85],
      [ghostslay, 0.85],
    ];
    for (const [character, x] of spots) {
      character.root.position.x = x;
      stage.add(character.root);
    }
    charactersRef.current = [minslay, ghostslay];
    const params = new URLSearchParams(window.location.search);
    const startTurn = Number(params.get("turn"));
    if (params.has("turn") && Number.isFinite(startTurn)) {
      turnRef.current.angle = startTurn;
      turnRef.current.spin = false;
      queueMicrotask(() => setSpin(false));
    }
    if (params.get("slow") === "1") {
      turnRef.current.slow = true;
      queueMicrotask(() => setSlow(true));
    }
    const startMotion = MOTIONS.find((item) => item.id === params.get("motion"))?.id;
    if (startMotion) {
      for (const character of [minslay, ghostslay]) character.play(startMotion);
      queueMicrotask(() => setMotion(startMotion));
    }

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Layar sempit: kamera mundur supaya kedua karakter tetap muat.
      const distance = w / h < 0.9 ? 8.2 : 6;
      camera.position.set(0, 1.5, distance);
      camera.lookAt(0, 0.8, 0);
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const turn = turnRef.current;
      if (turn.spin && !turn.dragging) turn.angle += dt * 0.6;
      // Tiap karakter berputar di tempatnya sendiri.
      for (const [character] of spots) character.root.rotation.y = turn.angle;
      for (const [character] of spots) character.update(turn.slow ? dt * 0.25 : dt);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      charactersRef.current = [];
      minslay.dispose();
      ghostslay.dispose();
      floorGeometry.dispose();
      floorMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  const play = (next: Motion) => {
    setMotion(next);
    for (const character of charactersRef.current) character.play(next);
  };

  // Pukulan (sekali jalan) diulang terus selama dipilih, supaya mudah diamati.
  useEffect(() => {
    if (!["forehand", "backhand", "serve"].includes(motion)) return;
    const timer = window.setInterval(() => {
      for (const character of charactersRef.current) character.play(motion);
    }, slow ? 5200 : 1500);
    return () => window.clearInterval(timer);
  }, [motion, slow]);

  const toggleSlow = () => {
    turnRef.current.slow = !slow;
    setSlow(!slow);
  };

  const toggleSpin = () => {
    turnRef.current.spin = !spin;
    setSpin(!spin);
  };

  return (
    <section className={styles.section} aria-label="Slay Tennis characters">
      <div className={styles.stage}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          role="img"
          aria-label="Minslay and Ghostslay 3D characters"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            turnRef.current.dragging = true;
            turnRef.current.lastX = event.clientX;
          }}
          onPointerMove={(event) => {
            const turn = turnRef.current;
            if (!turn.dragging) return;
            turn.angle += (event.clientX - turn.lastX) * 0.012;
            turn.lastX = event.clientX;
          }}
          onPointerUp={() => (turnRef.current.dragging = false)}
          onPointerCancel={() => (turnRef.current.dragging = false)}
        />
        <div className={styles.names} aria-hidden>
          <span>Minslay</span>
          <span>Ghostslay</span>
        </div>
        {unsupported && (
          <Text variant="body-16" tone="on-inverse" align="center" className={styles.notice} role="alert">
            3D graphics (WebGL) isn&apos;t available in this browser.
          </Text>
        )}
      </div>

      <div className={styles.panel}>
        <Text as="h1" variant="title-24" tone="white">
          Slay Tennis characters
        </Text>
        <Text variant="body-14" tone="on-inverse" muted>
          Drag to turn the characters. Tap a motion to preview it on both.
        </Text>
        <div className={styles.buttons} role="group" aria-label="Motions">
          {MOTIONS.map((item) => (
            <button key={item.id} type="button" className={cx(styles.chip, motion === item.id && styles.chipOn)} aria-pressed={motion === item.id} onClick={() => play(item.id)}>
              {item.label}
            </button>
          ))}
          <button type="button" className={cx(styles.chip, styles.chipGhost, spin && styles.chipOn)} aria-pressed={spin} onClick={toggleSpin}>
            Auto-turn
          </button>
          <button type="button" className={cx(styles.chip, styles.chipGhost, slow && styles.chipOn)} aria-pressed={slow} onClick={toggleSlow}>
            Slow motion
          </button>
        </div>
      </div>
    </section>
  );
}
