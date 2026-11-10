"use client";

import { Check, ChevronDown, Search, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useDialog } from "@/hooks/useDialog";
import { cx } from "@/lib/cx";
import { initials } from "@/lib/text";
import type { DetailPerson } from "@/server/member/session-detail";
import { KUDOS_TOP_DAYS, type KudosTop, type PersonCard } from "@/lib/kudos";
import { getKudosTopForHost, getPersonCard, setHostCheckIn } from "@/server/member/actions";
import kudosStyles from "./Kudos.module.css";
import styles from "./SessionDetail.module.css";

/** Alasan check-in manual (Figma S1-H · 2b) — sekadar konfirmasi host, tidak disimpan. */
const MANUAL_REASONS = ["QR rusak / HP mati", "Tidak bawa HP", "Lainnya"];

const PAGE = 8;

/**
 * Tab Peserta (Figma 2a): cari nama, daftar peserta + level & sumber daftar, "Lihat N lainnya".
 * Host (`checkIn`) menandai kehadiran langsung dari daftar (Figma S1-H · check-in manual); host (`kudosChips`)
 * juga melihat chip kudos teratas tiap peserta (BR-23) untuk menyusun line-up.
 */
export function ParticipantList({ people, checkIn = false, kudosChips = false, sessionId }: { people: DetailPerson[]; checkIn?: boolean; kudosChips?: boolean; sessionId?: string }) {
  const router = useRouter();
  const { dialogRef: confirmRef, open: openConfirm, close: closeConfirm, onBackdropClick: onConfirmBackdrop } = useDialog();
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const [target, setTarget] = useState<DetailPerson | null>(null);
  const [reason, setReason] = useState(MANUAL_REASONS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const mark = (p: DetailPerson, value: boolean) =>
    startBusy(async () => {
      if (!sessionId) return;
      const result = await setHostCheckIn(sessionId, p.id, value);
      if (!result.ok) return setError(result.error);
      setError(null);
      closeConfirm();
      router.refresh();
    });
  const ask = (p: DetailPerson) => {
    setTarget(p);
    setReason(MANUAL_REASONS[0]);
    setError(null);
    openConfirm();
  };
  // Kartu peserta: dimuat saat dibuka, disimpan per peserta selama halaman terbuka.
  const { dialogRef: cardRef, open: openCard, close: closeCard, onBackdropClick: onCardBackdrop } = useDialog();
  const [viewing, setViewing] = useState<{ person: DetailPerson; index: number } | null>(null);
  const [cards, setCards] = useState<Record<string, PersonCard | null | "error">>({});
  const loadCard = (id: string) => {
    if (!sessionId) return;
    // "Memuat…" (juga saat coba lagi).
    setCards((c) => {
      const next = { ...c };
      delete next[id];
      return next;
    });
    getPersonCard(sessionId, id)
      .then((r) => setCards((c) => ({ ...c, [id]: r.ok ? r.card : "error" })))
      .catch(() => setCards((c) => ({ ...c, [id]: "error" })));
  };
  const show = (p: DetailPerson, index: number) => {
    setViewing({ person: p, index });
    openCard();
    // Hasil yang berhasil disimpan; gagal → dimuat ulang saat dibuka lagi.
    if (p.member && (!(p.id in cards) || cards[p.id] === "error")) loadCard(p.id);
  };
  // Chip kudos teratas (host): sekali per kunjungan tab — tidak ikut muat ulang halaman live tiap 20 detik.
  const [tops, setTops] = useState<Record<string, KudosTop>>({});
  useEffect(() => {
    if (!kudosChips || !sessionId) return;
    let alive = true;
    getKudosTopForHost(sessionId)
      .then((t) => alive && setTops(t))
      .catch(() => undefined); // chip hanya pelengkap
    return () => {
      alive = false;
    };
  }, [kudosChips, sessionId]);
  const q = query.trim().toLowerCase();
  const found = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  const shown = all || q ? found : found.slice(0, PAGE);

  return (
    <>
      <label className={styles.search}>
        <Search size={16} aria-hidden />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama peserta…" aria-label="Cari nama peserta" />
      </label>
      <ul className={styles.people}>
        {shown.map((p, i) => (
          <li key={p.id} className={styles.person}>
            {/* Klik nama → kartu peserta (level, sesi di Soslay, kudos teratas). */}
            <button type="button" className={kudosStyles.personOpen} onClick={() => show(p, i)} aria-label={`Lihat info ${p.name}`}>
              <span className={cx(styles.personAvatar, styles[`face${i % 4}`])} aria-hidden>
                {initials(p.name)}
              </span>
              <span className={styles.personText}>
                <strong>
                  {p.name}
                  {p.me && <small> (kamu)</small>}
                </strong>
                <small>
                  {p.level} · via {p.source}
                </small>
              </span>
            </button>
            {/* Kudos teratas (hanya dikirim untuk host): bantu menyusun line-up. */}
            {tops[p.id] && (
              <span className={kudosStyles.chip} title={`Kudos teratas ${KUDOS_TOP_DAYS / 30} bulan terakhir: ${tops[p.id].label} (${tops[p.id].count})`}>
                <Sparkles size={12} aria-hidden />
                {tops[p.id].label} {tops[p.id].count}
              </span>
            )}
            {checkIn ? (
              p.checkedIn ? (
                <button type="button" className={cx(styles.pill, styles.pillOk)} onClick={() => mark(p, false)} disabled={busy} title="Batalkan check-in">
                  <Check size={12} aria-hidden /> Hadir
                </button>
              ) : (
                <button type="button" className={styles.btnOutlineSm} onClick={() => ask(p)} disabled={busy}>
                  Check-in
                </button>
              )
            ) : (
              <span className={cx(styles.pill, p.checkedIn && styles.pillOk)}>{p.checkedIn ? "Hadir" : "Terdaftar"}</span>
            )}
          </li>
        ))}
        {found.length === 0 && <li className={styles.muted}>Tidak ada peserta dengan nama itu.</li>}
      </ul>
      {!all && !q && found.length > PAGE && (
        <button type="button" className={styles.link} onClick={() => setAll(true)}>
          Lihat {found.length - PAGE} peserta lainnya
          <ChevronDown size={14} aria-hidden />
        </button>
      )}
      {error && !target && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}
      <dialog ref={cardRef} className={cx(styles.qrDialog, kudosStyles.sheet)} aria-labelledby="person-card-title" onClick={onCardBackdrop}>
        {viewing && <PersonCardPanel person={viewing.person} index={viewing.index} card={viewing.person.member ? cards[viewing.person.id] : null} onClose={closeCard} onRetry={() => loadCard(viewing.person.id)} />}
      </dialog>
      {checkIn && (
        <dialog ref={confirmRef} className={styles.qrDialog} aria-labelledby="checkin-title" onClick={onConfirmBackdrop}>
          {target && (
            <div className={styles.qrPanel}>
              <header className={styles.qrHead}>
                <div>
                  <h2 id="checkin-title">Check-in manual</h2>
                  <span className={styles.muted}>
                    {target.name} · {target.level}
                  </span>
                </div>
                <button type="button" className={styles.qrClose} onClick={closeConfirm} aria-label="Tutup">
                  <X size={18} />
                </button>
              </header>
              <fieldset className={styles.reasonSet}>
                <legend className={styles.endLabel}>Alasan check-in tanpa QR</legend>
                {MANUAL_REASONS.map((r) => (
                  <button key={r} type="button" aria-pressed={reason === r} className={cx(styles.reasonChip, reason === r && styles.reasonChipOn)} onClick={() => setReason(r)}>
                    {r}
                  </button>
                ))}
              </fieldset>
              <p className={styles.small}>Pastikan peserta sudah ada di lapangan. Peserta yang hadir masuk acakan line-up; yang punya akun Soslay juga mendapat Slay Point.</p>
              {error && (
                <p className={styles.formError} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.qrActions}>
                <button type="button" className={styles.btnOutline} onClick={closeConfirm}>
                  Batal
                </button>
                <button type="button" className={styles.btnLime} onClick={() => mark(target, true)} disabled={busy}>
                  {busy ? "Menyimpan…" : "Tandai hadir"}
                </button>
              </div>
            </div>
          )}
        </dialog>
      )}
    </>
  );
}

/** Isi kartu peserta: undefined = sedang dimuat, null = tamu tanpa akun Soslay. */
function PersonCardPanel({ person: p, index, card, onClose, onRetry }: { person: DetailPerson; index: number; card: PersonCard | null | "error" | undefined; onClose: () => void; onRetry: () => void }) {
  return (
    <div className={styles.qrPanel}>
      <header className={styles.qrHead}>
        <span className={kudosStyles.cardPerson}>
          <span className={cx(styles.personAvatar, styles[`face${index % 4}`])} aria-hidden>
            {initials(p.name)}
          </span>
          <span>
            <h2 id="person-card-title">
              {p.name}
              {p.me && <small> (kamu)</small>}
            </h2>
            <span className={styles.muted}>
              {p.level} · {p.checkedIn ? "Hadir" : "Terdaftar"}
            </span>
          </span>
        </span>
        <button type="button" className={styles.qrClose} onClick={onClose} aria-label="Tutup">
          <X size={18} />
        </button>
      </header>
      {card === undefined && <p className={styles.muted}>Memuat info peserta…</p>}
      {card === "error" && (
        <p className={styles.formError} role="alert">
          Info peserta gagal dimuat.{" "}
          <button type="button" className={styles.link} onClick={onRetry}>
            Coba lagi
          </button>
        </p>
      )}
      {card === null && <p className={styles.muted}>Belum punya akun Soslay — riwayat sesi & kudos tampil setelah daftar member.</p>}
      {card && card !== "error" && (
        <>
          <dl className={kudosStyles.cardStats}>
            <div>
              <dt>Sesi di Soslay</dt>
              <dd>{card.sessionsAttended}</dd>
            </div>
            <div>
              <dt>Kudos</dt>
              <dd>{card.kudosTotal}</dd>
            </div>
            <div>
              <dt>Diberikan dari</dt>
              <dd>{card.kudosGivers} orang</dd>
            </div>
          </dl>
          {card.kudosTop.length ? (
            <div className={kudosStyles.top} aria-label="3 kudos teratas">
              {card.kudosTop.map((t) => (
                <span key={t.label} className={kudosStyles.chip}>
                  <Sparkles size={12} aria-hidden />
                  {t.label} {t.count}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.muted}>Belum ada kudos.</p>
          )}
          <p className={styles.small}>Kudos bersifat anonim — nama pemberi tidak ditampilkan.</p>
        </>
      )}
    </div>
  );
}
