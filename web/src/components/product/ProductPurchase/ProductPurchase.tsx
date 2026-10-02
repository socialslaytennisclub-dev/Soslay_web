"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Icon, Modal, OptionChips } from "@/components/ui";
import { authLinks } from "@/content/site";
import { productPage, sizeGuide, type ProductOptionGroup } from "@/content/products";
import { useCart } from "@/hooks/useCart";
import { useDialog } from "@/hooks/useDialog";
import styles from "./ProductPurchase.module.css";

type ProductPurchaseProps = {
  product: { slug: string; name: string; price: number; image: string };
  options: ProductOptionGroup[];
  soldOut: boolean;
  showSizeGuide?: boolean;
};

/**
 * Figma 25:1642 — pilih varian, "Tambahkan ke Tas Belanja" & "Beli Langsung Sekarang".
 * Validasi: semua grup varian wajib dipilih. Keranjang disimpan via useCart (localStorage).
 */
export function ProductPurchase({ product, options, soldOut, showSizeGuide }: ProductPurchaseProps) {
  const router = useRouter();
  const cart = useCart();
  const sizeDialog = useDialog();
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>();

  const select = (key: string, value: string) => {
    setSelection((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setStatus(undefined);
  };

  /** true jika semua varian sudah dipilih; kalau belum, tampilkan pesan per grup. */
  const validate = () => {
    const missing = Object.fromEntries(
      options.filter((group) => !selection[group.key]).map((group) => [group.key, productPage.chooseFirst(group.label)]),
    );
    setErrors(missing);
    return Object.keys(missing).length === 0;
  };

  const addToBag = () => {
    if (!validate()) return false;
    cart.add({ productSlug: product.slug, name: product.name, price: product.price, image: product.image, options: selection });
    setStatus(productPage.added);
    return true;
  };

  const buyNow = () => {
    if (addToBag()) router.push(authLinks.cart.href);
  };

  return (
    <div className={styles.purchase}>
      <div className={styles.options}>
        {options.map((group) => (
          <OptionChips
            key={group.key}
            label={group.label}
            options={group.values}
            value={selection[group.key]}
            onChange={(value) => select(group.key, value)}
            error={errors[group.key] || undefined}
            aside={
              group.key === "size" && showSizeGuide ? (
                <button type="button" className={styles.sizeGuide} onClick={sizeDialog.open}>
                  <Icon name="ruler" />
                  {sizeGuide.title}
                </button>
              ) : undefined
            }
          />
        ))}
      </div>

      <div className={styles.actions}>
        {soldOut ? (
          <Button variant="secondary" disabled className={styles.full}>
            {productPage.soldOut}
          </Button>
        ) : (
          <>
            {/* Tombol selebar kolom → efek magnetic dibuat sangat halus */}
            <Button variant="secondary" onClick={addToBag} className={styles.full}>
              {productPage.addToBag}
            </Button>
            <Button variant="primary" onClick={buyNow} className={styles.full} data-magnetic="0.06">
              {productPage.buyNow}
            </Button>
          </>
        )}
        <p className={styles.status} role="status" aria-live="polite">
          {status}
        </p>
      </div>

      {showSizeGuide && (
        <Modal dialogRef={sizeDialog.dialogRef} title={sizeGuide.title} onClose={sizeDialog.close} onBackdropClick={sizeDialog.onBackdropClick}>
          <table className={styles.table}>
            <thead>
              <tr>
                {sizeGuide.columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sizeGuide.rows.map(([size, ...values]) => (
                <tr key={size}>
                  <th scope="row">{size}</th>
                  {values.map((value, i) => (
                    <td key={i}>{value} cm</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.tableNote}>{sizeGuide.note}</p>
        </Modal>
      )}
    </div>
  );
}
