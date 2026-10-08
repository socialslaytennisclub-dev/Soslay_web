"use client";

import { useState, type FormEvent } from "react";
import type { MemberNote } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import styles from "./MemberDetail.module.css";

const stamp = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

/**
 * Catatan internal tim (tabel member_notes). Sementara disimpan di state halaman —
 * setelah Supabase tersambung, submit menjadi server action insert ke member_notes.
 */
export function MemberNotes({ initial }: { initial: MemberNote[] }) {
  const [notes, setNotes] = useState(initial);
  const [draft, setDraft] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setNotes((current) => [{ id: crypto.randomUUID(), author: "Rara", body, at: new Date().toISOString() }, ...current]);
    setDraft("");
  }

  return (
    <div className={styles.notes}>
      {notes.map((note) => (
        <div key={note.id} className={styles.note}>
          <p>{note.body}</p>
          <p className={styles.noteMeta}>
            {note.author} · {stamp.format(new Date(note.at)).replace(".", "")}
          </p>
        </div>
      ))}
      <form onSubmit={submit} className={styles.noteForm}>
        <label className="visually-hidden" htmlFor="note-input">
          Tulis catatan
        </label>
        <input id="note-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Tulis catatan…" maxLength={2000} />
        <button type="submit" aria-label="Simpan catatan" disabled={!draft.trim()}>
          <AdminIcon name="note-pencil" size={18} />
        </button>
      </form>
    </div>
  );
}
