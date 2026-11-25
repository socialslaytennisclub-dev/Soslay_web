import "expo-sqlite/localStorage/install";
import { useSyncExternalStore } from "react";
import type { MatchFormat, Side } from "./scoring";

/**
 * Data v1 yang disimpan DI HP saja (localStorage dari expo-sqlite): activity buatan sendiri,
 * match + poinnya, dan tautan video → activity. Video-nya sendiri ada di galeri HP.
 * Sinkron ke Supabase menyusul setelah tabelnya disetujui (lihat mobile/supabase-draft.sql).
 */
export type ActivityKind = "mabar" | "sparring" | "match";
export type Activity = { id: string; title: string; kind: ActivityKind; venue: string; date: string; createdAt: string };
export type Match = {
  id: string;
  activityId: string;
  court: string;
  teamA: string;
  teamB: string;
  format: MatchFormat;
  firstServer: Side;
  points: Side[];
  finishedAt: string | null;
  createdAt: string;
};
/** Video di galeri (assetId) + activity yang dikaitkan. Social Slay → sessionId dari server. */
export type VideoLink = {
  assetId: string;
  createdAt: string;
  durationSec: number;
  activityId: string | null;
  sessionId: string | null;
  activityTitle: string | null;
};
type Data = { activities: Activity[]; matches: Match[]; videos: VideoLink[] };

const KEY = "soslay.v1";
const empty: Data = { activities: [], matches: [], videos: [] };

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<Data>) } : empty;
  } catch {
    return empty;
  }
}

let data: Data = load();
const listeners = new Set<() => void>();

function commit(next: Data) {
  data = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Selector harus mengembalikan nilai yang sudah ada di store (bukan array/objek baru), filter di luar. */
export const useStore = <T,>(select: (d: Data) => T): T => useSyncExternalStore(subscribe, () => select(data));

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();

export const store = {
  get: () => data,
  addActivity(a: Omit<Activity, "id" | "createdAt">) {
    const activity = { ...a, id: newId(), createdAt: now() };
    commit({ ...data, activities: [activity, ...data.activities] });
    return activity;
  },
  removeActivity(id: string) {
    commit({
      activities: data.activities.filter((a) => a.id !== id),
      matches: data.matches.filter((m) => m.activityId !== id),
      videos: data.videos.map((v) => (v.activityId === id ? { ...v, activityId: null, activityTitle: null } : v)),
    });
  },
  addMatch(m: Omit<Match, "id" | "createdAt" | "points" | "finishedAt">) {
    const match: Match = { ...m, id: newId(), createdAt: now(), points: [], finishedAt: null };
    commit({ ...data, matches: [match, ...data.matches] });
    return match;
  },
  updateMatch(id: string, patch: Partial<Match>) {
    commit({ ...data, matches: data.matches.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  },
  addVideo(v: VideoLink) {
    commit({ ...data, videos: [v, ...data.videos.filter((x) => x.assetId !== v.assetId)] });
  },
  linkVideo(assetId: string, link: Pick<VideoLink, "activityId" | "sessionId" | "activityTitle">) {
    commit({ ...data, videos: data.videos.map((v) => (v.assetId === assetId ? { ...v, ...link } : v)) });
  },
};
