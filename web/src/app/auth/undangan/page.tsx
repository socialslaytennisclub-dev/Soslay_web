import type { Metadata } from "next";
import { AcceptInviteForm } from "@/components/auth/AuthForms/AcceptInviteForm";
import { AuthStage } from "@/components/auth/AuthStage/AuthStage";
import { Navbar } from "@/components/layout/Navbar/Navbar";

export const metadata: Metadata = { title: "Aktifkan akun — SOSLAY", robots: { index: false } };

/** Tujuan link undangan email (undang anggota tim / tambah member): buat password lalu masuk. */
export default function AcceptInvitePage() {
  return (
    <>
      <Navbar variant="overlay" />
      <main>
        <AuthStage
          id="invite-title"
          title="Selamat bergabung di Soslay"
          description="Buat password untuk akunmu. Setelah itu kamu langsung masuk."
          switchTo={{ prompt: "Sudah punya password?", label: "Masuk", href: "/masuk" }}
        >
          <AcceptInviteForm />
        </AuthStage>
      </main>
    </>
  );
}
