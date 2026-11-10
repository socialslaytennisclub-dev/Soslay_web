import "server-only";
import { DEFAULT_KUDOS_CATEGORIES, KUDOS_WINDOW_MS, type KudosTop, type MemberKudos, type PersonCard, type SessionKudos } from "@/lib/kudos";
import type { SessionKudosEntry } from "./admin/types";

/** Data contoh kudos untuk mode demo (tanpa Supabase): member, profil, host & admin. */

const DEMO_COUNTS: Record<string, number> = { forehand: 12, fair_play: 9, serve: 7, positivity: 6, volley: 4, teamwork: 4, footwork: 3, backhand: 2, cheerleader: 2, consistency: 1, style: 1 };

export const DEMO_MEMBER_KUDOS: MemberKudos = {
  total: Object.values(DEMO_COUNTS).reduce((a, b) => a + b, 0),
  uniqueGivers: 23,
  // Urutan seperti member_kudos: terbanyak dulu (seri → urutan kategori).
  categories: DEFAULT_KUDOS_CATEGORIES.map((c) => ({ ...c, count: DEMO_COUNTS[c.key] ?? 0 })).sort((a, b) => b.count - a.count),
};

/** Bagian kudos contoh: peserta demo (kecuali "kamu") + 1 host yang tidak ikut main. */
export function demoKudosSection(people: { id: string; name: string; me: boolean }[], endedAt: number, now: number): SessionKudos {
  const closes = endedAt + KUDOS_WINDOW_MS;
  const given = ["forehand", null, "fair_play", null, "serve", null, null];
  return {
    windowClosesAt: new Date(closes).toISOString(),
    canEdit: now <= closes,
    receivers: [
      ...people.filter((p) => !p.me).map((p, i) => ({ memberId: `demo-${p.id}`, name: p.name, avatar: null, role: "participant" as const, category: given[i] ?? null })),
      { memberId: "demo-host", name: "Rara Anindya", avatar: null, role: "host" as const, category: null },
    ],
    categories: DEFAULT_KUDOS_CATEGORIES,
  };
}

/** Chip kudos teratas contoh untuk host / admin. */
export function demoKudosTop(index: number): KudosTop | null {
  const top = DEMO_MEMBER_KUDOS.categories;
  return index % 4 === 3 ? null : { label: top[index % top.length].label, count: 9 - (index % 6) };
}

/** Contoh untuk mode demo: beberapa kudos antar peserta hadir. */
export function demoAdminKudos(people: { memberId: string | null; name: string; checkedIn: boolean }[], endsAt: string): SessionKudosEntry[] {
  const present = people.filter((p): p is typeof p & { memberId: string } => Boolean(p.memberId) && p.checkedIn).slice(0, 6);
  const cats = ["Forehand", "Fair play", "Serve", "Positivity", "Volley", "Teamwork", "Footwork"];
  const base = new Date(endsAt).getTime();
  return present.flatMap((giver, i) =>
    present
      .filter((_, j) => j !== i && (i + j) % 3 !== 0)
      .slice(0, 2)
      .map((receiver, j) => ({
        id: `demo-${i}-${j}`,
        giver: { id: giver.memberId, name: giver.name },
        receiver: { id: receiver.memberId, name: receiver.name },
        receiverRole: "participant" as const,
        category: cats[(i * 2 + j) % cats.length],
        at: new Date(base + (i * 2 + j + 1) * 1_800_000).toISOString(),
        deleted: i === 1 && j === 0 ? { at: new Date(base + 86_400_000).toISOString(), reason: "Kudos salah orang", source: "admin" as const } : null,
      })),
  );
}

/** Kartu peserta contoh (angka tetap per peserta). */
export function demoPersonCard(personId: string): PersonCard {
  const n = [...personId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const top = DEMO_MEMBER_KUDOS.categories.slice(n % 3, (n % 3) + 3).map((c) => ({ label: c.label, count: Math.max(1, c.count - (n % 4)) }));
  return { sessionsAttended: 4 + (n % 17), kudosTotal: top.reduce((a, t) => a + t.count, 0) + (n % 5), kudosGivers: 3 + (n % 9), kudosTop: top };
}

/** Chip kudos teratas contoh untuk host di tab Peserta (id peserta demo "0"…"7"). */
export function demoKudosTopByPerson(): Record<string, KudosTop> {
  const out: Record<string, KudosTop> = {};
  for (let i = 0; i < 8; i++) {
    const t = demoKudosTop(i);
    if (t) out[String(i)] = t;
  }
  return out;
}
