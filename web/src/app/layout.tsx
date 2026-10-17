import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import { SPLASH_SCRIPT } from "@/components/home/SplashScreen/splash";
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
    "Not just a tennis community. A community to play, connect, and enjoy moments with the right people — in Jakarta & Bali.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: ekstensi browser (mis. Demoway, Grammarly) sering menyisipkan
    // atribut ke <html>/<body> sebelum React hydrate. Hanya berlaku untuk atribut elemen ini, bukan anak-anaknya.
    <html
      lang="en"
      className={`${poppins.variable} ${inter.variable} ${chillax.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        {/* Splash homepage: tandai <html data-splash> sebelum paint supaya homepage tidak berkedip dulu. */}
        <Script id="soslay-splash" strategy="beforeInteractive">
          {SPLASH_SCRIPT}
        </Script>
        {children}
      </body>
    </html>
  );
}
