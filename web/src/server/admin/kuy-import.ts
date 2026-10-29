import "server-only";
import { localPhone } from "@/lib/wa-invite";
import type { TennisLevel } from "./types";
import { readFirstSheet } from "./xlsx";

/**
 * Export peserta event dari Kuyy (XLSX, sheet "Form"): baris 1 = nama event, baris header
 * berisi "Username | Name | Email | Phone | Instagram | Tennis Leveling | … | User Status |
 * Total Transaction | … | Refund Time | … | Registration Number | … | Payment Method",
 * baris terakhir "Summary Total". Tamu yang dibelikan tiket memakai Username pembeli.
 */

export type KuyRow = {
  regNo: string;
  name: string;
  email: string;
  /** Tanpa +62 / 0 di depan — format yang sama dengan profiles.phone. */
  phone: string;
  instagram: string;
  level: TennisLevel | null;
  levelRaw: string;
  username: string;
  status: string;
  amount: number;
  paymentMethod: string;
  /** Jenis tiket (kolom "Pass Title") & harganya ("Pass Revenue"); kosong kalau tidak ada. */
  ticket: string;
  ticketPrice: number;
  /** null = ikut diimpor. */
  skipReason: string | null;
};

const HEADERS = {
  username: "username",
  name: "name",
  email: "email",
  phone: "phone",
  instagram: "instagram",
  level: "tennis leveling",
  status: "user status",
  amount: "total transaction",
  refund: "refund time",
  regNo: "registration number",
  payment: "payment method",
  ticket: "pass title",
  ticketPrice: "pass revenue",
} as const;


export function parseLevel(raw: string): TennisLevel | null {
  const t = raw.toLowerCase();
  const beg = t.includes("beginner") || t.includes("pemula");
  const int = t.includes("intermediate") || t.includes("menengah");
  const adv = t.includes("advance") || t.includes("mahir");
  if (beg && int) return "beginner_intermediate";
  if (int && adv) return "intermediate_advanced";
  if (adv) return "advanced";
  if (int) return "intermediate";
  if (beg) return "beginner";
  return null;
}

export function parseKuyExport(data: ArrayBuffer): { eventTitle: string; rows: KuyRow[] } {
  const sheet = readFirstSheet(data);
  const headerAt = sheet.findIndex((r) => r.some((c) => c.toLowerCase() === "username") && r.some((c) => c.toLowerCase() === "email"));
  if (headerAt < 0) throw new Error('Kolom "Username" & "Email" tidak ditemukan — pastikan ini export peserta dari Kuyy.');
  const header = sheet[headerAt].map((c) => c.toLowerCase());
  const col = Object.fromEntries(Object.entries(HEADERS).map(([key, label]) => [key, header.indexOf(label)])) as Record<keyof typeof HEADERS, number>;
  if (col.name < 0) throw new Error('Kolom "Name" tidak ditemukan.');
  const cell = (r: string[], key: keyof typeof HEADERS) => (col[key] >= 0 ? (r[col[key]] ?? "") : "");

  const eventTitle = sheet.slice(0, headerAt).flat().find(Boolean) ?? "";
  const seen = new Set<string>();
  const rows: KuyRow[] = [];
  for (const [i, r] of sheet.slice(headerAt + 1).entries()) {
    if (r[0]?.toLowerCase().startsWith("summary")) break;
    const name = cell(r, "name");
    if (!name && !cell(r, "email")) continue;
    const status = cell(r, "status").toLowerCase();
    const levelRaw = cell(r, "level");
    // Nomor registrasi jadi kunci import ulang; baris tanpa nomor diberi nomor baris.
    const regNo = cell(r, "regNo") || `ROW${headerAt + i + 2}`;
    const refunded = Boolean(cell(r, "refund"));
    const skipReason = !name
      ? "Nama kosong"
      : refunded
        ? "Sudah refund"
        : status && status !== "going"
          ? `Status Kuyy "${cell(r, "status")}"`
          : seen.has(regNo)
            ? "Nomor registrasi dobel"
            : null;
    seen.add(regNo);
    rows.push({
      regNo,
      name,
      email: cell(r, "email").toLowerCase(),
      phone: localPhone(cell(r, "phone")),
      instagram: cell(r, "instagram").replace(/^@/, ""),
      level: parseLevel(levelRaw),
      levelRaw,
      username: cell(r, "username"),
      status,
      amount: Math.round(Number(cell(r, "amount")) || 0),
      paymentMethod: cell(r, "payment"),
      ticket: cell(r, "ticket"),
      ticketPrice: Math.round(Number(cell(r, "ticketPrice")) || 0),
      skipReason,
    });
  }
  return { eventTitle, rows };
}
