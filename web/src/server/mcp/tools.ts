import "server-only";
import { z } from "zod";
import { activityTypes } from "@/content/activity";
import { matchVenue } from "@/lib/kuy-activity";
import { PUBLIC_SITE_URL } from "@/lib/wa-invite";
import { importActivityRows, type ImportActivityInput } from "@/server/admin/actions/import-activity";
import { previewKuyRows } from "@/server/admin/actions/play";
import { toKuyRows, type KuyRowInput } from "@/server/admin/kuy-import";
import { venueOptions } from "@/server/admin/sessions-repo";

/**
 * Alat MCP Slay Club untuk Claude: lihat venue, preview, lalu import activity dari event Kuyy.
 * Claude membaca halaman event Kuyy & file peserta (.xlsx) sendiri, lalu mengirim isinya ke sini — aturan
 * impor sama persis dengan form Activities → Import dari Kuyy (lihat import-activity.ts).
 */

const TYPE_SLUGS = activityTypes.map((t) => t.slug) as [string, ...string[]];

const participant = z.object({
  reg_no: z.string().trim().min(1).describe('Kolom "Registration Number" (mis. "G8") — wajib, kunci impor ulang'),
  name: z.string().describe('Kolom "Name"'),
  email: z.string().optional(),
  phone: z.string().optional().describe("Nomor HP apa adanya (+62…, 08…)"),
  instagram: z.string().optional(),
  level: z.string().optional().describe('Kolom "Tennis Leveling" apa adanya'),
  kuy_username: z.string().optional().describe('Kolom "Username"'),
  status: z.string().optional().describe('Kolom "User Status" ("going" = ikut)'),
  refunded: z.boolean().optional().describe('true bila kolom "Refund Time" terisi'),
  amount: z.number().optional().describe('Kolom "Total Transaction" (Rupiah)'),
  ticket: z.string().optional().describe('Kolom "Pass Title"'),
  ticket_price: z.number().optional().describe('Kolom "Pass Revenue"'),
  payment_method: z.string().optional().describe('Kolom "Payment Method"'),
});

const activityInput = z.object({
  title: z.string().min(1).describe("Judul event Kuyy apa adanya"),
  type: z.enum(TYPE_SLUGS).describe(`Tipe activity: ${activityTypes.map((t) => `${t.slug} = ${t.label}`).join(", ")}. Mabar → weekly-mabar`),
  venue: z.string().min(1).describe("Nama venue (dari halaman Kuyy) — dicocokkan ke daftar venue Slay Club"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Tanggal WIB, YYYY-MM-DD"),
  start: z.string().regex(/^\d{2}:\d{2}$/).describe("Jam mulai WIB, HH:MM"),
  end: z.string().regex(/^\d{2}:\d{2}$/).describe("Jam selesai WIB, HH:MM"),
  price: z.number().int().min(0).describe("Harga tiket per orang (Rupiah)"),
  capacity: z.number().int().min(1).optional().describe("Kuota peserta; kosong = jumlah peserta yang ikut"),
  description: z.string().max(500).optional().describe("Deskripsi event, maks. 500 karakter (ringkas bila lebih panjang)"),
  kuy_url: z.string().optional().describe("Link event Kuyy"),
  status: z.enum(["published", "draft"]).optional().describe("Default published"),
  participants: z.array(participant).min(1).max(500).describe("Semua baris peserta dari file export Kuyy (.xlsx)"),
});

type ActivityArgs = z.infer<typeof activityInput>;

const toRowInput = (p: z.infer<typeof participant>): KuyRowInput => ({
  regNo: p.reg_no,
  name: p.name,
  email: p.email,
  phone: p.phone,
  instagram: p.instagram,
  level: p.level,
  username: p.kuy_username,
  status: p.status,
  refunded: p.refunded,
  amount: p.amount,
  ticket: p.ticket,
  ticketPrice: p.ticket_price,
  paymentMethod: p.payment_method,
});

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError && { isError }) });

/** Venue Slay Club yang cocok dengan nama dari Kuyy, atau pesan daftar venue yang ada. */
async function resolveVenue(name: string): Promise<string | { error: string }> {
  const venues = await venueOptions();
  const exact = venues.find((v) => v.name.toLowerCase() === name.trim().toLowerCase());
  const hit = exact?.name ?? matchVenue(name, venues.map((v) => v.name));
  return hit ?? { error: `Venue "${name}" belum ada di Slay Club. Venue yang ada: ${venues.map((v) => v.name).join(", ")}. Tambahkan dulu di admin → Venues, atau pakai salah satu nama itu.` };
}

async function toInput(args: ActivityArgs): Promise<{ input: ImportActivityInput; rows: KuyRowInput[]; venueNote: string } | { error: string }> {
  const venue = await resolveVenue(args.venue);
  if (typeof venue !== "string") return venue;
  const rows = args.participants.map(toRowInput);
  const going = toKuyRows(rows).filter((r) => !r.skipReason).length;
  return {
    rows,
    venueNote: venue.toLowerCase() === args.venue.trim().toLowerCase() ? venue : `${venue} (dari "${args.venue}")`,
    input: {
      title: args.title.trim(),
      typeSlug: args.type,
      description: args.description?.trim() ?? "",
      venueName: venue,
      date: args.date,
      start: args.start,
      end: args.end,
      price: args.price,
      capacity: Math.max(args.capacity ?? 0, going, 1),
      kuyUrl: args.kuy_url?.trim() ?? "",
      status: args.status ?? "published",
    },
  };
}

export const TOOLS = [
  {
    name: "list_venues",
    description: "Daftar venue & tipe activity di Slay Club (untuk mencocokkan venue dari halaman Kuyy).",
    schema: z.object({}),
    run: async (): Promise<ToolResult> => {
      const venues = await venueOptions();
      return text(
        `Venue:\n${venues.map((v) => `- ${v.name} (${v.city})`).join("\n")}\n\nTipe activity:\n${activityTypes.map((t) => `- ${t.slug}: ${t.label}`).join("\n")}`,
      );
    },
  },
  {
    name: "preview_activity_import",
    description:
      "Cek import activity TANPA menyimpan: venue yang dipakai, peserta yang cocok dengan member Slay Club, yang belum daftar (jadi ghost member), dan yang dilewati. Panggil ini dulu, tunjukkan hasilnya ke admin, baru import_activity setelah admin setuju.",
    schema: activityInput,
    run: async (args: ActivityArgs): Promise<ToolResult> => {
      const prepared = await toInput(args);
      if ("error" in prepared) return text(prepared.error, true);
      const res = await previewKuyRows(null, prepared.input.title, prepared.rows);
      if (!res.ok) return text(res.error, true);
      const rows = res.preview.rows;
      const line = (r: (typeof rows)[number]) =>
        `- ${r.member?.name ?? r.name}: ${r.skipReason ? `DILEWATI (${r.skipReason})` : r.member ? `member ${r.member.code} (cocok via ${r.member.by})` : r.ghost ? `belum daftar, ghost lama (${r.ghost.activities} aktivitas)` : "belum daftar, ghost baru"}`;
      const { input } = prepared;
      return text(
        [
          `Activity: ${input.title}`,
          `Venue: ${prepared.venueNote} · ${input.date} ${input.start}–${input.end} WIB · Rp${input.price.toLocaleString("id-ID")} · kapasitas ${input.capacity} · ${input.status}`,
          `Peserta: ${rows.filter((r) => r.member && !r.skipReason).length} member, ${rows.filter((r) => !r.member && !r.skipReason).length} belum daftar, ${rows.filter((r) => r.skipReason).length} dilewati`,
          ...rows.map(line),
          "",
          "Belum disimpan. Panggil import_activity dengan data yang sama untuk membuat activity.",
        ].join("\n"),
      );
    },
  },
  {
    name: "import_activity",
    description:
      "Buat activity di Slay Club + masukkan semua peserta (member dicocokkan, belum daftar jadi ghost member yang otomatis tersambung saat daftar; activity yang sudah lewat → peserta tercatat hadir & dapat Slay Point). Hanya setelah admin menyetujui hasil preview_activity_import.",
    schema: activityInput,
    run: async (args: ActivityArgs): Promise<ToolResult> => {
      const prepared = await toInput(args);
      if ("error" in prepared) return text(prepared.error, true);
      const res = await importActivityRows(prepared.input, prepared.rows);
      if (!res.ok) return text(res.error, true);
      return text(`${res.message}\nVenue: ${prepared.venueNote}\nBuka di admin: ${PUBLIC_SITE_URL}/admin/activities/${res.id}`);
    },
  },
] as const;

export const toolList = () => TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: z.toJSONSchema(t.schema) }));

export async function callTool(name: string, rawArgs: unknown): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return text(`Alat "${name}" tidak ada.`, true);
  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) return text(`Input tidak valid: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`, true);
  return (tool.run as (args: unknown) => Promise<ToolResult>)(parsed.data);
}
