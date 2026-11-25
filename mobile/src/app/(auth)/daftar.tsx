import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Button, Field, IconButton, Muted, Row, Screen, Title } from "@/components/ui";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { colors, type } from "@/lib/theme";
import { localPhone, normalizeKuyId, validateSignUp, type SignUpErrors, type SignUpInput } from "@/lib/validation";

/**
 * Daftar → Supabase Auth dengan metadata yang sama seperti web (signup: "member").
 * Trigger DB `handle_member_signup` membuat profil → otomatis jadi member Social Slay (tier Basic).
 */
export default function SignUp() {
  const [v, setV] = useState<SignUpInput>({ fullName: "", kuyId: "", phone: "", gender: "", email: "", password: "" });
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const set = (k: keyof SignUpInput) => (text: string) => setV((p) => ({ ...p, [k]: text }));

  async function submit() {
    setError(undefined);
    const e = validateSignUp(v);
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!isSupabaseConfigured) return setError("Supabase belum dikonfigurasi. Isi file .env dulu (lihat README).");
    setLoading(true);
    const kuyId = normalizeKuyId(v.kuyId);
    const { data: free } = await supabase.rpc("kuy_id_available", { p_kuy_id: kuyId });
    if (free === false) {
      setLoading(false);
      return setErrors({ kuyId: "Kuy ID ini sudah terdaftar" });
    }
    const { data, error: err } = await supabase.auth.signUp({
      email: v.email.trim().toLowerCase(),
      password: v.password,
      options: {
        data: { signup: "member", full_name: v.fullName.trim(), display_name: "", kuy_id: kuyId, phone: localPhone(v.phone), birth_date: "", gender: v.gender },
      },
    });
    setLoading(false);
    if (err) {
      if (err.code === "user_already_exists" || err.code === "email_exists") return setErrors({ email: "Email sudah terdaftar — masuk saja" });
      if (err.code === "weak_password") return setErrors({ password: "Password terlalu lemah" });
      return setError("Akun belum bisa dibuat. Coba lagi sebentar.");
    }
    if (data.user && data.user.identities?.length === 0) return setErrors({ email: "Email sudah terdaftar — masuk saja" });
    if (!data.session) {
      Alert.alert("Cek email kamu", `Klik link konfirmasi yang kami kirim ke ${v.email.trim()}, lalu masuk.`);
      router.back();
    }
  }

  return (
    <Screen bg={colors.white}>
      <IconButton icon={ChevronLeft} label="Kembali" onPress={() => router.back()} />
      <Title>Daftar gratis</Title>
      <Muted>Langsung jadi member Social Slay: dapat Slay Point & bisa ikut activity.</Muted>
      <Field label="Nama lengkap" value={v.fullName} onChangeText={set("fullName")} error={errors.fullName} autoComplete="name" />
      <Field label="Kuy ID" value={v.kuyId} onChangeText={set("kuyId")} error={errors.kuyId} autoCapitalize="none" placeholder="mis. arya.tennis" />
      <Field label="Nomor WhatsApp" value={v.phone} onChangeText={set("phone")} error={errors.phone} keyboardType="phone-pad" placeholder="0812 3456 7890" />
      <View style={{ gap: 8 }}>
        <Text style={[type.label, { color: colors.navy900, fontFamily: "Inter_600SemiBold" }]}>Gender</Text>
        <Row>
          {(["male", "female"] as const).map((g) => (
            <Pressable key={g} onPress={() => setV((p) => ({ ...p, gender: g }))} style={{ flex: 1, height: 48, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", borderColor: v.gender === g ? colors.indigo600 : colors.border, backgroundColor: v.gender === g ? colors.indigo50 : colors.white }}>
              <Text style={[type.bodyStrong, { color: v.gender === g ? colors.indigo600 : colors.navy900 }]}>{g === "male" ? "Laki-laki" : "Perempuan"}</Text>
            </Pressable>
          ))}
        </Row>
        {errors.gender ? <Text style={[type.label, { color: colors.red500 }]}>{errors.gender}</Text> : null}
      </View>
      <Field label="Email" value={v.email} onChangeText={set("email")} error={errors.email} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Password" value={v.password} onChangeText={set("password")} error={errors.password} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      {error ? <Text style={[type.small, { color: colors.red500 }]}>{error}</Text> : null}
      <Button label="Daftar" onPress={submit} loading={loading} />
    </Screen>
  );
}
