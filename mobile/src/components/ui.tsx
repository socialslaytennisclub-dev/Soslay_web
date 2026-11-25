import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, type } from "@/lib/theme";

type ButtonStyle = "primary" | "brand" | "lime" | "outline" | "ghost";
const BUTTON: Record<ButtonStyle, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.navy900, fg: colors.white },
  brand: { bg: colors.indigo600, fg: colors.white },
  lime: { bg: colors.lime500, fg: colors.navy900 },
  outline: { bg: colors.white, fg: colors.indigo600, border: colors.indigo600 },
  ghost: { bg: colors.indigo50, fg: colors.indigo600 },
};

export function Button({ label, onPress, variant = "brand", icon: Icon, loading, disabled, style }: {
  label: string;
  onPress?: () => void;
  variant?: ButtonStyle;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = BUTTON[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.button, { backgroundColor: c.bg, borderColor: c.border ?? c.bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color={c.fg} /> : Icon ? <Icon size={20} color={c.fg} /> : null}
      <Text style={[type.bodyStrong, { color: c.fg }]}>{label}</Text>
    </Pressable>
  );
}

type ChipStyle = "lime" | "indigo" | "navy" | "red" | "muted";
const CHIP: Record<ChipStyle, [string, string]> = {
  lime: [colors.lime500, colors.navy900],
  indigo: [colors.indigo100, colors.indigo600],
  navy: [colors.navy900, colors.lime500],
  red: [colors.red500, colors.white],
  muted: [colors.indigo50, colors.muted],
};
export function Chip({ label, variant = "lime" }: { label: string; variant?: ChipStyle }) {
  const [bg, fg] = CHIP[variant];
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      <Text style={[type.label, { color: fg, fontFamily: "Inter_600SemiBold" }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style, tone = "white" }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: "white" | "navy" | "lime" | "indigo" }) {
  const bg = { white: colors.white, navy: colors.navy900, lime: colors.lime500, indigo: colors.indigo50 }[tone];
  return <View style={[s.card, { backgroundColor: bg, borderWidth: tone === "white" ? 1 : 0 }, style]}>{children}</View>;
}

export function Screen({ children, bg = colors.indigo50, scroll = true, padded = true }: { children: ReactNode; bg?: string; scroll?: boolean; padded?: boolean }) {
  const inner = <View style={[padded && s.pad, { gap: 16 }]}>{children}</View>;
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: bg }}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

export function IconButton({ icon: Icon, onPress, tone = "white", label }: { icon: LucideIcon; onPress?: () => void; tone?: "white" | "dark" | "brand"; label: string }) {
  const bg = { white: colors.white, dark: colors.navy700, brand: colors.indigo600 }[tone];
  const fg = tone === "white" ? colors.navy900 : colors.white;
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={[s.iconBtn, { backgroundColor: bg, borderWidth: tone === "white" ? 1 : 0 }]}>
      <Icon size={20} color={fg} />
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[type.label, { color: colors.navy900, fontFamily: "Inter_600SemiBold" }]}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={[s.input, error ? { borderColor: colors.red500 } : null]} {...props} />
      {error ? <Text style={[type.label, { color: colors.red500 }]}>{error}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segItem, on && { backgroundColor: colors.indigo600 }]}>
            <Text style={[type.bodyStrong, { color: on ? colors.white : colors.muted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ children, style, between }: { children: ReactNode; style?: StyleProp<ViewStyle>; between?: boolean }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, between && { justifyContent: "space-between" }, style]}>{children}</View>;
}

export function Avatar({ initials, size = 40, tone = "indigo" }: { initials: string; size?: number; tone?: "indigo" | "navy" | "lime" }) {
  const [bg, fg] = { indigo: [colors.indigo600, colors.white], navy: [colors.navy900, colors.lime500], lime: [colors.lime500, colors.navy900] }[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={[type.bodyStrong, { color: fg, fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

export const Title = ({ children, color = colors.navy900 }: { children: ReactNode; color?: string }) => <Text style={[type.displayL, { color }]}>{children}</Text>;
export const Muted = ({ children, small }: { children: ReactNode; small?: boolean }) => <Text style={[small ? type.small : type.body, { color: colors.muted }]}>{children}</Text>;

const s = StyleSheet.create({
  button: { height: 52, borderRadius: radius.button, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5 },
  chip: { borderRadius: radius.chip, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  card: { borderRadius: radius.card, padding: 16, gap: 12, borderColor: colors.border },
  pad: { paddingHorizontal: 20, paddingTop: 8 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", borderColor: colors.border },
  input: { height: 52, borderRadius: radius.button, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: 16, fontFamily: "Inter_400Regular", fontSize: 15, color: colors.navy900 },
  seg: { flexDirection: "row", backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 4, gap: 4 },
  segItem: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10 },
});
