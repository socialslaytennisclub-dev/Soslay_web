"use client";

import { ArrowRight, CircleAlert, Clock, Mail, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useMemberUser } from "@/hooks/useMemberUser";
import { rp } from "@/lib/checkout";
import { cx } from "@/lib/cx";
import { orderPayHref, readOrderNowVerifyRaw, type OrderNowVerify as VerifyData } from "@/lib/order-now";
import { resendSignupConfirmation } from "@/server/auth/actions";
import { Card } from "../CheckoutParts";
import cx2 from "../Checkout.module.css";
import styles from "./OrderNow.module.css";

const noopSubscribe = () => () => {};
const RESEND_COOLDOWN = 60;

/**
 * Order Now · setelah pesanan dibuat untuk akun baru: verifikasi email dulu, link di email membuka halaman bayar
 * pesanan itu. Data (email, kode, total) dari sessionStorage — tidak lewat URL.
 *
 * Link verifikasi (/auth/confirm) langsung membuat sesi login di browser yang membukanya. Jadi bila pembeli
 * verifikasi di tab lain browser ini lalu kembali ke sini → otomatis lanjut ke halaman bayar, tanpa login lagi.
 * Verifikasi di HP / browser lain → sesinya di sana; di sini tetap diminta masuk (tidak ada login tanpa sandi).
 */
export function OrderNowVerify() {
  const router = useRouter();
  const raw = useSyncExternalStore(noopSubscribe, readOrderNowVerifyRaw, () => "");
  // Hitung mundur kirim ulang me-render tiap detik → data cukup di-parse sekali.
  const data = useMemo(() => (raw ? (JSON.parse(raw) as VerifyData) : null), [raw]);
  const payHref = data ? orderPayHref(data.code) : "/akun/order";
  // Sesi akun pemesan muncul (verifikasi di tab lain browser ini) → langsung ke halaman bayar. Akun lain yang
  // sedang masuk di browser ini (perangkat bersama) tidak dianggap — pesanannya bukan milik akun itu.
  const member = useMemberUser();
  const ownSession = Boolean(member && (!data || !member.email || member.email.toLowerCase() === data.email));
  useEffect(() => {
    if (ownSession) router.replace(payHref);
  }, [ownSession, payHref, router]);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string }>();
  // "Lanjut" tanpa sesi di browser ini = belum verifikasi di sini → beri tahu di tempat, jangan lempar ke Masuk.
  const [notVerified, setNotVerified] = useState(false);
  const loginHref = `/masuk?next=${encodeURIComponent(payHref)}`;
  const continueToPay = () => (ownSession ? router.push(payHref) : setNotVerified(true));
  const otherAccount = Boolean(member && !ownSession);
  const notVerifiedBox = (resendButton?: React.ReactNode) =>
    notVerified && (
      <div className={cx(cx2.note, cx2.noteAmber, styles.notVerified)} role="alert">
        <CircleAlert size={16} />
        <div className={styles.notVerifiedBody}>
          {otherAccount ? (
            <>
              <strong>Browser ini sedang masuk dengan akun lain{member?.email ? ` (${member.email})` : ""}.</strong>
              <span>Keluar dari akun itu dulu, lalu klik link verifikasi di email kamu atau masuk dengan akunmu.</span>
            </>
          ) : (
            <>
              <strong>Email kamu belum terverifikasi di browser ini.</strong>
              <span>Klik link di email dari Slay Club dulu (cek folder Spam / Promotions juga).</span>
            </>
          )}
          <span className={styles.notVerifiedActions}>
            {resendButton}
            <Link href={loginHref} className={cx2.linkButton}>
              Sudah verifikasi di HP lain? Masuk di sini
            </Link>
          </span>
        </div>
      </div>
    );
  const [wait, setWait] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  if (!data) {
    return (
      <div className={cx2.body}>
        <div className={cx2.main}>
          <Card title="Cek email kamu">
            <p className={cx2.muted}>Buka email dari Slay Club dan klik link verifikasi — akunmu aktif dan kamu langsung masuk ke halaman pembayaran pesanan.</p>
            <div className={cx2.actionsRow}>
              <button type="button" className={cx2.outline} onClick={continueToPay}>
                Sudah verifikasi? Lanjut
              </button>
            </div>
            {notVerifiedBox()}
          </Card>
        </div>
      </div>
    );
  }

  const gmail = /@(gmail|googlemail)\.com$/i.test(data.email);
  const resendLabel = pending ? "Mengirim…" : wait > 0 ? `Kirim ulang (${wait} dtk)` : "Kirim ulang email";
  const resend = () =>
    start(async () => {
      const r = await resendSignupConfirmation(data.email, payHref);
      if (r?.error) setStatus({ tone: "error", text: "Belum bisa kirim ulang — tunggu beberapa menit lalu coba lagi." });
      else {
        setStatus({ tone: "ok", text: `Email verifikasi dikirim ulang ke ${data.email}.` });
        setWait(RESEND_COOLDOWN);
      }
    });

  return (
    <div className={cx2.body}>
      <div className={cx2.main}>
        <Card>
          <div className={cx2.hero}>
            <span className={cx(cx2.heroIcon, styles.verifyIcon)}>
              <Mail size={28} />
            </span>
            <div className={cx2.items} style={{ gap: 8 }}>
              <p className={cx2.heroTitle}>Satu langkah lagi: verifikasi email kamu</p>
              <p className={cx2.heroText}>
                Link verifikasi sudah dikirim ke <strong>{data.email}</strong>. Buka link itu di HP / browser ini — akun Slay Club kamu aktif dan kamu langsung masuk ke halaman pembayaran pesanan #{data.code}. Dibuka di perangkat lain? Setelah verifikasi, buka menu <strong>Order</strong> di akunmu untuk membayar.
              </p>
            </div>
          </div>
          <p className={cx(cx2.note, cx2.noteAmber)}>
            <Clock size={16} />
            <span>Verifikasi dalam 1 jam. Lewat dari itu pesanan dibatalkan otomatis dan stoknya dilepas.</span>
          </p>
          <div className={styles.verifyActions}>
            {gmail && (
              <a href="https://mail.google.com/mail/u/0/#inbox" target="_blank" rel="noopener noreferrer" className={cx2.primary}>
                <Mail size={16} /> Buka Gmail
              </a>
            )}
            <button type="button" className={cx2.outline} onClick={resend} disabled={pending || wait > 0}>
              <Send size={16} /> {resendLabel}
            </button>
          </div>
          <button type="button" className={cx(cx2.linkButton, styles.verifyNext)} onClick={continueToPay}>
            Sudah klik link verifikasi? Lanjut ke pembayaran <ArrowRight size={16} />
          </button>
          {notVerifiedBox(
            <button type="button" className={cx2.linkButton} onClick={resend} disabled={pending || wait > 0}>
              {resendLabel}
            </button>,
          )}
          {status && (
            <p className={status.tone === "error" ? cx2.error : cx2.muted} role="status">
              {status.text}
            </p>
          )}
          <p className={cx2.muted}>Belum masuk? Cek folder Spam / Promotions. Salah tulis email? Pesan lagi lewat Order Now dengan email yang benar — pesanan ini batal sendiri setelah 1 jam.</p>
        </Card>

        <Card title={`Pesanan #${data.code}`}>
          <p className={cx2.muted}>
            {data.items} produk · {rp(data.total)} + ongkir &amp; kode unik. Rincian, rekening tujuan & upload bukti transfer tampil setelah verifikasi.
          </p>
        </Card>
      </div>
    </div>
  );
}
