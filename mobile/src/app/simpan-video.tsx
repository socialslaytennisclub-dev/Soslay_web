import { router, useLocalSearchParams } from "expo-router";
import { Check, CircleCheck, Lock } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Card, Chip, Muted, Row, Screen, Title } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/member";
import { store, useStore } from "@/lib/store";
import { colors, type } from "@/lib/theme";

type Choice = { key: string; title: string; sub: string; activityId: string | null; sessionId: string | null; ss?: boolean };

/** Setelah rekam (atau dari tab Video): kaitkan video ke activity — opsional. */
export default function SaveVideo() {
  const { assetId } = useLocalSearchParams<{ assetId: string }>();
  const { socialSlay } = useAuth();
  const activities = useStore((d) => d.activities);
  const video = useStore((d) => d.videos.find((v) => v.assetId === assetId));
  const [pick, setPick] = useState<string>(video?.sessionId ? `ss-${video.sessionId}` : video?.activityId ?? "none");

  const choices: Choice[] = [
    ...socialSlay.map((s) => ({ key: `ss-${s.id}`, title: s.title, sub: `${formatDate(s.startsAt)}${s.venue ? ` · ${s.venue}` : ""}`, activityId: null, sessionId: s.id, ss: true })),
    ...activities.slice(0, 10).map((a) => ({ key: a.id, title: a.title, sub: formatDate(a.date), activityId: a.id, sessionId: null })),
    { key: "none", title: "Tanpa activity", sub: "Simpan saja di Video", activityId: null, sessionId: null },
  ];

  function save() {
    const c = choices.find((x) => x.key === pick);
    if (c) store.linkVideo(assetId, { activityId: c.activityId, sessionId: c.sessionId, activityTitle: c.key === "none" ? null : c.title });
    router.dismissTo("/video");
  }

  return (
    <Screen bg={colors.white}>
      <Row>
        <CircleCheck size={22} color={colors.indigo600} />
        <Text style={[type.bodyStrong, { color: colors.indigo600 }]}>Tersimpan di galeri HP</Text>
      </Row>
      <Title>Kaitkan ke activity?</Title>
      <Muted small>Opsional. Video tetap di HP-mu; yang disimpan hanya tautannya ke activity.</Muted>
      {choices.map((c) => {
        const on = pick === c.key;
        return (
          <Pressable key={c.key} onPress={() => setPick(c.key)}>
            <Card style={{ borderWidth: 1.5, borderColor: on ? colors.indigo600 : colors.border, backgroundColor: on ? colors.indigo50 : colors.white }}>
              <Row>
                <View style={{ flex: 1, gap: 4 }}>
                  {c.ss ? <Chip label="Social Slay" /> : null}
                  <Text style={[type.bodyStrong, { color: colors.navy900 }]}>{c.title}</Text>
                  <Muted small>{c.sub}</Muted>
                </View>
                {on ? <Check size={20} color={colors.indigo600} /> : null}
              </Row>
            </Card>
          </Pressable>
        );
      })}
      <Row style={{ backgroundColor: colors.indigo50, borderRadius: 12, padding: 10 }}>
        <Lock size={14} color={colors.indigo600} />
        <Text style={[type.label, { color: colors.indigo600, flex: 1 }]}>Hanya kamu yang bisa melihat video ini.</Text>
      </Row>
      <Button label="Simpan" onPress={save} />
    </Screen>
  );
}
