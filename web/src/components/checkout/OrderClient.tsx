"use client";

import { Check, Copy, FileText, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { senderBanks } from "@/content/checkout";
import { fmtDayDate, fmtSize, fmtTime, PROOF_MAX_BYTES, PROOF_TYPES, rp } from "@/lib/checkout";
import { cx } from "@/lib/cx";
import { changePickupSession, confirmReceived, submitProof } from "@/server/shop/actions";
import type { PickupSession, ProofView } from "@/server/shop/types";
import styles from "./Checkout.module.css";
import { Chip } from "./CheckoutParts";
import { StickyBar } from "./StickyBar";

/** Bagian interaktif halaman pesanan member (Figma 05 / 06 / 06a / 07). */

const subscribeSecond = (cb: () => void) => {
  const id = window.setInterval(cb, 1000);
  return () => window.clearInterval(id);
};

/** Hitung mundur HH : MM : SS ke batas bayar; habis → muat ulang (server membatalkan pesanan). */
export function Countdown({ deadline }: { deadline: string }) {
  const router = useRouter();
  const left = useSyncExternalStore(
    subscribeSecond,
    () => Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000)),
    () => -1,
  );
  const expired = left === 0;
  useEffect(() => {
    if (expired) router.refresh();
  }, [expired, router]);
  if (left < 0) return <span className={styles.countdown} aria-hidden />;
  const parts = [Math.floor(left / 3600), Math.floor((left % 3600) / 60), left % 60].map((n) => String(n).padStart(2, "0"));
  return (
    <span className={styles.countdown} role="timer" aria-label={`Sisa waktu ${parts[0]} jam ${parts[1]} menit`}>
      <span>{parts[0]}</span>:<span>{parts[1]}</span>:<span>{parts[2]}</span>
    </span>
  );
}

export function CopyButton({ value, label, full }: { value: string; label: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard diblokir — pengguna menyalin manual
    }
  };
  return (
    <button type="button" className={styles.pillButton} onClick={copy} style={full ? { width: "100%" } : undefined} aria-live="polite">
      {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Tersalin" : label}
    </button>
  );
}

type ProofFormProps = {
  code: string;
  total: number;
  /** Nilai awal dari bukti sebelumnya (upload ulang / ganti bukti). */
  previous?: ProofView;
  defaultSender: string;
  /** Teks di bawah tombol (desktop). */
  helper?: string;
  onDone?: () => void;
};

const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

/** Upload bukti transfer: dropzone / file + nama pengirim, bank, jumlah, tanggal, catatan. */
export function ProofForm({ code, total, previous, defaultSender, helper, onDone }: ProofFormProps) {
  const router = useRouter();
  const inputId = useId();
  const formId = `proof-${useId().replace(/:/g, "")}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [fields, setFields] = useState({
    senderName: previous?.senderName ?? defaultSender,
    senderBank: previous?.senderBank ?? "BCA",
    amount: String(previous?.amount ?? total),
    transferDate: previous?.transferDate ?? today(),
    note: "",
  });
  const amount = Number(fields.amount.replace(/\D/g, ""));
  const mismatch = amount > 0 && amount !== total;

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = (f: File | undefined) => {
    setError(undefined);
    if (!f) return;
    if (!PROOF_TYPES[f.type]) return setError("Format harus JPG, PNG, atau PDF.");
    if (f.size > PROOF_MAX_BYTES) return setError(`Ukuran file ${fmtSize(f.size)} — maksimal 5 MB.`);
    setFile(f);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return setError("Pilih file bukti transfer dulu.");
    const form = new FormData();
    form.set("file", file);
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    start(async () => {
      const result = await submitProof(code, form);
      if (!result.ok) return setError(result.error);
      onDone?.();
      router.refresh();
    });
  };

  return (
    <form className={styles.items} onSubmit={submit} id={formId}>
      <input ref={inputRef} id={inputId} type="file" accept="image/jpeg,image/png,application/pdf" className={styles.hiddenInput} onChange={(e) => pick(e.target.files?.[0])} />
      {file ? (
        <div className={styles.fileRow}>
          <span className={styles.filePreview}>
            {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau lokal (blob URL) */}
            {preview ? <img src={preview} alt="" /> : <FileText size={24} />}
          </span>
          <span className={styles.fileText}>
            <span className={styles.fileName}>{file.name}</span>
            <span className={styles.muted}>{fmtSize(file.size)} · dipilih {fmtTime(new Date().toISOString())}</span>
            <Chip tone="green">Siap dikirim</Chip>
          </span>
          <button type="button" className={styles.linkButton} onClick={() => inputRef.current?.click()}>
            Ganti
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={cx(styles.dropzone, drag && styles.dropzoneActive)}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            pick(e.dataTransfer.files?.[0]);
          }}
        >
          <span className={styles.dropIcon}>
            <Upload size={22} />
          </span>
          <span className={styles.strong}>
            <span className={styles.desktopOnly}>Seret foto / screenshot bukti transfer ke sini</span>
            <span className={styles.mobileOnly}>Ambil foto atau pilih screenshot</span>
          </span>
          <span className={styles.pillButton}>Pilih file</span>
          <span className={styles.muted}>Pastikan nominal, tanggal, dan rekening tujuan terlihat jelas. JPG, PNG, PDF · maks 5 MB.</span>
        </label>
      )}

      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.label}>Nama pemilik rekening pengirim</span>
          <input className={styles.input} required value={fields.senderName} onChange={(e) => setFields({ ...fields, senderName: e.target.value })} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Bank pengirim</span>
          <select className={styles.input} value={fields.senderBank} onChange={(e) => setFields({ ...fields, senderBank: e.target.value })}>
            {senderBanks.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Jumlah yang ditransfer</span>
          <input className={styles.input} inputMode="numeric" required value={amount ? rp(amount) : ""} onChange={(e) => setFields({ ...fields, amount: e.target.value.replace(/\D/g, "") })} />
          {mismatch && <span className={styles.fieldError}>Berbeda dengan total {rp(total)} — tetap boleh dikirim, admin akan mengecek.</span>}
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Tanggal transfer</span>
          <input className={styles.input} type="date" required max={today()} value={fields.transferDate} onChange={(e) => setFields({ ...fields, transferDate: e.target.value })} />
        </label>
        <label className={cx(styles.field, styles.fieldFull)}>
          <span className={styles.label}>Catatan untuk admin (opsional)</span>
          <input className={styles.input} value={fields.note} maxLength={300} placeholder="Contoh: transfer dari rekening a.n. orang lain" onChange={(e) => setFields({ ...fields, note: e.target.value })} />
        </label>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <StickyBar
        total={
          <>
            Total transfer
            <strong>{rp(total)}</strong>
          </>
        }
      >
        {/* form=…: tombol versi HP dirender di luar <form> (portal). */}
        <button type="submit" form={formId} className={styles.primary} disabled={!file || pending}>
          <Upload size={16} /> {pending ? "Mengirim…" : <><span className={styles.desktopOnly}>Kirim bukti transfer</span><span className={styles.mobileOnly}>Kirim bukti</span></>}
        </button>
      </StickyBar>
      {helper && <p className={cx(styles.helper, styles.desktopOnly)}>{helper}</p>}
    </form>
  );
}

/** "Ganti bukti" di halaman Menunggu verifikasi: buka form upload di tempat. */
export function ReplaceProof(props: Omit<ProofFormProps, "onDone">) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className={styles.items}>
      <ProofForm {...props} onDone={() => setOpen(false)} />
      <button type="button" className={styles.linkButton} onClick={() => setOpen(false)}>
        Batal ganti bukti
      </button>
    </div>
  ) : (
    <button type="button" className={styles.pillButton} onClick={() => setOpen(true)}>
      <Upload size={14} /> Ganti bukti
    </button>
  );
}

export function ConfirmReceived({ code }: { code: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <>
      <button
        type="button"
        className={styles.outline}
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Pesanan sudah kamu terima dengan baik?")) return;
          start(async () => {
            const r = await confirmReceived(code);
            if (!r.ok) setError(r.error);
            else router.refresh();
          });
        }}
      >
        <Check size={16} /> Pesanan sudah diterima
      </button>
      {error && <p className={styles.error}>{error}</p>}
    </>
  );
}

/** Pickup: batas H-1 lewat / sesi batal → member memilih sesi Mabar lain. */
export function ChangePickup({ code, sessions, current }: { code: string; sessions: PickupSession[]; current?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(sessions.find((s) => s.id !== current)?.id ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  if (!sessions.length) return <p className={styles.muted}>Belum ada sesi Mabar lain dalam 14 hari ke depan — admin akan menghubungimu.</p>;
  return (
    <div className={styles.coordForm}>
      <select className={styles.input} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Sesi Mabar baru">
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {fmtDayDate(s.startsAt)} · {fmtTime(s.startsAt)} · {s.venue}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={styles.pillButton}
        disabled={pending || !value}
        onClick={() =>
          start(async () => {
            const r = await changePickupSession(code, value);
            if (!r.ok) setError(r.error);
            else router.refresh();
          })
        }
      >
        Ganti sesi
      </button>
      {error && <p className={styles.fieldError}>{error}</p>}
    </div>
  );
}
