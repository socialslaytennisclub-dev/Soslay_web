/** "Anitya Ayu Silfia" → "AA", "@vikayusti" → "VI". */
export function initials(name: string): string {
  const words = name.replace(/^@/, "").trim().split(/\s+/);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return words[0].slice(0, 2).toUpperCase();
}

/** "Faqih Muflihun" → "Faqih". */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Nama tim ganda dari nama depan: ["Arya Putra", "Ratna Sari"] → "Arya + Ratna". */
export const teamName = (team: string[]) => team.map(firstName).join(" + ");
