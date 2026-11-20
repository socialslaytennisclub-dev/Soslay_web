import type { Metadata } from "next";
import { AuthStage } from "@/components/auth/AuthStage/AuthStage";
import { LoginForm } from "@/components/auth/AuthForms/LoginForm";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { authCopyFor, loginPage, withNext } from "@/content/auth";

export const metadata: Metadata = {
  title: "Sign In — SOSLAY",
  description: "Sign in to your Social Slay Tennis Club member account.",
};

/** Halaman Masuk — layout sama dengan Daftar (Figma 25:1850). */
export default async function LoginPage({ searchParams }: PageProps<"/masuk">) {
  const raw = (await searchParams).next;
  const next = Array.isArray(raw) ? raw[0] : raw;
  const copy = authCopyFor(next, "login") ?? loginPage;
  return (
    <>
      <Navbar variant="overlay" />
      <main>
        <AuthStage id="login-title" title={copy.title} description={copy.description} switchTo={{ ...loginPage.switch, href: withNext(loginPage.switch.href, next) }}>
          <LoginForm next={next} />
        </AuthStage>
      </main>
      <Footer />
    </>
  );
}
