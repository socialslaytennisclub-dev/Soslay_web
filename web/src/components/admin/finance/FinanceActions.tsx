"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useTransition, useState } from "react";
import searchStyles from "@/components/admin/activities/Activities.module.css";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { AdminButton, SearchClear } from "@/components/admin/ui/AdminUI";
import { useConfirm } from "@/components/admin/ui/ConfirmDialog";
import { toast } from "@/components/admin/ui/Toaster";
import { undoImport } from "@/server/admin/actions/finance";

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

/**
 * Kolom cari daftar transaksi — pola yang sama dengan Members / Orders / Activities: ikon, tombol hapus,
 * cari otomatis 300 ms setelah berhenti mengetik (router.replace, tidak menumpuk riwayat).
 */
export function SearchBox({ value, placeholder }: { value: string; placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(value);
  useEffect(() => {
    if (q.trim() === (params.get("q") ?? "")) return;
    const id = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      if (q.trim()) next.set("q", q.trim());
      else next.delete("q");
      next.delete("page");
      router.replace(`${pathname}?${next}`, { scroll: false });
    }, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya bereaksi pada ketikan
  }, [q]);
  return (
    <label className={searchStyles.searchField}>
      <AdminIcon name="magnifying-glass" size={18} />
      <span className="visually-hidden">Cari transaksi</span>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      {q && <SearchClear onClear={() => setQ("")} />}
    </label>
  );
}
