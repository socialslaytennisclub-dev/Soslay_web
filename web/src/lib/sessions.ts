import { sessionStart, type ActivityTypeSlug, type Session } from "@/content/activity";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sesi yang belum lewat, urut dari yang paling dekat. */
export function upcomingSessions(sessions: Session[], now: Date): Session[] {
  return sessions
    .filter((session) => sessionStart(session).getTime() >= now.getTime())
    .sort((a, b) => sessionStart(a).getTime() - sessionStart(b).getTime());
}

export function filterByType(sessions: Session[], type?: ActivityTypeSlug): Session[] {
  return type ? sessions.filter((session) => session.type === type) : sessions;
}

/** Bagi sesi menjadi "7 hari ke depan" dan "setelahnya". */
export function groupByWeek(sessions: Session[], now: Date): { thisWeek: Session[]; later: Session[] } {
  const limit = now.getTime() + 7 * DAY_MS;
  return {
    thisWeek: sessions.filter((session) => sessionStart(session).getTime() < limit),
    later: sessions.filter((session) => sessionStart(session).getTime() >= limit),
  };
}

/** Sesi unggulan untuk hero: featured terdekat, atau sesi terdekat apa pun. */
export function pickFeatured(sessions: Session[]): Session | undefined {
  return sessions.find((session) => session.featured) ?? sessions[0];
}
