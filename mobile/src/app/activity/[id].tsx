import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, ChevronRight, Lock, Play, Radio, Trash2 } from "lucide-react-native";
import { Alert, Pressable, Text, View } from "react-native";
import { Button, Card, Chip, IconButton, Muted, Row, Screen, Title } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/member";
import { computeMatch, scoreLine } from "@/lib/scoring";
import { store, useStore } from "@/lib/store";
import { colors, type } from "@/lib/theme";

/** Detail activity. `ss-<uuid>` = activity Social Slay (data server); selain itu activity di HP. */
export default function ActivityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { socialSlay } = useAuth();
  const isSS = id.startsWith("ss-");
  const ss = isSS ? socialSlay.find((s) => s.id === id.slice(3)) : undefined;
  const local = useStore((d) => d.activities.find((a) => a.id === id));
  const matches = useStore((d) => d.matches).filter((m) => m.activityId === id);
  const videos = useStore((d) => d.videos).filter((v) => (isSS ? v.sessionId === id.slice(3) : v.activityId === id));

  const title = ss?.title ?? local?.title ?? "Activity";
  const sub = ss ? `${formatDate(ss.startsAt)}${ss.venue ? ` · ${ss.venue}` : ""}` : local ? `${formatDate(local.date)}${local.venue ? ` · ${local.venue}` : ""}` : "";

  function remove() {
    Alert.alert("Hapus activity?", "Match & skornya ikut terhapus. Video di galeri tidak terhapus.", [
      { text: "Batal", style: "cancel" },
      { text: "Hapus", style: "destructive", onPress: () => (store.removeActivity(id), router.back()) },
    ]);
  }

  return (
    <Screen>
      <Row between>
        <IconButton icon={ChevronLeft} label="Kembali" onPress={() => router.back()} />
        {local ? <IconButton icon={Trash2} label="Hapus activity" onPress={remove} /> : null}
      </Row>
      {isSS ? <Chip label="Social Slay" /> : null}
      <Title>{title}</Title>
      {sub ? <Muted>{sub}</Muted> : null}

      {isSS ? (
        <Card tone="indigo">
          <Text style={[type.bodyStrong, { color: colors.navy900 }]}>Skor dari host</Text>
          <Muted small>Skor tiap ronde Social Slay akan tampil di sini setelah terhubung dengan line-up host (versi berikutnya).</Muted>
        </Card>
      ) : (
        <>
          <Row between>
            <Text style={[type.h3, { color: colors.navy900 }]}>Match</Text>
            <Muted small>{matches.length} match</Muted>
          </Row>
          {matches.map((m) => {
            const st = computeMatch(m.points, m.format, m.firstServer);
            return (
              <Pressable key={m.id} onPress={() => router.push({ pathname: "/match/[id]", params: { id: m.id } })}>
                <Card style={{ gap: 6 }}>
                  <Row between>
                    <Row>
                      {st.winner ? <Chip label="Selesai" /> : <Chip variant="red" label="LIVE" />}
                      {m.court ? <Text style={[type.bodyStrong, { color: colors.navy900 }]}>{m.court}</Text> : null}
                    </Row>
                    <ChevronRight size={20} color={colors.muted} />
                  </Row>
                  <Row between>
                    <Text style={[type.body, { color: colors.navy900, flex: 1 }]}>{m.teamA}</Text>
                    <Text style={[type.h3, { color: colors.indigo600 }]}>{scoreLine(st)}</Text>
                    <Text style={[type.body, { color: colors.navy900, flex: 1, textAlign: "right" }]}>{m.teamB}</Text>
                  </Row>
                </Card>
              </Pressable>
            );
          })}
          <Button label="Match baru · skor live" icon={Radio} onPress={() => router.push({ pathname: "/match/baru", params: { activityId: id } })} />
        </>
      )}

      <Row between>
        <Text style={[type.h3, { color: colors.navy900 }]}>Video kamu</Text>
        <Muted small>{videos.length} video</Muted>
      </Row>
      <Card style={{ gap: 10 }}>
        {videos.length === 0 ? <Muted small>Belum ada video yang dikaitkan ke activity ini.</Muted> : null}
        {videos.map((v) => (
          <Pressable key={v.assetId} onPress={() => router.push({ pathname: "/video", params: { play: v.assetId } })}>
            <Row>
              <View style={{ width: 56, height: 40, borderRadius: 10, backgroundColor: colors.courtBlue, alignItems: "center", justifyContent: "center" }}>
                <Play size={16} color={colors.white} />
              </View>
              <Text style={[type.bodyStrong, { color: colors.navy900, flex: 1 }]}>Video {formatDate(v.createdAt)}</Text>
              <Muted small>{Math.round(v.durationSec / 60)} mnt</Muted>
            </Row>
          </Pressable>
        ))}
        <Row style={{ backgroundColor: colors.indigo50, borderRadius: 10, padding: 10 }}>
          <Lock size={14} color={colors.indigo600} />
          <Text style={[type.label, { color: colors.indigo600, flex: 1 }]}>Hanya kamu yang bisa melihat. Video tersimpan di galeri HP-mu, tidak diunggah.</Text>
        </Row>
      </Card>
    </Screen>
  );
}
