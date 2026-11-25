import type { ComponentProps } from "react";
import { router, Tabs } from "expo-router";
import { CalendarDays, House, Play, User, Video, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "@/lib/theme";

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const TABS: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: "Beranda", icon: House },
  activity: { label: "Activity", icon: CalendarDays },
  video: { label: "Video", icon: Play },
  profil: { label: "Profil", icon: User },
};

/** Tab bar sesuai Figma: Beranda · Activity · [Rekam] · Video · Profil. Rekam membuka kamera (bukan tab). */
function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const items = state.routes.map((route, index) => ({ route, focused: state.index === index }));
  const render = ({ route, focused }: (typeof items)[number]) => {
    const t = TABS[route.name];
    if (!t) return null;
    const color = focused ? colors.indigo600 : colors.muted;
    return (
      <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} onPress={() => navigateToTab(route.key)} style={s.item}>
        <t.icon size={24} color={color} />
        <Text style={[type.label, { fontSize: 10, color, fontFamily: focused ? "Inter_600SemiBold" : "Inter_500Medium" }]}>{t.label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {items.slice(0, 2).map(render)}
      <Pressable accessibilityRole="button" accessibilityLabel="Rekam video" onPress={() => router.push("/rekam")} style={s.item}>
        <View style={s.rec}>
          <Video size={24} color={colors.navy900} />
        </View>
        <Text style={[type.label, { fontSize: 10, color: colors.navy900, fontFamily: "Inter_600SemiBold" }]}>Rekam</Text>
      </Pressable>
      {items.slice(2).map(render)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="video" />
      <Tabs.Screen name="profil" />
    </Tabs>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 20, paddingTop: 8 },
  item: { width: 56, alignItems: "center", gap: 4 },
  rec: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.lime500, alignItems: "center", justifyContent: "center", marginTop: -20 },
});
