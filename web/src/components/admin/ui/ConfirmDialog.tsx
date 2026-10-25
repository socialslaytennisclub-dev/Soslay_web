"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminIcon } from "./AdminIcon";
import { AdminButton } from "./AdminUI";
import styles from "./ConfirmDialog.module.css";

/**
 * Popup konfirmasi untuk aksi yang merusak (hapus). `const [confirm, dialog] = useConfirm()`,
 * render `{dialog}`, lalu `if (await confirm({...})) …`. Dengan `requireText`, tombol konfirmasi
 * baru aktif setelah admin mengetik teks itu — untuk aksi massal yang tidak bisa dibatalkan.
 */

export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  /** Teks yang harus diketik persis (mis. "HAPUS") sebelum tombol konfirmasi aktif. */
  requireText?: string;
};

export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setOptions(next);
      }),
    [],
  );

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  }, []);

  return [confirm, options ? <ConfirmDialog key={options.title} options={options} onSettle={settle} /> : null];
}

function ConfirmDialog({ options, onSettle }: { options: ConfirmOptions; onSettle: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const ready = !options.requireText || typed.trim() === options.requireText;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    const onCancel = (event: Event) => {
      event.preventDefault();
      onSettle(false);
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onSettle]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="confirm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onSettle(false);
      }}
    >
      <form
        className={styles.panel}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onSettle(true);
        }}
      >
        <span className={styles.icon}>
          <AdminIcon name="warning-circle" size={22} />
        </span>
        <h2 id="confirm-title" className={styles.title}>
          {options.title}
        </h2>
        {options.body && <div className={styles.body}>{options.body}</div>}
        {options.requireText && (
          <label className={styles.typeField}>
            <span>
              Ketik <strong>{options.requireText}</strong> untuk melanjutkan
            </span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus spellCheck={false} />
          </label>
        )}
        <div className={styles.actions}>
          <AdminButton type="button" onClick={() => onSettle(false)} autoFocus={!options.requireText}>
            Batal
          </AdminButton>
          <AdminButton type="submit" variant="primary" icon="trash" className={styles.danger} disabled={!ready}>
            {options.confirmLabel ?? "Hapus"}
          </AdminButton>
        </div>
      </form>
    </dialog>
  );
}
