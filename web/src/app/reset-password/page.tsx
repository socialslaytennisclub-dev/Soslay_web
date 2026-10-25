import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/AuthForms/ForgotPasswordForm";
import { ResetPasswordForm } from "@/components/auth/AuthForms/ResetPasswordForm";
import { AuthStage } from "@/components/auth/AuthStage/AuthStage";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { resetPage } from "@/content/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMemberSession } from "@/server/member/user";

export const metadata: Metadata = { title: "Set New Password — SOSLAY", robots: { index: false } };

/** Tujuan link reset password (lewat /auth/confirm yang membuat sesi). Tanpa sesi → minta link baru. */
export default async function ResetPasswordPage() {
  const signedIn = !isSupabaseConfigured || Boolean((await getMemberSession()).user);
  return (
    <>
      <Navbar variant="overlay" />
      <main>
        <AuthStage
          id="reset-title"
          title={resetPage.title}
          description={signedIn ? resetPage.description : resetPage.expired}
          switchTo={resetPage.switch}
        >
          {signedIn ? <ResetPasswordForm /> : <ForgotPasswordForm />}
        </AuthStage>
      </main>
      <Footer />
    </>
  );
}
