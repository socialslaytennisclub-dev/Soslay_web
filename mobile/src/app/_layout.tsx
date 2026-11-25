import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { ready, session } = useAuth();
  const [fontsLoaded] = useFonts({ Poppins_600SemiBold, Poppins_700Bold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const done = ready && fontsLoaded;
  useEffect(() => {
    if (done) SplashScreen.hideAsync();
  }, [done]);
  if (!done) return null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="activity/baru" options={{ presentation: "modal" }} />
        <Stack.Screen name="activity/[id]" />
        <Stack.Screen name="match/baru" options={{ presentation: "modal" }} />
        <Stack.Screen name="match/[id]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="rekam" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="simpan-video" options={{ presentation: "modal" }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootStack />
    </AuthProvider>
  );
}
