"use client";

import { useTransition } from "react";
import { deleteSegment, saveSegment } from "@/server/admin/actions/members";
import type { MembersQuery } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { toast } from "../ui/Toaster";
import styles from "./Members.module.css";

/** "Simpan segmen" — menyimpan filter aktif ke member_segments. */
export function SaveSegmentButton({ query }: { query: MembersQuery }) {
  const [pending, start] = useTransition();
  const hasFilter = Boolean(query.q || query.tier || query.level || query.city || query.frequency || query.interest || (query.tab && query.tab !== "all"));
  const save = () => {
    const name = window.prompt("Nama segmen (filter yang aktif sekarang akan disimpan):");
    if (!name?.trim()) return;
    start(async () => {
      toast.result(await saveSegment(name, query));
    });
  };
  return (
    <button type="button" className={styles.saveSegment} onClick={save} disabled={!hasFilter || pending} title={hasFilter ? undefined : "Pilih filter dulu, lalu simpan sebagai segmen"}>
      <AdminIcon name="plus-bold" size={12} />
      {pending ? "Menyimpan…" : "Simpan segmen"}
    </button>
  );
}

export function DeleteSegmentButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={styles.segmentDelete}
      aria-label={`Hapus segmen ${name}`}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Hapus segmen "${name}"?`)) return;
        start(async () => {
          toast.result(await deleteSegment(id));
        });
      }}
    >
      <AdminIcon name="x" size={10} />
    </button>
  );
}
