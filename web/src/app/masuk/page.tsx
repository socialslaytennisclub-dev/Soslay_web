import type { Metadata } from "next";
import { AuthStage } from "@/components/auth/AuthStage/AuthStage";
import { LoginForm } from "@/components/auth/AuthForms/LoginForm";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { loginPage } from "@/content/auth";

export const metadata: Metadata = {
  title: "Sign In — SOSLAY",
  description: "Sign in to your Social Slay Tennis Club member account.",
};

/** Halaman Masuk — layout sama dengan Daftar (Figma 25:1850). */
export default async function LoginPage({ searchParams }: PageProps<"/masuk">) {
  const next = (await searchParams).next;
  return (
    <>
      <Navbar variant="overlay" />
      <main>
        <AuthStage id="login-title" title={loginPage.title} description={loginPage.description} switchTo={loginPage.switch}>
          <LoginForm next={Array.isArray(next) ? next[0] : next} />
        </AuthStage>
      </main>
      <Footer />
    </>
  );
}
