import type { Metadata } from "next";
import { AuthStage } from "@/components/auth/AuthStage/AuthStage";
import { RegisterForm } from "@/components/auth/AuthForms/RegisterForm";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { authPageCopy } from "@/content/auth";

export const metadata: Metadata = {
  title: "Sign Up — SOSLAY",
  description: "Become a member of Social Slay Tennis Club.",
};

/** Halaman Daftar (Figma 25:1850 "Desktop - 30"). */
export default async function RegisterPage({ searchParams }: PageProps<"/daftar">) {
  const { next, title, description, switchTo } = authPageCopy("register", (await searchParams).next);
  return (
    <>
      <Navbar variant="overlay" />
      <main>
        <AuthStage
          id="register-title"
          title={title}
          description={description}
          switchTo={switchTo}
        >
          <RegisterForm next={next} />
        </AuthStage>
      </main>
      <Footer />
    </>
  );
}
