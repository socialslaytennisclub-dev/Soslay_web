"use client";

import { CalendarDays, Crosshair, Info, Landmark, LocateFixed, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { cityOptions } from "@/content/member";
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

/** "-6.2, 106.8" atau link Google Maps (…@-6.2,106.8… / ?q=-6.2,106.8) → koordinat. */
function parseCoords(raw: string): { lat: number; lng: number } | null {
  const m = raw.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{2,3}\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

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
  const [recipient, setRecipient] = useState<Recipient>(ctx.recipient);
  const complete = Boolean(recipient.name && recipient.phone && recipient.address && recipient.city && recipient.postalCode);
  const [editing, setEditing] = useState(!complete);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string>();
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

  const useMyLocation = () => {
    setPinError(undefined);
    if (!navigator.geolocation) return setPinError("Browser tidak mendukung lokasi — tempel koordinat dari Google Maps.");
    navigator.geolocation.getCurrentPosition(
      (pos) => setPin({ lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 }),
      () => setPinError("Lokasi tidak bisa dibaca — izinkan akses lokasi, atau tempel koordinat dari Google Maps."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const applyPin = () => {
    const c = parseCoords(pinInput);
    if (!c) return setPinError("Format koordinat tidak dikenali. Contoh: -6.2607, 106.8136 atau link Google Maps.");
    setPin(c);
    setPinOpen(false);
    setPinError(undefined);
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
              <span className={styles.label}>Kota / kabupaten</span>
              <select className={styles.input} value={recipient.city} onChange={(e) => setRecipient({ ...recipient, city: e.target.value })}>
                <option value="">Pilih kota</option>
                {[...new Set([...ctx.rates.map((r) => r.city), ...cityOptions])].map((c) => (
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

  const pinControls = (
    <>
      <div className={styles.pinRow}>
        <button type="button" className={styles.pillButton} onClick={useMyLocation}>
          <LocateFixed size={14} /> Pakai lokasi saya
        </button>
        <button type="button" className={styles.pillButton} onClick={() => setPinOpen((v) => !v)}>
          <MapPin size={14} /> {pin ? "Ubah titik lokasi" : "Tempel dari Google Maps"}
        </button>
        <span className={styles.muted}>Pastikan pin tepat di depan rumah/gedung.</span>
      </div>
      {pinOpen && (
        <div className={styles.coordForm}>
          <input className={styles.input} value={pinInput} onChange={(e) => setPinInput(e.target.value)} placeholder="-6.2607, 106.8136 atau link Google Maps" aria-label="Koordinat titik lokasi" />
          <button type="button" className={styles.pillButton} onClick={applyPin}>
            Pakai
          </button>
        </div>
      )}
      {pinError && <p className={styles.fieldError}>{pinError}</p>}
    </>
  );

  const instantDetail = (
    <>
      <div className={styles.map}>
        {pin ? (
          <iframe title="Titik lokasi pengiriman" loading="lazy" src={`https://maps.google.com/maps?q=${pin.lat},${pin.lng}&z=14&output=embed`} />
        ) : (
          <div className={styles.mapEmpty}>
            <span className={styles.muted}>
              <Crosshair size={18} style={{ verticalAlign: "-4px" }} /> Atur titik lokasimu untuk menghitung ongkir dari {ctx.instant.originAddress}.
            </span>
          </div>
        )}
        {quote && (
          <span className={styles.mapBadge}>
            {String(quote.km).replace(".", ",")} km · ±{etaMinutes(quote.km)} menit
          </span>
        )}
      </div>
      {pinControls}
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
          Jarak dihitung perkiraan (garis lurus × 1,3) sampai Google Maps terpasang. Dikirim admin via GoSend/GrabExpress setelah pembayaran terverifikasi. Verifikasi sebelum {ctx.instant.cutoff.replace(":", ".")} → tiba hari ini; setelahnya → besok pagi.
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
                <span className={styles.optionTitle}>Transfer bank — BCA</span>
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
