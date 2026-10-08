import type { Metadata } from "next";
import { AuthStage } from "@/components/auth/AuthStage/AuthStage";
import { LoginForm } from "@/components/auth/AuthForms/LoginForm";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { loginPage } from "@/content/auth";

export const metadata: Metadata = {
  title: "Masuk — SOSLAY",
  description: "Masuk ke akun member Social Slay Tennis Club.",
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
    </>
  );
}
