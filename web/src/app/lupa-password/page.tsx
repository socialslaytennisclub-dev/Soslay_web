import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/AuthForms/ForgotPasswordForm";
import { AuthStage } from "@/components/auth/AuthStage/AuthStage";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { forgotPage } from "@/content/auth";

export const metadata: Metadata = { title: "Forgot Password — SOSLAY", robots: { index: false } };

/** Lupa password — layout sama dengan Masuk. */
export default async function ForgotPasswordPage({ searchParams }: PageProps<"/lupa-password">) {
  const linkFailed = Boolean((await searchParams).link);
  return (
    <>
      <Navbar variant="overlay" />
      <main>
        <AuthStage id="forgot-title" title={forgotPage.title} description={linkFailed ? forgotPage.linkFailed : forgotPage.description} switchTo={forgotPage.switch}>
          <ForgotPasswordForm />
        </AuthStage>
      </main>
      <Footer />
    </>
  );
}
