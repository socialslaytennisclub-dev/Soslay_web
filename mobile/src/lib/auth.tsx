import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchMember, fetchSocialSlaySessions, type MemberSummary, type SocialSlaySession } from "./member";
import { supabase } from "./supabase";

type AuthState = {
  ready: boolean;
  session: Session | null;
  member: MemberSummary | null;
  socialSlay: SocialSlaySession[];
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState<MemberSummary | null>(null);
  const [socialSlay, setSocialSlay] = useState<SocialSlaySession[]>([]);

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setMember(null);
      setSocialSlay([]);
      return;
    }
    const [m, ss] = await Promise.all([fetchMember(s.user.id).catch(() => null), fetchSocialSlaySessions(s.user.id).catch(() => [])]);
    setMember(m);
    setSocialSlay(ss);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await load(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      void load(s);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const value: AuthState = {
    ready,
    session,
    member,
    socialSlay,
    refresh: () => load(session),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus di dalam AuthProvider");
  return ctx;
}
