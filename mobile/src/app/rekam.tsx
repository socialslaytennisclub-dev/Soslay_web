import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Asset, usePermissions as useMediaPermissions } from "expo-media-library";
import { router } from "expo-router";
import { RefreshCcw, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Chip, IconButton, Row } from "@/components/ui";
import { store } from "@/lib/store";
import { colors, type } from "@/lib/theme";

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** Rekam video saja (tanpa skor). Hasil langsung disimpan ke galeri HP, tidak diunggah. */
export default function Record() {
  const cam = useRef<CameraView>(null);
  const [camPerm, askCam] = useCameraPermissions();
  const [micPerm, askMic] = useMicrophonePermissions();
  const [libPerm, askLib] = useMediaPermissions({ writeOnly: true });
  const [facing, setFacing] = useState<CameraType>("back");
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const granted = camPerm?.granted && micPerm?.granted && libPerm?.granted;
  if (!camPerm || !micPerm || !libPerm) return <View style={{ flex: 1, backgroundColor: colors.navy900 }} />;

  if (!granted) {
    const blocked = [camPerm, micPerm, libPerm].some((p) => !p.granted && !p.canAskAgain);
    return (
      <SafeAreaView style={[s.fill, { padding: 24, gap: 16, justifyContent: "center" }]}>
        <Text style={[type.h2, { color: colors.white }]}>Izinkan kamera, mikrofon & galeri</Text>
        <Text style={[type.body, { color: colors.indigo200 }]}>SOSLAY merekam permainanmu lalu menyimpannya langsung ke galeri HP. Video tidak diunggah ke mana pun.</Text>
        <Button
          label={blocked ? "Buka Pengaturan" : "Izinkan"}
          variant="lime"
          onPress={async () => {
            if (blocked) return Linking.openSettings();
            if (!camPerm.granted) await askCam();
            if (!micPerm.granted) await askMic();
            if (!libPerm.granted) await askLib();
          }}
        />
        <Button label="Nanti saja" variant="ghost" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  async function start() {
    if (!cam.current || !ready) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSecs(0);
    setRecording(true);
    const started = Date.now();
    try {
      const res = await cam.current.recordAsync();
      setRecording(false);
      if (!res?.uri) return;
      setSaving(true);
      const asset = await Asset.create(res.uri);
      store.addVideo({ assetId: asset.id, createdAt: new Date().toISOString(), durationSec: Math.round((Date.now() - started) / 1000), activityId: null, sessionId: null, activityTitle: null });
      router.replace({ pathname: "/simpan-video", params: { assetId: asset.id } });
    } catch (e) {
      setRecording(false);
      setSaving(false);
      Alert.alert("Gagal merekam", e instanceof Error ? e.message : "Coba lagi.");
    }
  }

  function stop() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    cam.current?.stopRecording();
  }

  return (
    <View style={s.fill}>
      <CameraView ref={cam} style={StyleSheet.absoluteFill} mode="video" facing={facing} onCameraReady={() => setReady(true)} />
      <SafeAreaView style={{ flex: 1, justifyContent: "space-between", padding: 16 }}>
        <Row between>
          <IconButton icon={X} tone="dark" label="Tutup" onPress={() => (recording ? Alert.alert("Masih merekam", "Hentikan rekaman dulu.") : router.back())} />
          {recording ? <Chip variant="red" label={`● REC ${mmss(secs)}`} /> : <Chip variant="navy" label="Video" />}
          <IconButton icon={RefreshCcw} tone="dark" label="Ganti kamera" onPress={() => !recording && setFacing((f) => (f === "back" ? "front" : "back"))} />
        </Row>
        <View style={{ alignItems: "center", gap: 12 }}>
          <Text style={[type.label, s.hint]}>
            {saving ? "Menyimpan ke galeri…" : recording ? "Tap untuk berhenti" : "Taruh HP di belakang baseline, posisi landscape. Tap untuk mulai."}
          </Text>
          <Pressable accessibilityLabel={recording ? "Berhenti" : "Mulai rekam"} disabled={saving || !ready} onPress={recording ? stop : start} style={s.shutter}>
            <View style={recording ? s.stop : s.dot} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navy900 },
  hint: { color: colors.white, backgroundColor: "rgba(10,8,74,0.6)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, overflow: "hidden", textAlign: "center" },
  shutter: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: colors.white, alignItems: "center", justifyContent: "center" },
  dot: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.red500 },
  stop: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.red500 },
});
