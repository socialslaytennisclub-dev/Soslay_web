import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import type { ShotKind, Side, Snapshot } from "./engine";

/**
 * Sambungan antar layar Slay Tennis lewat satu "room" (kode di link): layar permainan host,
 * layar lawan, dan HP yang jadi controller semuanya bergabung ke kanal yang sama.
 *
 *  · Produksi: Supabase Realtime broadcast (kanal `slay-tennis:<kode>`). Dipakai RealtimeClient
 *    langsung — TANPA klien auth Supabase di browser (lihat catatan Web Locks di useMemberUser).
 *  · Mode demo (tanpa Supabase): BroadcastChannel — hanya antar tab di browser yang sama, cukup
 *    untuk mencoba alurnya di lokal.
 *
 * Host menjalankan simulasi dan menyiarkan snapshot; layar lawan & controller hanya mengirim input.
 */

export type RoomMsg =
  /** Layar baru bertanya siapa host room ini. */
  | { t: "who"; id: string }
  /** Jawaban host (juga dikirim berkala) — `mode` & nama untuk layar tunggu. */
  | { t: "host"; id: string; name: string; guest: string | null; mode: "ai" | "vs"; match: string | null }
  /** Layar lawan bergabung / masih ada. */
  | { t: "join"; id: string; name: string }
  | { t: "leave"; id: string }
  /** Controller HP terhubung untuk sisi tertentu (dikirim berkala). */
  | { t: "pad"; side: Side }
  | { t: "in"; side: Side; mx: number; my: number }
  | { t: "shot"; side: Side; kind: ShotKind }
  /** Host → semua: keadaan permainan. */
  | { t: "snap"; s: Snapshot; live: boolean }
  /** Host → semua: mulai / ulang pertandingan. `match` = id catatan pertandingan di server (Slay Point). */
  | { t: "start"; match: string | null };

export type RoomLink = {
  send: (msg: RoomMsg) => void;
  /** Mengembalikan fungsi untuk berhenti mendengarkan. */
  listen: (cb: (msg: RoomMsg) => void) => () => void;
  close: () => void;
  /** Selesai saat kanal siap dipakai. */
  ready: Promise<void>;
};

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

export function cleanRoomCode(value: string | null | undefined) {
  const code = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return code.length >= 4 ? code : null;
}

export function newClientId() {
  return crypto.randomUUID();
}

export function openRoom(code: string): RoomLink {
  const listeners = new Set<(msg: RoomMsg) => void>();
  const emit = (msg: RoomMsg) => listeners.forEach((cb) => cb(msg));
  const listen = (cb: (msg: RoomMsg) => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };

  if (!isSupabaseConfigured) {
    const channel = new BroadcastChannel(`slay-tennis-${code}`);
    channel.onmessage = (event) => emit(event.data as RoomMsg);
    return {
      send: (msg) => channel.postMessage(msg),
      listen,
      close: () => channel.close(),
      ready: Promise.resolve(),
    };
  }

  let closed = false;
  let sendNow: ((msg: RoomMsg) => void) | null = null;
  let shut = () => {};
  const ready = import("@supabase/realtime-js").then(
    ({ RealtimeClient }) =>
      new Promise<void>((resolve, reject) => {
        const client = new RealtimeClient(`${supabaseUrl.replace(/^http/, "ws")}/realtime/v1`, {
          params: { apikey: supabaseAnonKey, eventsPerSecond: 40 },
        });
        const channel = client.channel(`slay-tennis:${code}`, { config: { broadcast: { self: false, ack: false } } });
        channel.on("broadcast", { event: "m" }, ({ payload }) => emit(payload as RoomMsg));
        shut = () => {
          void client.removeChannel(channel);
          client.disconnect();
        };
        if (closed) return shut();
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            sendNow = (msg) => void channel.send({ type: "broadcast", event: "m", payload: msg });
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            reject(new Error(status));
          }
        });
      }),
  );
  // Gagal tersambung ditangani pemanggil lewat `ready`; jangan jadi unhandled rejection.
  ready.catch(() => {});

  return {
    send: (msg) => sendNow?.(msg),
    listen,
    close: () => {
      closed = true;
      sendNow = null;
      shut();
    },
    ready,
  };
}
