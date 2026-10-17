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

/** Halaman login khusus tim (admin). */
export const ADMIN_LOGIN = "/masuk/admin";

/** Tujuan setelah berhasil masuk / daftar. */
export const AFTER_AUTH = "/akun";
