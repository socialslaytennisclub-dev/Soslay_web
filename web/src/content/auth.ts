import { isInternalPath } from "@/lib/safe-path";

/**
 * Copy halaman Masuk & Daftar. Daftar = Figma Website v2 375:2379 ("Sign Up");
 * Masuk belum ada di Figma → memakai layout & gaya yang sama.
 */

export const authBackground = {
  src: "/images/auth/auth-court.webp",
  alt: "",
};

export const loginPage = {
  title: "Welcome back to Social Slay",
  description: "Sign in to see your sessions, member card, Slay Points, and orders.",
  submit: "Sign In",
  remember: "Remember me",
  forgot: { label: "Forgot password?", href: "/lupa-password" },
  switch: { prompt: "Not a member yet?", label: "Sign up now", href: "/daftar" },
};

export const registerPage = {
  title: "Become a member of Social Slay Tennis Club",
  description:
    "Collect Slay Points from every session you play, redeem them for merch and booking discounts, and get early access to favorite slots.",
  consent: "I agree to the Terms & Conditions and Privacy Policy of Social Slay Tennis Club.",
  submit: "Create Account",
  switch: { prompt: "Already a member?", label: "Sign In", href: "/masuk" },
  confirm: {
    title: "Check your email ✉️",
    text: (email: string) => `We sent a verification link to ${email}. Open it to activate your account, then you can sign in.`,
    change: "Wrong email? Change it",
    resend: "Resend email",
    changeSubmit: "Save & resend link",
    sameEmail: "This is the same email — enter the correct one",
    passwordRequired: "Enter the password you used to sign up",
    changed: "Email updated — we sent a new verification link.",
    changedNotSent: "Email updated, but the link couldn't be sent yet. Wait a minute, then tap “Resend email”.",
    resent: "Verification link sent again.",
  },
};

export const forgotPage = {
  title: "Forgot your password?",
  description: "Enter the email you used to sign up. We'll send you a link to set a new password.",
  submit: "Send reset link",
  /** Dari link reset yang gagal (?link=expired / invalid). */
  linkFailed: "That reset link has expired or was already used. Only the newest link works, once — request a new one below.",
  sent: {
    title: "Check your email ✉️",
    text: (email: string) => `If ${email} is registered, a reset link is on its way. Open it on this device to set a new password.`,
  },
  switch: { prompt: "Remembered it?", label: "Sign In", href: "/masuk" },
};

export const resetPage = {
  title: "Set a new password",
  description: "Choose a new password for your Social Slay account. You'll stay signed in after saving.",
  submit: "Save password",
  expired: "This reset link has expired or was already used. Request a new one below.",
  switch: { prompt: "Need a new link?", label: "Forgot password", href: "/lupa-password" },
};

/** Halaman setel password baru (tujuan link reset di email). */
export const RESET_PASSWORD = "/reset-password";

/** Halaman login khusus tim (admin). */
/** Datang dari gerbang ronde 2 Slay Rally (/game) → judul & ajakan khusus game. */
export const gameAuthCopy = {
  register: {
    title: "Sign up to play Round 2",
    description: "Your Round 1 score is saved. Create a free account to keep playing, and overtake players on the Slay Rally leaderboard — reaching the top 3 wins Slay Points.",
  },
  login: {
    title: "Sign in to play Round 2",
    description: "Your Round 1 score is saved. Sign in to keep playing and overtake players into the top 3 for Slay Points.",
  },
};

/** Datang dari gerbang game 2 Slay Tennis (/gameoncourt) atau link pertandingan member vs member. */
export const tennisAuthCopy = {
  register: {
    title: "Sign up to keep playing Slay Tennis",
    description: "Your match is saved. Create a free account to finish it, then challenge other members by link — every win against a member earns a Slay Point.",
  },
  login: {
    title: "Sign in to keep playing Slay Tennis",
    description: "Your match is saved. Sign in to finish it and to play other members for Slay Points.",
  },
};

/** Judul & ajakan halaman Masuk / Daftar menurut asal `?next=` (game) — null = teks biasa. */
export function authCopyFor(next: string | undefined, page: "register" | "login") {
  if (next?.startsWith("/gameoncourt")) return tennisAuthCopy[page];
  if (next === "/game" || next?.startsWith("/game?") || next?.startsWith("/game/")) return gameAuthCopy[page];
  return null;
}

/**
 * Yang dibutuhkan halaman Masuk / Daftar dari `?next=`: nilai tunggalnya, judul & ajakan (khusus
 * game bila datang dari game), dan link ke halaman sebelah yang tetap membawa `next`.
 */
export function authPageCopy(kind: "login" | "register", rawNext: string | string[] | undefined) {
  const next = Array.isArray(rawNext) ? rawNext[0] : rawNext;
  const page = kind === "login" ? loginPage : registerPage;
  const { title, description } = authCopyFor(next, kind) ?? page;
  return { next, title, description, switchTo: { ...page.switch, href: withNext(page.switch.href, next) } };
}

/** `?next=` yang dibawa bolak-balik Masuk ↔ Daftar (hanya path internal). */
export function withNext(href: string, next: string | undefined) {
  return isInternalPath(next) ? `${href}?next=${encodeURIComponent(next)}` : href;
}

export const ADMIN_LOGIN = "/masuk/admin";

/** Tujuan setelah klik link verifikasi bila daftar dari halaman lain (mis. /game) — lihat signupRedirect. */
export const AFTER_CONFIRM_COOKIE = "soslay-after-confirm";

/** Tujuan setelah berhasil masuk / daftar. */
export const AFTER_AUTH = "/akun";
