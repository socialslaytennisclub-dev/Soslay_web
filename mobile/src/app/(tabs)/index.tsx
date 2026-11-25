import { router } from "expo-router";
import { Bell, CalendarDays, ChevronRight, Radio, Video } from "lucide-react-native";
import { Linking, Pressable, Text, View } from "react-native";
import { Avatar, Button, Card, Chip, IconButton, Muted, Row, Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatDate, TIER_LABEL } from "@/lib/member";
import { computeMatch, scoreLine } from "@/lib/scoring";
import { useStore } from "@/lib/store";
import { colors, type } from "@/lib/theme";

export default function Home() {
  const { member, socialSlay } = useAuth();
  const lastMatch = useStore((d) => d.matches[0]);
  const activity = useStore((d) => d.activities.find((a) => a.id === lastMatch?.activityId));
  const nextSS = socialSlay.filter((s) => s.status === "registered" && Date.parse(s.startsAt) > Date.now()).at(-1);
  const progress = member?.nextTier ? Math.min(1, member.earned / member.nextTier.minPoints) : 1;
  const state = lastMatch ? computeMatch(lastMatch.points, lastMatch.format, lastMatch.firstServer) : null;

  return (
    <Screen>
      <Row between>
        <Row style={{ gap: 12 }}>
          <Avatar initials={member?.initials ?? "S"} />
          <View style={{ gap: 4 }}>
            <Text style={[type.h2, { color: colors.navy900 }]}>Halo, {member?.name.split(" ")[0] ?? "Slayer"}</Text>
            <Chip label={`${TIER_LABEL[member?.tier ?? "basic"]} Member`} />
          </View>
        </Row>
        <IconButton icon={Bell} label="Notifikasi" />
      </Row>

      <Card style={{ gap: 10 }}>
        <Row between>
          <Row style={{ alignItems: "baseline", gap: 6 }}>
            <Text style={[type.h1, { color: colors.navy900 }]}>{(member?.points ?? 0).toLocaleString("id-ID")}</Text>
            <Muted small>Slay Point</Muted>
          </Row>
          {member?.nextTier ? <Chip variant="indigo" label={`${TIER_LABEL[member.tier]} → ${member.nextTier.label}`} /> : null}
        </Row>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.indigo50 }}>
          <View style={{ width: `${progress * 100}%`, height: 6, borderRadius: 3, backgroundColor: colors.indigo600 }} />
        </View>
        <Muted small>
          {member?.nextTier ? `${(member.nextTier.minPoints - member.earned).toLocaleString("id-ID")} poin lagi ke ${member.nextTier.label}` : "Kamu sudah di tier tertinggi"}
        </Muted>
      </Card>

      <Card tone="navy" style={{ gap: 14 }}>
        <Text style={[type.h2, { color: colors.white }]}>Mau main hari ini?</Text>
        <Row style={{ gap: 10 }}>
          <Button label="Skor live" icon={Radio} variant="lime" style={{ flex: 1 }} onPress={() => router.push("/match/baru")} />
          <Button label="Rekam" icon={Video} variant="outline" style={{ flex: 1, borderColor: colors.white }} onPress={() => router.push("/rekam")} />
        </Row>
      </Card>

      {lastMatch && state ? (
        <>
          <Text style={[type.h3, { color: colors.navy900 }]}>Match terakhir</Text>
          <Pressable onPress={() => router.push({ pathname: "/match/[id]", params: { id: lastMatch.id } })}>
            <Card>
              <Row between>
                <Text style={[type.bodyStrong, { color: colors.navy900 }]}>{activity?.title ?? "Match"}</Text>
                <Row>
                  {state.winner ? <Chip label={state.winner === "A" ? "Tim A menang" : "Tim B menang"} /> : <Chip variant="red" label="LIVE" />}
                  <Text style={[type.h3, { color: colors.navy900 }]}>{scoreLine(state)}</Text>
                </Row>
              </Row>
              <Muted small>
                {lastMatch.teamA} vs {lastMatch.teamB}
              </Muted>
            </Card>
          </Pressable>
        </>
      ) : null}

      <Card tone="lime" style={{ gap: 10 }}>
        <Row between>
          <Chip variant="navy" label="Social Slay" />
          <Text style={[type.label, { color: colors.navy900 }]}>Pro gratis + foto</Text>
        </Row>
        <Text style={[type.h2, { color: colors.navy900 }]}>Main bareng komunitas Social Slay</Text>
        <Text style={[type.small, { color: colors.navy900 }]}>Dapat lawan main, skor live, video terpotong otomatis, dan foto dari fotografer.</Text>
        <Pressable
          onPress={() => (nextSS ? router.push("/activity") : Linking.openURL("https://www.slayclub.id/activity"))}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.white, borderRadius: 12, padding: 12 }}
        >
          <CalendarDays size={16} color={colors.navy900} />
          <Text style={[type.small, { color: colors.navy900, flex: 1 }]}>{nextSS ? `${formatDate(nextSS.startsAt)} · ${nextSS.title}` : "Lihat jadwal activity"}</Text>
          <ChevronRight size={16} color={colors.navy900} />
        </Pressable>
      </Card>
    </Screen>
  );
}
