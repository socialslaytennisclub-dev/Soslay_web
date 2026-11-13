"use client";

import { CalendarDays, Info, Landmark, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { MapPicker } from "@/components/ui/MapPicker/MapPicker";
import { citiesOf, PROVINCE_NAMES, provinceOf } from "@/content/wilayah";
import {
  billableKg,
  estimateRouteKm,
  etaMinutes,
  fmtDayDate,
  fmtTime,
  instantQuote,
  jntFee,
  pointsFor,
  rp,
  SHIPPING_LABEL,
  variantLabel,
  type ShippingMethod,
} from "@/lib/checkout";
import { cartItemKey, clearCheckoutSelection, readCart, readCheckoutSelection, removeFromCart, type CheckoutSelection } from "@/lib/cart";
import { cx } from "@/lib/cx";
import { placeOrder } from "@/server/shop/actions";
import type { CheckoutContext, Recipient } from "@/server/shop/types";
import { Card, Chip, KV, METHOD_ICON, ProductLine, shippingLine } from "./CheckoutParts";
import styles from "./Checkout.module.css";
import { StickyBar } from "./StickyBar";

const noopSubscribe = () => () => {};
const readSelection = () => JSON.stringify(readCheckoutSelection() ?? { source: "cart", items: readCart() });

const kgText = (grams: number) => `${(grams / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg`;

/**
 * Checkout (Figma 04a J&T · 04b Instant · 04c Free Pickup Mabar; mobile MOB-05).
 * Ongkir di sini hanya pratinjau — angka resmi dihitung ulang server saat "Buat pesanan & bayar".
 */
export function CheckoutForm({ ctx }: { ctx: CheckoutContext }) {
  const router = useRouter();
  const snapshot = useSyncExternalStore(noopSubscribe, readSelection, () => "null");
  const selection = JSON.parse(snapshot) as CheckoutSelection | null;
  const items = selection?.items ?? [];

  const [method, setMethod] = useState<ShippingMethod>("jnt");
  // Nama kota lama (sebelum daftar resmi Kemendagri) tidak dikenali → member diminta memilih ulang.
  const [recipient, setRecipient] = useState<Recipient>(() => (provinceOf(ctx.recipient.city) ? ctx.recipient : { ...ctx.recipient, city: "" }));
  const [province, setProvince] = useState(() => provinceOf(ctx.recipient.city));
  const complete = Boolean(recipient.name && recipient.phone && recipient.address && recipient.city && recipient.postalCode);
  const [editing, setEditing] = useState(!complete);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(ctx.pin);
  const [sessionId, setSessionId] = useState(ctx.pickupSessions[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const weight = items.reduce((s, i) => s + (ctx.weights[i.productSlug] ?? 300) * i.quantity, 0);
  const rate = ctx.rates.find((r) => r.city === recipient.city);
  const inJakarta = rate?.province === "DKI Jakarta";
  const quote = useMemo(() => (pin ? instantQuote(estimateRouteKm(pin.lat, pin.lng, ctx.instant), ctx.instant) : null), [pin, ctx.instant]);
  const session = ctx.pickupSessions.find((s) => s.id === sessionId);

  const fees: Record<ShippingMethod, number | null> = {
    jnt: rate ? jntFee(rate.perKg, weight) : null,
    instant: inJakarta && quote && !quote.tooFar ? quote.fee : null,
    pickup: 0,
  };
  const fee = fees[method];
  const disabled: Record<ShippingMethod, string | undefined> = {
    jnt: recipient.city && !rate ? "Pengiriman ke kota ini belum tersedia, hubungi admin." : undefined,
    instant: recipient.city && !inJakarta ? "Khusus alamat di DKI Jakarta." : quote?.tooFar ? `Titik lokasi lebih dari ${ctx.instant.maxKm} km.` : undefined,
    pickup: ctx.pickupSessions.length === 0 ? "Belum ada sesi Mabar 14 hari ke depan." : undefined,
  };

  const validate = (): string | undefined => {
    if (!items.length) return "Belum ada produk dipilih.";
    if (!recipient.name.trim() || !recipient.phone.trim()) return method === "pickup" ? "Isi nama & nomor HP pengambil." : "Isi nama & nomor HP penerima.";
    if (method !== "pickup" && (!recipient.address.trim() || !recipient.city || !recipient.postalCode.trim())) return "Lengkapi alamat, kota & kode pos.";
    if (method === "instant" && !pin) return "Atur titik lokasi di peta dulu.";
    if (method === "pickup" && !session) return "Pilih sesi Mabar untuk mengambil pesanan.";
    if (disabled[method] || fee === null) return disabled[method] ?? "Opsi pengiriman ini belum bisa dipakai.";
  };

  const submit = () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      if (method !== "pickup" && !complete) setEditing(true);
      return;
    }
    setError(undefined);
    start(async () => {
      const result = await placeOrder(
        items.map((i) => ({ slug: i.productSlug, options: i.options, quantity: i.quantity })),
        { method, name: recipient.name, phone: recipient.phone, address: recipient.address, city: recipient.city, postalCode: recipient.postalCode, lat: pin?.lat, lng: pin?.lng, sessionId },
      );
      if (!result.ok) return setError(result.error);
      if (selection?.source === "cart") removeFromCart(items.map(cartItemKey));
      clearCheckoutSelection();
      router.push(`/akun/pesanan/${result.data.code}`);
    });
  };

  if (snapshot !== "null" && items.length === 0) {
    return (
      <div className={styles.body}>
        <Card title="Belum ada produk dipilih">
          <p className={styles.muted}>Pilih produk di keranjang atau klik Buy Now di halaman produk.</p>
          <div className={styles.actionsRow}>
            <Link href="/akun/order" className={styles.outline}>
              Ke keranjang
            </Link>
            <Link href="/shop" className={styles.primary} style={{ width: "auto" }}>
              Lihat Shop
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const option = (m: ShippingMethod, desc: string, price: ReactNode, detail?: ReactNode) => {
    const Icon = METHOD_ICON[m];
    const on = method === m;
    return (
      <div className={cx(styles.option, on && styles.optionSelected, disabled[m] && !on && styles.optionDisabled)}>
        <button type="button" className={styles.optionRow} role="radio" aria-checked={on} onClick={() => setMethod(m)}>
          <span className={cx(styles.radio, on && styles.radioOn)} aria-hidden />
          <span className={styles.tile} aria-hidden>
            <Icon size={20} />
          </span>
          <span className={styles.optionText}>
            <span className={styles.optionTitle}>{SHIPPING_LABEL[m].title}</span>
            <span className={styles.optionDesc}>{disabled[m] ?? desc}</span>
          </span>
          <span className={cx(styles.optionPrice, m === "pickup" && styles.free)}>{price}</span>
        </button>
        {on && detail && <div className={styles.optionDetail}>{detail}</div>}
      </div>
    );
  };

  const addressCard =
    method === "pickup" ? (
      <Card title="Data pengambil" aside={!editing && <button type="button" className={styles.pillButton} onClick={() => setEditing(true)}>Ubah</button>}>
        {editing ? (
          <div className={styles.fields}>
            <Field label="Nama pengambil" value={recipient.name} onChange={(name) => setRecipient({ ...recipient, name })} autoComplete="name" />
            <Field label="No. HP" value={recipient.phone} onChange={(phone) => setRecipient({ ...recipient, phone })} type="tel" autoComplete="tel" />
          </div>
        ) : (
          <div className={styles.person}>
            <UserRound size={20} />
            <span className={styles.personText}>
              <span className={styles.personName}>{recipient.name}</span>
              <span className={styles.muted}>{recipient.phone} · notifikasi siap diambil dikirim ke akun kamu</span>
            </span>
          </div>
        )}
      </Card>
    ) : (
      <Card title="Alamat pengiriman" aside={!editing && <button type="button" className={styles.pillButton} onClick={() => setEditing(true)}>Ganti alamat</button>}>
        {editing ? (
          <div className={styles.fields}>
            <Field label="Nama penerima" value={recipient.name} onChange={(name) => setRecipient({ ...recipient, name })} autoComplete="name" />
            <Field label="No. HP" value={recipient.phone} onChange={(phone) => setRecipient({ ...recipient, phone })} type="tel" autoComplete="tel" />
            <label className={cx(styles.field, styles.fieldFull)}>
              <span className={styles.label}>Alamat lengkap</span>
              <textarea className={styles.input} value={recipient.address} onChange={(e) => setRecipient({ ...recipient, address: e.target.value })} autoComplete="street-address" placeholder="Nama jalan, nomor, RT/RW, kelurahan, kecamatan" />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Provinsi</span>
              <select
                className={styles.input}
                value={province}
                onChange={(e) => {
                  setProvince(e.target.value);
                  setRecipient({ ...recipient, city: "" });
                }}
              >
                <option value="">Pilih provinsi</option>
                {PROVINCE_NAMES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Kabupaten / kota</span>
              <select className={styles.input} value={recipient.city} disabled={!province} onChange={(e) => setRecipient({ ...recipient, city: e.target.value })}>
                <option value="">{province ? "Pilih kabupaten / kota" : "Pilih provinsi dulu"}</option>
                {citiesOf(province).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <Field label="Kode pos" value={recipient.postalCode} onChange={(postalCode) => setRecipient({ ...recipient, postalCode: postalCode.replace(/\D/g, "").slice(0, 5) })} inputMode="numeric" autoComplete="postal-code" />
            {complete && (
              <button type="button" className={styles.pillButton} onClick={() => setEditing(false)}>
                Simpan alamat
              </button>
            )}
          </div>
        ) : (
          <div className={styles.person}>
            <MapPin size={20} />
            <span className={styles.personText}>
              <span className={styles.personName}>{recipient.name}</span>
              <span className={styles.muted}>{recipient.phone}</span>
              <span className={styles.address}>{[recipient.address, recipient.city, recipient.postalCode].filter(Boolean).join(", ")}</span>
              {method === "instant" && pin && <Chip tone="green">Titik lokasi sudah diatur di peta</Chip>}
            </span>
          </div>
        )}
      </Card>
    );

  const instantDetail = (
    <>
      <MapPicker
        value={pin}
        onChange={setPin}
        origin={{ lat: ctx.instant.originLat, lng: ctx.instant.originLng, label: `Pengirim · ${ctx.instant.originAddress}` }}
        hint="Klik peta atau geser pin ke depan rumah/gedungmu"
        height={240}
      />
      {quote && (
        <p className={styles.muted}>
          Jarak ±{String(quote.km).replace(".", ",")} km dari {ctx.instant.originAddress} · ±{etaMinutes(quote.km)} menit
        </p>
      )}
      {quote && (
        <div className={styles.breakdown}>
          <KV
            rows={[
              ["Jarak rute (pengirim → titik alamatmu)", `${String(quote.km).replace(".", ",")} km`],
              [`Tarif dasar (${ctx.instant.baseKm} km pertama)`, rp(ctx.instant.baseFee)],
              [`Tambahan ${quote.extraKm} km × ${rp(ctx.instant.perKmFee)} (dibulatkan ke atas per km)`, rp(quote.extraFee)],
            ]}
          />
          <hr className={styles.divider} style={{ margin: "12px 0" }} />
          <div className={cx(styles.kvRow, styles.kvTotal)}>
            <span>Ongkir Instant</span>
            <span>{quote.tooFar ? "Di luar jangkauan" : rp(quote.fee)}</span>
          </div>
        </div>
      )}
      <p className={cx(styles.note, styles.noteAmber)}>
        <Info size={16} />
        <span>
          Jarak dihitung perkiraan (garis lurus × 1,3). Dikirim admin via GoSend/GrabExpress setelah pembayaran terverifikasi. Verifikasi sebelum {ctx.instant.cutoff.replace(":", ".")} → tiba hari ini; setelahnya → besok pagi.
        </span>
      </p>
    </>
  );

  const pickupDetail = (
    <>
      <p className={styles.strong} style={{ fontSize: 14 }}>
        Pilih sesi untuk ambil pesanan
      </p>
      <div className={styles.sessionList} role="radiogroup" aria-label="Sesi Mabar">
        {ctx.pickupSessions.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={s.id === sessionId} className={cx(styles.sessionItem, s.id === sessionId && styles.sessionItemOn)} onClick={() => setSessionId(s.id)}>
            <span className={cx(styles.radio, s.id === sessionId && styles.radioOn)} aria-hidden />
            <span className={styles.optionText}>
              <span className={styles.optionTitle} style={{ fontSize: 14 }}>
                {s.title} · {fmtDayDate(s.startsAt)} · {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}
              </span>
              <span className={styles.optionDesc}>{s.venue}</span>
            </span>
            {s.registered && <Chip tone="lime">Kamu terdaftar</Chip>}
          </button>
        ))}
      </div>
      {session && (
        <p className={cx(styles.note, styles.noteAmber)}>
          <CalendarDays size={16} />
          <span>
            Pembayaran harus terverifikasi paling lambat H-1 sesi ({fmtDayDate(session.deadline)} · {fmtTime(session.deadline)}). Tunjukkan kode pesanan ke host saat mengambil; boleh diwakilkan.
          </span>
        </p>
      )}
    </>
  );

  const jntDetail = rate ? (
    <>
      <KV
        rows={[
          ["Kota tujuan", `${rate.city}, ${rate.province}`],
          ["Tarif J&T ke kota ini", `${rp(rate.perKg)} / kg`],
          ["Berat pesanan", `${kgText(weight)} → dibulatkan ${billableKg(weight)} kg`],
        ]}
      />
      <p className={styles.note}>
        <Info size={16} />
        <span>Ongkir = tarif per kg × berat dibulatkan ke atas. Kota yang belum ada di master ongkir tidak bisa memilih J&T.</span>
      </p>
    </>
  ) : (
    <p className={styles.muted}>Isi kota tujuan di alamat pengiriman untuk menghitung ongkir.</p>
  );

  const totalPreview = subtotal + (fee ?? 0);
  const points = pointsFor(subtotal);
  const cta = (
    <button type="button" className={styles.primary} onClick={submit} disabled={pending || !items.length}>
      {pending ? "Membuat pesanan…" : <><span className={styles.desktopOnly}>Buat pesanan &amp; bayar</span><span className={styles.mobileOnly}>Buat pesanan</span></>}
    </button>
  );

  return (
    <div className={styles.body}>
      <div className={styles.main}>
        <Card title="Opsi pengiriman" aside={<span className={styles.cardAside}>Pilih salah satu</span>}>
          <div className={styles.options} role="radiogroup" aria-label="Opsi pengiriman">
            {option("jnt", `Estimasi ${rate?.eta ?? "2–3"} hari kerja · seluruh Indonesia`, fees.jnt !== null ? rp(fees.jnt) : "—", jntDetail)}
            {option("instant", `Tiba di hari yang sama · khusus alamat di DKI Jakarta (maks ${ctx.instant.maxKm} km)`, fees.instant !== null ? rp(fees.instant) : "Dihitung dari jarak", instantDetail)}
            {option("pickup", "Ambil langsung saat kamu ikut sesi Mabar · tanpa ongkir", "Gratis", pickupDetail)}
          </div>
        </Card>

        {addressCard}

        <Card title={`Produk dipesan (${items.length})`}>
          <div className={styles.items}>
            {items.map((i) => (
              <ProductLine key={cartItemKey(i)} name={i.name} variant={variantLabel(i.productSlug, i.options)} image={i.image} price={i.price} quantity={i.quantity} weight={`Berat ${kgText((ctx.weights[i.productSlug] ?? 300) * i.quantity)}`} />
            ))}
          </div>
        </Card>

        <Card title="Metode pembayaran">
          <div className={cx(styles.option, styles.optionSelected)}>
            <div className={styles.optionRow} role="radio" aria-checked="true">
              <span className={cx(styles.radio, styles.radioOn)} aria-hidden />
              <span className={styles.tile} aria-hidden>
                <Landmark size={20} />
              </span>
              <span className={styles.optionText}>
                <span className={styles.optionTitle}>Transfer bank — {ctx.bankShort}</span>
                <span className={styles.optionDesc}>Nomor rekening tampil setelah pesanan dibuat. Upload bukti transfer, lalu admin memverifikasi maks 1×24 jam.</span>
              </span>
            </div>
          </div>
        </Card>
      </div>

      <aside className={styles.aside}>
        <Card title="Ringkasan">
          <KV
            rows={[
              [`Subtotal (${items.reduce((s, i) => s + i.quantity, 0)} produk)`, rp(subtotal)],
              [shippingLine(method, method === "instant" ? quote?.km : null), fee === null ? "—" : fee === 0 ? <span className={styles.free}>Gratis</span> : rp(fee)],
              ["Kode unik verifikasi", "+ Rp1–999"],
            ]}
          />
          <hr className={styles.divider} />
          <div className={styles.summaryTotal}>
            <span>Total bayar</span>
            <strong>{rp(totalPreview)}</strong>
          </div>
          <p className={styles.muted}>+ kode unik 3 digit yang ditentukan saat pesanan dibuat, supaya admin mudah mencocokkan transfermu.</p>
        </Card>
        {points > 0 && (
          <p className={styles.points}>
            <strong>+{points} pts</strong> Slay Point masuk setelah pembayaran diverifikasi
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <StickyBar
          total={
            <>
              Total bayar + kode unik
              <strong>{rp(totalPreview)}</strong>
            </>
          }
        >
          {cta}
        </StickyBar>
        <p className={styles.helper}>Selesaikan transfer dalam 24 jam setelah pesanan dibuat. Lewat batas, pesanan otomatis dibatalkan dan stok dilepas.</p>
        {ctx.demo && <p className={styles.helper}>Mode demo: pesanan disimpan sementara di server lokal (tanpa Supabase).</p>}
      </aside>
    </div>
  );
}

function Field({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input className={styles.input} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </label>
  );
}
