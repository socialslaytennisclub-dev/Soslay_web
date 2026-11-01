import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { SPLASH_SCRIPT } from "@/components/home/SplashScreen/splash";
import "./globals.css";

// Font Google (subset latin, lisensi OFL) di-host sendiri di src/fonts: build tidak bergantung pada
// unduhan fonts.googleapis.com — unduhan yang gagal di Vercel sempat menggagalkan deploy.
const poppins = localFont({
  src: [
    { path: "../fonts/Poppins-Medium.woff2", weight: "500" },
    { path: "../fonts/Poppins-SemiBold.woff2", weight: "600" },
    { path: "../fonts/Poppins-Bold.woff2", weight: "700" },
    { path: "../fonts/Poppins-ExtraBold.woff2", weight: "800" },
  ],
  variable: "--font-poppins",
});

/** Inter variable — satu file untuk semua ketebalan. */
const inter = localFont({
  src: "../fonts/Inter-Variable.woff2",
  weight: "100 900",
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
