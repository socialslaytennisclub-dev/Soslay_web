/** "Anitya Ayu Silfia" → "AA", "@vikayusti" → "VI". */
export function initials(name: string): string {
  const words = name.replace(/^@/, "").trim().split(/\s+/);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return words[0].slice(0, 2).toUpperCase();
}
