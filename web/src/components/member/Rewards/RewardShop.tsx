"use client";

import { CalendarDays, Gift, Info, Lock, PackageCheck, Ticket, Truck, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { MapPicker } from "@/components/ui/MapPicker/MapPicker";
import { Modal } from "@/components/ui/Modal/Modal";
import { citiesOf, PROVINCE_NAMES, provinceOf } from "@/content/wilayah";
import { useDialog } from "@/hooks/useDialog";
import { REWARD_CATEGORY_LABEL, TIER_LABEL } from "@/lib/admin-labels";
import { estimateRouteKm, fmtDate, fmtDayDate, fmtTime, instantQuote, jntFee, rp, type InstantSettings, type ShippingRate } from "@/lib/checkout";
import { cx } from "@/lib/cx";
import { formatAngka } from "@/lib/format";
import type { RedemptionStatus, RewardCategory } from "@/server/admin/types";
import { redeemReward, type RedeemShip } from "@/server/member/actions";
import type { MemberReward, RewardPage } from "@/server/member/rewards";
import type { Recipient } from "@/server/shop/types";
import { CopyButton } from "@/components/checkout/OrderClient";
import checkout from "@/components/checkout/Checkout.module.css";
import styles from "./RewardShop.module.css";

type ShipContext = { recipient: Recipient; pin: { lat: number; lng: number } | null; rates: ShippingRate[]; instant: InstantSettings };

const FILTERS: (RewardCategory | "all")[] = ["all", "merch", "product", "session", "voucher", "experience"];

const STATUS: Record<RedemptionStatus, { label: string; tone: string }> = {
  pending: { label: "Menunggu", tone: styles.toneAmber },
  approved: { label: "Disetujui", tone: styles.toneIndigo },
  fulfilled: { label: "Selesai", tone: styles.toneGreen },
  rejected: { label: "Ditolak · poin kembali", tone: styles.toneNeutral },
};

const pts = (n: number) => `${formatAngka(n)} pts`;

/** Katalog reward + dialog tukar + riwayat penukaran member. */
export function RewardShop({ page, ship }: { page: RewardPage; ship: ShipContext }) {
  const [filter, setFilter] = useState<RewardCategory | "all">("all");
  const [selected, setSelected] = useState<MemberReward | null>(null);
  const dialog = useDialog();
  const list = page.rewards.filter((r) => filter === "all" || r.category === filter);

  const open = (r: MemberReward) => {
    setSelected(r);
    dialog.open();
  };
  const close = () => {
    dialog.close();
    setSelected(null);
  };

  return (
    <div className={checkout.body}>
      <div className={checkout.main}>
        <div className={styles.filters} role="tablist" aria-label="Kategori reward">
          {FILTERS.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} className={cx(styles.filter, filter === f && styles.filterOn)} onClick={() => setFilter(f)}>
              {f === "all" ? "Semua" : REWARD_CATEGORY_LABEL[f]}
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <p className={checkout.muted}>Belum ada reward di kategori ini.</p>
        ) : (
          <ul className={styles.grid}>
            {list.map((r) => {
              const soldOut = r.stock !== null && r.stock < 1;
              const short = page.balance < r.pointsCost;
              const reason = r.locked ? `Khusus ${TIER_LABEL[r.minTier]}+` : soldOut ? "Stok habis" : short ? `Kurang ${pts(r.pointsCost - page.balance)}` : null;
              return (
                <li key={r.id} className={styles.card}>
                  <div className={styles.thumb}>
                    {r.image ? <Image src={r.image} alt="" fill sizes="(min-width: 768px) 280px, 100vw" /> : <Gift size={32} aria-hidden />}
                  </div>
                  <div className={styles.cardBody}>
                    <span className={styles.category}>
                      {REWARD_CATEGORY_LABEL[r.category]}
                      {r.minTier !== "basic" && ` · ${TIER_LABEL[r.minTier]}+`}
                    </span>
                    <h3 className={styles.name}>{r.name}</h3>
                    {r.description && <p className={checkout.muted}>{r.description}</p>}
                    <p className={styles.delivery}>
                      {r.physical ? (
                        <>
                          <Truck size={14} aria-hidden /> Dikirim J&T / Instant atau ambil di activity
                        </>
                      ) : (
                        <>
                          <Ticket size={14} aria-hidden /> Dapat kode voucher dari admin
                        </>
                      )}
                    </p>
                    <div className={styles.cardFoot}>
                      <span className={styles.cost}>{pts(r.pointsCost)}</span>
                      {r.stock !== null && !soldOut && <span className={checkout.muted}>{r.stock} tersisa</span>}
                    </div>
                    <button type="button" className={cx(checkout.primary, styles.redeem)} disabled={Boolean(reason)} onClick={() => open(r)}>
                      {reason ? (
                        <>
                          {r.locked && <Lock size={14} aria-hidden />} {reason}
                        </>
                      ) : (
                        "Tukar"
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <MyRedemptions page={page} />
      </div>

      <aside className={checkout.aside}>
        <section className={cx(checkout.card, styles.balance)}>
          <span className={checkout.muted}>Saldo Slay Point</span>
          <strong className={styles.balanceValue}>{pts(page.balance)}</strong>
          <span className={checkout.muted}>Tier {TIER_LABEL[page.tier]}</span>
        </section>
        <p className={checkout.note}>
          <Info size={16} />
          <span>
            Poin langsung terpotong saat menukar. Kalau penukaran ditolak atau ongkir tidak dibayar dalam 24 jam, poin dikembalikan otomatis.
          </span>
        </p>
        {page.demo && <p className={checkout.helper}>Mode demo: penukaran belum bisa disimpan (tanpa Supabase).</p>}
      </aside>

      <Modal dialogRef={dialog.dialogRef} title={selected ? `Tukar ${selected.name}` : "Tukar reward"} onClose={close} onBackdropClick={dialog.onBackdropClick}>
        {selected && <RedeemForm key={selected.id} reward={selected} page={page} ship={ship} onDone={close} />}
      </Modal>
    </div>
  );
}

function RedeemForm({ reward, page, ship, onDone }: { reward: MemberReward; page: RewardPage; ship: ShipContext; onDone: () => void }) {
  const router = useRouter();
  const [method, setMethod] = useState<RedeemShip["method"]>(page.activities.length ? "pickup" : "jnt");
  const [recipient, setRecipient] = useState<Recipient>(() => (provinceOf(ship.recipient.city) ? ship.recipient : { ...ship.recipient, city: "" }));
  const [province, setProvince] = useState(() => provinceOf(ship.recipient.city));
  const [pin, setPin] = useState(ship.pin);
  const [sessionId, setSessionId] = useState(page.activities[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [pending, start] = useTransition();

  const rate = ship.rates.find((r) => r.city === recipient.city);
  const inJakarta = provinceOf(recipient.city) === "DKI Jakarta";
  const quote = useMemo(() => (pin ? instantQuote(estimateRouteKm(pin.lat, pin.lng, ship.instant), ship.instant) : null), [pin, ship.instant]);
  const fee = method === "jnt" ? (rate ? jntFee(rate.perKg, reward.weightGrams) : null) : method === "instant" ? (inJakarta && quote && !quote.tooFar ? quote.fee : null) : 0;
  const set = (patch: Partial<Recipient>) => setRecipient((r) => ({ ...r, ...patch }));

  const validate = (): string | undefined => {
    if (!reward.physical) return;
    if (!recipient.name.trim() || !recipient.phone.trim()) return method === "pickup" ? "Isi nama & nomor HP pengambil." : "Isi nama & nomor HP penerima.";
    if (method === "pickup") return sessionId ? undefined : "Pilih activity untuk mengambil reward.";
    if (!recipient.address.trim() || !recipient.city || !/^\d{5}$/.test(recipient.postalCode)) return "Lengkapi alamat, kota & kode pos (5 angka).";
    if (method === "jnt" && !rate) return "Pengiriman J&T ke kota ini belum tersedia — pilih Instant atau ambil di activity.";
    if (method === "instant") {
      if (!inJakarta) return "Instant khusus alamat di DKI Jakarta.";
      if (!pin) return "Tempel link Google Maps / atur titik lokasi dulu.";
      if (quote?.tooFar) return `Titik lokasi lebih dari ${ship.instant.maxKm} km — pilih J&T.`;
    }
  };

  const submit = () => {
    const problem = validate();
    if (problem) return setError(problem);
    setError(undefined);
    start(async () => {
      const result = await redeemReward(
        reward.id,
        reward.physical
          ? { method, name: recipient.name, phone: recipient.phone, address: recipient.address, city: recipient.city, postalCode: recipient.postalCode, lat: pin?.lat, lng: pin?.lng, sessionId }
          : null,
      );
      if (!result.ok) return setError(result.error);
      if (result.orderCode) {
        onDone();
        router.push(`/akun/pesanan/${result.orderCode}`);
        return;
      }
      setDone(result.code);
      router.refresh();
    });
  };

  if (done) {
    return (
      <div className={styles.form}>
        <p className={styles.success}>
          <PackageCheck size={20} aria-hidden /> Penukaran #{done} berhasil — {pts(reward.pointsCost)} terpotong.
        </p>
        <p className={checkout.muted}>
          {reward.physical
            ? "Ambil reward-mu di activity yang dipilih; tunjukkan kode penukaran ini ke host."
            : "Admin akan mengirim kode voucher (maks 1×24 jam). Kodenya muncul di bagian Penukaran saya."}
        </p>
        <button type="button" className={checkout.primary} onClick={onDone}>
          Oke
        </button>
      </div>
    );
  }

  const option = (m: RedeemShip["method"], icon: React.ReactNode, title: string, desc: string, price: string) => (
    <button type="button" role="radio" aria-checked={method === m} className={cx(checkout.option, checkout.optionRow, method === m && checkout.optionSelected)} onClick={() => setMethod(m)}>
      <span className={cx(checkout.radio, method === m && checkout.radioOn)} aria-hidden />
      <span className={checkout.tile} aria-hidden>
        {icon}
      </span>
      <span className={checkout.optionText}>
        <span className={checkout.optionTitle}>{title}</span>
        <span className={checkout.optionDesc}>{desc}</span>
      </span>
      <span className={cx(checkout.optionPrice, m === "pickup" && checkout.free)}>{price}</span>
    </button>
  );

  return (
    <div className={styles.form}>
      <div className={styles.summary}>
        <span>{reward.name}</span>
        <strong>{pts(reward.pointsCost)}</strong>
      </div>
      <p className={checkout.muted}>
        Saldo setelah tukar: <strong>{pts(page.balance - reward.pointsCost)}</strong>
      </p>

      {reward.physical ? (
        <>
          <div className={checkout.options} role="radiogroup" aria-label="Cara pengiriman">
            {option("pickup", <CalendarDays size={20} />, "Ambil di activity", page.activities.length ? "Gratis · ambil saat kamu datang ke activity" : "Belum ada activity 14 hari ke depan", "Gratis")}
            {option("jnt", <Truck size={20} />, "J&T Express — Reguler", rate ? `Estimasi ${rate.eta} hari kerja` : "Isi kota tujuan untuk menghitung ongkir", method === "jnt" && fee !== null ? rp(fee) : "Ongkir")}
            {option("instant", <Zap size={20} />, "Instant — Area Jakarta", `Tiba di hari yang sama · maks ${ship.instant.maxKm} km`, method === "instant" && fee !== null ? rp(fee) : "Dari jarak")}
          </div>

          <div className={checkout.fields}>
            <Field label={method === "pickup" ? "Nama pengambil" : "Nama penerima"} value={recipient.name} onChange={(name) => set({ name })} autoComplete="name" />
            <Field label="No. HP" value={recipient.phone} onChange={(phone) => set({ phone })} type="tel" autoComplete="tel" />
          </div>

          {method === "pickup" ? (
            <div className={checkout.sessionList} role="radiogroup" aria-label="Activity">
              {page.activities.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={a.id === sessionId} className={cx(checkout.sessionItem, a.id === sessionId && checkout.sessionItemOn)} onClick={() => setSessionId(a.id)}>
                  <span className={cx(checkout.radio, a.id === sessionId && checkout.radioOn)} aria-hidden />
                  <span className={checkout.optionText}>
                    <span className={checkout.optionTitle} style={{ fontSize: 14 }}>
                      {a.title} · {fmtDayDate(a.startsAt)} · {fmtTime(a.startsAt)}–{fmtTime(a.endsAt)}
                    </span>
                    <span className={checkout.optionDesc}>{a.venue}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className={checkout.fields}>
              <label className={cx(checkout.field, checkout.fieldFull)}>
                <span className={checkout.label}>Alamat lengkap</span>
                <textarea className={checkout.input} value={recipient.address} onChange={(e) => set({ address: e.target.value })} autoComplete="street-address" placeholder="Nama jalan, nomor, RT/RW, kelurahan, kecamatan" />
              </label>
              <label className={checkout.field}>
                <span className={checkout.label}>Provinsi</span>
                <select
                  className={checkout.input}
                  value={province}
                  onChange={(e) => {
                    setProvince(e.target.value);
                    set({ city: "" });
                  }}
                >
                  <option value="">Pilih provinsi</option>
                  {PROVINCE_NAMES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label className={checkout.field}>
                <span className={checkout.label}>Kabupaten / kota</span>
                <select className={checkout.input} value={recipient.city} disabled={!province} onChange={(e) => set({ city: e.target.value })}>
                  <option value="">{province ? "Pilih kabupaten / kota" : "Pilih provinsi dulu"}</option>
                  {citiesOf(province).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <Field label="Kode pos" value={recipient.postalCode} onChange={(postalCode) => set({ postalCode: postalCode.replace(/\D/g, "").slice(0, 5) })} inputMode="numeric" autoComplete="postal-code" />
              {method === "instant" && (
                <div className={checkout.fieldFull}>
                  <MapPicker value={pin} onChange={setPin} origin={{ lat: ship.instant.originLat, lng: ship.instant.originLng, label: `Pengirim · ${ship.instant.originAddress}` }} height={220} />
                  {quote && <p className={checkout.muted}>Jarak ±{String(quote.km).replace(".", ",")} km dari gudang.</p>}
                </div>
              )}
            </div>
          )}

          {method !== "pickup" && (
            <p className={cx(checkout.note, checkout.noteAmber)}>
              <Info size={16} />
              <span>
                Ongkir {fee !== null ? <strong>{rp(fee)}</strong> : "dihitung dari alamat"} + kode unik dibayar transfer setelah ini. Bayar dalam 24 jam — kalau tidak, penukaran batal dan poin kembali.
              </span>
            </p>
          )}
        </>
      ) : (
        <p className={checkout.note}>
          <Ticket size={16} />
          <span>Setelah disetujui admin (maks 1×24 jam), kode voucher muncul di bagian Penukaran saya.</span>
        </p>
      )}

      {error && (
        <p className={checkout.error} role="alert">
          {error}
        </p>
      )}
      <button type="button" className={checkout.primary} onClick={submit} disabled={pending}>
        {pending ? "Memproses…" : reward.physical && method !== "pickup" ? `Tukar ${pts(reward.pointsCost)} & bayar ongkir` : `Tukar ${pts(reward.pointsCost)}`}
      </button>
    </div>
  );
}

function MyRedemptions({ page }: { page: RewardPage }) {
  if (!page.redemptions.length) return null;
  return (
    <section className={checkout.card} id="penukaran-saya">
      <h2 className={checkout.cardTitle}>Penukaran saya</h2>
      <ul className={styles.history}>
        {page.redemptions.map((r) => {
          const s = STATUS[r.status];
          return (
            <li key={r.code} className={styles.historyRow}>
              <div className={styles.historyText}>
                <span className={styles.name}>{r.rewardName}</span>
                <span className={checkout.muted}>
                  #{r.code} · {fmtDate(r.createdAt)} · {pts(r.points)}
                </span>
                {r.activity && r.status !== "rejected" && (
                  <span className={checkout.muted}>
                    Ambil di {r.activity.title} · {fmtDayDate(r.activity.startsAt)} · {r.activity.venue}
                  </span>
                )}
                {r.orderCode && r.status !== "rejected" && (
                  <Link href={`/akun/pesanan/${r.orderCode}`} className={styles.link}>
                    {r.status === "pending" ? "Bayar ongkir" : "Lacak pengiriman"} · #{r.orderCode}
                  </Link>
                )}
                {r.voucherCode && (
                  <span className={styles.voucher}>
                    <code>{r.voucherCode}</code>
                    <CopyButton value={r.voucherCode} label="Salin kode" />
                    {r.voucherValidUntil && <span className={checkout.muted}>Berlaku s/d {fmtDate(r.voucherValidUntil)}</span>}
                  </span>
                )}
                {r.status === "rejected" && r.note && <span className={checkout.muted}>Alasan: {r.note}</span>}
              </div>
              <span className={cx(styles.status, s.tone)}>{s.label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Field({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className={checkout.field}>
      <span className={checkout.label}>{label}</span>
      <input className={checkout.input} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </label>
  );
}
