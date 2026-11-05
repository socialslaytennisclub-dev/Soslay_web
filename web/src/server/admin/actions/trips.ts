"use server";

import { formatRupiahPlain } from "@/lib/admin-labels";
import { bookingMoney, PAYMENT_KIND_LABEL, todayWib, TRIP_TYPE, type TripPaymentKind } from "@/lib/trips";
import { wibAt } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/text";
import { localPhone } from "@/lib/wa-invite";
import { uploadPrivateFile } from "@/server/storage";
import { FINANCE_PROOF_BUCKET } from "../finance-repo";
import { findMemberById, findMemberByIdentifier } from "../identity";
import { getTrip } from "../trips-repo";
import { audit, refreshPaths, requireEditor, type ActionResult } from "./common";

/**
 * Aksi Tennis Escape = Trip (BR-22): simpan trip (info, activity, rundown, paket), arsip / duplikat,
 * peserta paket & pembayaran. Penautan peserta paket ke activity dan pencatatan Keuangan (A-10) dijaga
 * trigger database (migrasi 20261106040000_trips).
 */

export type TripActivityInput = {
  /** Sesi yang sudah ada (dibuat sebelumnya / diambil dari activity lain); kosong = buat baru. */
  id?: string;
  key: string;
  title: string;
  venueName: string;
  date: string;
  start: string;
  end: string;
  capacity: number;
  soldSingle: boolean;
  price: number;
  singleQuota: number | null;
  kuyUrl: string;
};

export type TripRundownInput = { day: string; time: string; title: string; location: string; activityKey: string | null };

export type TripInput = {
  id?: string;
  title: string;
  description: string;
  area: string;
  startsOn: string;
  endsOn: string;
  coverPath: string | null;
  status: "draft" | "published";
  visibility: "public" | "members" | "link";
  showOnHomepage: boolean;
  showRundown: boolean;
  priceNormal: number;
  priceEarlyBird: number | null;
  earlyBirdUntil: string | null;
  packageQuota: number;
  minDp: number;
  inclusions: string[];
  activities: TripActivityInput[];
  rundown: TripRundownInput[];
};

type SaveResult = ({ ok: true; message: string; id: string } | { ok: false; error: string });

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const okInt = (n: number, min = 0) => Number.isInteger(n) && n >= min && n <= 1_000_000_000;

function validate(input: TripInput): string | null {
  if (!input.title.trim()) return "Judul trip wajib diisi.";
  if (!DAY_RE.test(input.startsOn) || !DAY_RE.test(input.endsOn) || input.endsOn < input.startsOn) return "Tanggal trip tidak valid.";
  if (!okInt(input.priceNormal) || !okInt(input.packageQuota) || !okInt(input.minDp)) return "Harga, kuota & minimal DP harus angka.";
  if (input.priceEarlyBird !== null && (!okInt(input.priceEarlyBird) || input.priceEarlyBird > input.priceNormal)) return "Harga early bird tidak boleh di atas harga normal.";
  if (input.priceEarlyBird !== null && !(input.earlyBirdUntil && DAY_RE.test(input.earlyBirdUntil))) return "Isi batas tanggal early bird.";
  if (input.minDp > input.priceNormal) return "Minimal DP tidak boleh di atas harga paket.";
  if (input.status === "published" && input.priceNormal <= 0) return "Isi harga paket normal sebelum dipublikasikan.";
  for (const [i, a] of input.activities.entries()) {
    const n = `Activity ${i + 1}`;
    if (!a.title.trim()) return `${n}: nama activity wajib diisi.`;
    if (!a.venueName) return `${n}: pilih venue.`;
    if (!DAY_RE.test(a.date) || !TIME_RE.test(a.start) || !TIME_RE.test(a.end) || a.end <= a.start) return `${n}: tanggal & jam tidak valid.`;
    if (a.date < input.startsOn || a.date > input.endsOn) return `${n}: tanggal harus di dalam tanggal trip.`;
    if (!okInt(a.capacity, 1)) return `${n}: kapasitas minimal 1.`;
    if (a.soldSingle && (!okInt(a.price) || (a.singleQuota !== null && !okInt(a.singleQuota)))) return `${n}: harga & kuota satuan harus angka.`;
  }
  for (const r of input.rundown) {
    if (!r.title.trim() || !r.time.trim()) return "Setiap baris rundown butuh jam & kegiatan.";
    if (r.day < input.startsOn || r.day > input.endsOn) return "Baris rundown di luar tanggal trip.";
  }
  return null;
}

export async function saveTrip(input: TripInput): Promise<SaveResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };
  const supabase = await createSupabaseServerClient();

  // Pemeriksaan awal (saling lepas) sekaligus: venue, activity yang diambil, pembeli paket, keterisian.
  const venueNames = [...new Set(input.activities.map((a) => a.venueName))];
  const existingIds = input.activities.flatMap((a) => (a.id ? [a.id] : []));
  const [{ data: venues }, { data: linked }, { data: buyerRows }, fills, { data: present }] = await Promise.all([
    venueNames.length ? supabase.from("venues").select("id, name").in("name", venueNames) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    existingIds.length ? supabase.from("sessions").select("id, title, trip_id").in("id", existingIds) : Promise.resolve({ data: [] as { id: string; title: string; trip_id: string | null }[] }),
    input.id ? supabase.from("trip_bookings").select("member_id").eq("trip_id", input.id).is("cancelled_at", null) : Promise.resolve({ data: [] as { member_id: string | null }[] }),
    existingIds.length ? supabase.rpc("session_fill_counts").in("session_id", existingIds) : Promise.resolve({ data: [] }),
    // Pembeli paket yang sudah ada di sesi lewat jalur lain (mis. impor Kuyy) tidak dihitung dua kali.
    existingIds.length ? supabase.from("session_participants").select("session_id, member_id").in("session_id", existingIds).neq("source", "trip").not("member_id", "is", null) : Promise.resolve({ data: [] as { session_id: string; member_id: string }[] }),
  ]);
  const venueId = new Map((venues ?? []).map((v) => [v.name as string, v.id as string]));
  const missing = venueNames.find((n) => !venueId.has(n));
  if (missing) return { ok: false, error: `Venue "${missing}" tidak ditemukan.` };
  // Activity yang diambil: belum masuk trip lain.
  const taken = (linked ?? []).find((s) => s.trip_id && s.trip_id !== input.id);
  if (taken) return { ok: false, error: `"${taken.title}" sudah terhubung ke trip lain — 1 activity hanya bisa masuk 1 trip.` };

  // Kapasitas tiap activity ≥ pembeli paket (otomatis terdaftar) + peserta lain yang sudah ada di sesi itu.
  const buyers = buyerRows ?? [];
  const buyerIds = new Set(buyers.flatMap((b) => (b.member_id ? [b.member_id as string] : [])));
  const others = new Map(((fills.data ?? []) as { session_id: string; filled: number; trip_filled: number }[]).map((r) => [r.session_id, r.filled - r.trip_filled]));
  const overlap = new Map<string, number>();
  for (const p of present ?? []) if (buyerIds.has(p.member_id as string)) overlap.set(p.session_id as string, (overlap.get(p.session_id as string) ?? 0) + 1);
  for (const a of input.activities) {
    const other = a.id ? (others.get(a.id) ?? 0) : 0;
    const bundled = buyers.length - (a.id ? (overlap.get(a.id) ?? 0) : 0);
    if (a.capacity < bundled + other) return { ok: false, error: `${a.title || "Activity"}: kapasitas minimal ${bundled + other} (${bundled} pembeli paket${other ? ` + ${other} peserta lain` : ""}).` };
  }

  const tripRow = {
    title: input.title.trim(),
    description: input.description.trim(),
    area: input.area.trim(),
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    cover_path: input.coverPath,
    status: input.status,
    visibility: input.visibility,
    show_on_homepage: input.showOnHomepage,
    show_rundown: input.showRundown,
    price_normal: input.priceNormal,
    price_early_bird: input.priceEarlyBird,
    early_bird_until: input.priceEarlyBird === null ? null : input.earlyBirdUntil,
    package_quota: input.packageQuota,
    min_dp: input.minDp,
    inclusions: input.inclusions.map((s) => s.trim()).filter(Boolean),
  };
  // Simpan tidak dalam satu transaksi: gagal di tengah → buang trip / activity yang baru dibuat di simpan ini
  // supaya menekan Simpan lagi tidak membuat trip & activity ganda.
  const created: string[] = [];
  let newTrip: string | null = null;
  const fail = async (error: string): Promise<SaveResult> => {
    if (created.length) await supabase.from("sessions").delete().in("id", created);
    if (newTrip) await supabase.from("trips").delete().eq("id", newTrip);
    return { ok: false, error };
  };
  let id = input.id;
  if (id) {
    const { error } = await supabase.from("trips").update(tripRow).eq("id", id);
    if (error) return { ok: false, error: `Gagal menyimpan trip: ${error.message}` };
  } else {
    const { data, error } = await supabase
      .from("trips")
      .insert({ ...tripRow, slug: `${slugify(input.title)}-${crypto.randomUUID().slice(0, 4)}`, created_by: auth.userId })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: `Gagal membuat trip: ${error?.message ?? "coba lagi"}` };
    id = newTrip = data.id as string;
  }

  // Activity: data inti diatur di trip; detail lain (foto, format, crew, level…) di Edit activity.
  const keyToSession = new Map<string, string>();
  for (const [i, a] of input.activities.entries()) {
    const core = {
      title: a.title.trim(),
      venue_id: venueId.get(a.venueName),
      starts_at: wibAt(a.date, a.start).toISOString(),
      ends_at: wibAt(a.date, a.end).toISOString(),
      capacity: a.capacity,
      sold_single: a.soldSingle,
      price: a.soldSingle ? a.price : 0,
      single_quota: a.soldSingle ? a.singleQuota : null,
      kuy_booking_url: a.soldSingle && a.kuyUrl.trim() ? (/^https?:\/\//i.test(a.kuyUrl.trim()) ? a.kuyUrl.trim() : `https://${a.kuyUrl.trim()}`) : null,
      trip_id: id,
      trip_order: i + 1,
    };
    if (a.id) {
      const { error } = await supabase.from("sessions").update(core).eq("id", a.id);
      if (error) return fail(`Gagal menyimpan ${a.title}: ${error.message}`);
      keyToSession.set(a.key, a.id);
    } else {
      const { data, error } = await supabase
        .from("sessions")
        .insert({
          ...core,
          slug: `${slugify(`${a.title}-${a.date}`)}-${crypto.randomUUID().slice(0, 4)}`,
          type_slug: TRIP_TYPE,
          status: input.status,
          visibility: input.visibility,
          points_per_attendance: 150,
          waitlist_enabled: false,
          created_by: auth.userId,
        })
        .select("id")
        .single();
      if (error || !data) return fail(`Gagal membuat ${a.title}: ${error?.message ?? "coba lagi"}`);
      created.push(data.id as string);
      keyToSession.set(a.key, data.id as string);
    }
  }
  // Activity yang dikeluarkan dari daftar → lepas dari trip (sesinya tetap ada, peserta paket dikeluarkan).
  const keep = [...keyToSession.values()];
  const detach = supabase.from("sessions").update({ trip_id: null, trip_order: null }).eq("trip_id", id);
  const { error: detachError } = keep.length ? await detach.not("id", "in", `(${keep.join(",")})`) : await detach;
  if (detachError) return fail(`Gagal melepas activity: ${detachError.message}`);

  // Status & visibilitas trip diteruskan ke activity-nya oleh trigger (trips_cascade_to_sessions; activity
  // yang baru ditautkan: sessions_trip_link).

  // Rundown diganti seluruhnya dalam satu transaksi (gagal → rundown lama tetap utuh).
  const { error: rundownError } = await supabase.rpc("save_trip_rundown", {
    p_trip: id,
    p_items: input.rundown.map((r) => ({
      day: r.day,
      time_label: r.time.trim(),
      title: r.title.trim(),
      location: r.location.trim(),
      session_id: r.activityKey ? (keyToSession.get(r.activityKey) ?? null) : null,
    })),
  });
  if (rundownError) return fail(`Gagal menyimpan rundown: ${rundownError.message}`);

  await audit(auth.userId, `${input.id ? "mengubah" : "membuat"} trip ${tripRow.title}`, "trip", id);
  refreshPaths("/admin/activities", `/admin/activities/trip/${id}`);
  return { ok: true, id, message: input.status === "published" ? "Trip dipublikasikan." : "Trip tersimpan sebagai draft." };
}

export async function archiveTrip(id: string): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("trips").update({ status: "cancelled", show_on_homepage: false }).eq("id", id).select("title").maybeSingle();
  if (error || !data) return { ok: false, error: `Gagal mengarsipkan: ${error?.message ?? "trip tidak ditemukan"}` };
  await audit(auth.userId, `mengarsipkan trip ${data.title}`, "trip", id);
  refreshPaths("/admin/activities");
  return { ok: true, message: `${data.title} diarsipkan.` };
}

/** Salin info, rundown & paket ke trip draft baru (tanpa activity, peserta & pembayaran). */
export async function duplicateTrip(id: string): Promise<SaveResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const trip = await getTrip(id);
  if (!trip) return { ok: false, error: "Trip tidak ditemukan." };
  return saveTrip({
    title: `${trip.title} (salinan)`,
    description: trip.description,
    area: trip.area,
    startsOn: trip.startsOn,
    endsOn: trip.endsOn,
    coverPath: trip.coverPath,
    status: "draft",
    visibility: trip.visibility,
    showOnHomepage: false,
    showRundown: trip.showRundown,
    priceNormal: trip.priceNormal,
    priceEarlyBird: trip.priceEarlyBird,
    earlyBirdUntil: trip.earlyBirdUntil,
    packageQuota: trip.packageQuota,
    minDp: trip.minDp,
    inclusions: trip.inclusions,
    activities: [],
    rundown: trip.rundown.map((r) => ({ day: r.day, time: r.time, title: r.title, location: r.location, activityKey: null })),
  });
}

/** Tambah pembeli paket: member Soslay (ID Soslay / Kuy ID / no. HP) atau tamu (nama + no. HP). */
export async function addTripBooking(tripId: string, input: { query?: string; memberId?: string; name?: string; phone?: string }): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  // Hanya yang dibutuhkan: kuota & judul trip, jumlah activity, pembeli aktif (tanpa memuat semua trip).
  const supabase = await createSupabaseServerClient();
  const [{ data: trip }, { count: activityCount }, { data: activeRows }, member] = await Promise.all([
    supabase.from("trips").select("title, package_quota").eq("id", tripId).maybeSingle(),
    supabase.from("sessions").select("id", { count: "exact", head: true }).eq("trip_id", tripId),
    supabase.from("trip_bookings").select("member_id").eq("trip_id", tripId).is("cancelled_at", null),
    input.memberId ? findMemberById(input.memberId) : input.query ? findMemberByIdentifier(input.query) : Promise.resolve(null),
  ]);
  if (!trip) return { ok: false, error: "Trip tidak ditemukan." };
  const active = activeRows ?? [];
  if (trip.package_quota && active.length >= trip.package_quota) return { ok: false, error: `Kuota paket (${trip.package_quota}) sudah penuh — naikkan kuota di Edit trip dulu.` };
  if (input.query && !member) return { ok: false, error: "Member tidak ditemukan — isi nama & nomor HP untuk tamu." };
  if (member && active.some((b) => b.member_id === member.id)) return { ok: false, error: `${member.fullName} sudah terdaftar di paket ini.` };
  const name = member?.fullName ?? input.name?.trim() ?? "";
  if (!name) return { ok: false, error: "Isi nama peserta." };

  const { error } = await supabase.from("trip_bookings").insert({
    trip_id: tripId,
    member_id: member?.id ?? null,
    full_name: name,
    phone: member?.phone || (input.phone ? localPhone(input.phone) : "") || null,
    email: member?.email || null,
  });
  if (error) return { ok: false, error: `Gagal menambah peserta: ${error.message}` };
  await audit(auth.userId, `menambah ${name} ke paket ${trip.title}`, "trip", tripId);
  refreshPaths(`/admin/activities/trip/${tripId}/peserta`, "/admin/activities");
  return { ok: true, message: `${name} terdaftar di paket & semua ${activityCount ?? 0} activity.` };
}

export async function cancelTripBooking(bookingId: string): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("trip_bookings").update({ cancelled_at: new Date().toISOString() }).eq("id", bookingId).is("cancelled_at", null).select("trip_id, full_name").maybeSingle();
  if (error || !data) return { ok: false, error: `Gagal membatalkan: ${error?.message ?? "peserta tidak ditemukan"}` };
  await audit(auth.userId, `membatalkan paket ${data.full_name}`, "trip", data.trip_id as string);
  refreshPaths(`/admin/activities/trip/${data.trip_id}/peserta`, "/admin/activities");
  return { ok: true, message: `Paket ${data.full_name} dibatalkan · keluar dari semua activity trip. Pembayaran yang sudah masuk tetap tercatat — batalkan dari Riwayat bila dikembalikan.` };
}

const PROOF_TYPES = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };
const MAX_PROOF = 5 * 1024 * 1024;
const KINDS: TripPaymentKind[] = ["dp", "installment", "settlement"];

/** Catat DP / cicilan / pelunasan (form Catat pembayaran, Figma 05x-3). Otomatis masuk Keuangan (A-10). */
export async function recordTripPayment(formData: FormData): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  const bookingId = String(formData.get("bookingId") ?? "");
  const kind = String(formData.get("kind") ?? "") as TripPaymentKind;
  const amount = Number(formData.get("amount"));
  const receivedOn = String(formData.get("receivedOn") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  if (!KINDS.includes(kind)) return { ok: false, error: "Pilih jenis pembayaran." };
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: "Jumlah diterima harus lebih dari 0." };
  if (!DAY_RE.test(receivedOn)) return { ok: false, error: "Isi tanggal diterima." };
  if (!accountId) return { ok: false, error: "Pilih akun penerima." };

  const supabase = await createSupabaseServerClient();
  // Satu booking + harga trip + pembayarannya — cukup untuk menghitung sisa (tanpa memuat semua trip).
  const [{ data: booking }, { data: paid }] = await Promise.all([
    supabase.from("trip_bookings").select("id, trip_id, full_name, cancelled_at, trips(price_normal, price_early_bird, early_bird_until)").eq("id", bookingId).maybeSingle(),
    supabase.from("trip_payments").select("amount, received_on, voided_at").eq("booking_id", bookingId),
  ]);
  if (!booking || booking.cancelled_at) return { ok: false, error: "Peserta paket tidak ditemukan." };
  const t = booking.trips as unknown as { price_normal: number; price_early_bird: number | null; early_bird_until: string | null } | null;
  // Tidak boleh melebihi sisa tagihan (salah ketik langsung masuk Keuangan). Harga paket (early bird /
  // normal) dihitung dengan pembayaran ini ikut — tanggal diterima bisa mundur ke masa early bird.
  const pricing = t ? { priceNormal: t.price_normal, priceEarlyBird: t.price_early_bird, earlyBirdUntil: t.early_bird_until } : null;
  const before = (paid ?? []).map((p) => ({ amount: p.amount as number, receivedOn: p.received_on as string, voided: Boolean(p.voided_at) }));
  const remaining = pricing ? Math.max(bookingMoney(pricing, [...before, { amount, receivedOn, voided: false }], todayWib()).price - bookingMoney(pricing, before, receivedOn).paid, 0) : 0;
  if (remaining <= 0) return { ok: false, error: `${booking.full_name} sudah lunas.` };
  if (amount > remaining) return { ok: false, error: `Jumlah melebihi sisa tagihan (${formatRupiahPlain(remaining)}).` };

  let proof: { proof_path: string; proof_name: string } | null = null;
  const file = formData.get("proof");
  if (file instanceof File && file.size > 0) {
    const up = await uploadPrivateFile({ bucket: FINANCE_PROOF_BUCKET, file, folder: `trip/${receivedOn.slice(0, 7)}`, maxBytes: MAX_PROOF, types: PROOF_TYPES });
    if (!up.ok) return { ok: false, error: up.error };
    proof = { proof_path: up.path, proof_name: file.name.slice(0, 120) };
  }
  const { error } = await supabase.from("trip_payments").insert({ booking_id: bookingId, kind, amount, received_on: receivedOn, account_id: accountId, created_by: auth.userId, ...proof });
  if (error) return { ok: false, error: `Gagal mencatat pembayaran: ${error.message}` };
  await audit(auth.userId, `mencatat ${PAYMENT_KIND_LABEL[kind]} ${formatRupiahPlain(amount)} · ${booking.full_name}`, "trip", booking.trip_id as string);
  refreshPaths(`/admin/activities/trip/${booking.trip_id}/peserta`, "/admin/activities", "/admin/keuangan");
  return { ok: true, message: `${PAYMENT_KIND_LABEL[kind]} ${formatRupiahPlain(amount)} dari ${booking.full_name} tercatat · masuk Keuangan.` };
}

/** Batalkan pembayaran (salah input / dana dikembalikan) — Keuangan dikoreksi otomatis. */
export async function voidTripPayment(paymentId: string, reason: string): Promise<ActionResult> {
  const auth = await requireEditor("activities");
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!reason.trim()) return { ok: false, error: "Tulis alasan pembatalan." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_payments")
    .update({ voided_at: new Date().toISOString(), voided_by: auth.userId, void_reason: reason.trim().slice(0, 200) })
    .eq("id", paymentId)
    .is("voided_at", null)
    .select("amount, trip_bookings(trip_id, full_name)")
    .maybeSingle();
  if (error || !data) return { ok: false, error: `Gagal membatalkan: ${error?.message ?? "pembayaran tidak ditemukan"}` };
  const b = data.trip_bookings as unknown as { trip_id: string; full_name: string } | null;
  await audit(auth.userId, `membatalkan pembayaran ${formatRupiahPlain(data.amount as number)} · ${b?.full_name ?? ""} (${reason.trim()})`, "trip", b?.trip_id);
  refreshPaths(`/admin/activities/trip/${b?.trip_id}/peserta`, "/admin/activities", "/admin/keuangan");
  return { ok: true, message: "Pembayaran dibatalkan · Keuangan dikoreksi." };
}
