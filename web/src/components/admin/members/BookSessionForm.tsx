"use client";

import { useState, useTransition } from "react";
import { bookMemberIntoSession } from "@/server/admin/actions/members";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton } from "../ui/AdminUI";
import styles from "./MemberDetail.module.css";

/** "Booking-kan sesi": pilih sesi mendatang → booking dengan sumber Admin (bayar menyusul). */
export function BookSessionForm({ memberId, sessions }: { memberId: string; sessions: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <AdminButton icon="calendar-plus" size="sm" onClick={() => setOpen(true)} disabled={sessions.length === 0} title={sessions.length ? undefined : "Tidak ada sesi mendatang"}>
        Booking-kan sesi
      </AdminButton>
    );
  }

  const submit = () =>
    start(async () => {
      const result = await bookMemberIntoSession(memberId, sessionId);
      setMessage(result.ok ? { text: result.message } : { text: result.error, error: true });
      if (result.ok) setSessionId("");
    });

  return (
    <div className={styles.bookForm}>
      <label className={styles.bookSelect}>
        <span className="visually-hidden">Pilih sesi</span>
        <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          <option value="">Pilih sesi…</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <AdminIcon name="caret-down" size={12} />
      </label>
      <AdminButton size="sm" variant="primary" onClick={submit} disabled={!sessionId || pending}>
        {pending ? "Menyimpan…" : "Booking"}
      </AdminButton>
      <button type="button" className={styles.bookCancel} onClick={() => setOpen(false)} aria-label="Tutup">
        <AdminIcon name="x" size={14} />
      </button>
      {message && (
        <p className={message.error ? styles.noteError : styles.bookDone} role={message.error ? "alert" : "status"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
