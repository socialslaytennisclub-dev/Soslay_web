"use client";

import { IMAGE_ASPECT } from "@/lib/image-aspect";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatRupiahPlain, LEVEL_LABEL } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { TRIP_TYPE } from "@/lib/trips";
import { shrinkImage } from "@/lib/image-resize";
import { isSessionEnded, participantRemoveLock, participantsLockReason } from "@/lib/session-lock";
import { memberInviteWaLink } from "@/lib/wa-invite";
import { clearParticipants, removeParticipants } from "@/server/admin/actions/play";
import { deleteSession, deleteSessionMistake, discardSessionUploads, saveSession, setCheckIn, uploadSessionCover, type SessionInput } from "@/server/admin/actions/sessions";
import { hasTargetTotal, scoreTarget, usesLineup } from "@/lib/americano";
import { effectivePodiumBonus, LEGACY_PODIUM_BONUS } from "@/lib/standings";
import { KUDOS_TOP_DAYS } from "@/lib/kudos";
import type { MemberChoice, SessionDetail, SessionHost, SessionParticipant, TennisLevel } from "@/server/admin/types";
import { FormCard, MultiChips, TextArea, Toggle } from "../ui/AdminForm";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, Badge, desktopOnlyClass, MemberAvatar, MobileCard, MobileCardList, PickerInput } from "../ui/AdminUI";
import { CrewDrawer } from "./CrewDrawer";
import { PaymentCell, useParticipantPayment, viaLabel } from "./ParticipantPayment";
import { ParticipantsDrawer } from "./ParticipantsDrawer";
import { WaInviteLink } from "./WaInviteLink";
import { FormatCard, LineupCard, type PlayForm } from "./PlayCards";
import { SessionKudos } from "./SessionKudos";
import { SessionReviews } from "./SessionReviews";
import styles from "./SessionEditor.module.css";
import playStyles from "./Play.module.css";
import { useConfirm } from "../ui/ConfirmDialog";
import { useImageCrop } from "@/components/ui/ImageCropper/ImageCropper";
import { RowMenu } from "../ui/RowMenu";
import { toast, ToastOnMount } from "../ui/Toaster";
import { useUploadCleanup } from "../ui/useUploadCleanup";

type SessionEditorProps = {
  session: SessionDetail;
  types: { slug: string; label: string }[];
  venues: { name: string; city: string; image: string; courts: string[] }[];
  /** "new" = form Buat sesi (termasuk hasil Duplikat). */
  mode: "edit" | "new";
  /** Pesan setelah redirect (mis. sesi baru tersimpan). */
  initialNotice?: string;
  /** Default Slay Point per tipe sesi (Aturan poin) — dipakai saat tipe diganti di sesi baru. */
  pointDefaults?: Record<string, number>;
  /** Pilihan "Tambah host (member)". */
  members: MemberChoice[];
};

const WIB = 7 * 3600_000;
const toDate = (iso: string) => new Date(new Date(iso).getTime() + WIB).toISOString().slice(0, 10);
const toTime = (iso: string) => new Date(new Date(iso).getTime() + WIB).toISOString().slice(11, 16);
const fromWib = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);

const LEVELS = (Object.entries(LEVEL_LABEL) as [TennisLevel, string][]).map(([value, label]) => ({ value, label }));

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "scheduled", label: "Terjadwal" },
  { value: "cancelled", label: "Dibatalkan" },
] as const;

const VISIBILITY = [
  { value: "public", label: "Publik" },
  { value: "members", label: "Member" },
  { value: "link", label: "Link" },
] as const;

const PREVIEW_ROWS = 5;

const longDate = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Admin / 05 Activity Editor (Figma 25:5098). Simpan → Supabase (server action), tampil di website. */
export function SessionEditor({ session, types, venues, mode, initialNotice, pointDefaults, members }: SessionEditorProps) {
  const [title, setTitle] = useState(session.title);
  const [typeSlug, setTypeSlug] = useState(session.typeSlug);
  const [description, setDescription] = useState(session.description);
  // null = belum ada foto sendiri → website memakai foto venue.
  const [cover, setCover] = useState<string | null>(session.coverPath);
  const uploads = useUploadCleanup(discardSessionUploads);
  const [date, setDate] = useState(toDate(session.startsAt));
  const [start, setStart] = useState(toTime(session.startsAt));
  const [end, setEnd] = useState(toTime(session.endsAt));
  const [venue, setVenue] = useState(session.venueName);
  const [court, setCourt] = useState(session.court);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [price, setPrice] = useState(String(session.price));
  const [capacity, setCapacity] = useState(String(session.capacity));
  const [points, setPoints] = useState(String(session.pointsPerAttendance));
  // Poin ikut default tipe baru selama admin belum mengubahnya sendiri.
  const changeType = (slug: string) => {
    // Tennis Escape = trip (BR-22): form sesi baru berubah jadi form Buat trip.
    if (mode === "new" && slug === TRIP_TYPE) return router.push("/admin/activities/trip/new");
    if (pointDefaults && points === String(pointDefaults[typeSlug] ?? "") && pointDefaults[slug] !== undefined) setPoints(String(pointDefaults[slug]));
    setTypeSlug(slug);
  };
  const [levels, setLevels] = useState<TennisLevel[]>(session.recommendedLevels);
  const [waitlist, setWaitlist] = useState(session.waitlistEnabled);
  const [membersOnly, setMembersOnly] = useState(session.membersOnly);
  const [status, setStatus] = useState<string>(session.displayStatus === "scheduled" ? "scheduled" : session.displayStatus === "completed" ? "published" : session.status);
  const [visibility, setVisibility] = useState(session.visibility);
  const until = session.visibleUntil ?? session.startsAt;
  const [visibleUntil, setVisibleUntil] = useState(`${toDate(until)}T${toTime(until)}`);
  const [homepage, setHomepage] = useState(session.showOnHomepage);
  const router = useRouter();
  const [crew, setCrew] = useState(session.crew);
  const [hosts, setHosts] = useState<SessionHost[]>(session.hosts);
  // Foto sesi (album Google Drive + thumbnail) — Figma ADM-16.
  const [albumUrl, setAlbumUrl] = useState(session.photos.albumUrl);
  const [photoCover, setPhotoCover] = useState<string | null>(session.photos.coverPath);
  const [photoCount, setPhotoCount] = useState(session.photos.count === null ? "" : String(session.photos.count));
  const [uploadingPhoto, startUploadingPhoto] = useTransition();
  const [play, setPlay] = useState<PlayForm>({
    matchFormat: session.play.matchFormat,
    courtCount: String(session.play.courtCount),
    roundCount: String(session.play.roundCount),
    targetPoints: String(session.play.targetPoints),
    leaderboardMode: session.play.leaderboardMode,
    showLeaderboard: session.play.showLeaderboard,
    podiumBonus: effectivePodiumBonus(session.play.podiumBonus).map(String) as PlayForm["podiumBonus"],
  });
  // Check-in yang diubah di halaman ini (id peserta → hadir?); sisanya dari server.
  const [checkInEdits, setCheckInEdits] = useState<Record<string, boolean>>({});
  const isCheckedIn = (p: SessionParticipant) => checkInEdits[p.id] ?? p.checkedIn;
  const [showAll, setShowAll] = useState(false);
  const [saving, startSaving] = useTransition();
  const [uploading, startUploading] = useTransition();
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [kuyUrl, setKuyUrl] = useState(session.kuyUrl);
  const [copied, setCopied] = useState(false);
  const [tried, setTried] = useState(false);

  const venueInfo = venues.find((v) => v.name === venue) ?? venues[0];
  const coverSrc = cover ?? venueInfo.image;
  const isDraft = status === "draft";
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
    if (kuyUrl.trim() && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(kuyUrl.trim())) e.kuy = "Link tidak valid — contoh: https://kuy.id/soslay/nama-event";
    if (play.matchFormat !== "none") {
      if (!(Number(play.courtCount) >= 1 && Number(play.courtCount) <= 12)) e.play = "Jumlah court 1–12.";
      else if (!(Number(play.roundCount) >= 1 && Number(play.roundCount) <= 40)) e.play = "Jumlah ronde 1–40.";
      else if (hasTargetTotal(play.matchFormat) && !(Number(play.targetPoints) >= 1)) e.play = "Isi target poin.";
    }
    return e;
  }, [title, date, startsAt, endsAt, price, capacity, mode, session.booked, play, kuyUrl]);
  const err = (key: string) => (tried ? errors[key] : undefined);

  const registered = session.participants.filter((p) => p.status !== "waitlisted");
  const waitlisted = session.participants.filter((p) => p.status === "waitlisted");
  const ordered = [...registered, ...waitlisted];
  const visibleRows = showAll ? ordered : ordered.slice(0, PREVIEW_ROWS);
  const hidden = ordered.length - visibleRows.length;

  /** `publish` → simpan sekaligus ubah status ke Published (tombol "Publikasikan" untuk draft). */
  const save = (publish = false) => {
    setTried(true);
    if (Object.keys(errors).length > 0) {
      toast.error("Periksa kembali kolom yang ditandai.");
      return;
    }
    const input: SessionInput = {
      id: mode === "edit" ? session.id : undefined,
      title,
      typeSlug,
      description,
      venueName: venue,
      court,
      date,
      start,
      end,
      price: Number(price),
      capacity: Number(capacity),
      points: Number(points || 0),
      levels,
      waitlist,
      membersOnly,
      status: (publish ? "published" : status) as SessionInput["status"],
      visibility,
      visibleUntil,
      homepage,
      coverPath: cover,
      kuyUrl,
      repeatWeekly: mode === "new" && repeatWeekly,
      crew,
      crewMembers: hosts.map((h) => ({ memberId: h.memberId, role: h.role })),
      photos: { albumUrl: albumUrl.trim(), coverPath: photoCover, count: photoCount === "" ? null : Number(photoCount) },
      play: {
        matchFormat: play.matchFormat,
        courtCount: Number(play.courtCount),
        roundCount: Number(play.roundCount),
        targetPoints: Number(play.targetPoints),
        leaderboardMode: play.leaderboardMode,
        showLeaderboard: play.showLeaderboard,
        // Activity lama yang bonusnya tidak diubah tetap "aturan lama" (null) — Duplikat-nya memakai default baru.
        podiumBonus:
          session.play.podiumBonus === null && play.podiumBonus.join() === LEGACY_PODIUM_BONUS.join()
            ? null
            : (play.podiumBonus.map((v) => Number(v) || 0) as [number, number, number]),
      },
    };
    if (publish) setStatus("published");
    startSaving(async () => {
      // Sesi baru → server mengarahkan ke halaman editnya; edit → kembalikan hasil.
      const result = await uploads.save(() => saveSession(input), {
        isNew: mode === "new",
        stored: [session.coverPath, session.photos.coverPath],
        current: [cover, photoCover],
      });
      toast.result(result);
    });
  };

  /** Upload langsung ke Storage; URL baru tersimpan ke sesi saat admin menekan Simpan. */
  const uploadCover = async (picked: File | undefined) => {
    if (!picked || uploading) return;
    // Crop dulu sesuai kotak cover (4:3), baru diupload.
    const file = await crop(picked, IMAGE_ASPECT.sessionCover, "Cover activity");
    if (!file) return;
    startUploading(async () => {
      // Foto HP > 4,5 MB ditolak Vercel sebelum sampai server → perkecil dulu di browser.
      const body = new FormData();
      body.append("file", await shrinkImage(file));
      const result = await uploadSessionCover(body).catch(() => ({ ok: false as const, error: "Upload gagal — coba lagi." }));
      if (result.ok) {
        uploads.track(result.url);
        setCover(result.url);
        toast.success("Foto cover terupload — tekan Simpan untuk menerapkannya.");
      } else toast.error(result.error);
    });
  };

  const sessionWhen = date ? new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(startsAt) : "";

  /** Thumbnail Foto sesi — upload ke Storage yang sama dengan foto cover; tersimpan saat Simpan. */
  const uploadPhotoCover = async (picked: File | undefined) => {
    if (!picked || uploadingPhoto) return;
    const file = await crop(picked, IMAGE_ASPECT.sessionPhoto, "Thumbnail foto sesi");
    if (!file) return;
    startUploadingPhoto(async () => {
      const body = new FormData();
      body.append("file", await shrinkImage(file));
      const result = await uploadSessionCover(body).catch(() => ({ ok: false as const, error: "Upload gagal — coba lagi." }));
      if (result.ok) {
        uploads.track(result.url);
        setPhotoCover(result.url);
        toast.success("Thumbnail terupload — tekan Simpan untuk menerapkannya.");
      } else toast.error(result.error);
    });
  };

  const pasteAlbum = async () => {
    try {
      setAlbumUrl((await navigator.clipboard.readText()).trim());
    } catch {
      toast.error("Browser tidak mengizinkan membaca clipboard — tempel manual (Ctrl/Cmd + V).");
    }
  };

  const remove = async () => {
    // Sudah ada peserta → "Hapus activity salah input": peserta ikut terhapus, konfirmasi dengan mengetik judul.
    const withPeople = session.booked > 0 || session.participants.length > 0;
    if (withPeople) {
      const ok = await confirm({
        title: "Hapus activity salah input?",
        body: `Activity ini dan ${session.booked} pesertanya dihapus permanen, termasuk dari riwayat aktivitas member. Poin kehadiran / bonus juara dari activity ini dinetralkan, dan pemasukan otomatis peserta di Keuangan dikoreksi. Pembayaran yang perlu dikembalikan diurus di luar sistem.`,
        confirmLabel: "Hapus activity & peserta",
        requireText: session.title,
      });
      if (!ok) return;
    } else if (!window.confirm(`Hapus sesi "${session.title}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    startSaving(async () => {
      const result = withPeople ? await deleteSessionMistake(session.id, session.title) : await deleteSession(session.id);
      if (!result.ok) toast.error(result.error);
    });
  };

  const toggleCheckIn = async (p: SessionParticipant) => {
    const next = !isCheckedIn(p);
    const apply = (on: boolean) => setCheckInEdits((prev) => ({ ...prev, [p.id]: on }));
    apply(next); // optimistis — dikembalikan kalau gagal
    setCheckingIn(p.id);
    const result = await setCheckIn(session.id, { id: p.id, memberId: p.memberId }, next);
    setCheckingIn(null);
    if (!result.ok) {
      apply(!next);
      toast.error(result.error);
    }
  };

  const copyKuy = async () => {
    try {
      await navigator.clipboard.writeText(kuyUrl.trim());
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
        {/* displayStatus: termasuk sesi yang sudah lewat jeda tutup walau belum diakhiri host (sama dengan tabel). */}
        {session.displayStatus === "completed" ? "Selesai" : STATUS_OPTIONS.find((o) => o.value === status)?.label}
      </Badge>
    );

  /** Format permainan diubah tapi belum disimpan → line-up menunggu "Simpan perubahan". */
  const playDirty =
    session.play.matchFormat !== play.matchFormat ||
    String(session.play.courtCount) !== play.courtCount ||
    String(session.play.roundCount) !== play.roundCount ||
    (hasTargetTotal(play.matchFormat) && String(session.play.targetPoints) !== play.targetPoints);

  // ── Hapus peserta & absensi (terkunci begitu aktivitas sudah dikerjakan) ──
  const [confirm, confirmDialog] = useConfirm();
  const [crop, cropDialog] = useImageCrop();
  const [editPayment, paymentDrawer] = useParticipantPayment(session.id, session.displayStatus === "completed");
  const [removing, setRemoving] = useState<string | null>(null);
  const checkedInCount = session.participants.filter(isCheckedIn).length;
  const lockBase = {
    startsAt: session.startsAt,
    status: session.status,
    endedAt: session.play.endedAt,
    scoredMatches: session.matches.filter((m) => m.scoreA !== null).length,
  };
  const clearLock = participantsLockReason({ ...lockBase, checkedIn: checkedInCount });
  const fromKuy = session.participants.filter((p) => p.id !== p.memberId && p.source !== "trip");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Hapus per peserta: belum check-in & belum masuk line-up / skor; setelah selesai hanya tambahan admin.
  const inMatch = useMemo(() => new Set(session.matches.flatMap((m) => [...m.a, ...m.b])), [session.matches]);
  // Status selesai dihitung server saat halaman dimuat (diakhiri / ditutup otomatis) — tidak memakai jam
  // browser saat render, supaya hasil server & browser sama. Server tetap mengecek ulang saat menghapus.
  const finished = session.displayStatus === "completed";
  // Baris booking (id = memberId) bukan baris daftar peserta tambahan admin.
  const removeLock = (p: SessionParticipant) =>
    participantRemoveLock({ trip: p.source === "trip", checkedIn: isCheckedIn(p), inMatch: inMatch.has(p.id), finished, adminRow: p.source === "admin" && p.id !== p.memberId });
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Hapus satu / beberapa peserta setelah konfirmasi. */
  const removeMany = async (list: SessionParticipant[]) => {
    if (!list.length) return;
    const games = session.matches.filter((m) => [...m.a, ...m.b].some((id) => list.some((p) => p.id === id))).length;
    const single = list.length === 1 ? list[0] : null;
    const ok = await confirm({
      title: single ? `Hapus ${single.name} dari sesi?` : `Hapus ${list.length} peserta dari sesi?`,
      body: (
        <>
          {!single && (
            <p>
              <strong>{list.slice(0, 5).map((p) => p.name).join(", ")}</strong>
              {list.length > 5 && ` dan ${list.length - 5} lainnya`}
            </p>
          )}
          <p>Data peserta & absensi{single ? "-nya" : " mereka"} di sesi ini akan dihapus, termasuk booking member yang belum hadir.</p>
          {games > 0 && (
            <p>
              <strong>{games} match line-up</strong> yang memuat {single ? single.name.split(" ")[0] : "peserta ini"} ikut terhapus — generate ulang line-up setelahnya.
            </p>
          )}
          <p>Tindakan ini tidak bisa dibatalkan.</p>
        </>
      ),
      confirmLabel: single ? "Hapus peserta" : `Hapus ${list.length} peserta`,
    });
    if (!ok) return;
    setRemoving(single ? single.id : "many");
    const result = await removeParticipants(
      session.id,
      list.map((p) => ({ id: p.id, memberId: p.memberId })),
    );
    setRemoving(null);
    toast.result(result);
    if (result.ok) {
      setSelected(new Set());
      router.refresh();
    }
  };

  const removeAll = async () => {
    const ok = await confirm({
      title: `Hapus semua ${fromKuy.length} peserta & absensi?`,
      body: (
        <>
          <p>
            Semua peserta hasil impor Kuyy di <strong>{session.title}</strong> akan dihapus, beserta line-up dan booking member yang belum hadir.
          </p>
          <p>Pakai ini untuk mengganti dengan data impor baru. Tindakan ini tidak bisa dibatalkan.</p>
        </>
      ),
      confirmLabel: "Hapus semua",
      requireText: "HAPUS",
    });
    if (!ok) return;
    setRemoving("all");
    const result = await clearParticipants(session.id);
    setRemoving(null);
    toast.result(result);
    if (result.ok) router.refresh();
  };

  // Hanya peserta yang boleh dihapus yang bisa dicentang (bukan yang sudah check-in / sesi terkunci).
  const selectable = visibleRows.filter((p) => !removeLock(p));
  const chosen = session.participants.filter((p) => selected.has(p.id) && !removeLock(p));
  const selectBox = (p: SessionParticipant) => {
    const reason = removeLock(p);
    return (
      <input
        type="checkbox"
        className={styles.selectBox}
        checked={selected.has(p.id)}
        disabled={Boolean(reason)}
        title={reason ?? undefined}
        aria-label={`Pilih ${p.name}`}
        onChange={() => toggleSelected(p.id)}
      />
    );
  };

  /** Menu ⋮ per peserta: ubah pembayaran (impor Kuyy & tambahan admin) & hapus dari sesi. */
  const rowMenu = (p: SessionParticipant) => (
    <RowMenu
      label={`Aksi untuk ${p.name}`}
      items={[
        ...(p.editablePayment ? [{ label: "Ubah pembayaran", icon: "pencil-simple" as const, onSelect: () => editPayment(p) }] : []),
        { label: "Hapus dari sesi", icon: "trash" as const, danger: true, disabledReason: removeLock(p), disabled: removing !== null, onSelect: () => removeMany([p]) },
      ]}
    />
  );

  const participantName = (p: SessionParticipant) => (
    <span className={styles.person}>
      <MemberAvatar name={p.name} size={32} />
      <span className={styles.personText}>
        {p.memberId ? (
          <Link href={`/admin/members/${p.memberId}`} className={styles.personName}>
            {p.name}
          </Link>
        ) : (
          <span className={styles.personName}>{p.name}</span>
        )}
        {p.memberId ? (
          // Member terverifikasi → ID Soslay dulu (ID utama), lalu Kuy ID dari profil Soslay.
          <span className={cx(styles.muted, styles.username)}>
            {p.memberCode || "Member Soslay"}
            <AdminIcon name="verified" size={14} label="Member Soslay terverifikasi" className={styles.verified} />
            {p.kuyId && ` · Kuy @${p.kuyId}`}
            {p.guests > 0 && ` · +${p.guests} teman`}
          </span>
        ) : (
          // Belum member → tanpa username: ghost member, dikenali lagi di aktivitas berikutnya.
          <span className={styles.muted}>
            Ghost member{p.ghostActivities && p.ghostActivities > 1 ? ` · ${p.ghostActivities} aktivitas` : ""}
            {p.guests > 0 && ` · +${p.guests} teman`}
          </span>
        )}
        {/* Kudos teratas member (6 bulan terakhir, semua sesi) — bantu menyusun line-up. */}
        {p.kudosTop && (
          <span title={`Kudos teratas ${KUDOS_TOP_DAYS / 30} bulan terakhir: ${p.kudosTop.label} (${p.kudosTop.count})`}>
            <Badge tone="lime">
              ✦ {p.kudosTop.label} {p.kudosTop.count}
            </Badge>
          </span>
        )}
        {/* Belum member → undang daftar lewat WhatsApp (wa.me ke nomor dari Kuyy). */}
        {!p.memberId && <WaInviteLink href={memberInviteWaLink(p, session.title)} />}
      </span>
    </span>
  );

  const checkInButton = (p: SessionParticipant) =>
    p.status === "waitlisted" ? (
      <Badge tone="neutral">Waitlist</Badge>
    ) : (
      <button
        type="button"
        className={cx(styles.checkIn, isCheckedIn(p) && styles.checkInDone)}
        aria-pressed={isCheckedIn(p)}
        disabled={checkingIn === p.id}
        onClick={() => toggleCheckIn(p)}
      >
        <AdminIcon name={isCheckedIn(p) ? "check-bold" : "check-circle"} size={14} />
        {isCheckedIn(p) ? "Hadir" : "Check-in"}
      </button>
    );

  return (
    <div className={styles.editor}>
      {cropDialog}
      <div className={styles.bar}>
        <div className={styles.barLeft}>
          <Link href="/admin/activities" className={styles.back}>
            <AdminIcon name="caret-left" size={16} />
            Activities
          </Link>
          {statusBadge}

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
              <AdminButton size="sm" icon="trash" onClick={remove} disabled={saving} title={session.booked ? "Hapus activity salah input beserta pesertanya" : undefined}>
                Hapus
              </AdminButton>
            </>
          )}
          {/* Draft belum tampil di website → aksi utama = Publikasikan, simpan draft jadi sekunder. */}
          {isDraft && (
            <AdminButton size="sm" icon="check-bold" onClick={() => save()} disabled={saving}>
              Simpan draft
            </AdminButton>
          )}
          <AdminButton
            variant="primary"
            size="sm"
            icon={isDraft ? "globe-simple" : "check-bold"}
            onClick={() => save(isDraft)}
            disabled={saving}
            title={isDraft ? "Simpan dan tampilkan di website" : undefined}
          >
            {saving ? "Menyimpan…" : isDraft ? "Publikasikan" : mode === "new" ? "Simpan sesi" : "Simpan perubahan"}
          </AdminButton>
        </div>
      </div>

      {initialNotice && <ToastOnMount text={initialNotice} />}

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
                  <button key={t.slug} type="button" aria-pressed={typeSlug === t.slug} className={cx(styles.option, typeSlug === t.slug && styles.optionOn)} onClick={() => changeType(t.slug)}>
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
                  <Image src={coverSrc} alt="" fill sizes="(min-width: 768px) 180px, 100vw" />
                </span>
                <label
                  className={cx(styles.dropzone, uploading && styles.dropzoneBusy)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    uploadCover(e.dataTransfer.files[0]);
                  }}
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="visually-hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      uploadCover(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <AdminIcon name="upload-simple" size={20} />
                  <strong>{uploading ? "Mengupload…" : cover ? "Ganti foto" : "Tarik foto ke sini atau pilih file"}</strong>
                  <span className={styles.muted}>JPG/PNG/WebP · rasio 4:3 · maks 5 MB</span>
                </label>
              </div>
              <span className={styles.muted}>
                {cover ? "Foto sendiri dipakai di website. " : "Belum ada foto sendiri — website memakai foto venue. "}
                {cover && (
                  <button type="button" className={styles.linkButton} onClick={() => setCover(null)}>
                    Pakai foto venue
                  </button>
                )}
              </span>
            </div>
          </FormCard>

          <FormCard title="Jadwal & lokasi">
            <div className={styles.cols3}>
              <label className={styles.field}>
                <span className={styles.label}>Tanggal *</span>
                <PickerInput type="date" className={cx(styles.input, err("date") && styles.invalid)} value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Jam mulai *</span>
                <PickerInput type="time" className={styles.input} value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Jam selesai *</span>
                <PickerInput type="time" className={cx(styles.input, err("end") && styles.invalid)} value={end} onChange={(e) => setEnd(e.target.value)} />
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
                    {(venueInfo?.courts.length ? [...new Set([court, ...venueInfo.courts].filter(Boolean))] : session.courts).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <AdminIcon name="caret-down" size={14} />
                </span>
              </label>
            </div>
            {mode === "new" ? (
              <Toggle
                label="Ulangi setiap minggu"
                hint={repeatWeekly ? `Buat 8 sesi: tiap ${new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "Asia/Jakarta" }).format(startsAt)} selama 8 minggu` : "Sesi satu kali"}
                checked={repeatWeekly}
                onChange={setRepeatWeekly}
              />
            ) : (
              session.repeatWeekly && <p className={styles.muted}>Bagian dari seri mingguan — perubahan hanya untuk sesi ini.</p>
            )}
            <p className={playStyles.info}>
              <AdminIcon name="question" size={16} />
              Zona waktu mengikuti venue: (GMT+07:00) Asia/Jakarta. Jam mulai & selesai otomatis disimpan dengan zona waktu ini.
            </p>
          </FormCard>

          <FormatCard
            value={play}
            onChange={setPlay}
            locked={session.matches.some((m) => m.scoreA !== null)}
            bonusLocked={isSessionEnded({ status: session.status, endedAt: session.play.endedAt })}
            legacyBonus={session.play.podiumBonus === null}
          />
          {err("play") && <span className={styles.error}>{err("play")}</span>}

          {usesLineup(play.matchFormat) && (
            <LineupCard
              key={`${session.participants.length}-${session.matches.map((m) => m.id).join()}`}
              sessionId={session.id}
              participants={session.participants}
              courts={Number(play.courtCount) || 1}
              rounds={Number(play.roundCount) || 1}
              targetPoints={scoreTarget(session.play.matchFormat, session.play.targetPoints)}
              balanceLevels={play.matchFormat === "rotating"}
              initial={session.matches}
              ended={isSessionEnded({ status: session.status, endedAt: session.play.endedAt })}
              disabledReason={
                mode === "new"
                  ? "Simpan sesi dulu, lalu impor peserta dari Kuyy untuk membuat line-up."
                  : playDirty
                    ? "Format berubah — klik \"Simpan perubahan\" dulu, lalu atur line-up."
                    : undefined
              }
            />
          )}

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
            <div className={styles.field}>
              <label className={styles.label} htmlFor="kuy-url">
                Link booking Kuy
              </label>
              <span className={cx(styles.affix, err("kuy") && styles.invalid)}>
                <AdminIcon name="link-simple" size={16} />
                <input id="kuy-url" inputMode="url" value={kuyUrl} onChange={(e) => setKuyUrl(e.target.value)} placeholder="https://kuy.id/soslay/nama-event" />
                {kuyUrl.trim() && (
                  <>
                    <button type="button" className={styles.iconButton} onClick={copyKuy} aria-label="Salin link">
                      <AdminIcon name={copied ? "check-bold" : "copy"} size={16} />
                    </button>
                    <a className={styles.iconButton} href={/^https?:\/\//i.test(kuyUrl.trim()) ? kuyUrl.trim() : `https://${kuyUrl.trim()}`} target="_blank" rel="noopener noreferrer" aria-label="Buka link di tab baru">
                      <AdminIcon name="arrow-up-right" size={16} />
                    </a>
                  </>
                )}
              </span>
              {err("kuy") ? (
                <span className={styles.error}>{err("kuy")}</span>
              ) : (
                <span className={styles.muted}>Tombol &quot;Booking&quot; di website membuka link ini. Kosong = halaman Soslay di Kuyy (kuy.id/soslay).</span>
              )}
            </div>
          </FormCard>

          {mode === "edit" && (
            <FormCard
              title="Peserta & absensi"
              subtitle={`Check-in dibuka ${timeFmt.format(new Date(startsAt.getTime() - 30 * 60_000))} · peserta diverifikasi dari export Kuyy`}
            >
              {/* Tombol aksi selalu di bawah deskripsi (tidak pindah-pindah ke samping judul). */}
              <span className={styles.cardActions}>
                {/* Satu tombol hapus: ada yang dicentang → hapus yang terpilih; tidak ada → hapus semua (impor Kuyy). */}
                {chosen.length > 0 ? (
                  <AdminButton size="sm" icon="trash" onClick={() => removeMany(chosen)} disabled={removing !== null} title="Hapus peserta yang dicentang">
                    {removing === "many" ? "Menghapus…" : `Hapus ${chosen.length} terpilih`}
                  </AdminButton>
                ) : (
                  fromKuy.length > 0 && (
                    <AdminButton size="sm" icon="trash" onClick={removeAll} disabled={Boolean(clearLock) || removing !== null} title={clearLock ?? "Hapus semua peserta & absensi untuk diganti impor baru"}>
                      {removing === "all" ? "Menghapus…" : "Hapus semua"}
                    </AdminButton>
                  )
                )}
                <AdminButton size="sm" icon="qr-code" disabled title="Scan QR e-ticket — segera hadir">
                  Scan QR
                </AdminButton>
                <ParticipantsDrawer
                  sessionId={session.id}
                  sessionTitle={session.title}
                  sessionWhen={sessionWhen}
                />
              </span>
              <div className={styles.stats}>
                <Stat label="Terdaftar" value={`${registered.length}/${capacity || session.capacity}`} />
                <Stat label="Sudah bayar" value={session.paid} />
                <Stat label="Waitlist" value={waitlisted.length} />
                <Stat label="Check-in" value={checkedInCount || "—"} />
              </div>
              {fromKuy.length > 0 && clearLock && (
                <p className={styles.muted}>
                  <AdminIcon name="key" size={12} /> {clearLock}
                </p>
              )}
              {confirmDialog}
              {paymentDrawer}

              {ordered.length === 0 ? (
                <p className={styles.empty}>Belum ada peserta.</p>
              ) : (
                <>
                  <MobileCardList label="Peserta">
                    {visibleRows.map((p) => (
                      <MobileCard
                        key={p.id}
                        selected={selected.has(p.id)}
                        leading={selectBox(p)}
                        title={participantName(p)}
                        aside={
                          <span className={styles.cardActions}>
                            {checkInButton(p)}
                            {rowMenu(p)}
                          </span>
                        }
                        meta={[
                          { label: "Level", value: p.level ? LEVEL_LABEL[p.level] : "—" },
                          { label: "Bayar", value: <PaymentCell participant={p} /> },
                          { label: "Via", value: viaLabel(p) },
                        ]}
                      />
                    ))}
                  </MobileCardList>
                  <div className={cx(styles.tableWrap, desktopOnlyClass)}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th className={styles.selectCell}>
                            <input
                              type="checkbox"
                              aria-label="Pilih semua peserta yang bisa dihapus"
                              checked={selectable.length > 0 && selectable.every((p) => selected.has(p.id))}
                              disabled={selectable.length === 0}
                              onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((p) => p.id)) : new Set())}
                            />
                          </th>
                          <th>Peserta</th>
                          <th>Level</th>
                          <th>Pembayaran</th>
                          <th>Via</th>
                          <th>Check-in</th>
                          <th aria-label="Aksi" />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((p) => (
                          <tr key={p.id} className={cx(selected.has(p.id) && styles.rowSelected)}>
                            <td className={styles.selectCell}>{selectBox(p)}</td>
                            <td>{participantName(p)}</td>
                            <td>{p.level ? LEVEL_LABEL[p.level] : "—"}</td>
                            <td>
                              <PaymentCell participant={p} />
                            </td>
                            <td>
                              {viaLabel(p)}
                            </td>
                            <td>{checkInButton(p)}</td>
                            <td>{rowMenu(p)}</td>
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

          {mode === "edit" && <SessionReviews reviews={session.reviews} />}

          {mode === "edit" && (session.kudos.length > 0 || session.displayStatus === "completed" || session.play.endedAt) && <SessionKudos sessionId={session.id} kudos={session.kudos} />}

          {mode === "edit" && (
            <FormCard
              title="Foto sesi"
              subtitle={`Link album Google Drive + 1 foto thumbnail untuk tab Foto di halaman Sesi Selesai member · batas unggah ${new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(endsAt.getTime() + 24 * 3600_000))}`}
            >
              <div className={styles.field}>
                <label className={styles.label} htmlFor="album-url">
                  Link album Google Drive *
                </label>
                <span className={cx(styles.affix, albumUrl.trim() && !/^https:\/\/([\w-]+\.)?drive\.google\.com\//i.test(albumUrl.trim()) && styles.invalid)}>
                  <AdminIcon name="link-simple" size={16} />
                  <input id="album-url" inputMode="url" value={albumUrl} onChange={(e) => setAlbumUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" />
                  <button type="button" className={styles.linkButton} onClick={pasteAlbum}>
                    Tempel
                  </button>
                </span>
                <span className={styles.muted}>Pastikan folder bisa diakses siapa saja yang punya link.</span>
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Foto thumbnail (cover)</span>
                <div className={styles.coverRow}>
                  <span className={cx(styles.cover, playStyles.photoThumb)}>
                    {photoCover ? <Image src={photoCover} alt="" fill sizes="180px" /> : <AdminIcon name="image" size={24} />}
                  </span>
                  <label className={cx(styles.dropzone, uploadingPhoto && styles.dropzoneBusy)}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="visually-hidden"
                      disabled={uploadingPhoto}
                      onChange={(e) => {
                        uploadPhotoCover(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    <AdminIcon name="upload-simple" size={20} />
                    <strong>{uploadingPhoto ? "Mengupload…" : photoCover ? "Ganti foto" : "Pilih 1 foto"}</strong>
                    <span className={styles.muted}>JPG/PNG · maks 5 MB · rasio 16:9 · diunggah tim Soslay</span>
                  </label>
                </div>
              </div>

              <div className={styles.cols2}>
                <label className={styles.field}>
                  <span className={styles.label}>Jumlah foto (opsional)</span>
                  <span className={styles.affix}>
                    <input inputMode="numeric" value={photoCount} onChange={(e) => setPhotoCount(e.target.value.replace(/\D/g, ""))} placeholder="mis. 48" />
                    <span className={styles.muted}>foto</span>
                  </span>
                </label>
                <div className={styles.field}>
                  <span className={styles.label}>Fotografer</span>
                  <span className={styles.muted}>
                    {[...crew.filter((c) => c.role === "Fotografer").map((c) => c.name), ...hosts.filter((h) => h.role === "photographer").map((h) => h.name)].join(", ") ||
                      "Belum ada — tambahkan lewat Host & fotografer."}
                  </span>
                </div>
              </div>
              {session.photos.postedAt && (
                <span className={styles.muted}>Album tersimpan sejak {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(session.photos.postedAt))}.</span>
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
              <PickerInput type="datetime-local" className={styles.input} value={visibleUntil} onChange={(e) => setVisibleUntil(e.target.value)} />
            </label>
            <Toggle label="Tampilkan di homepage" hint='Section "Lebih dari Sekadar Pertandingan"' checked={homepage} onChange={setHomepage} />
          </FormCard>

          <FormCard title="Preview kartu" subtitle="Seperti tampil di website">
            <div className={styles.preview}>
              <Image src={coverSrc} alt="" fill sizes="(min-width: 1024px) 300px, 100vw" />
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
              {hosts.map((h) => (
                <li key={h.memberId}>
                  <MemberAvatar name={h.name} size={32} />
                  <span className={styles.personText}>
                    <span className={styles.personName}>{h.name}</span>
                    <span className={styles.crewMeta}>
                      <label className={styles.roleSelect}>
                        <span className="visually-hidden">Peran {h.name}</span>
                        <select value={h.role} onChange={(e) => setHosts((list) => list.map((x) => (x.memberId === h.memberId ? { ...x, role: e.target.value as SessionHost["role"] } : x)))}>
                          <option value="host">Host</option>
                          <option value="photographer">Fotografer</option>
                        </select>
                        <AdminIcon name="caret-down" size={12} className={styles.roleCaret} />
                      </label>
                      <span className={styles.muted}>member {h.code}</span>
                    </span>
                  </span>
                  <button type="button" className={styles.iconButton} aria-label={`Hapus ${h.name}`} onClick={() => setHosts((list) => list.filter((x) => x.memberId !== h.memberId))}>
                    <AdminIcon name="x" size={14} />
                  </button>
                </li>
              ))}
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
            <CrewDrawer
              sessionTitle={session.title || title}
              sessionWhen={sessionWhen}
              members={members}
              participantIds={new Set(session.participants.map((p) => p.memberId).filter((id): id is string => Boolean(id)))}
              exclude={new Set(hosts.map((h) => h.memberId))}
              onAdd={(c) => setHosts((list) => [...list, c])}
            />
            {hosts.some((h) => h.role === "host") && (
              <span className={styles.muted}>Host member bisa input skor, atur line-up & check-in hanya untuk sesi ini. Akses berakhir otomatis saat sesi diakhiri.</span>
            )}
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
