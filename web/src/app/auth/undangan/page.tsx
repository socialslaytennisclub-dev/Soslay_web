import type { Metadata } from "next";
import { AcceptInviteForm } from "@/components/auth/AuthForms/AcceptInviteForm";
import { AuthStage } from "@/components/auth/AuthStage/AuthStage";
import { Navbar } from "@/components/layout/Navbar/Navbar";

export const metadata: Metadata = { title: "Aktifkan akun tim — SOSLAY", robots: { index: false } };

/** Tujuan link undangan email (Settings → Undang anggota): buat password lalu masuk admin. */
export default function AcceptInvitePage() {
  return (
    <>
      <Navbar variant="overlay" />
      <main>
        <AuthStage
          id="invite-title"
          title="Selamat bergabung di tim Soslay"
          description="Buat password untuk akunmu. Setelah itu kamu langsung masuk ke dashboard admin."
          switchTo={{ prompt: "Sudah punya password?", label: "Masuk", href: "/masuk?next=/admin" }}
        >
          <AcceptInviteForm />
        </AuthStage>
      </main>
    </>
  );
}
