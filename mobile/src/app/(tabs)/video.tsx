import { Asset } from "expo-media-library";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { Link2, Lock, Play, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Chip, IconButton, Muted, Row, Screen, Title } from "@/components/ui";
import { formatDate } from "@/lib/member";
import { useStore, type VideoLink } from "@/lib/store";
import { colors, type } from "@/lib/theme";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

/** Video milik user. File ada di galeri HP (tidak diunggah); di sini hanya daftar + tautan activity. */
export default function Videos() {
  const videos = useStore((d) => d.videos);
  const { play } = useLocalSearchParams<{ play?: string }>();
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (play) setOpen(play);
  }, [play]);

  return (
    <Screen>
      <Title>Video</Title>
      <Row style={{ backgroundColor: colors.white, borderRadius: 14, padding: 12 }}>
        <Lock size={16} color={colors.indigo600} />
        <Text style={[type.label, { color: colors.indigo600, flex: 1 }]}>Hanya kamu yang bisa melihat. Video tersimpan di galeri HP-mu dan tidak pernah diunggah.</Text>
      </Row>
      {videos.length === 0 ? (
        <Card style={{ alignItems: "center", paddingVertical: 32 }}>
          <Play size={28} color={colors.indigo600} />
          <Text style={[type.h3, { color: colors.navy900 }]}>Belum ada video</Text>
          <Muted small>Tekan tombol Rekam di tengah untuk merekam permainanmu.</Muted>
          <Button label="Rekam sekarang" variant="lime" onPress={() => router.push("/rekam")} />
        </Card>
      ) : (
        videos.map((v) => <VideoRow key={v.assetId} v={v} onPlay={() => setOpen(v.assetId)} />)
      )}
      <Modal visible={!!open} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setOpen(null)}>
        {open ? <Player assetId={open} onClose={() => setOpen(null)} /> : null}
      </Modal>
    </Screen>
  );
}

function VideoRow({ v, onPlay }: { v: VideoLink; onPlay: () => void }) {
  return (
    <Pressable onPress={onPlay}>
      <Card style={{ gap: 8 }}>
        <Row>
          <View style={{ width: 72, height: 52, borderRadius: 12, backgroundColor: colors.courtBlue, alignItems: "center", justifyContent: "center" }}>
            <Play size={20} color={colors.white} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[type.bodyStrong, { color: colors.navy900 }]}>{formatDate(v.createdAt)}</Text>
            <Muted small>Durasi {mmss(v.durationSec)}</Muted>
          </View>
        </Row>
        <Row between>
          {v.activityTitle ? <Chip variant={v.sessionId ? "lime" : "indigo"} label={v.activityTitle} /> : <Chip variant="muted" label="Tanpa activity" />}
          <Pressable onPress={() => router.push({ pathname: "/simpan-video", params: { assetId: v.assetId } })} hitSlop={8}>
            <Row>
              <Link2 size={14} color={colors.indigo600} />
              <Text style={[type.label, { color: colors.indigo600 }]}>Kaitkan</Text>
            </Row>
          </Pressable>
        </Row>
      </Card>
    </Pressable>
  );
}

function Player({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    new Asset(assetId).getUri().then(setUri, () => setError(true));
  }, [assetId]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
      <Row between style={{ padding: 16 }}>
        <Text style={[type.bodyStrong, { color: colors.white }]}>Video kamu</Text>
        <IconButton icon={X} tone="dark" label="Tutup" onPress={onClose} />
      </Row>
      {error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={[type.body, { color: colors.white, textAlign: "center" }]}>Video tidak ditemukan di galeri. Mungkin sudah dihapus dari HP.</Text>
        </View>
      ) : uri ? (
        <Playback uri={uri} />
      ) : null}
    </SafeAreaView>
  );
}

function Playback({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => p.play());
  return <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls />;
}
