import type { Metadata } from "next";
import { CharacterLab } from "@/components/game/SlayTennis/CharacterLab";
import { Navbar } from "@/components/layout/Navbar/Navbar";

export const metadata: Metadata = {
  title: "Slay Tennis Characters — SOSLAY",
  // Halaman kerja untuk meninjau karakter & gerakannya — tidak untuk diindeks.
  robots: { index: false, follow: false },
};

/** Pratinjau karakter 3D Slay Tennis: Minslay & Ghostslay dengan semua gerakannya. */
export default function TennisCharactersPage() {
  return (
    <>
      <Navbar variant="solid" />
      <main>
        <CharacterLab />
      </main>
    </>
  );
}
