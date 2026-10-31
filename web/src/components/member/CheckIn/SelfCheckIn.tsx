"use client";

import { Check, MapPinCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cx } from "@/lib/cx";
import { formatTanggalPendek, type City } from "@/lib/format";
import { selfCheckIn } from "@/server/member/actions";
import styles from "./CheckIn.module.css";

/** Batas setTimeout aman (jauh di bawah 2^31 ms) — sesi berminggu-minggu lagi dicek ulang tiap 6 jam. */
const MAX_WAIT_MS = 6 * 3_600_000;

type Props = {
  sessionId: string;
  city: City;
  /** Jendela check-in dibuka (30 menit sebelum mulai, atau saat sesi di-live-kan lebih awal). */
  opensAt: string;
  endsAt: string;
  /** Sudah tercatat hadir (oleh siapa pun); `checkedInAt` null bila waktunya tidak diketahui. */
  checkedIn: boolean;
  checkedInAt: string | null;
  /** Jam server saat halaman dimuat. */
  fetchedAt: number;
  /** "ticket" = di kartu e-ticket navy (detail sesi), "card" = halaman /akun/absensi. */
  variant: "ticket" | "card";
};

/**
 * Tombol check-in mandiri peserta: aktif selama jendela check-in s.d. sesi selesai, langsung tercatat
 * di admin & Panel Host (RPC member_self_check_in). Batal check-in hanya lewat host / admin.
 */
export function SelfCheckIn({ sessionId, city, opensAt, endsAt, checkedIn, checkedInAt, fetchedAt, variant }: Props) {
  const router = useRouter();
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Hasil tombol ini sampai data server menyusul; begitu status dari server berubah (mis. host
  // membatalkan check-in), data server yang dipakai lagi.
  const [justAt, setJustAt] = useState<string | null>(null);
  const [seen, setSeen] = useState(checkedIn);
  if (seen !== checkedIn) {
    setSeen(checkedIn);
    setJustAt(null);
    setError(null);
  }
  const done = checkedIn || justAt !== null;
  const at = checkedIn ? checkedInAt : justAt;

  const [now, setNow] = useState(fetchedAt);
  const opens = new Date(opensAt).getTime();
  const ends = new Date(endsAt).getTime();
  const open = now >= opens && now <= ends;
  // Satu timer ke perubahan berikutnya — jendela dibuka, lalu jendela ditutup (halaman yang
  // dibiarkan terbuka tidak perlu dimuat ulang).
  useEffect(() => {
    const next = now < opens ? opens : now <= ends ? ends + 1 : null;
    if (done || next === null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(Math.max(0, next - Date.now()), MAX_WAIT_MS));
    return () => window.clearTimeout(timer);
  }, [done, now, opens, ends]);

  const checkIn = () =>
    startBusy(async () => {
      const result = await selfCheckIn(sessionId);
      if (!result.ok) return setError(result.error);
      setError(null);
      setJustAt(new Date().toISOString());
      router.refresh();
    });

  return (
    <div className={cx(styles.self, styles[`self_${variant}`])}>
      {done ? (
        <p className={styles.done} role="status">
          <Check size={16} aria-hidden /> Sudah check-in{at && ` · ${formatTanggalPendek(at, city, "time")}`}
        </p>
      ) : open ? (
        <button type="button" className={styles.button} onClick={checkIn} disabled={busy}>
          <MapPinCheck size={18} aria-hidden />
          {busy ? "Menyimpan…" : variant === "ticket" ? "Check-in sekarang" : "Saya hadir"}
        </button>
      ) : now > ends ? (
        <p className={styles.wait}>Sesi sudah selesai · minta host / admin bila kamu hadir</p>
      ) : (
        <p className={styles.wait}>Check-in dibuka {formatTanggalPendek(opensAt, city, "dateTime")}</p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
