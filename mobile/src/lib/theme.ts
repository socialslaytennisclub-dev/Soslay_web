/** Token warna & tipografi — sama dengan web (web/src/styles/tokens.css) dan Figma "SOSLAY - APP". */
export const colors = {
  navy900: "#0a084a",
  navy700: "#1e1e6a",
  indigo600: "#291fc0",
  indigo500: "#4035de",
  indigoMuted: "#3a3582",
  indigo200: "#d6d9ff",
  indigo100: "#ebecff",
  indigo50: "#f4f5ff",
  lime500: "#d4ef1f",
  lime700: "#a4c400",
  lime100: "#f4ffb8",
  pink500: "#ec6abc",
  red500: "#e5322d",
  white: "#ffffff",
  muted: "#6b6994",
  border: "#e3e4f5",
  courtBlue: "#2c4f86",
  courtGreen: "#2f5d3a",
} as const;

export const fonts = {
  displayBold: "Poppins_700Bold",
  display: "Poppins_600SemiBold",
  body: "Inter_400Regular",
  medium: "Inter_500Medium",
  strong: "Inter_600SemiBold",
} as const;

export const type = {
  score: { fontFamily: fonts.displayBold, fontSize: 44, lineHeight: 48 },
  displayL: { fontFamily: fonts.displayBold, fontSize: 28, lineHeight: 34 },
  h1: { fontFamily: fonts.display, fontSize: 22, lineHeight: 29 },
  h2: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24 },
  h3: { fontFamily: fonts.display, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.strong, fontSize: 14, lineHeight: 20 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  label: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 },
  caps: { fontFamily: fonts.strong, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: "uppercase" as const },
} as const;

export const radius = { card: 20, button: 14, chip: 999 } as const;
