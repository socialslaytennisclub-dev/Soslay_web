import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-poppins",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

/** Chillax Bold (Fontshare) — khusus wordmark "SOSLAY". */
const chillax = localFont({
  src: "../fonts/Chillax-Bold.woff2",
  weight: "700",
  variable: "--font-chillax",
});

export const metadata: Metadata = {
  title: "SOSLAY — Social Slay Tennis Club",
  description:
    "Bukan sekadar komunitas bermain tenis. Komunitas untuk bermain, terhubung, dan menikmati momen bersama orang-orang yang tepat — di Jakarta & Bali.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: ekstensi browser (mis. Demoway, Grammarly) sering menyisipkan
    // atribut ke <html>/<body> sebelum React hydrate. Hanya berlaku untuk atribut elemen ini, bukan anak-anaknya.
    <html
      lang="id"
      className={`${poppins.variable} ${inter.variable} ${chillax.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
