"use client";

import { useRef } from "react";

type Photo = string | null | undefined;

/**
 * Foto yang diupload di editor baru tersimpan saat Simpan. Upload yang diganti sebelum itu — dan foto
 * Storage lama yang diganti — dibuang lewat `discard` (server hanya menghapus file yang tidak lagi
 * dipakai baris mana pun).
 */
export function useUploadCleanup(discard: (urls: string[]) => Promise<void>) {
  const uploaded = useRef<string[]>([]);

  return {
    /** Catat URL hasil upload di halaman ini. */
    track: (url: string) => void uploaded.current.push(url),
    /**
     * Jalankan `save`, lalu buang foto yang tidak dipakai: `stored` = foto tersimpan sebelum diedit,
     * `current` = foto yang dipakai sekarang. Data baru diarahkan server ke halaman editnya → dibuang lebih dulu.
     */
    async save<R extends { ok: boolean }>(save: () => Promise<R>, { isNew, stored, current }: { isNew: boolean; stored: Photo[]; current: Photo[] }): Promise<R> {
      const unused = [...uploaded.current, ...stored].filter((u): u is string => Boolean(u) && !current.includes(u));
      // Upload dilupakan hanya setelah benar-benar dibuang — simpan gagal → tetap jadi kandidat simpan berikutnya.
      const run = () =>
        discard(unused)
          .then(() => void (uploaded.current = uploaded.current.filter((u) => !unused.includes(u))))
          .catch(() => undefined);
      if (isNew && unused.length) await run();
      const result = await save();
      if (result.ok && !isNew && unused.length) void run();
      return result;
    },
  };
}
