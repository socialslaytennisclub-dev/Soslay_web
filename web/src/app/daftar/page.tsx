import type { Metadata } from "next";
import { AuthStage } from "@/components/auth/AuthStage/AuthStage";
import { RegisterForm } from "@/components/auth/AuthForms/RegisterForm";
import { Footer } from "@/components/layout/Footer/Footer";
import { Navbar } from "@/components/layout/Navbar/Navbar";
import { registerPage } from "@/content/auth";

export const metadata: Metadata = {
  title: "Sign Up — SOSLAY",
  description: "Become a member of Social Slay Tennis Club.",
};

/** Halaman Daftar (Figma 25:1850 "Desktop - 30"). */
export default function RegisterPage() {
  return (
    <>
      <Navbar variant="overlay" />
      <main>
        <AuthStage
          id="register-title"
          title={registerPage.title}
          description={registerPage.description}
          switchTo={registerPage.switch}
        >
          <RegisterForm />
        </AuthStage>
      </main>
      <Footer />
    </>
  );
}
