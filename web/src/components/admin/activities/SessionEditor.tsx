"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatRupiahPlain, LEVEL_LABEL } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import type { SessionDetail, SessionParticipant, TennisLevel } from "@/server/admin/types";
import { FormCard, MultiChips, TextArea, Toggle } from "../ui/AdminForm";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, Badge, desktopOnlyClass, MemberAvatar, MobileCard, MobileCardList, PaymentBadge } from "../ui/AdminUI";
import styles from "./SessionEditor.module.css";

type SessionEditorProps = {
  session: SessionDetail;
  types: { slug: string; label: string }[];
  venues: { name: string; city: string; image: string }[];
  /** "new" = form Buat sesi (termasuk hasil Duplikat). */
  mode: "edit" | "new";
};

const WIB = 7 * 3600_000;
const toDate = (iso: string) => new Date(new Date(iso).getTime() + WIB).toISOString().slice(0, 10);
const toTime = (iso: string) => new Date(new Date(iso).getTime() + WIB).toISOString().slice(11, 16);
const fromWib = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);

const LEVELS = (Object.keys(LEVEL_LABEL) as TennisLevel[]).map((value) => ({
  value,
  label: { beginner_intermediate: "Beginner–Intermediate", intermediate_advanced: "Intermediate–Advanced" }[value as string] ?? LEVEL_LABEL[value],
}));

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "scheduled", label: "Terjadwal" },
  { value: "cancelled", label: "Dibatalkan" },
] as const;

const VISIBILITY = [
  { value: "public", label: "Publik" },
  { value: "members", label: "Member saja" },
  { value: "link", label: "Link saja" },
] as const;

const SOURCE_LABEL: Record<SessionParticipant["source"], string> = { website: "Website", kuy: "Kuy", admin: "Admin" };
const PREVIEW_ROWS = 5;

const longDate = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Admin / 05 Activity Editor (Figma 25:5098). Simpan masih demo sampai Supabase tersambung. */
export function SessionEditor({ session, types, venues, mode }: SessionEditorProps) {
  const [title, setTitle] = useState(session.title);
  const [typeSlug, setTypeSlug] = useState(session.typeSlug);
  const [description, setDescription] = useState(session.description);
  const [date, setDate] = useState(toDate(session.startsAt));
  const [start, setStart] = useState(toTime(session.startsAt));
  const [end, setEnd] = useState(toTime(session.endsAt));
  const [venue, setVenue] = useState(session.venueName);
  const [court, setCourt] = useState(session.court);
  const [repeatWeekly, setRepeatWeekly] = useState(session.repeatWeekly);
  const [price, setPrice] = useState(String(session.price));
  const [capacity, setCapacity] = useState(String(session.capacity));
  const [points, setPoints] = useState(String(session.pointsPerAttendance));
  const [levels, setLevels] = useState<TennisLevel[]>(session.recommendedLevels);
  const [waitlist, setWaitlist] = useState(session.waitlistEnabled);
  const [membersOnly, setMembersOnly] = useState(session.membersOnly);
  const [status, setStatus] = useState<string>(session.displayStatus === "scheduled" ? "scheduled" : session.status === "completed" ? "published" : session.status);
  const [visibility, setVisibility] = useState(session.visibility);
  const [visibleUntil, setVisibleUntil] = useState(`${toDate(session.startsAt)}T${toTime(session.startsAt)}`);
  const [homepage, setHomepage] = useState(session.showOnHomepage);
  const [crew, setCrew] = useState(session.crew);
  const [checkIns, setCheckIns] = useState(() => new Set(session.participants.filter((p) => p.checkedIn).map((p) => p.memberId)));
  const [showAll, setShowAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tried, setTried] = useState(false);

  const venueInfo = venues.find((v) => v.name === venue) ?? venues[0];
  const startsAt = fromWib(date, start);
  const endsAt = fromWib(date, end);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Judul sesi wajib diisi.";
    if (!date) e.date = "Pilih tanggal.";
    if (!(endsAt > startsAt)) e.end = "Jam selesai harus setelah jam mulai.";
    if (!(Number(price) >= 0) || price === "") e.price = "Isi harga (0 untuk gratis).";
    if (!(Number(capacity) > 0)) e.capacity = "Kapasitas minimal 1.";
    if (mode === "edit" && Number(capacity) < session.booked) e.capacity = `Sudah ada ${session.booked} peserta terdaftar.`;
    return e;
  }, [title, date, startsAt, endsAt, price, capacity, mode, session.booked]);
  const err = (key: string) => (tried ? errors[key] : undefined);

  const registered = session.participants.filter((p) => p.status !== "waitlisted");
  const waitlisted = session.participants.filter((p) => p.status === "waitlisted");
  const ordered = [...registered, ...waitlisted];
  const visibleRows = showAll ? ordered : ordered.slice(0, PREVIEW_ROWS);
  const hidden = ordered.length - visibleRows.length;

  const save = () => {
    setTried(true);
    if (Object.keys(errors).length > 0) {
      setNotice("Periksa kembali kolom yang ditandai.");
      return;
    }
    setNotice("Mode demo: perubahan belum disimpan karena database (Supabase) belum tersambung.");
  };

  const toggleCheckIn = (id: string) =>
    setCheckIns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const copyKuy = async () => {
    try {
      await navigator.clipboard.writeText(session.kuyUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const statusBadge =
    mode === "new" ? (
      <Badge tone="neutral" dot>
        Sesi baru
      </Badge>
    ) : (
      <Badge tone={status === "published" ? "lime" : status === "cancelled" ? "pink" : status === "scheduled" ? "indigo" : "neutral"} dot>
        {session.status === "completed" ? "Selesai" : STATUS_OPTIONS.find((o) => o.value === status)?.label}
      </Badge>
    );

  const participantName = (p: SessionParticipant) => (
    <span className={styles.person}>
      <MemberAvatar name={p.name} size={32} />
      <span className={styles.personText}>
        <Link href={`/admin/members/${p.memberId}`} className={styles.personName}>
          {p.name}
        </Link>
        <span className={styles.muted}>
          @{p.handle}
          {p.guests > 0 && ` · +${p.guests} teman`}
        </span>
      </span>
    </span>
  );

  const checkInButton = (p: SessionParticipant) =>
    p.status === "waitlisted" ? (
      <Badge tone="neutral">Waitlist</Badge>
    ) : (
      <button type="button" className={cx(styles.checkIn, checkIns.has(p.memberId) && styles.checkInDone)} aria-pressed={checkIns.has(p.memberId)} onClick={() => toggleCheckIn(p.memberId)}>
        <AdminIcon name={checkIns.has(p.memberId) ? "check-bold" : "check-circle"} size={14} />
        {checkIns.has(p.memberId) ? "Hadir" : "Check-in"}
      </button>
    );

  return (
    <div className={styles.editor}>
      <div className={styles.bar}>
        <div className={styles.barLeft}>
          <Link href="/admin/activities" className={styles.back}>
            <AdminIcon name="caret-left" size={16} />
            Activities
          </Link>
          {statusBadge}
          {mode === "edit" && <span className={styles.muted}>Perubahan belum tersimpan ke database (demo)</span>}
        </div>
        <div className={styles.barActions}>
          {mode === "edit" && (
            <>
              <AdminButton href="/activity" target="_blank" size="sm" icon="eye">
                Preview
              </AdminButton>
              <AdminButton href={`/admin/activities/new?from=${session.id}`} size="sm" icon="copy">
                Duplikat
              </AdminButton>
            </>
          )}
          <AdminButton variant="primary" size="sm" icon="check-bold" onClick={save}>
            {mode === "new" ? "Simpan sesi" : "Simpan perubahan"}
          </AdminButton>
        </div>
      </div>

      {notice && (
        <p className={styles.notice} role="status">
          <AdminIcon name="warning-circle" size={18} />
          {notice}
          <button type="button" className={styles.noticeClose} aria-label="Tutup" onClick={() => setNotice(null)}>
            <AdminIcon name="x" size={14} />
          </button>
        </p>
      )}

      <div className={styles.grid}>
        <div className={styles.main}>
          <FormCard title="Info sesi" subtitle="Tampil di halaman Activity & detail sesi">
            <label className={styles.field}>
              <span className={styles.label}>Judul sesi *</span>
              <input className={cx(styles.input, err("title") && styles.invalid)} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Mabar Session" />
              {err("title") && <span className={styles.error}>{err("title")}</span>}
            </label>

            <fieldset className={styles.fieldset}>
              <legend className={styles.label}>Tipe sesi *</legend>
              <div className={styles.segmentWrap}>
                {types.map((t) => (
                  <button key={t.slug} type="button" aria-pressed={typeSlug === t.slug} className={cx(styles.option, typeSlug === t.slug && styles.optionOn)} onClick={() => setTypeSlug(t.slug)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <TextArea label="Deskripsi" value={description} onChange={setDescription} maxLength={500} />

            <div className={styles.field}>
              <span className={styles.label}>Foto cover *</span>
              <div className={styles.coverRow}>
                <span className={styles.cover}>
                  <Image src={venueInfo.image} alt="" fill sizes="(min-width: 768px) 180px, 100vw" />
                </span>
                <div className={styles.dropzone} title="Upload aktif setelah Supabase Storage tersambung">
                  <AdminIcon name="upload-simple" size={20} />
                  <strong>Tarik foto ke sini atau pilih file</strong>
                  <span className={styles.muted}>JPG/PNG · rasio 4:3 · maks 5 MB</span>
                </div>
              </div>
            </div>
          </FormCard>

          <FormCard title="Jadwal & lokasi">
            <div className={styles.cols3}>
              <label className={styles.field}>
                <span className={styles.label}>Tanggal *</span>
                <input type="date" className={cx(styles.input, err("date") && styles.invalid)} value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Jam mulai *</span>
                <input type="time" className={styles.input} value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Jam selesai *</span>
                <input type="time" className={cx(styles.input, err("end") && styles.invalid)} value={end} onChange={(e) => setEnd(e.target.value)} />
                {err("end") && <span className={styles.error}>{err("end")}</span>}
              </label>
            </div>
            <div className={styles.cols2}>
              <label className={styles.field}>
                <span className={styles.label}>Venue *</span>
                <span className={styles.selectWrap}>
                  <AdminIcon name="map-pin" size={16} />
                  <select className={cx(styles.input, styles.select, styles.withIcon)} value={venue} onChange={(e) => setVenue(e.target.value)}>
                    {venues.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} · {v.city}
                      </option>
                    ))}
                  </select>
                  <AdminIcon name="caret-down" size={14} />
                </span>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Lapangan</span>
                <span className={styles.selectWrap}>
                  <select className={cx(styles.input, styles.select)} value={court} onChange={(e) => setCourt(e.target.value)}>
                    {session.courts.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <AdminIcon name="caret-down" size={14} />
                </span>
              </label>
            </div>
            <Toggle
              label="Ulangi setiap minggu"
              hint={repeatWeekly ? `Buat sesi otomatis tiap ${new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "Asia/Jakarta" }).format(startsAt)}` : "Sesi satu kali"}
              checked={repeatWeekly}
              onChange={setRepeatWeekly}
            />
          </FormCard>

          <FormCard title="Tiket & kapasitas">
            <div className={styles.cols3}>
              <label className={styles.field}>
                <span className={styles.label}>Harga *</span>
                <span className={cx(styles.affix, err("price") && styles.invalid)}>
                  <span className={styles.muted}>Rp</span>
                  <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
                </span>
                {err("price") && <span className={styles.error}>{err("price")}</span>}
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Kapasitas *</span>
                <span className={cx(styles.affix, err("capacity") && styles.invalid)}>
                  <input inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ""))} />
                  <span className={styles.muted}>orang</span>
                </span>
                {err("capacity") && <span className={styles.error}>{err("capacity")}</span>}
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Slay Point</span>
                <span className={styles.affix}>
                  <input inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/\D/g, ""))} />
                  <span className={styles.muted}>pts / hadir</span>
                </span>
              </label>
            </div>
            <MultiChips label="Level yang disarankan" options={LEVELS} values={levels} onChange={setLevels} />
            <Toggle label="Aktifkan waitlist" hint="Member otomatis masuk saat ada slot kosong" checked={waitlist} onChange={setWaitlist} />
            <Toggle label="Hanya untuk member" hint="Non-member tidak bisa booking sesi ini" checked={membersOnly} onChange={setMembersOnly} />
            {session.kuyUrl && (
              <div className={styles.field}>
                <span className={styles.label}>Link booking Kuy</span>
                <span className={styles.affix}>
                  <AdminIcon name="link-simple" size={16} />
                  <input readOnly value={session.kuyUrl.replace(/^https:\/\//, "")} aria-label="Link booking Kuy" />
                  <button type="button" className={styles.iconButton} onClick={copyKuy} aria-label="Salin link">
                    <AdminIcon name={copied ? "check-bold" : "copy"} size={16} />
                  </button>
                </span>
              </div>
            )}
          </FormCard>

          {mode === "edit" && (
            <FormCard
              title="Peserta & absensi"
              subtitle={`Check-in dibuka ${timeFmt.format(new Date(startsAt.getTime() - 30 * 60_000))} · QR dikirim via WhatsApp peserta`}
              action={
                <span className={styles.cardActions}>
                  <AdminButton size="sm" icon="qr-code" disabled title="Butuh database">
                    Scan QR
                  </AdminButton>
                  <AdminButton size="sm" icon="user-plus" disabled title="Butuh database">
                    Tambah peserta
                  </AdminButton>
                </span>
              }
            >
              <div className={styles.stats}>
                <Stat label="Terdaftar" value={`${registered.length}/${capacity || session.capacity}`} />
                <Stat label="Sudah bayar" value={session.paid} />
                <Stat label="Waitlist" value={waitlisted.length} />
                <Stat label="Check-in" value={checkIns.size || "—"} />
              </div>

              {ordered.length === 0 ? (
                <p className={styles.empty}>Belum ada peserta.</p>
              ) : (
                <>
                  <MobileCardList label="Peserta">
                    {visibleRows.map((p) => (
                      <MobileCard
                        key={p.memberId}
                        title={participantName(p)}
                        aside={checkInButton(p)}
                        meta={[
                          { label: "Level", value: LEVEL_LABEL[p.level] },
                          { label: "Bayar", value: <PaymentBadge status={p.payment} /> },
                          { label: "Via", value: SOURCE_LABEL[p.source] },
                        ]}
                      />
                    ))}
                  </MobileCardList>
                  <div className={cx(styles.tableWrap, desktopOnlyClass)}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Peserta</th>
                          <th>Level</th>
                          <th>Pembayaran</th>
                          <th>Via</th>
                          <th>Check-in</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((p) => (
                          <tr key={p.memberId}>
                            <td>{participantName(p)}</td>
                            <td>{LEVEL_LABEL[p.level]}</td>
                            <td>
                              <PaymentBadge status={p.payment} />
                            </td>
                            <td>{SOURCE_LABEL[p.source]}</td>
                            <td>{checkInButton(p)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(hidden > 0 || showAll) && ordered.length > PREVIEW_ROWS && (
                    <button type="button" className={styles.more} onClick={() => setShowAll((v) => !v)}>
                      {showAll ? "Tampilkan lebih sedikit" : `Lihat ${hidden} peserta lainnya${waitlisted.length ? " & waitlist" : ""}`}
                      <AdminIcon name="caret-down" size={14} className={showAll ? styles.flip : undefined} />
                    </button>
                  )}
                </>
              )}
            </FormCard>
          )}
        </div>

        <aside className={styles.side}>
          <FormCard title="Publikasi">
            <label className={styles.field}>
              <span className={styles.label}>Status</span>
              <span className={styles.selectWrap}>
                <select className={cx(styles.input, styles.select)} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <AdminIcon name="caret-down" size={14} />
              </span>
            </label>
            <fieldset className={styles.fieldset}>
              <legend className={styles.label}>Visibilitas</legend>
              <div className={styles.segmentFill}>
                {VISIBILITY.map((v) => (
                  <button key={v.value} type="button" aria-pressed={visibility === v.value} className={cx(styles.option, visibility === v.value && styles.optionOn)} onClick={() => setVisibility(v.value)}>
                    {v.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className={styles.field}>
              <span className={styles.label}>Tampil di website sampai</span>
              <input type="datetime-local" className={styles.input} value={visibleUntil} onChange={(e) => setVisibleUntil(e.target.value)} />
            </label>
            <Toggle label="Tampilkan di homepage" hint='Section "Lebih dari Sekadar Pertandingan"' checked={homepage} onChange={setHomepage} />
          </FormCard>

          <FormCard title="Preview kartu" subtitle="Seperti tampil di website">
            <div className={styles.preview}>
              <Image src={venueInfo.image} alt="" fill sizes="(min-width: 1024px) 300px, 100vw" />
              <span className={styles.previewText}>
                <strong>{venue}</strong>
                <span>
                  {date ? longDate.format(startsAt) : "Tanggal belum diisi"} · {start}–{end}
                </span>
                <span className={styles.previewPrice}>
                  {title || "Judul sesi"} · {Number(price) > 0 ? formatRupiahPlain(Number(price)) : "Gratis"}
                </span>
              </span>
            </div>
          </FormCard>

          <FormCard title="Host & fotografer">
            <ul className={styles.crew}>
              {crew.map((c) => (
                <li key={`${c.name}-${c.role}`}>
                  <MemberAvatar name={c.name} size={32} />
                  <span className={styles.personText}>
                    <span className={styles.personName}>{c.name}</span>
                    <span className={styles.muted}>{c.role}</span>
                  </span>
                  <button type="button" className={styles.iconButton} aria-label={`Hapus ${c.name}`} onClick={() => setCrew((list) => list.filter((x) => x !== c))}>
                    <AdminIcon name="x" size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className={styles.addCrew} disabled title="Butuh database staff">
              <AdminIcon name="plus-bold" size={14} />
              Tambah crew
            </button>
          </FormCard>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.stat}>
      <span className={styles.muted}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
