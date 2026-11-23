"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { formatRupiahPlain } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { amountDigits, amountDisplay, dateLabel, todayWib } from "@/lib/finance/format";
import { recordManualOrder, searchOrderMembers, type OrderMemberOption } from "@/server/admin/actions/orders";
import { withMemberLinkConfirm } from "../activities/confirm-member-link";
import editor from "../activities/SessionEditor.module.css";
import picker from "../activities/TripPayments.module.css";
import { FinanceModal } from "../finance/FinanceModal";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, PickerInput } from "../ui/AdminUI";
import { toast } from "../ui/Toaster";
import styles from "./ManualOrder.module.css";

export type ManualOrderProduct = { name: string; variants: string[]; price: number };

type Row = { key: number; productName: string; variant: string; quantity: string; unitPrice: string };

const OTHER = "__other";
const PAYMENT_METHODS = ["Transfer BCA", "Tunai", "QRIS", "Lainnya"];

/**
 * "Input order lama": pembelian merch di luar checkout website dicatat sebagai order Selesai & Lunas.
 * Pembeli = member Soslay (dicari nama / ID / nomor HP) atau tamu (nama + nomor HP). Masuk Keuangan hanya bila
 * tanggal bayar ≥ go-live di Pengaturan Keuangan (aturan yang sama dengan pencatatan otomatis lain).
 */
export function ManualOrderButton({ products, goLive }: { products: ManualOrderProduct[]; goLive: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const seq = useRef(1);
  const newRow = (): Row => ({ key: seq.current++, productName: "", variant: "", quantity: "1", unitPrice: "" });

  // ── Pembeli ──
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrderMemberOption[] | null>(null);
  const [picked, setPicked] = useState<OrderMemberOption | null>(null);
  const [searching, setSearching] = useState(false);
  const [guest, setGuest] = useState({ name: "", phone: "" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);
  const typeQuery = (value: string) => {
    setQuery(value);
    setPicked(null);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      searchSeq.current += 1;
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const n = ++searchSeq.current;
    timer.current = setTimeout(async () => {
      const r = await searchOrderMembers(value).catch(() => ({ ok: false as const, error: "Pencarian gagal — coba lagi." }));
      if (n !== searchSeq.current) return;
      setSearching(false);
      setResults(r.ok ? r.members : []);
      if (!r.ok) toast.error(r.error);
    }, 300);
  };

  // ── Order ──
  const [paidOn, setPaidOn] = useState("");
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [rows, setRows] = useState<Row[]>([{ key: 0, productName: "", variant: "", quantity: "1", unitPrice: "" }]);
  const [custom, setCustom] = useState<Record<number, boolean>>({});
  const [shippingFee, setShippingFee] = useState("");
  const [courier, setCourier] = useState("");
  const [address, setAddress] = useState("");

  const setRow = (key: number, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const pickProduct = (row: Row, value: string) => {
    if (value === OTHER) {
      setCustom((c) => ({ ...c, [row.key]: true }));
      setRow(row.key, { productName: "", variant: "" });
      return;
    }
    const p = products.find((x) => x.name === value);
    setRow(row.key, { productName: value, variant: p?.variants[0] ?? "", unitPrice: p ? String(p.price) : row.unitPrice });
  };

  const subtotal = rows.reduce((sum, r) => sum + Number(r.quantity || 0) * Number(r.unitPrice || 0), 0);
  const total = subtotal + Number(shippingFee || 0);
  const usingMember = query.trim() !== "";
  const buyerOk = usingMember ? Boolean(picked) : guest.name.trim() !== "";
  const itemsOk = rows.some((r) => r.productName.trim()) && rows.every((r) => !r.productName.trim() || (Number(r.quantity) > 0 && r.unitPrice !== ""));
  const beforeGoLive = Boolean(goLive && paidOn && paidOn < goLive);

  const reset = () => {
    setOpen(false);
    setQuery("");
    setResults(null);
    setPicked(null);
    setGuest({ name: "", phone: "" });
    setPaidOn("");
    setMethod(PAYMENT_METHODS[0]);
    setRows([newRow()]);
    setCustom({});
    setShippingFee("");
    setCourier("");
    setAddress("");
  };

  const save = () =>
    start(async () => {
      const input = {
        ...(picked ? { memberId: picked.id } : { name: guest.name, phone: guest.phone }),
        paidOn,
        paymentMethod: method,
        items: rows.map((row) => ({ productName: row.productName, variant: row.variant, quantity: Number(row.quantity || 0), unitPrice: Number(row.unitPrice || 0) })),
        shippingFee: Number(shippingFee || 0),
        courier,
        address,
      };
      // Nomor tamu milik member → admin memastikan dulu orangnya sama (salah ketik nomor bisa menautkan ke member lain).
      const r = await withMemberLinkConfirm((linkMember) => recordManualOrder({ ...input, linkMember }), "Catat order ini atas akun member itu?");
      toast.result(r);
      if (r.ok) {
        reset();
        router.refresh();
      }
    });

  return (
    <>
      <AdminButton size="sm" icon="plus-bold" onClick={() => setOpen(true)}>
        Input order lama
      </AdminButton>
      <FinanceModal
        open={open}
        onClose={reset}
        wide
        title="Input order lama"
        subtitle="Pembelian merch di luar checkout website — tersimpan sebagai order Selesai & Lunas. Stok & Slay Point tidak berubah."
        footer={
          <>
            <span className={picker.sub}>
              Total <strong>{formatRupiahPlain(total)}</strong>
            </span>
            <span className={picker.modalActions}>
              <AdminButton onClick={reset}>Batal</AdminButton>
              <AdminButton variant="primary" icon="check-bold" onClick={save} disabled={busy || !buyerOk || !itemsOk || !paidOn}>
                {busy ? "Menyimpan…" : "Simpan order"}
              </AdminButton>
            </span>
          </>
        }
      >
        <h3 className={styles.heading}>Pembeli</h3>
        <label className={editor.field}>
          <span className={editor.label}>Member Soslay</span>
          <span className={editor.affix}>
            <AdminIcon name="magnifying-glass" size={16} />
            <input value={query} onChange={(e) => typeQuery(e.target.value)} placeholder="Nama, ID Soslay, Kuy ID, atau nomor HP" autoComplete="off" />
          </span>
        </label>
        {usingMember && (
          <ul className={picker.results} aria-label="Hasil pencarian member" aria-busy={searching}>
            {picked ? (
              <li>
                <div className={cx(picker.result, picker.picked)}>
                  <MemberLine m={picked} />
                  <button type="button" className={picker.link} onClick={() => setPicked(null)}>
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
                  <button type="button" className={picker.result} onClick={() => setPicked(m)}>
                    <MemberLine m={m} />
                    <AdminIcon name="plus-bold" size={14} />
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
        <p className={picker.or}>atau tamu (belum member) — nomor milik member akan ditanyakan untuk ditautkan</p>
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

        <h3 className={styles.heading}>Pembayaran</h3>
        <div className={editor.cols2}>
          <label className={editor.field}>
            <span className={editor.label}>Tanggal bayar</span>
            <PickerInput type="date" className={editor.input} value={paidOn} max={todayWib()} onChange={(e) => setPaidOn(e.target.value)} />
          </label>
          <label className={editor.field}>
            <span className={editor.label}>Metode bayar</span>
            <span className={editor.selectWrap}>
              <select className={cx(editor.input, editor.select)} value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <AdminIcon name="caret-down" size={14} />
            </span>
          </label>
        </div>

        <h3 className={styles.heading}>Produk</h3>
        <div className={styles.items}>
          {rows.map((row) => {
            const product = products.find((p) => p.name === row.productName);
            const isCustom = custom[row.key];
            return (
              <div key={row.key} className={styles.item}>
                <label className={cx(editor.field, styles.product)}>
                  <span className={editor.label}>Produk</span>
                  {isCustom ? (
                    <span className={editor.affix}>
                      <input value={row.productName} onChange={(e) => setRow(row.key, { productName: e.target.value })} placeholder="Nama produk" autoFocus />
                      <button
                        type="button"
                        className={picker.link}
                        onClick={() => {
                          setCustom((c) => ({ ...c, [row.key]: false }));
                          setRow(row.key, { productName: "" });
                        }}
                      >
                        Katalog
                      </button>
                    </span>
                  ) : (
                    <span className={editor.selectWrap}>
                      <select className={cx(editor.input, editor.select)} value={row.productName} onChange={(e) => pickProduct(row, e.target.value)}>
                        <option value="">Pilih produk…</option>
                        {products.map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                        <option value={OTHER}>Lainnya (ketik nama)…</option>
                      </select>
                      <AdminIcon name="caret-down" size={14} />
                    </span>
                  )}
                </label>
                <label className={editor.field}>
                  <span className={editor.label}>Varian</span>
                  {product && product.variants.length > 0 && !isCustom ? (
                    <span className={editor.selectWrap}>
                      <select className={cx(editor.input, editor.select)} value={row.variant} onChange={(e) => setRow(row.key, { variant: e.target.value })}>
                        {product.variants.map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                      <AdminIcon name="caret-down" size={14} />
                    </span>
                  ) : (
                    <input className={editor.input} value={row.variant} onChange={(e) => setRow(row.key, { variant: e.target.value })} placeholder="Opsional" />
                  )}
                </label>
                <label className={editor.field}>
                  <span className={editor.label}>Jumlah</span>
                  <input className={editor.input} inputMode="numeric" value={row.quantity} onChange={(e) => setRow(row.key, { quantity: amountDigits(e.target.value) })} />
                </label>
                <label className={editor.field}>
                  <span className={editor.label}>Harga satuan</span>
                  <span className={editor.affix}>
                    <span className={editor.muted}>Rp</span>
                    <input inputMode="numeric" value={amountDisplay(row.unitPrice)} onChange={(e) => setRow(row.key, { unitPrice: amountDigits(e.target.value) })} />
                  </span>
                </label>
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                  disabled={rows.length === 1}
                  aria-label="Hapus baris produk"
                >
                  <AdminIcon name="trash" size={16} />
                </button>
              </div>
            );
          })}
          <button type="button" className={cx(picker.link, styles.addRow)} onClick={() => setRows((list) => [...list, newRow()])}>
            + Tambah produk
          </button>
        </div>

        <h3 className={styles.heading}>Pengiriman (opsional)</h3>
        <div className={editor.cols2}>
          <label className={editor.field}>
            <span className={editor.label}>Ongkir</span>
            <span className={editor.affix}>
              <span className={editor.muted}>Rp</span>
              <input inputMode="numeric" value={amountDisplay(shippingFee)} onChange={(e) => setShippingFee(amountDigits(e.target.value))} placeholder="0" />
            </span>
          </label>
          <label className={editor.field}>
            <span className={editor.label}>Kurir / cara terima</span>
            <input className={editor.input} value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="J&T, GoSend, ambil di Mabar…" />
          </label>
        </div>
        <label className={editor.field}>
          <span className={editor.label}>Alamat</span>
          <input className={editor.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Opsional" />
        </label>

        <p className={cx(picker.financeNote, beforeGoLive && styles.noteOff)}>
          <AdminIcon name="hand-coins" size={16} />
          {!paidOn
            ? `Keuangan: tanggal bayar sejak go-live${goLive ? ` (${dateLabel(goLive)})` : ""} tercatat otomatis sebagai Pemasukan · Penjualan merchandise; sebelum itu tidak dicatat.`
            : beforeGoLive
              ? `Tanggal bayar sebelum go-live Keuangan (${dateLabel(goLive!)}) — order tersimpan, tapi tidak masuk Keuangan.`
              : `Masuk Keuangan otomatis: Pemasukan · Penjualan merchandise · ${formatRupiahPlain(total)} · tanggal ${dateLabel(paidOn)}.`}
        </p>
      </FinanceModal>
    </>
  );
}

function MemberLine({ m }: { m: OrderMemberOption }) {
  return (
    <span>
      <strong>{m.fullName}</strong>
      <small>{[m.memberCode, m.phone].filter(Boolean).join(" · ")}</small>
    </span>
  );
}
