"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { AFTER_AUTH } from "@/content/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { PasswordField } from "./PasswordField";
import styles from "./AuthForms.module.css";

type State = "checking" | "ready" | "invalid" | "saving";

/**
 * Link undangan Supabase membawa token di URL (#access_token=…). Token dipakai untuk membuat
 * sesi, lalu user menetapkan password. Staf diundang → /admin; member yang ditambahkan admin
 * (metadata signup = "member") → /akun.
 */
export function AcceptInviteForm() {
  const router = useRouter();
  const [state, setState] = useState<State>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    const start = access_token && refresh_token ? supabase.auth.setSession({ access_token, refresh_token }) : supabase.auth.getSession();
    start.then(({ data }) => {
      // Token jangan tertinggal di address bar / riwayat.
      window.history.replaceState(null, "", window.location.pathname);
      setIsMember(data.session?.user.user_metadata?.signup === "member");
      setState(data.session ? "ready" : "invalid");
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setError("Password minimal 8 karakter.");
    if (password !== confirm) return setError("Konfirmasi password belum sama.");
    setState("saving");
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError("Gagal menyimpan password. Coba lagi atau minta undangan baru.");
      setState("ready");
      return;
    }
    if (!isMember) await supabase.rpc("touch_staff_login");
    router.replace(isMember ? AFTER_AUTH : "/admin");
    router.refresh();
  }

  if (state === "checking") return <p className={styles.error}>Memeriksa undangan…</p>;
  if (state === "invalid") return <p className={styles.error}>Link undangan sudah kedaluwarsa atau sudah dipakai. Minta admin Soslay mengirim undangan baru.</p>;

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.fields}>
        <PasswordField label="Password baru" autoComplete="new-password" placeholder="Minimal 8 karakter" value={password} onChange={(e) => setPassword(e.target.value)} />
        <PasswordField label="Ulangi password" autoComplete="new-password" placeholder="Ketik ulang password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="arrow" className={styles.submit} disabled={state === "saving"}>
        {state === "saving" ? "Menyimpan…" : isMember ? "Simpan & masuk" : "Simpan & masuk admin"}
      </Button>
    </form>
  );
}
