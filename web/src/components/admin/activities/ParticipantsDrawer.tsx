"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useDialog } from "@/hooks/useDialog";
import { formatRupiahPlain, LEVEL_LABEL } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { memberInviteWaLink, phoneFormatError } from "@/lib/wa-invite";
import { addParticipantManual, importKuyParticipants, lookupParticipant, previewKuyImport, type ParticipantLookup } from "@/server/admin/actions/play";
import type { KuyImportPreview } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, Badge, MemberAvatar } from "../ui/AdminUI";
import { Drawer } from "../ui/Drawer";
import { toast } from "../ui/Toaster";
import editor from "./SessionEditor.module.css";
import styles from "./Play.module.css";
import { WaInviteLink } from "./WaInviteLink";

/**
 * Tambah peserta (Figma ADM-10 · 05i/05j): satu drawer kanan dengan dua tab —
 * Input manual (cari ID Soslay / Kuy ID / nomor HP) dan Import XLSX dari Kuy (pilih file →
 * preview → centang peserta yang ditambahkan).
 */

type Tab = "manual" | "import";

/** Kolom yang dibaca dari export Kuyy (lihat server/admin/kuy-import). */
const READ_COLUMNS = ["Nama", "No. WhatsApp", "Email", "Username Kuy", "Level tenis", "Jenis tiket", "Harga tiket", "Total bayar", "Status"];

const kb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const phoneLabel = (phone: string) => (phone ? `0${phone.replace(/^0/, "")}` : "");

export function ParticipantsDrawer({ sessionId, sessionTitle, sessionWhen, addLock }: { sessionId: string; sessionTitle: string; sessionWhen: string; addLock?: string | null }) {
  const dialog = useDialog();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("manual");

  // ── Input manual ──
  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState<ParticipantLookup | null>(null);
  const [guest, setGuest] = useState({ fullName: "", phone: "", email: "" });
  const [checking, startChecking] = useTransition();

  // ── Import XLSX ──
  const fileRef = useRef<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<KuyImportPreview | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState<string | null>(null);
  const [reading, startReading] = useTransition();

  const [saving, startSaving] = useTransition();

  const reset = () => {
    setQuery("");
    setLookup(null);
    setGuest({ fullName: "", phone: "", email: "" });
    setGuestPhoneTouched(false);
    fileRef.current = null;
    setFileName(null);
    setPreview(null);
    setPicked(new Set());
    setImportError(null);
  };
  const close = () => {
    dialog.close();
    reset();
  };
  const done = () => {
    close();
    router.refresh();
  };

  // ── Manual ──
  const check = (event?: FormEvent) => {
    event?.preventDefault();
    if (!query.trim()) return;
    startChecking(async () => {
      const res = await lookupParticipant(sessionId, query);
      if (!res.ok) return toast.error(res.error);
      setLookup(res.result);
      // Belum member & yang diketik nomor HP → langsung jadi isian nomor HP peserta.
      if (res.result.found === "none" && /^[+\d][\d\s().-]{7,}$/.test(query.trim())) setGuest((g) => ({ ...g, phone: query.trim() }));
    });
  };
  const member = lookup?.found === "member" ? lookup.member : null;
  const alreadyIn = lookup?.found === "member" && lookup.alreadyIn;
  const [guestPhoneTouched, setGuestPhoneTouched] = useState(false);
  const guestPhoneError = phoneFormatError(guest.phone);
  const canAddManual = member ? !alreadyIn : lookup?.found === "none" && guest.fullName.trim() !== "" && guest.phone.trim() !== "" && !guestPhoneError;
  const addManual = () =>
    startSaving(async () => {
      const res = await addParticipantManual(sessionId, member ? { memberId: member.id } : guest);
      toast.result(res);
      if (res.ok) done();
    });

  // ── Import ──
  const fileForm = (selected?: string[]) => {
    const form = new FormData();
    if (fileRef.current) form.append("file", fileRef.current);
    if (selected) form.append("selected", JSON.stringify(selected));
    return form;
  };
  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    fileRef.current = file;
    setFileName(file.name);
    setPreview(null);
    setImportError(null);
  };
  const toPreview = () =>
    startReading(async () => {
      const res = await previewKuyImport(sessionId, fileForm()).catch(() => ({ ok: false as const, error: "File gagal dibaca — coba lagi." }));
      if (!res.ok) return setImportError(res.error);
      setPreview(res.preview);
      // Default: semua baris yang bisa diimpor & belum ada di sesi ini.
      setPicked(new Set(res.preview.rows.filter((r) => !r.skipReason && !r.existing).map((r) => r.regNo)));
    });
  const importPicked = () =>
    startSaving(async () => {
      const res = await importKuyParticipants(sessionId, fileForm([...picked]));
      toast.result(res);
      if (res.ok) done();
    });
  const clearFile = () => {
    fileRef.current = null;
    setFileName(null);
    setPreview(null);
    setPicked(new Set());
  };

  const rows = preview?.rows ?? [];
  const selectable = rows.filter((r) => !r.skipReason && !r.existing);
  const members = rows.filter((r) => r.member && !r.skipReason).length;
  const ghosts = rows.filter((r) => !r.member && !r.skipReason).length;
  const totalPaid = rows.filter((r) => picked.has(r.regNo)).reduce((sum, r) => sum + r.amount, 0);
  const existing = rows.filter((r) => r.existing && !r.skipReason);
  const togglePick = (regNo: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(regNo)) next.delete(regNo);
      else next.add(regNo);
      return next;
    });

  const footer =
    tab === "manual" ? (
      <>
        <AdminButton onClick={close}>Batal</AdminButton>
        <AdminButton variant="primary" icon="check-bold" onClick={addManual} disabled={!canAddManual || saving}>
          {saving ? "Menambahkan…" : member ? "Tambahkan ke sesi" : "Tambahkan peserta"}
        </AdminButton>
      </>
    ) : (
      <>
        <span className={cx(editor.muted, styles.footerNote)}>
          {preview ? `${picked.size} dari ${selectable.length} peserta dipilih` : fileName ? fileName : "Belum ada file dipilih"}
        </span>
        <AdminButton onClick={close}>Batal</AdminButton>
        {preview ? (
          <AdminButton variant="primary" icon="check-bold" onClick={importPicked} disabled={!picked.size || saving}>
            {saving ? "Menambahkan…" : `Tambahkan ${picked.size} peserta`}
          </AdminButton>
        ) : (
          <AdminButton variant="primary" iconAfter="caret-right" onClick={toPreview} disabled={!fileName || reading}>
            {reading ? "Membaca file…" : "Lanjut ke preview"}
          </AdminButton>
        )}
      </>
    );

  return (
    <>
      <AdminButton size="sm" icon="user-plus" onClick={dialog.open} disabled={Boolean(addLock)} title={addLock ?? "Tambah peserta manual atau impor dari Kuy"}>
        Tambah peserta
      </AdminButton>
      <Drawer
        dialogRef={dialog.dialogRef}
        title="Tambah peserta"
        subtitle={`${sessionTitle} · ${sessionWhen}`}
        onClose={close}
        onBackdropClick={dialog.onBackdropClick}
        size={tab === "import" && preview ? "wide" : "default"}
        footer={footer}
      >
        <div className={styles.importBody}>
          <div className={styles.tabs} role="tablist" aria-label="Cara menambah peserta">
            <button type="button" role="tab" aria-selected={tab === "manual"} className={cx(styles.tab, tab === "manual" && styles.tabOn)} onClick={() => setTab("manual")}>
              <AdminIcon name="user-plus" size={16} />
              Input manual
            </button>
            <button type="button" role="tab" aria-selected={tab === "import"} className={cx(styles.tab, tab === "import" && styles.tabOn)} onClick={() => setTab("import")}>
              <AdminIcon name="upload-simple" size={16} />
              Import XLSX dari Kuy
            </button>
          </div>

          {tab === "manual" ? (
            <>
              <form className={editor.field} onSubmit={check}>
                <label className={editor.label} htmlFor="participant-query">
                  ID Soslay, Kuy ID, atau nomor HP
                </label>
                <span className={styles.lookupRow}>
                  <span className={editor.affix}>
                    <AdminIcon name="magnifying-glass" size={16} />
                    <input
                      id="participant-query"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setLookup(null);
                      }}
                      placeholder="SOS 0541 2610 · faqih32 · 0812…"
                      autoComplete="off"
                    />
                  </span>
                  <AdminButton type="submit" disabled={!query.trim() || checking}>
                    {checking ? "Mengecek…" : "Cek"}
                  </AdminButton>
                </span>
                <span className={editor.muted}>Urutan pencarian: ID Soslay → Kuy ID → Reclub ID. Nomor HP juga bisa.</span>
              </form>

              {member && (
                <div className={styles.importRow}>
                  <span className={styles.person}>
                    <MemberAvatar name={member.fullName} size={36} />
                    <span className={styles.importMeta}>
                      <strong>{member.fullName}</strong>
                      <span className={styles.username}>
                        {member.memberCode}
                        <AdminIcon name="verified" size={14} label="Member Soslay terverifikasi" className={styles.verified} />
                        {member.kuyId && ` · Kuy @${member.kuyId}`}
                      </span>
                      <span>{[phoneLabel(member.phone), member.email].filter(Boolean).join(" · ")}</span>
                      <span>{member.level ? LEVEL_LABEL[member.level] : "Level —"}</span>
                    </span>
                  </span>
                  <span className={styles.importBadges}>
                    <Badge tone="lime" icon="check-circle">
                      Member Soslay
                    </Badge>
                    <span className={editor.muted}>cocok via {member.matchedBy}</span>
                  </span>
                </div>
              )}
              {alreadyIn && (
                <p className={cx(styles.info, styles.warn)}>
                  <AdminIcon name="warning-circle" size={16} />
                  Member ini sudah terdaftar di sesi ini.
                </p>
              )}
              {lookup?.found === "none" && (
                <>
                  <p className={styles.info}>
                    <AdminIcon name="question" size={16} />
                    Belum terdaftar sebagai member Soslay. Isi data peserta — dicatat sebagai ghost member dan otomatis tersambung ke akunnya saat dia daftar.
                  </p>
                  <label className={editor.field}>
                    <span className={editor.label}>Nama lengkap *</span>
                    <input className={editor.input} value={guest.fullName} onChange={(e) => setGuest({ ...guest, fullName: e.target.value })} autoComplete="off" />
                  </label>
                  <label className={editor.field}>
                    <span className={editor.label}>Nomor HP (WhatsApp) *</span>
                    <input
                      className={cx(editor.input, guestPhoneTouched && guestPhoneError && editor.invalid)}
                      inputMode="tel"
                      value={guest.phone}
                      onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
                      placeholder="0812…"
                      autoComplete="off"
                      onBlur={() => setGuestPhoneTouched(true)}
                      aria-invalid={guestPhoneTouched && Boolean(guestPhoneError)}
                    />
                    {guestPhoneTouched && guestPhoneError && <span className={editor.error}>{guestPhoneError}</span>}
                  </label>
                  <label className={editor.field}>
                    <span className={editor.label}>Email (opsional)</span>
                    <input className={editor.input} type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} autoComplete="off" />
                  </label>
                  <span className={editor.muted}>Nomor HP dipakai untuk mengenali peserta di aktivitas berikutnya & mengirim undangan daftar lewat WhatsApp.</span>
                </>
              )}
            </>
          ) : !preview ? (
            <>
              <label
                className={styles.dropBig}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  chooseFile(e.dataTransfer.files[0]);
                }}
              >
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="visually-hidden"
                  onChange={(e) => {
                    chooseFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <span className={styles.dropIcon}>
                  <AdminIcon name="upload-simple" size={22} />
                </span>
                <strong>{fileName ?? "Tarik & lepas file .xlsx export Kuy di sini"}</strong>
                <span className={styles.dropOr}>
                  {fileName ? "Ganti file:" : "atau"}
                  <span className={styles.pickButton}>
                    <AdminIcon name="upload-simple" size={14} />
                    Pilih file
                  </span>
                </span>
                <span className={editor.muted}>Format .xlsx · maks. 5 MB · 1 sheet per sesi</span>
              </label>

              {importError && (
                <p className={cx(styles.info, styles.warn)} role="alert">
                  <AdminIcon name="warning-circle" size={16} />
                  {importError}
                </p>
              )}

              <div className={styles.readBox}>
                <strong>Kolom yang otomatis dibaca dari file Kuy</strong>
                <span className={styles.readCols}>
                  {READ_COLUMNS.map((c) => (
                    <span key={c} className={styles.readCol}>
                      {c}
                    </span>
                  ))}
                </span>
                <span className={styles.readNote}>
                  <AdminIcon name="check-circle" size={14} />
                  No. WhatsApp, email & username dicocokkan dengan member Soslay. Yang sudah member ditandai centang di preview; yang belum dicatat sebagai ghost member.
                </span>
              </div>
              <a className={styles.sampleLink} href="/templates/contoh-export-kuy.xlsx" download>
                <AdminIcon name="download-simple" size={16} />
                Unduh contoh format (.xlsx)
              </a>
            </>
          ) : (
            <>
              <div className={styles.fileCard}>
                <span className={styles.xlsxIcon}>XLSX</span>
                <span className={styles.importMeta}>
                  <strong>{preview.fileName}</strong>
                  <span>
                    {rows.length} baris terbaca · 1 sheet · {kb(preview.fileSize)}
                    {preview.eventTitle && ` · ${preview.eventTitle}`}
                  </span>
                </span>
                <button type="button" className={styles.fileAction} onClick={clearFile}>
                  <AdminIcon name="upload-simple" size={14} />
                  Ganti file
                </button>
                <button type="button" className={editor.iconButton} aria-label="Hapus file" onClick={clearFile}>
                  <AdminIcon name="trash" size={16} />
                </button>
              </div>

              <div className={styles.summary}>
                <Stat label="Baris di file" value={rows.length} />
                <Stat
                  label="Member Soslay"
                  value={
                    <span className={styles.username}>
                      <AdminIcon name="check-circle" size={14} className={styles.verified} />
                      {members} / {rows.filter((r) => !r.skipReason).length}
                    </span>
                  }
                />
                <Stat label="Belum member (ghost)" value={ghosts} />
                <Stat label={`Total dibayar (${picked.size} peserta)`} value={formatRupiahPlain(totalPaid)} />
              </div>

              {existing.length > 0 && (
                <p className={cx(styles.info, styles.warn)}>
                  <AdminIcon name="warning-circle" size={16} />
                  {existing.length} peserta ({existing.slice(0, 3).map((r) => r.member?.name || r.name).join(", ")}
                  {existing.length > 3 ? ", …" : ""}) sudah terdaftar di sesi ini, jadi tidak ditambahkan lagi.
                </p>
              )}

              <div className={styles.previewWrap}>
                <table className={styles.previewTable}>
                  <thead>
                    <tr>
                      <th className={styles.pickCell}>
                        <input
                          type="checkbox"
                          aria-label="Pilih semua peserta"
                          checked={selectable.length > 0 && selectable.every((r) => picked.has(r.regNo))}
                          onChange={(e) => setPicked(e.target.checked ? new Set(selectable.map((r) => r.regNo)) : new Set())}
                        />
                      </th>
                      <th>Peserta & kontak</th>
                      <th>Member Soslay</th>
                      <th>Tiket & harga</th>
                      <th>Dibayar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const disabled = Boolean(r.skipReason) || r.existing;
                      const name = r.member?.name || r.name || "(tanpa nama)";
                      return (
                        <tr key={r.regNo} className={cx(disabled && styles.rowMuted)}>
                          <td className={styles.pickCell}>
                            <input type="checkbox" aria-label={`Pilih ${name}`} checked={picked.has(r.regNo)} disabled={disabled} onChange={() => togglePick(r.regNo)} />
                          </td>
                          <td>
                            <span className={styles.person}>
                              <MemberAvatar name={name} size={32} />
                              <span className={styles.importMeta}>
                                <strong>{name}</strong>
                                {r.member && r.name && r.name.trim().toLowerCase() !== r.member.name.trim().toLowerCase() && <span>Nama di Kuyy: {r.name}</span>}
                                {r.phone && (
                                  <span className={styles.contact}>
                                    <AdminIcon name="whatsapp-logo" size={12} />
                                    {phoneLabel(r.phone)}
                                  </span>
                                )}
                                {r.email && (
                                  <span className={styles.contact}>
                                    <AdminIcon name="envelope-simple" size={12} />
                                    {r.email}
                                  </span>
                                )}
                              </span>
                            </span>
                          </td>
                          <td>
                            {r.member ? (
                              <span className={styles.importMeta}>
                                <span className={cx(styles.username, styles.memberLabel)}>
                                  <AdminIcon name="verified" size={16} label="Member Soslay terverifikasi" className={styles.verified} />
                                  Member
                                </span>
                                <span>{r.member.code}</span>
                              </span>
                            ) : (
                              <span className={styles.importMeta}>
                                <span className={cx(styles.username, styles.memberLabel)}>
                                  <span className={styles.ghostDot} aria-hidden />
                                  Bukan member
                                </span>
                                <span>{r.ghost ? `Ghost · ${r.ghost.activities} aktivitas` : "Ghost baru"}</span>
                                {r.invite === "whatsapp" && <WaInviteLink href={memberInviteWaLink(r, sessionTitle)} />}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={styles.importMeta}>
                              <strong>{r.ticket || "—"}</strong>
                              {r.ticketPrice > 0 && <span>{formatRupiahPlain(r.ticketPrice)}</span>}
                            </span>
                          </td>
                          <td>
                            {r.skipReason ? (
                              <Badge tone="pink">{r.skipReason}</Badge>
                            ) : r.existing ? (
                              <Badge tone="neutral">Sudah terdaftar</Badge>
                            ) : (
                              <strong className={styles.paid}>{r.amount ? formatRupiahPlain(r.amount) : "—"}</strong>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Drawer>
    </>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={editor.stat}>
      <span className={editor.muted}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
