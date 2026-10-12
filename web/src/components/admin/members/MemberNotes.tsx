"use client";

import { useState, useTransition, type FormEvent } from "react";
import { addMemberNote, deleteMemberNote } from "@/server/admin/actions/members";
import type { MemberNote } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import styles from "./MemberDetail.module.css";

const stamp = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

/** Catatan internal tim (tabel member_notes) — tersimpan lewat server action. */
export function MemberNotes({ memberId, initial }: { memberId: string; initial: MemberNote[] }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    start(async () => {
      const result = await addMemberNote(memberId, body);
      if (result.ok) setDraft("");
      setError(result.ok ? null : result.error);
    });
  }

  const remove = (id: string) => {
    if (!window.confirm("Hapus catatan ini?")) return;
    start(async () => {
      const result = await deleteMemberNote(memberId, id);
      setError(result.ok ? null : result.error);
    });
  };

  return (
    <div className={styles.notes}>
      {initial.map((note) => (
        <div key={note.id} className={styles.note}>
          <p>{note.body}</p>
          <p className={styles.noteMeta}>
            {note.author} · {stamp.format(new Date(note.at)).replace(".", "")}
            <button type="button" className={styles.noteDelete} onClick={() => remove(note.id)} disabled={pending} aria-label="Hapus catatan">
              <AdminIcon name="trash" size={12} />
            </button>
          </p>
        </div>
      ))}
      {error && (
        <p className={styles.noteError} role="alert">
          {error}
        </p>
      )}
      <form onSubmit={submit} className={styles.noteForm}>
        <label className="visually-hidden" htmlFor="note-input">
          Tulis catatan
        </label>
        <input id="note-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Tulis catatan…" maxLength={2000} disabled={pending} />
        <button type="submit" aria-label="Simpan catatan" disabled={!draft.trim() || pending}>
          <AdminIcon name="note-pencil" size={18} />
        </button>
      </form>
    </div>
  );
}
