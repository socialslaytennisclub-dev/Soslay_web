import type { Metadata, Viewport } from "next";
import { TennisPad } from "@/components/game/SlayTennis/TennisPad";

export const metadata: Metadata = {
  title: "Slay Tennis Controller — SOSLAY",
  robots: { index: false, follow: false },
};

/** Controller: tanpa zoom / gulir supaya jempol tidak menggeser halaman. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

/** HP sebagai controller Slay Tennis — dibuka dari QR di layar permainan (?room=KODE&side=0|1). */
export default function TennisPadPage() {
  return <TennisPad />;
}
