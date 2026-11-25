import { Link } from "expo-router";
import { Lock, Mail } from "lucide-react-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { Button, Field, Muted, Row, Screen, Title } from "@/components/ui";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { colors, type } from "@/lib/theme";

/** Masuk — akun yang sama dengan slayclub.id (Supabase Auth email + password). */
export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(undefined);
    if (!isSupabaseConfigured) return setError("Supabase belum dikonfigurasi. Isi file .env dulu (lihat README).");
    setLoading(true);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setLoading(false);
    if (!e) return;
    if (e.code === "invalid_credentials") setError("Email atau password salah.");
    else if (e.code === "email_not_confirmed") setError("Email belum dikonfirmasi. Cek inbox kamu.");
    else setError("Tidak bisa masuk sekarang. Coba lagi sebentar.");
  }

  async function forgot() {
    if (!email.trim()) return setError("Isi email dulu, lalu tap Lupa password.");
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    Alert.alert("Cek email kamu", "Kalau email terdaftar, link reset password sudah dikirim.");
  }

  return (
    <Screen bg={colors.white}>
      <View style={{ height: 24 }} />
      <Text style={[type.h1, { color: colors.indigo600 }]}>SOSLAY</Text>
      <Title>Masuk atau daftar gratis</Title>
      <Muted>Untuk semua pemain tenis. Sudah punya akun slayclub.id? Pakai yang sama — poin & tiketmu langsung muncul.</Muted>
      <Field label="Email" value={email} onChangeText={setEmail} placeholder="nama@email.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry autoComplete="password" textContentType="password" />
      {error ? <Text style={[type.small, { color: colors.red500 }]}>{error}</Text> : null}
      <Text onPress={forgot} style={[type.bodyStrong, { color: colors.indigo600, textAlign: "right" }]}>Lupa password?</Text>
      <Button label="Masuk" icon={Lock} onPress={submit} loading={loading} />
      <Row style={{ justifyContent: "center", marginTop: 8 }}>
        <Muted>Belum punya akun?</Muted>
        <Link href="/daftar" style={[type.bodyStrong, { color: colors.indigo600 }]}>Daftar gratis</Link>
      </Row>
      <Row style={{ justifyContent: "center" }}>
        <Mail size={14} color={colors.muted} />
        <Muted small>Sign in with Apple menyusul di build berikutnya.</Muted>
      </Row>
    </Screen>
  );
}
