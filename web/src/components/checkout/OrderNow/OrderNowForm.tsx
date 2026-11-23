"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { OptionChips } from "@/components/ui";
import { productPage, type Product, type ProductOptionGroup } from "@/content/products";
import { MIN_PASSWORD } from "@/lib/auth";
import { cartCount, cartItemKey, type CartItem } from "@/lib/cart";
import { rp, variantLabel } from "@/lib/checkout";
import { cx } from "@/lib/cx";
import { ORDER_NOW_AFTER_CONFIRM, orderNowAccountErrors, writeOrderNowVerify, type OrderNowAccount, type OrderNowAccountErrors as AccountErrors } from "@/lib/order-now";
import { resendSignupConfirmation } from "@/server/auth/actions";
import { orderNow } from "@/server/shop/order-now";
import type { CheckoutContext } from "@/server/shop/types";
import { CheckoutForm } from "../CheckoutForm";
import { Card } from "../CheckoutParts";
import cx2 from "../Checkout.module.css";
import styles from "./OrderNow.module.css";

type PickerProduct = Pick<Product, "slug" | "name" | "price" | "image" | "stock"> & { options: ProductOptionGroup[] };
/**
 * Order Now (/ordernow): pilih produk + (belum login) data akun + pengiriman dalam satu halaman.
 * Pengiriman, ringkasan & tombol memakai CheckoutForm; pesanan dibuat lewat orderNow (daftar + order).
 */
export function OrderNowForm({ ctx, products, initial, loginHref }: { ctx: CheckoutContext; products: PickerProduct[]; initial?: string; loginHref: string }) {
  const [items, setItems] = useState<CartItem[]>([]);
  // Produk dari link yang hilang / nonaktif / habis → pemberitahuan + daftar semua produk.
  const preselected = initial ? products.find((p) => p.slug === initial && p.stock > 0) : undefined;
  const [open, setOpen] = useState<string | undefined>(preselected?.slug);
  // Daftar semua produk hanya saat dibuka ("Tambah produk lain"): link ke satu produk menampilkan produk itu
  // saja, dan setelah ada pilihan daftarnya dilipat — data akun & pengiriman tidak terdorong jauh di HP.
  const [browsing, setBrowsing] = useState(!preselected);
  const [account, setAccount] = useState<OrderNowAccount>({ fullName: "", email: "", phone: "", password: "" });
  const [errors, setErrors] = useState<AccountErrors>({});
  // Akun ada tapi belum diverifikasi → tombol kirim ulang link (setelah verifikasi kembali ke Order Now).
  const [needsVerify, setNeedsVerify] = useState(false);
  const [resendNote, setResendNote] = useState<string>();
  const [resending, startResend] = useTransition();
  const guest = !ctx.loggedIn;
  const units = cartCount(items);
  // Produk dari link (?produk=) paling atas; yang habis paling bawah. Daftar yang tampil: semua saat dibuka,
  // produk dari link saja sebelum ada pilihan, selebihnya dilipat.
  const sorted = useMemo(() => [...products].sort((a, b) => Number(b.slug === initial) - Number(a.slug === initial) || Number(b.stock > 0) - Number(a.stock > 0)), [products, initial]);
  const shown = browsing ? sorted : !items.length && preselected ? [preselected] : [];

  const add = (p: PickerProduct, options: Record<string, string>, quantity: number) => {
    const key = cartItemKey({ productSlug: p.slug, options });
    setItems((list) =>
      list.some((i) => cartItemKey(i) === key)
        ? list.map((i) => (cartItemKey(i) === key ? { ...i, quantity: Math.min(99, i.quantity + quantity) } : i))
        : [...list, { productSlug: p.slug, name: p.name, price: p.price, image: p.image, options, quantity }],
    );
    setOpen(undefined);
    setBrowsing(false);
  };
  const setQty = (key: string, quantity: number) => setItems((list) => (quantity < 1 ? list.filter((i) => cartItemKey(i) !== key) : list.map((i) => (cartItemKey(i) === key ? { ...i, quantity: Math.min(99, quantity) } : i))));
  const field = (key: keyof OrderNowAccount, value: string) => {
    setAccount((a) => ({ ...a, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const header = (
    <>
      {initial && !preselected && (
        <p className={cx2.error} role="status">
          Produk dari link ini sedang tidak tersedia atau stoknya habis — pilih produk lain di bawah.
        </p>
      )}
      <Card title="Pilih produk" aside={units > 0 && <span className={cx2.cardAside}>{units} dipilih</span>}>
        {items.length > 0 && (
          <ul className={styles.chosen}>
            {items.map((i) => {
              const key = cartItemKey(i);
              const variant = variantLabel(i.productSlug, i.options);
              return (
                <li key={key} className={styles.line}>
                  <Image src={i.image} alt="" width={56} height={56} className={styles.thumb} />
                  <span className={styles.lineText}>
                    <span className={styles.lineName}>{i.name}</span>
                    {variant && <span className={styles.lineMeta}>{variant}</span>}
                    <span className={styles.linePrice}>{rp(i.price * i.quantity)}</span>
                  </span>
                  <Stepper value={i.quantity} onChange={(q) => setQty(key, q)} label={i.name} removable />
                </li>
              );
            })}
          </ul>
        )}
        {shown.length > 0 && (
        <ul className={styles.catalog} aria-label="Produk">
          {shown.map((p) => (
            <li key={p.slug} className={cx(styles.product, open === p.slug && styles.productOpen)}>
              <button type="button" className={styles.productRow} onClick={() => setOpen(open === p.slug ? undefined : p.slug)} disabled={p.stock <= 0} aria-expanded={open === p.slug}>
                <Image src={p.image} alt="" width={56} height={56} className={styles.thumb} />
                <span className={styles.lineText}>
                  <span className={styles.lineName}>{p.name}</span>
                  <span className={styles.linePrice}>{p.stock > 0 ? rp(p.price) : "Stok habis"}</span>
                </span>
                {p.stock > 0 && <span className={styles.pick}>{open === p.slug ? "Tutup" : "Pilih"}</span>}
              </button>
              {open === p.slug && <VariantPicker product={p} onAdd={(options, qty) => add(p, options, qty)} />}
            </li>
          ))}
        </ul>
        )}
        {!browsing && (
          <button type="button" className={styles.more} onClick={() => setBrowsing(true)}>
            <Plus size={16} /> Tambah produk lain
          </button>
        )}
      </Card>

      {guest && (
        <Card title="Data akun" aside={<Link href={loginHref} className={cx2.pillButton}>Masuk</Link>}>
          <p className={cx2.muted}>Akun Slay Club dibuat otomatis — riwayat pesanan & Slay Point tersimpan di akun ini. Link verifikasi dikirim ke email kamu. Sudah punya akun? Masuk dulu, atau isi email & password akunmu di sini.</p>
          <div className={cx(cx2.fields, styles.accountFields)}>
            <AccountField label="Nama lengkap" value={account.fullName} error={errors.fullName} onChange={(v) => field("fullName", v)} autoComplete="name" />
            <AccountField label="Email" value={account.email} error={errors.email} onChange={(v) => field("email", v)} type="email" autoComplete="email" inputMode="email" />
            <AccountField label="No. WhatsApp" value={account.phone} error={errors.phone} onChange={(v) => field("phone", v)} type="tel" autoComplete="tel" placeholder="0812 3456 7890" />
            <AccountField label="Buat password" value={account.password} error={errors.password} onChange={(v) => field("password", v)} type="password" autoComplete="new-password" placeholder={`Minimal ${MIN_PASSWORD} karakter`} />
          </div>
          {needsVerify && (
            <p className={cx(cx2.note, cx2.noteAmber)}>
              <span>
                Akun {account.email.trim()} menunggu verifikasi email.{" "}
                <button
                  type="button"
                  className={cx2.linkButton}
                  disabled={resending}
                  onClick={() =>
                    startResend(async () => {
                      // Setelah verifikasi → daftar pesanan (pesanan yang menunggu bayar ada di sana), bukan Order Now kosong.
                      const r = await resendSignupConfirmation(account.email.trim(), ORDER_NOW_AFTER_CONFIRM);
                      setResendNote(r?.error ? "Belum bisa kirim ulang — tunggu beberapa menit." : "Link verifikasi dikirim ulang. Setelah verifikasi kamu masuk ke halaman Order di akunmu.");
                    })
                  }
                >
                  {resending ? "Mengirim…" : "Kirim ulang link verifikasi"}
                </button>
                {resendNote && <> · {resendNote}</>}
              </span>
            </p>
          )}
        </Card>
      )}
    </>
  );

  return (
    <CheckoutForm
      ctx={ctx}
      items={items}
      header={header}
      fallbackRecipient={guest ? { name: account.fullName, phone: account.phone } : undefined}
      extraCheck={() => {
        if (!guest) return;
        const e = orderNowAccountErrors(account);
        setErrors(e);
        return Object.keys(e).length ? "Lengkapi data akun kamu." : undefined;
      }}
      place={async (lines, ship) => {
        const result = await orderNow(guest ? account : null, lines, ship);
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {});
          setNeedsVerify(Boolean(result.needsVerify));
          setResendNote(undefined);
          return { ok: false, error: result.error };
        }
        if (result.verify) writeOrderNowVerify({ ...result.verify, total: items.reduce((sum, i) => sum + i.price * i.quantity, 0), items: units });
        return { ok: true, href: result.href };
      }}
    />
  );
}

/** Pilih varian + jumlah untuk satu produk (grup dengan satu pilihan langsung terpilih, seperti halaman produk). */
function VariantPicker({ product, onAdd }: { product: PickerProduct; onAdd: (options: Record<string, string>, quantity: number) => void }) {
  const [selection, setSelection] = useState<Record<string, string>>(() => Object.fromEntries(product.options.filter((g) => g.values.length === 1).map((g) => [g.key, g.values[0].value])));
  const [missing, setMissing] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const submit = () => {
    const m = Object.fromEntries(product.options.filter((g) => !selection[g.key]).map((g) => [g.key, productPage.chooseFirst(g.label)]));
    setMissing(m);
    if (!Object.keys(m).length) onAdd(selection, qty);
  };
  return (
    <div className={styles.picker}>
      {product.options.map((g) => (
        <OptionChips
          key={g.key}
          label={g.label}
          options={g.values}
          value={selection[g.key]}
          onChange={(v) => {
            setSelection((s) => ({ ...s, [g.key]: v }));
            setMissing((m) => ({ ...m, [g.key]: "" }));
          }}
          error={missing[g.key] || undefined}
        />
      ))}
      <div className={styles.pickerFoot}>
        <Stepper value={qty} onChange={setQty} label="jumlah" />
        <button type="button" className={cx(cx2.primary, styles.add)} onClick={submit}>
          <Plus size={16} /> Tambah
        </button>
      </div>
    </div>
  );
}

/** Stepper jumlah ringkas (1–99). `removable`: di 1, tombol kurang jadi hapus (baris pesanan). */
function Stepper({ value, onChange, label, removable = false }: { value: number; onChange: (value: number) => void; label: string; removable?: boolean }) {
  const remove = removable && value <= 1;
  return (
    <span className={styles.stepper}>
      <button type="button" onClick={() => onChange(value - 1)} aria-label={remove ? `Hapus ${label}` : `Kurangi ${label}`} disabled={!removable && value <= 1}>
        {remove ? <Trash2 size={14} /> : <Minus size={14} />}
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} aria-label={`Tambah ${label}`} disabled={value >= 99}>
        <Plus size={14} />
      </button>
    </span>
  );
}

function AccountField({ label, value, error, onChange, ...rest }: { label: string; value: string; error?: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className={cx2.field}>
      <span className={cx2.label}>{label}</span>
      <input className={cx2.input} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} {...rest} />
      {error && <span className={cx2.fieldError}>{error}</span>}
    </label>
  );
}
