"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import { useConfirm } from "@/components/admin/ui/ConfirmDialog";
import { toast } from "@/components/admin/ui/Toaster";
import { undoImport } from "@/server/admin/actions/finance";
import styles from "./Finance.module.css";

/** Tombol "Batalkan import" (dalam 24 jam) di daftar transaksi hasil import (13i). */
export function UndoImportButton({ batchId, fileName, count }: { batchId: string; fileName: string; count: number }) {
  const router = useRouter();
  const [confirm, dialog] = useConfirm();
  const [pending, start] = useTransition();
  return (
    <>
      <AdminButton
        size="sm"
        icon="undo"
        disabled={pending}
        onClick={async () => {
          if (!(await confirm({ title: `Batalkan import ${fileName}?`, body: `${count} transaksi hasil import ini dihapus dari laporan. Tercatat di log.`, confirmLabel: "Batalkan import" }))) return;
          start(async () => {
            const r = await undoImport(batchId);
            toast.result(r);
            if (r.ok) router.push("/admin/keuangan/transaksi");
          });
        }}
      >
        Batalkan import
      </AdminButton>
      {dialog}
    </>
  );
}

/** Kolom cari di daftar transaksi (Enter → ?q=). */
export function SearchBox({ value, placeholder }: { value: string; placeholder: string }) {
  const router = useRouter();
  const [q, setQ] = useState(value);
  return (
    <form
      className={styles.search}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams(window.location.search);
        if (q.trim()) params.set("q", q.trim());
        else params.delete("q");
        params.delete("page");
        router.push(`${window.location.pathname}?${params.toString()}`, { scroll: false });
      }}
    >
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Cari transaksi" type="search" />
    </form>
  );
}
