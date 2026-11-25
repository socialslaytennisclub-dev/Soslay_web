import { Crown, ExternalLink, Lock, LogOut } from "lucide-react-native";
import { Alert, Linking, Text } from "react-native";
import { Avatar, Button, Card, Chip, Muted, Row, Screen, Title } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { TIER_LABEL } from "@/lib/member";
import { colors, type } from "@/lib/theme";

export default function Profile() {
  const { member, session, signOut } = useAuth();
  const tier = member ? TIER_LABEL[member.tier] : "Basic";

  return (
    <Screen>
      <Title>Profil</Title>
      <Card style={{ alignItems: "center", paddingVertical: 24 }}>
        <Avatar initials={member?.initials ?? "?"} size={72} />
        <Text style={[type.h2, { color: colors.navy900 }]}>{member?.name ?? session?.user.email}</Text>
        <Chip variant="navy" label={`${tier} Member`} />
        <Muted small>{(member?.points ?? 0).toLocaleString("id-ID")} Slay Point</Muted>
      </Card>

      <Card tone="navy">
        <Row>
          <Crown size={18} color={colors.lime500} />
          <Text style={[type.h3, { color: colors.white }]}>Paket Gratis</Text>
        </Row>
        <Text style={[type.body, { color: colors.indigo200 }]}>
          Rekam video & skor live gratis. SOSLAY Pro (Rp20.000/bulan) dengan potong otomatis segera hadir, dan gratis saat ikut activity Social Slay.
        </Text>
      </Card>

      <Card>
        <Row>
          <Lock size={16} color={colors.indigo600} />
          <Text style={[type.bodyStrong, { color: colors.navy900 }]}>Privasi video</Text>
        </Row>
        <Muted small>Video tersimpan di HP saja dan hanya kamu yang bisa melihat. Server hanya menyimpan akun, skor, Slay Point, dan tautan video ke activity.</Muted>
      </Card>

      <Button label="Kelola akun di slayclub.id" variant="outline" icon={ExternalLink} onPress={() => Linking.openURL("https://www.slayclub.id/akun")} />
      <Button
        label="Keluar"
        variant="ghost"
        icon={LogOut}
        onPress={() => Alert.alert("Keluar dari SOSLAY?", "", [{ text: "Batal", style: "cancel" }, { text: "Keluar", style: "destructive", onPress: signOut }])}
      />
    </Screen>
  );
}
