import "expo-sqlite/localStorage/install";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

/**
 * Supabase yang SAMA dengan web (slayclub.id). Hanya publishable/anon key — RLS yang menjaga data.
 * Sesi login disimpan di HP (localStorage dari expo-sqlite) supaya tetap masuk setelah app ditutup.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const isSupabaseConfigured = Boolean(url && key);

export const supabase = createClient(url || "https://example.invalid", key || "missing-key", {
  auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
