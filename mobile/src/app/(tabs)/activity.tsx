import { router } from "expo-router";
import { ChevronRight, Plus, Radio, Users } from "lucide-react-native";
import { Linking, Pressable, Text } from "react-native";
import { Button, Card, Chip, IconButton, Muted, Row, Screen, Title } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/member";
import { useStore } from "@/lib/store";
import { colors, type } from "@/lib/theme";

const KIND = { mabar: ["Mabar", "indigo"], sparring: ["Sparring", "muted"], match: ["Match", "muted"] } as const;

/** Tab Activity: activity Social Slay (dari server) + activity buatan sendiri (di HP). Skor ada di dalam activity. */
export default function ActivityTab() {
  const { socialSlay } = useAuth();
  const activities = useStore((d) => d.activities);
  const matches = useStore((d) => d.matches);
  const videos = useStore((d) => d.videos);

  return (
    <Screen>
      <Row between>
        <Title>Activity</Title>
        <IconButton icon={Plus} tone="brand" label="Buat activity" onPress={() => router.push("/activity/baru")} />
      </Row>

      {socialSlay.length ? <Text style={[type.caps, { color: colors.muted }]}>Social Slay</Text> : null}
      {socialSlay.slice(0, 5).map((s) => {
        const count = videos.filter((v) => v.sessionId === s.id).length;
        return (
          <Pressable key={s.id} onPress={() => router.push({ pathname: "/activity/[id]", params: { id: `ss-${s.id}` } })}>
            <Card style={{ borderColor: colors.lime500, borderWidth: 2, gap: 8 }}>
              <Row between>
                <Chip label="Social Slay" />
                <Muted small>{s.status === "attended" ? "Hadir" : s.status === "registered" ? "Terdaftar" : s.status}</Muted>
              </Row>
              <Text style={[type.h3, { color: colors.navy900 }]}>{s.title}</Text>
              <Muted small>
                {formatDate(s.startsAt)}
                {s.venue ? ` · ${s.venue}` : ""}
                {count ? ` · ${count} video` : ""}
              </Muted>
            </Card>
          </Pressable>
        );
      })}

      <Text style={[type.caps, { color: colors.muted }]}>Activity kamu</Text>
      {activities.length === 0 ? (
        <Card style={{ alignItems: "center" }}>
          <Muted>Belum ada activity. Buat mabar atau sparring, lalu catat skornya live.</Muted>
        </Card>
      ) : null}
      {activities.map((a) => {
        const live = matches.find((m) => m.activityId === a.id && !m.finishedAt);
        const [label, variant] = KIND[a.kind];
        return (
          <Pressable key={a.id} onPress={() => router.push({ pathname: "/activity/[id]", params: { id: a.id } })}>
            <Card style={{ gap: 8 }}>
              <Row between>
                <Row>
                  <Chip variant={live ? "red" : variant} label={live ? "LIVE" : label} />
                  <Text style={[type.bodyStrong, { color: colors.navy900 }]}>{a.title}</Text>
                </Row>
                <ChevronRight size={20} color={colors.muted} />
              </Row>
              <Muted small>
                {formatDate(a.date)}
                {a.venue ? ` · ${a.venue}` : ""} · {matches.filter((m) => m.activityId === a.id).length} match
              </Muted>
            </Card>
          </Pressable>
        );
      })}

      <Pressable onPress={() => Linking.openURL("https://www.slayclub.id/activity")}>
        <Card tone="navy" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Users size={20} color={colors.lime500} />
          <Text style={[type.bodyStrong, { color: colors.white, flex: 1 }]}>Cari activity Social Slay</Text>
          <ChevronRight size={20} color={colors.white} />
        </Card>
      </Pressable>
      <Row style={{ gap: 10 }}>
        <Button label="Mabar / grup" icon={Users} variant="outline" style={{ flex: 1 }} onPress={() => router.push("/activity/baru")} />
        <Button label="Match cepat" icon={Radio} style={{ flex: 1 }} onPress={() => router.push("/match/baru")} />
      </Row>
    </Screen>
  );
}
