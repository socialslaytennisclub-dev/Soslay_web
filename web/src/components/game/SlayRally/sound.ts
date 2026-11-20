import type { SoundKind } from "./engine";

/**
 * Suara Slay Rally — semuanya disintesis dengan Web Audio (tanpa file audio):
 * musik latar berupa loop sequencer kecil, plus efek pantulan/pukulan.
 * AudioContext baru dibuat di `unlock()`, yang harus dipanggil dari klik pengguna.
 */

const MUSIC_VOLUME = 0.2;
const SFX_VOLUME = 0.8;
const BPM = 112;
const STEP = 60 / BPM / 4; // satu not 1/16

/** Safari < 14.1 hanya punya versi berawalan. */
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
/** Safari 16.4+: kategori sesi audio (lihat `preferPlayback`). */
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

/** WAV PCM 8-bit berisi diam (0,1 detik) — untuk trik sesi audio iOS lama. */
function silentWavUrl() {
  const rate = 8000;
  const samples = rate / 10;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44); // 128 = nol untuk PCM 8-bit
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}

const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** Progresi empat bar: nada bass + tiga nada arpeggio (nomor MIDI). */
const BARS = [
  { bass: 45, tones: [69, 72, 76] },
  { bass: 41, tones: [69, 72, 77] },
  { bass: 48, tones: [67, 72, 76] },
  { bass: 43, tones: [67, 71, 74] },
];
const BASS_STEPS = new Set([0, 3, 6, 8, 11, 14]);
/** Tangga pentatonik — nada naik setiap blok pecah beruntun. */
const COMBO = [72, 74, 76, 79, 81, 84, 86, 88, 91];

const WAKE_EVENTS = ["pointerdown", "touchend", "click", "keydown"] as const;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  private muted = false;
  private musicLevel = 0;
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private combo = 0;
  private lastPlayed = new Map<SoundKind, number>();
  private hidden = false;
  private keepAlive: HTMLAudioElement | null = null;

  /**
   * Browser bisa menghentikan audio sendiri (pindah tab, layar terkunci, kebijakan autoplay).
   * Setiap sentuhan/tombol berikutnya menyalakannya lagi, supaya suara tidak "kadang hilang".
   */
  private wake = () => {
    if (this.hidden) return;
    if (this.keepAlive?.paused) void this.keepAlive.play().catch(() => {});
    // Safari juga punya status "interrupted" (telepon masuk, Siri) — semua selain "running" dibangunkan.
    if (this.ctx && this.ctx.state !== "running") void this.ctx.resume();
  };

  /**
   * iPhone/iPad: Web Audio ikut kategori "ambient" → DIAM saat tombol senyap (ring/silent) aktif,
   * padahal video & musik lain tetap bunyi. Safari 16.4+ bisa diminta kategori "playback";
   * Safari lama dipaksa lewat elemen <audio> diam yang diputar dari klik pengguna.
   */
  private preferPlayback() {
    const session = (navigator as AudioSessionNavigator).audioSession;
    if (session) {
      try {
        session.type = "playback";
        return;
      } catch {
        // Lanjut ke trik <audio>.
      }
    }
    if (this.keepAlive) return;
    const el = document.createElement("audio");
    el.src = silentWavUrl();
    el.loop = true;
    el.setAttribute("playsinline", "");
    el.setAttribute("x-webkit-airplay", "deny");
    this.keepAlive = el;
    void el.play().catch(() => {});
  }

  /** Panggil dari handler klik: browser hanya mengizinkan audio setelah interaksi. */
  unlock() {
    this.preferPlayback();
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      const limiter = ctx.createDynamicsCompressor();
      limiter.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(limiter);
      this.music = ctx.createGain();
      this.music.gain.value = 0;
      this.music.connect(this.master);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = SFX_VOLUME;
      this.sfx.connect(this.master);

      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;

      this.nextTime = ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 80);
      this.setMusicLevel(this.musicLevel);
      // iOS hanya menganggap touchend / click sebagai izin memutar audio (pointerdown = touchstart tidak).
      for (const type of WAKE_EVENTS) window.addEventListener(type, this.wake, true);
    }
    this.wake();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(
        muted ? 0 : 1,
        this.ctx.currentTime,
        0.03,
      );
  }

  /** 0 = musik diam, 1 = penuh (dipakai untuk meredam saat jeda / game over). */
  setMusicLevel(level: number) {
    this.musicLevel = level;
    if (this.ctx && this.music)
      this.music.gain.setTargetAtTime(
        level * MUSIC_VOLUME,
        this.ctx.currentTime,
        0.25,
      );
  }

  /** Tab disembunyikan → audio berhenti total. */
  setSuspended(suspended: boolean) {
    this.hidden = suspended;
    if (this.keepAlive) {
      if (suspended) this.keepAlive.pause();
      else void this.keepAlive.play().catch(() => {});
    }
    if (!this.ctx) return;
    if (suspended) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  dispose() {
    window.clearInterval(this.timer);
    for (const type of WAKE_EVENTS) window.removeEventListener(type, this.wake, true);
    void this.ctx?.close();
    this.ctx = null;
    if (this.keepAlive) {
      this.keepAlive.pause();
      URL.revokeObjectURL(this.keepAlive.src);
      this.keepAlive = null;
    }
  }

  // ── Efek ──────────────────────────────────────────────────────

  play(kind: SoundKind) {
    const { ctx, sfx } = this;
    if (!ctx || !sfx) return;
    if (ctx.state !== "running") {
      this.wake();
      return;
    }
    const t = ctx.currentTime;
    // Banyak bola sekaligus: jangan menumpuk suara yang sama dalam 35 ms.
    if (t - (this.lastPlayed.get(kind) ?? -1) < 0.035) return;
    this.lastPlayed.set(kind, t);

    switch (kind) {
      case "racket":
        // Pukulan raket: "pock" berongga yang tajam — letupan senar + badan bola yang kopong.
        this.combo = 0;
        this.pock(t, 1050, 0.085, 1);
        this.hiss(sfx, "highpass", 3800, 0.7, t, 0.012, 0.5); // "tik" senar
        this.tone(sfx, "sine", 150, 85, t, 0.05, 0.35);
        break;
      case "wall":
        // Pantulan di dinding/lapangan: lebih rendah, lebih tumpul, lebih pelan.
        this.pock(t, 620, 0.06, 0.5);
        this.tone(sfx, "sine", 120, 70, t, 0.05, 0.28);
        break;
      case "brick":
        this.pock(t, 780, 0.06, 0.6);
        break;
      case "break": {
        // Bola kena blok: pantulan bola dulu, lalu denting kecil yang naik saat beruntun.
        const note = COMBO[Math.min(this.combo, COMBO.length - 1)];
        this.combo += 1;
        this.pock(t, 840, 0.065, 0.7);
        this.tone(sfx, "sine", midi(note), midi(note), t + 0.01, 0.14, 0.16);
        break;
      }
      case "net":
        this.tone(sfx, "sine", 180, 420, t, 0.16, 0.5);
        break;
      case "bonus":
        this.arp([76, 81, 88], t, 0.07, 0.16, 0.4);
        break;
      case "level":
        this.arp([72, 76, 79, 84], t, 0.1, 0.24, 0.45);
        break;
      case "lose":
        this.tone(sfx, "sawtooth", 330, 110, t, 0.4, 0.25);
        break;
      case "over":
        this.arp([67, 64, 60, 55], t, 0.16, 0.3, 0.4);
        break;
    }
  }

  /**
   * Bunyi khas bola tenis: letupan derau sangat pendek yang diresonansikan di satu
   * frekuensi (rongga bola), dengan nada yang cepat turun. `pitch` rendah = lebih tumpul.
   */
  private pock(t: number, pitch: number, dur: number, peak: number) {
    const { ctx, sfx, noise } = this;
    if (!ctx || !sfx || !noise) return;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const body = ctx.createBiquadFilter();
    body.type = "bandpass";
    body.Q.value = 5;
    body.frequency.setValueAtTime(pitch * 1.5, t);
    body.frequency.exponentialRampToValueAtTime(pitch * 0.7, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak * 2.4, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    source.connect(body).connect(gain).connect(sfx);
    source.start(t, Math.random() * 0.5);
    source.stop(t + dur + 0.03);
    // Nada berongga di bawahnya memberi kesan "pok", bukan sekadar klik.
    this.tone(
      sfx,
      "triangle",
      pitch * 0.62,
      pitch * 0.36,
      t,
      dur * 0.8,
      peak * 0.5,
    );
  }

  /** Deretan nada naik/turun berjarak `gap` detik (bonus, naik level, game over). */
  private arp(
    notes: number[],
    t: number,
    gap: number,
    dur: number,
    peak: number,
  ) {
    if (!this.sfx) return;
    for (const [i, note] of notes.entries())
      this.tone(
        this.sfx,
        "triangle",
        midi(note),
        midi(note),
        t + i * gap,
        dur,
        peak,
      );
  }

  private tone(
    dest: AudioNode,
    type: OscillatorType,
    from: number,
    to: number,
    t: number,
    dur: number,
    peak: number,
  ) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private hiss(
    dest: AudioNode,
    type: BiquadFilterType,
    freq: number,
    q: number,
    t: number,
    dur: number,
    peak: number,
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    source.connect(filter).connect(gain).connect(dest);
    source.start(t, Math.random() * 0.5);
    source.stop(t + dur + 0.03);
  }

  // ── Musik latar ───────────────────────────────────────────────

  /** Jadwalkan not sedikit di depan waktu audio supaya temponya tidak goyah. */
  private schedule() {
    const { ctx, music } = this;
    if (!ctx || !music || ctx.state !== "running") return;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.3) {
      if (this.musicLevel > 0) this.playStep(music, this.step, this.nextTime);
      this.step = (this.step + 1) % (BARS.length * 16);
      this.nextTime += STEP;
    }
  }

  private playStep(dest: AudioNode, step: number, t: number) {
    const bar = BARS[Math.floor(step / 16)];
    const s = step % 16;
    if (s % 4 === 0) this.tone(dest, "sine", 130, 45, t, 0.16, 1); // kick
    if (s === 4 || s === 12)
      this.hiss(dest, "bandpass", 1700, 0.8, t, 0.11, 0.4); // snare
    if (s % 4 === 2) this.hiss(dest, "highpass", 7000, 0.7, t, 0.04, 0.22); // hi-hat
    if (BASS_STEPS.has(s)) {
      const note = bar.bass + (s === 6 || s === 14 ? 12 : 0);
      this.tone(dest, "triangle", midi(note), midi(note), t, 0.2, 0.7);
    }
    if (s % 2 === 0) {
      const note = bar.tones[(s / 2) % bar.tones.length];
      this.tone(dest, "triangle", midi(note), midi(note), t, 0.2, 0.22);
    }
  }
}
