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
export const ADMIN_LOGIN = "/masuk/admin";

/** Tujuan setelah berhasil masuk / daftar. */
export const AFTER_AUTH = "/akun";
