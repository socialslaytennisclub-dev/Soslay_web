import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { Check, ChevronLeft, Undo2 } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Chip, IconButton, Row } from "@/components/ui";
import { computeMatch, scoreLine, type Side } from "@/lib/scoring";
import { store, useStore } from "@/lib/store";
import { colors, type } from "@/lib/theme";

/** Skor live: tap separuh layar tim yang dapat poin. Undo membuang poin terakhir. */
export default function LiveScore() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const match = useStore((d) => d.matches.find((m) => m.id === id));
  if (!match) return null;
  const st = computeMatch(match.points, match.format, match.firstServer);
  const done = Boolean(st.winner);
  const set = st.sets[st.sets.length - 1];

  const point = (side: Side) => {
    if (done) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const points = [...match.points, side];
    const next = computeMatch(points, match.format, match.firstServer);
    store.updateMatch(match.id, { points, finishedAt: next.winner ? new Date().toISOString() : null });
  };
  const undo = () => match.points.length && store.updateMatch(match.id, { points: match.points.slice(0, -1), finishedAt: null });

  const half = (side: Side) => {
    const name = side === "A" ? match.teamA : match.teamB;
    const p = side === "A" ? st.point.a : st.point.b;
    const games = side === "A" ? set.a : set.b;
    const won = st.winner === side;
    return (
      <Pressable onPress={() => point(side)} style={[s.half, { backgroundColor: side === "A" ? colors.indigo600 : colors.navy700 }, won && { backgroundColor: colors.lime500 }]}>
        <Row>
          {st.server === side && !done ? <View style={s.serve} /> : null}
          <Text style={[type.bodyStrong, { color: won ? colors.navy900 : colors.white }]}>{name}</Text>
        </Row>
        <Text style={[type.score, { fontSize: 96, lineHeight: 104, color: won ? colors.navy900 : colors.white }]}>{done ? (won ? "Menang" : "") : p}</Text>
        <Text style={[type.h3, { color: won ? colors.navy900 : colors.indigo200 }]}>Game: {games}</Text>
        {!done ? <Text style={[type.label, { color: colors.indigo200 }]}>Tap untuk +1 poin</Text> : null}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.navy900 }}>
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
        <Row between>
          <IconButton icon={ChevronLeft} tone="dark" label="Kembali" onPress={() => router.back()} />
          <Row>
            {!done ? <Chip variant="red" label="LIVE" /> : <Chip label="Selesai" />}
            <Text style={[type.bodyStrong, { color: colors.white }]}>{match.court || "Match"} · Set {st.sets.length}</Text>
          </Row>
          <View style={{ width: 42 }} />
        </Row>
        {half("A")}
        <Row between>
          <Text style={[type.label, { color: colors.indigo200 }]}>Set: {scoreLine(st)}{st.inTiebreak ? " · Tiebreak" : ""}</Text>
          {st.situation ? <Chip label={st.situation} /> : null}
        </Row>
        {half("B")}
        <Row style={{ gap: 12 }}>
          <Button label="Undo" icon={Undo2} variant="primary" style={{ backgroundColor: colors.navy700, borderColor: colors.navy700 }} onPress={undo} disabled={!match.points.length} />
          <Button label={done ? "Selesai" : "Akhiri match"} icon={Check} variant="lime" style={{ flex: 1 }} onPress={() => (store.updateMatch(match.id, { finishedAt: match.finishedAt ?? new Date().toISOString() }), router.back())} />
        </Row>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  half: { flex: 1, borderRadius: 28, alignItems: "center", justifyContent: "center", gap: 6, padding: 20 },
  serve: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.lime500 },
});
