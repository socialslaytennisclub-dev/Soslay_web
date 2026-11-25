import { router, useLocalSearchParams } from "expo-router";
import { Radio, X } from "lucide-react-native";
import { useState } from "react";
import { Text } from "react-native";
import { Button, Field, IconButton, Row, Screen, Segmented } from "@/components/ui";
import { FORMATS, type Side } from "@/lib/scoring";
import { store } from "@/lib/store";
import { colors, type } from "@/lib/theme";

/** Buat match. Tanpa activityId (Match cepat) → activity "Match cepat" dibuat otomatis. */
export default function NewMatch() {
  const { activityId } = useLocalSearchParams<{ activityId?: string }>();
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [court, setCourt] = useState("");
  const [format, setFormat] = useState("0");
  const [server, setServer] = useState<Side>("A");

  function start() {
    const actId =
      activityId ??
      store.addActivity({ title: `Match cepat · ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`, kind: "match", venue: "", date: new Date().toISOString() }).id;
    const m = store.addMatch({
      activityId: actId,
      court: court.trim(),
      teamA: teamA.trim() || "Tim A",
      teamB: teamB.trim() || "Tim B",
      format: FORMATS[Number(format)].value,
      firstServer: server,
    });
    router.replace({ pathname: "/match/[id]", params: { id: m.id } });
  }

  return (
    <Screen bg={colors.white}>
      <Row between>
        <Text style={[type.h2, { color: colors.navy900 }]}>Match baru</Text>
        <IconButton icon={X} label="Tutup" onPress={() => router.back()} />
      </Row>
      <Field label="Tim A" value={teamA} onChangeText={setTeamA} placeholder="Arya / Ratna" />
      <Field label="Tim B" value={teamB} onChangeText={setTeamB} placeholder="Tryan / Kasih" />
      <Field label="Court (opsional)" value={court} onChangeText={setCourt} placeholder="Court 2" />
      <Text style={[type.caps, { color: colors.muted }]}>Format</Text>
      <Segmented value={format} onChange={setFormat} options={FORMATS.map((f, i) => ({ label: f.label, value: String(i) }))} />
      <Text style={[type.caps, { color: colors.muted }]}>Servis pertama</Text>
      <Segmented value={server} onChange={setServer} options={[{ label: teamA.trim() || "Tim A", value: "A" }, { label: teamB.trim() || "Tim B", value: "B" }]} />
      <Button label="Mulai skor live" icon={Radio} onPress={start} />
    </Screen>
  );
}
