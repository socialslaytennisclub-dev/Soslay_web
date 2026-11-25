import { router } from "expo-router";
import { X } from "lucide-react-native";
import { useState } from "react";
import { Text } from "react-native";
import { Button, Field, IconButton, Muted, Row, Screen, Segmented } from "@/components/ui";
import { store, type ActivityKind } from "@/lib/store";
import { colors, type } from "@/lib/theme";

export default function NewActivity() {
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [kind, setKind] = useState<ActivityKind>("mabar");
  const [error, setError] = useState<string>();

  function create() {
    if (!title.trim()) return setError("Beri nama activity, mis. Mabar Sabtu");
    const a = store.addActivity({ title: title.trim(), venue: venue.trim(), kind, date: new Date().toISOString() });
    router.replace({ pathname: "/activity/[id]", params: { id: a.id } });
  }

  return (
    <Screen bg={colors.white}>
      <Row between>
        <Text style={[type.h2, { color: colors.navy900 }]}>Activity baru</Text>
        <IconButton icon={X} label="Tutup" onPress={() => router.back()} />
      </Row>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { label: "Mabar", value: "mabar" },
          { label: "Sparring", value: "sparring" },
          { label: "Match", value: "match" },
        ]}
      />
      <Field label="Nama activity" value={title} onChangeText={setTitle} placeholder="Mabar Sabtu" error={error} />
      <Field label="Venue (opsional)" value={venue} onChangeText={setVenue} placeholder="Senayan Tennis Indoor" />
      <Muted small>Activity & skor tersimpan di HP kamu dulu. Sinkron ke akun menyusul di versi berikutnya.</Muted>
      <Button label="Buat activity" onPress={create} />
    </Screen>
  );
}
