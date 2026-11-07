"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { formatRupiahPlain } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { waLink } from "@/lib/wa-invite";
import { amountDigits, amountDisplay, num } from "@/lib/finance/format";
import { PAY_STATUS_LABEL, PAYMENT_KIND_LABEL, PLAN_LABEL, reminderText, shortDate, todayWib, type TripPayStatus } from "@/lib/trips";
import { addTripBooking, cancelTripBooking, recordTripPayment, searchTripMembers, voidTripPayment, type TripMemberOption } from "@/server/admin/actions/trips";
import type { TripBooking } from "@/server/admin/types";
import { FinanceModal } from "../finance/FinanceModal";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, Badge, MemberAvatar, PickerInput, type BadgeTone } from "../ui/AdminUI";
import { useConfirm } from "../ui/ConfirmDialog";
import { toast } from "../ui/Toaster";
import editor from "./SessionEditor.module.css";
import styles from "./TripPayments.module.css";

type Account = { id: string; name: string };
type Filter = "all" | TripPayStatus;

const STATUS_TONE: Record<TripPayStatus, BadgeTone> = { paid: "lime", dp: "indigo", unpaid: "pink" };
const fmtDay = (iso: string) => shortDate(iso.slice(0, 10));

/** Subjudul baris: "DP 20 Agu · lunas 10 Sep" / "Daftar 22 Sep · belum DP". */
function trail(b: TripBooking) {
  const pays = b.payments.filter((p) => !p.voided);
  if (!pays.length) return `Daftar ${fmtDay(b.createdAt)} · belum DP`;
  const first = pays[0];
  const last = pays.at(-1)!;
  // "Lunas" hanya bila memang lunas — Pelunasan yang nominalnya diubah lebih kecil tetap "DP".
  const head = b.money.status === "paid" && pays.length === 1 ? `Lunas ${fmtDay(first.receivedOn)}` : `DP ${fmtDay(first.receivedOn)}`;
  return b.money.status === "paid" && pays.length > 1 ? `${head} · lunas ${fmtDay(last.receivedOn)}` : head;
}

/** Peserta bundling (Figma 05x-2) + Catat pembayaran (05x-3) + Riwayat. */
export function TripPayments({ tripId, tripTitle, activities, quota, due, minDp, bookings, accounts, defaultAccountId }: {
  tripId: string;
  tripTitle: string;
  activities: number;
  quota: number;
  due: string;
  minDp: number;
  bookings: TripBooking[];
  accounts: Account[];
  defaultAccountId: string;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false);
  const [paying, setPaying] = useState<TripBooking | null>(null);
  const [history, setHistory] = useState<TripBooking | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, start] = useTransition();
  const active = bookings.filter((b) => !b.cancelled);
  const counts = { all: active.length, paid: 0, dp: 0, unpaid: 0 } as Record<Filter, number>;
  for (const b of active) counts[b.money.status]++;
  const shown = active.filter((b) => filter === "all" || b.money.status === filter);
  const visible = showAll ? shown : shown.slice(0, 6);

  // ── Catat pembayaran ──
  const [kind, setKind] = useState<"dp" | "settlement">("settlement");
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(todayWib());
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [proof, setProof] = useState<File | null>(null);
  const openPay = (b: TripBooking) => {
    const settle = b.money.paid > 0 || b.money.remaining <= minDp;
    setKind(settle ? "settlement" : "dp");
    setAmount(String(settle ? b.money.remaining : Math.min(minDp || b.money.remaining, b.money.remaining)));
    setReceivedOn(todayWib());
    setAccountId(defaultAccountId);
    setProof(null);
    setPaying(b);
  };
  const pickKind = (k: "dp" | "settlement") => {
    setKind(k);
    if (paying) setAmount(String(k === "settlement" ? paying.money.remaining : Math.min(minDp || paying.money.remaining, paying.money.remaining)));
  };
  const savePayment = () =>
    paying &&
    start(async () => {
      const form = new FormData();
      form.set("bookingId", paying.id);
      // DP kedua dst. = cicilan; pelunasan menutup sisa.
      form.set("kind", kind === "settlement" ? "settlement" : paying.money.paid > 0 ? "installment" : "dp");
      form.set("amount", String(Number(amount || 0)));
      form.set("receivedOn", receivedOn);
      form.set("accountId", accountId);
      if (proof) form.set("proof", proof);
      const r = await recordTripPayment(form);
      toast.result(r);
      if (r.ok) {
        setPaying(null);
        router.refresh();
      }
    });

  const voidPayment = async (paymentId: string, label: string) => {
    const ok = await confirm({
      title: `Batalkan pembayaran ${label}?`,
      body: <p>Dipakai untuk salah input atau dana dikembalikan. Pemasukan di Keuangan dikoreksi otomatis; riwayat tetap tersimpan.</p>,
      confirmLabel: "Batalkan pembayaran",
    });
    if (!ok) return;
    start(async () => {
      const r = await voidTripPayment(paymentId, "Dibatalkan dari Riwayat");
      toast.result(r);
      if (r.ok) {
        setHistory(null);
        router.refresh();
      }
    });
  };

  const cancelBooking = async (b: TripBooking) => {
    const ok = await confirm({
      title: `Batalkan paket ${b.name}?`,
      body: <p>{b.name} dikeluarkan dari semua {activities} activity trip. Pembayaran yang sudah masuk tetap tercatat — batalkan dari Riwayat bila dikembalikan.</p>,
      confirmLabel: "Batalkan paket",
    });
    if (!ok) return;
    start(async () => {
      const r = await cancelTripBooking(b.id);
      toast.result(r);
      if (r.ok) {
        setHistory(null);
        router.refresh();
      }
    });
  };

  // ── Tambah peserta ──
  const [query, setQuery] = useState("");
  const [guest, setGuest] = useState({ name: "", phone: "" });
  // Saran member saat mengetik (nama / ID Soslay / Kuy ID / nomor HP); null = belum dicari.
  const [results, setResults] = useState<TripMemberOption[] | null>(null);
  const [picked, setPicked] = useState<TripMemberOption | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);
  const typeQuery = (value: string) => {
    setQuery(value);
    setPicked(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim().length < 2) {
      searchSeq.current += 1; // abaikan pencarian sebelumnya yang masih berjalan
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    searchTimer.current = setTimeout(async () => {
      const r = await searchTripMembers(tripId, value).catch(() => ({ ok: false as const, error: "Pencarian gagal — coba lagi." }));
      if (seq !== searchSeq.current) return; // sudah ada ketikan yang lebih baru
      setSearching(false);
      setResults(r.ok ? r.members : []);
      if (!r.ok) toast.error(r.error);
    }, 300);
  };
  const resetAdd = () => {
    setAdding(false);
    setQuery("");
    setGuest({ name: "", phone: "" });
    setResults(null);
    setPicked(null);
  };
  const usingMember = query.trim() !== "";
  const canAdd = usingMember ? Boolean(picked && !picked.alreadyIn) : guest.name.trim() !== "";
  const addBooking = () =>
    start(async () => {
      const r = await addTripBooking(tripId, picked ? { memberId: picked.id } : { name: guest.name, phone: guest.phone });
      toast.result(r);
      if (r.ok) {
        resetAdd();
        router.refresh();
      }
    });

  const wa = (b: TripBooking) => (b.phone ? waLink(b.phone, reminderText(b.name, tripTitle, formatRupiahPlain(b.money.remaining), due)) : null);

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "Semua" },
    { value: "paid", label: "Lunas" },
    { value: "dp", label: "DP" },
    { value: "unpaid", label: "Belum bayar" },
  ];
  const remainingAfter = useMemo(() => (paying ? Math.max(paying.money.remaining - Number(amount || 0), 0) : 0), [paying, amount]);

  return (
    <section className={styles.panel} aria-labelledby="peserta-bundling">
      <header className={styles.head}>
        <div>
          <h2 id="peserta-bundling" className={styles.title}>
            Peserta bundling
          </h2>
          <p className={styles.sub}>Bayar manual (transfer). Otomatis terdaftar di {activities === 4 ? "keempat" : `${activities}`} activity.</p>
        </div>
        <div className={styles.headActions}>
          <div className={styles.filters} role="tablist" aria-label="Status bayar">
            {filters.map((f) => (
              <button key={f.value} type="button" role="tab" aria-selected={filter === f.value} className={cx(styles.filter, filter === f.value && styles.filterOn)} onClick={() => setFilter(f.value)}>
                {f.label} <span className={styles.count}>{counts[f.value]}</span>
              </button>
            ))}
          </div>
          <AdminButton size="sm" icon="plus-bold" onClick={() => setAdding(true)} disabled={quota > 0 && active.length >= quota} title={quota > 0 && active.length >= quota ? "Kuota paket penuh" : undefined}>
            Tambah peserta
          </AdminButton>
        </div>
      </header>

      {shown.length === 0 ? (
        <p className={styles.empty}>{active.length ? "Tidak ada peserta dengan status ini." : "Belum ada pembeli paket. Tambahkan peserta yang sudah transfer DP."}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Peserta</th>
                <th>Paket</th>
                <th className={styles.num}>Harga</th>
                <th className={styles.num}>Dibayar</th>
                <th className={styles.num}>Sisa</th>
                <th>Status</th>
                <th aria-label="Aksi" />
              </tr>
            </thead>
            <tbody>
              {visible.map((b) => {
                const link = b.money.status !== "paid" ? wa(b) : null;
                return (
                  <tr key={b.id}>
                    <td>
                      <span className={styles.person}>
                        <MemberAvatar name={b.name} size={32} />
                        <span>
                          <strong>{b.name}</strong>
                          <small>{trail(b)}</small>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={cx(styles.plan, b.money.plan === "early_bird" && styles.planEarly)}>{PLAN_LABEL[b.money.plan]}</span>
                    </td>
                    <td className={styles.num}>{num(b.money.price)}</td>
                    <td className={cx(styles.num, styles.strong)}>{num(b.money.paid)}</td>
                    <td className={cx(styles.num, b.money.remaining > 0 && styles.due)}>{b.money.remaining > 0 ? num(b.money.remaining) : "—"}</td>
                    <td>
                      <Badge tone={STATUS_TONE[b.money.status]}>{PAY_STATUS_LABEL[b.money.status]}</Badge>
                    </td>
                    <td>
                      <span className={styles.rowActions}>
                        {b.money.status !== "paid" ? (
                          <>
                            {link ? (
                              <a href={link} target="_blank" rel="noopener noreferrer" className={styles.wa} aria-label={`Kirim pengingat pelunasan ke ${b.name} lewat WhatsApp`} title="Pengingat pelunasan (wa.me)">
                                <AdminIcon name="whatsapp-logo" size={16} />
                              </a>
                            ) : (
                              <span className={styles.waOff} title="Nomor HP belum ada">
                                <AdminIcon name="whatsapp-logo" size={16} />
                              </span>
                            )}
                            <AdminButton size="sm" variant="primary" onClick={() => openPay(b)}>
                              Catat pembayaran
                            </AdminButton>
                          </>
                        ) : null}
                        <button type="button" className={styles.link} onClick={() => setHistory(b)}>
                          Riwayat
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <footer className={styles.foot}>
        {shown.length > 6 ? (
          <button type="button" className={styles.link} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Tampilkan lebih sedikit" : `Lihat ${shown.length - 6} peserta lainnya`}
          </button>
        ) : (
          <span />
        )}
        <span className={styles.sub}>Pengingat pelunasan: tombol WA membuka wa.me dengan template (dikirim manual)</span>
      </footer>
      {confirmDialog}

      <FinanceModal
        open={paying !== null}
        onClose={() => setPaying(null)}
        title="Catat pembayaran"
        subtitle={`${tripTitle} · bundling (bayar manual)`}
        footer={
          <>
            <span className={styles.sub}>Bisa dibatalkan dari Riwayat</span>
            <span className={styles.modalActions}>
              <AdminButton onClick={() => setPaying(null)}>Batal</AdminButton>
              <AdminButton variant="primary" icon="check-bold" onClick={savePayment} disabled={busy || !Number(amount) || !accountId}>
                {busy ? "Menyimpan…" : "Simpan pembayaran"}
              </AdminButton>
            </span>
          </>
        }
      >
        {paying && (
          <>
            <div className={styles.payBox}>
              <p className={styles.payName}>
                <strong>{paying.name}</strong>
                <span>
                  <span className={cx(styles.plan, paying.money.plan === "early_bird" && styles.planEarly)}>{PLAN_LABEL[paying.money.plan]}</span>
                  <Badge tone={STATUS_TONE[paying.money.status]}>{PAY_STATUS_LABEL[paying.money.status]}</Badge>
                </span>
              </p>
              <p>
                <span>Harga paket ({PLAN_LABEL[paying.money.plan].toLowerCase()})</span>
                <strong>{formatRupiahPlain(paying.money.price)}</strong>
              </p>
              <p>
                <span>Sudah dibayar{paying.payments.filter((p) => !p.voided).map((p) => ` · ${PAYMENT_KIND_LABEL[p.kind]} ${fmtDay(p.receivedOn)}`).join("")}</span>
                <strong>{formatRupiahPlain(paying.money.paid)}</strong>
              </p>
              <p>
                <span>Sisa · jatuh tempo {due}</span>
                <strong className={styles.due}>{formatRupiahPlain(paying.money.remaining)}</strong>
              </p>
            </div>
            <div className={styles.kinds} role="radiogroup" aria-label="Jenis pembayaran">
              {(
                [
                  { value: "dp", title: "DP / cicilan", text: "Belum lunas setelah ini" },
                  { value: "settlement", title: "Pelunasan", text: "Status jadi Lunas" },
                ] as const
              ).map((k) => (
                <button key={k.value} type="button" role="radio" aria-checked={kind === k.value} className={cx(styles.kind, kind === k.value && styles.kindOn)} onClick={() => pickKind(k.value)}>
                  <span className={styles.radio} />
                  <span>
                    <strong>{k.title}</strong>
                    <small>{k.text}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className={editor.cols2}>
              <label className={editor.field}>
                <span className={editor.label}>Jumlah diterima</span>
                <span className={editor.affix}>
                  <span className={editor.muted}>Rp</span>
                  <input inputMode="numeric" value={amountDisplay(amount)} onChange={(e) => setAmount(amountDigits(e.target.value))} />
                </span>
                <span className={editor.muted}>{kind === "settlement" ? "Otomatis = sisa tagihan; bisa diubah" : `Sisa setelah ini ${formatRupiahPlain(remainingAfter)}`}</span>
              </label>
              <label className={editor.field}>
                <span className={editor.label}>Tanggal diterima</span>
                <PickerInput type="date" className={editor.input} value={receivedOn} max={todayWib()} onChange={(e) => setReceivedOn(e.target.value)} />
              </label>
              <label className={editor.field}>
                <span className={editor.label}>Diterima ke akun</span>
                <span className={editor.selectWrap}>
                  <select className={cx(editor.input, editor.select)} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <AdminIcon name="caret-down" size={14} />
                </span>
              </label>
              <label className={editor.field}>
                <span className={editor.label}>Bukti transfer (opsional)</span>
                <span className={editor.affix}>
                  <AdminIcon name="image" size={16} />
                  <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
                </span>
              </label>
            </div>
            <p className={styles.financeNote}>
              <AdminIcon name="hand-coins" size={16} />
              Tercatat otomatis di Keuangan: Pemasukan · Tiket activity · {accounts.find((a) => a.id === accountId)?.name ?? "akun"} · trip {tripTitle} · “{kind === "settlement" ? "Pelunasan" : paying.money.paid > 0 ? "Cicilan" : "DP"} · {paying.name}”.
            </p>
            {paying.money.plan === "early_bird" && paying.money.locked && (
              <p className={styles.sub}>
                <AdminIcon name="clock" size={12} /> Harga early bird dikunci karena DP pertama masuk sebelum batas early bird.
              </p>
            )}
          </>
        )}
      </FinanceModal>

      <FinanceModal open={history !== null} onClose={() => setHistory(null)} title={`Riwayat · ${history?.name ?? ""}`} subtitle={history ? `${PLAN_LABEL[history.money.plan]} · ${formatRupiahPlain(history.money.price)} · ${PAY_STATUS_LABEL[history.money.status]}` : undefined}>
        {history && (
          <>
            <ul className={styles.history}>
              {history.payments.length === 0 && <li className={styles.sub}>Belum ada pembayaran.</li>}
              {history.payments.map((p) => (
                <li key={p.id} className={cx(p.voided && styles.voided)}>
                  <span>
                    <strong>
                      {PAYMENT_KIND_LABEL[p.kind]} · {formatRupiahPlain(p.amount)}
                    </strong>
                    <small>
                      {fmtDay(p.receivedOn)} · {p.accountName}
                      {p.proofName ? ` · ${p.proofName}` : ""}
                      {p.voided ? ` · dibatalkan${p.voidReason ? ` (${p.voidReason})` : ""}` : ""}
                    </small>
                  </span>
                  {!p.voided && (
                    <button type="button" className={styles.link} disabled={busy} onClick={() => voidPayment(p.id, `${PAYMENT_KIND_LABEL[p.kind]} ${formatRupiahPlain(p.amount)}`)}>
                      Batalkan
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <button type="button" className={cx(styles.link, styles.danger)} disabled={busy} onClick={() => cancelBooking(history)}>
              Batalkan paket {history.name}
            </button>
          </>
        )}
      </FinanceModal>

      <FinanceModal
        open={adding}
        onClose={resetAdd}
        title="Tambah peserta bundling"
        subtitle={`Otomatis terdaftar di semua ${activities} activity trip.`}
        footer={
          <>
            <span className={styles.sub}>
              {active.length}/{quota || "∞"} paket terisi
            </span>
            <span className={styles.modalActions}>
              <AdminButton onClick={resetAdd}>Batal</AdminButton>
              <AdminButton variant="primary" icon="plus-bold" onClick={addBooking} disabled={busy || !canAdd}>
                Tambahkan
              </AdminButton>
            </span>
          </>
        }
      >
        <label className={editor.field}>
          <span className={editor.label}>Member Soslay</span>
          <span className={editor.affix}>
            <AdminIcon name="magnifying-glass" size={16} />
            <input value={query} onChange={(e) => typeQuery(e.target.value)} placeholder="Nama, ID Soslay, Kuy ID, atau nomor HP" autoComplete="off" />
          </span>
        </label>
        {usingMember && (
          <ul className={styles.results} aria-label="Hasil pencarian member" aria-busy={searching}>
            {picked ? (
              <li>
                <div className={cx(styles.result, styles.picked)}>
                  <MemberLine m={picked} />
                  <button type="button" className={styles.link} onClick={() => setPicked(null)}>
                    Ganti
                  </button>
                </div>
              </li>
            ) : searching || results === null ? (
              <li className={editor.muted}>{query.trim().length < 2 ? "Ketik minimal 2 huruf…" : "Mencari member…"}</li>
            ) : results.length === 0 ? (
              <li className={editor.muted}>Member tidak ditemukan — kosongkan pencarian lalu isi sebagai tamu di bawah.</li>
            ) : (
              results.map((m) => (
                <li key={m.id}>
                  <button type="button" className={styles.result} disabled={m.alreadyIn} onClick={() => setPicked(m)}>
                    <MemberLine m={m} />
                    {m.alreadyIn ? <Badge tone="neutral">Sudah terdaftar</Badge> : <AdminIcon name="plus-bold" size={14} />}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
        <p className={styles.or}>atau tamu (belum member)</p>
        <div className={editor.cols2}>
          <label className={editor.field}>
            <span className={editor.label}>Nama</span>
            <input className={editor.input} value={guest.name} disabled={usingMember} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
          </label>
          <label className={editor.field}>
            <span className={editor.label}>Nomor HP (WhatsApp)</span>
            <input className={editor.input} inputMode="tel" value={guest.phone} disabled={usingMember} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
          </label>
        </div>
      </FinanceModal>
    </section>
  );
}

/** Nama + "ID Soslay · no. HP" di saran & pilihan member "Tambah peserta bundling". */
function MemberLine({ m }: { m: TripMemberOption }) {
  return (
    <span>
      <strong>{m.fullName}</strong>
      <small>{[m.memberCode, m.phone].filter(Boolean).join(" · ")}</small>
    </span>
  );
}
