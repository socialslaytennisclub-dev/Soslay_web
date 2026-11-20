import type { Metadata } from "next";
import { AuthStage } from "@/components/auth/AuthStage/AuthStage";
import { RegisterForm } from "@/components/auth/AuthForms/RegisterForm";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { gameAuthCopy, registerPage, withNext } from "@/content/auth";

export const metadata: Metadata = {
  title: "Sign Up — SOSLAY",
  description: "Become a member of Social Slay Tennis Club.",
};

/** Halaman Daftar (Figma 25:1850 "Desktop - 30"). */
export default async function RegisterPage({ searchParams }: PageProps<"/daftar">) {
  const raw = (await searchParams).next;
  const next = Array.isArray(raw) ? raw[0] : raw;
  const copy = next?.startsWith("/game") ? gameAuthCopy.register : registerPage;
  return (
    <>
      <Navbar variant="overlay" />
      <main>
        <AuthStage
          id="register-title"
          title={copy.title}
          description={copy.description}
          switchTo={{ ...registerPage.switch, href: withNext(registerPage.switch.href, next) }}
        >
          <RegisterForm next={next} />
        </AuthStage>
      </main>
      <Footer />
    </>
  );
}
