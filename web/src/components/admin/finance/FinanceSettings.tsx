"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AdminIcon, type AdminIconName } from "@/components/admin/ui/AdminIcon";
import { Toggle } from "@/components/admin/ui/AdminForm";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import { useConfirm } from "@/components/admin/ui/ConfirmDialog";
import { toast } from "@/components/admin/ui/Toaster";
import { cx } from "@/lib/cx";
import { dateLabel, rp } from "@/lib/finance/format";
import type { AccountType, FinAccount, FinCategory, FinSettings } from "@/lib/finance/types";
import { deleteAccount, removeCategory, restoreCategory, saveAccount, saveCategory, saveFinanceSettings } from "@/server/admin/actions/finance";
import styles from "./Finance.module.css";

const TYPE_LABEL: Record<AccountType, string> = { bank: "Bank", payment_gateway: "Payment gateway", cash: "Kas", platform: "Platform (Kuyy)" };
const TYPE_ICON: Record<AccountType, AdminIconName> = { bank: "bank", payment_gateway: "money", cash: "wallet", platform: "tennis-ball" };
const GROUP_LABEL = { revenue: "Pendapatan", cogs: "HPP", opex: "Beban operasional", tax: "Pajak" } as const;

type AccountForm = { id?: string; name: string; type: AccountType; accountNoMasked: string; note: string };
type CategoryForm = { id?: string; name: string; kind: "income" | "expense"; reportGroup: "revenue" | "cogs" | "opex"; note: string; keywords: string };

/** Admin / 12r — Pengaturan keuangan: akun, kategori (+ kata kunci import), pajak, pencatatan otomatis. */
export function FinanceSettingsView({ accounts, balances, categories, usage, settings }: { accounts: FinAccount[]; balances: Record<string, number>; categories: FinCategory[]; usage: Record<string, number>; settings: FinSettings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, dialog] = useConfirm();
  const [acc, setAcc] = useState<AccountForm | null>(null);
  const [cat, setCat] = useState<CategoryForm | null>(null);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [merge, setMerge] = useState<{ id: string; into: string } | null>(null);
  const [tax, setTax] = useState({ enabled: settings.taxEnabled, rate: String(settings.taxRate ?? "") });

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      toast.result(r as Parameters<typeof toast.result>[0]);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });

  const list = categories.filter((c) => c.kind === kind && !c.isArchived);
  const archived = categories.filter((c) => c.kind === kind && c.isArchived);

  return (
    <div className={styles.gridSide}>
      <div className={styles.stack}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h3 className={styles.panelTitle}>Akun kas & bank</h3>
              <p className={styles.panelSub}>Tempat uang klub disimpan.</p>
            </div>
            <AdminButton icon="plus-bold" onClick={() => setAcc({ name: "", type: "bank", accountNoMasked: "", note: "" })}>
              Tambah akun
            </AdminButton>
          </div>
          {acc && (
            <div className={styles.inlineForm} style={{ marginBottom: 16 }}>
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span>Nama akun</span>
                  <input className={styles.input} value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} placeholder="mis. Bank Mandiri" />
                </label>
                <label className={styles.field}>
                  <span>Jenis</span>
                  <select className={styles.input} value={acc.type} onChange={(e) => setAcc({ ...acc, type: e.target.value as AccountType })}>
                    {(Object.keys(TYPE_LABEL) as AccountType[]).map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span>
                    No. rekening (disamarkan) <span className={styles.optional}>(opsional)</span>
                  </span>
                  <input className={styles.input} value={acc.accountNoMasked} onChange={(e) => setAcc({ ...acc, accountNoMasked: e.target.value })} placeholder="•••• 4821" />
                </label>
                <label className={styles.field}>
                  <span>
                    Keterangan <span className={styles.optional}>(opsional)</span>
                  </span>
                  <input className={styles.input} value={acc.note} onChange={(e) => setAcc({ ...acc, note: e.target.value })} />
                </label>
              </div>
              <div className={styles.actions}>
                <AdminButton size="sm" onClick={() => setAcc(null)}>
                  Batal
                </AdminButton>
                <AdminButton size="sm" variant="primary" disabled={pending} onClick={() => run(() => saveAccount(acc), () => setAcc(null))}>
                  Simpan akun
                </AdminButton>
              </div>
            </div>
          )}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Akun</th>
                  <th>Jenis</th>
                  <th className={styles.num}>Saldo saat ini</th>
                  <th aria-label="Aksi" />
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} style={a.isActive ? undefined : { opacity: 0.55 }}>
                    <td>
                      <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <span className={styles.accIcon}>
                          <AdminIcon name={TYPE_ICON[a.type]} size={16} />
                        </span>
                        <span>
                          <span className={styles.cellTitle}>
                            {a.name} {a.isSystem && <span className={cx(styles.pill, styles.pillAuto)}>Sistem</span>} {!a.isActive && <span className={styles.pill}>Nonaktif</span>}
                          </span>
                          <span className={styles.cellSub}>{[a.accountNoMasked && `No. rek ${a.accountNoMasked}`, a.note].filter(Boolean).join(" · ")}</span>
                        </span>
                      </span>
                    </td>
                    <td>{TYPE_LABEL[a.type]}</td>
                    <td className={cx(styles.num, styles.strong)}>{rp(balances[a.id] ?? 0)}</td>
                    <td>
                      <span style={{ display: "flex" }}>
                        <button type="button" className={styles.iconBtn} aria-label={`Ubah ${a.name}`} onClick={() => setAcc({ id: a.id, name: a.name, type: a.type, accountNoMasked: a.accountNoMasked ?? "", note: a.note ?? "" })}>
                          <AdminIcon name="pencil-simple" size={16} />
                        </button>
                        {!a.isSystem &&
                          (a.isActive ? (
                            <button
                              type="button"
                              className={styles.iconBtn}
                              aria-label={`Hapus ${a.name}`}
                              onClick={async () => {
                                if (await confirm({ title: `Hapus akun ${a.name}?`, body: "Akun yang sudah punya transaksi hanya dinonaktifkan.", confirmLabel: "Hapus" })) run(() => deleteAccount(a.id));
                              }}
                            >
                              <AdminIcon name="trash" size={16} />
                            </button>
                          ) : (
                            <button type="button" className={styles.iconBtn} aria-label={`Aktifkan ${a.name}`} onClick={() => run(() => saveAccount({ id: a.id, name: a.name, type: a.type, accountNoMasked: a.accountNoMasked ?? "", note: a.note ?? "", isActive: true }))}>
                              <AdminIcon name="undo" size={16} />
                            </button>
                          ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.muted} style={{ marginTop: 12 }}>
            Akun yang sudah punya transaksi tidak bisa dihapus — hanya dinonaktifkan. Saldo awal diatur di Neraca → Saldo awal & penyesuaian.
          </p>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h3 className={styles.panelTitle}>Kategori</h3>
              <p className={styles.panelSub}>Dipakai di form transaksi, saran import & laporan laba rugi.</p>
            </div>
            <AdminButton icon="plus-bold" onClick={() => setCat({ name: "", kind, reportGroup: kind === "income" ? "revenue" : "opex", note: "", keywords: "" })}>
              Tambah kategori
            </AdminButton>
          </div>
          <div className={styles.segment} style={{ marginBottom: 16 }}>
            {(["expense", "income"] as const).map((k) => (
              <button key={k} type="button" className={cx(styles.segBtn, kind === k && styles.segActive)} onClick={() => setKind(k)}>
                {k === "expense" ? "Pengeluaran" : "Pemasukan"} <span className={styles.count}>{categories.filter((c) => c.kind === k && !c.isArchived).length}</span>
              </button>
            ))}
          </div>
          {cat && (
            <div className={styles.inlineForm} style={{ marginBottom: 16 }}>
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span>Nama kategori</span>
                  <input className={styles.input} value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} />
                </label>
                <label className={styles.field}>
                  <span>Pos laporan</span>
                  <select className={styles.input} value={cat.reportGroup} disabled={cat.kind === "income"} onChange={(e) => setCat({ ...cat, reportGroup: e.target.value as CategoryForm["reportGroup"] })}>
                    {cat.kind === "income" ? (
                      <option value="revenue">Pendapatan</option>
                    ) : (
                      <>
                        <option value="opex">Beban operasional</option>
                        <option value="cogs">HPP (harga pokok penjualan)</option>
                      </>
                    )}
                  </select>
                </label>
              </div>
              <label className={styles.field}>
                <span>
                  Keterangan <span className={styles.optional}>(opsional)</span>
                </span>
                <input className={styles.input} value={cat.note} onChange={(e) => setCat({ ...cat, note: e.target.value })} />
              </label>
              <label className={styles.field}>
                <span>Kata kunci saran import</span>
                <input className={styles.input} value={cat.keywords} onChange={(e) => setCat({ ...cat, keywords: e.target.value })} placeholder="pisahkan dengan koma, mis. book, lapangan, court" />
                <small>Keterangan jurnal yang mengandung kata ini otomatis disarankan ke kategori ini.</small>
              </label>
              <div className={styles.actions}>
                <AdminButton size="sm" onClick={() => setCat(null)}>
                  Batal
                </AdminButton>
                <AdminButton
                  size="sm"
                  variant="primary"
                  disabled={pending}
                  onClick={() => run(() => saveCategory({ ...cat, keywords: cat.keywords.split(",").map((k) => k.trim()).filter(Boolean) }), () => setCat(null))}
                >
                  Simpan kategori
                </AdminButton>
              </div>
            </div>
          )}
          <div className={styles.boxList}>
            {list.map((c) => (
              <div key={c.id} className={styles.settingRow}>
                <div>
                  {c.name}
                  <small>
                    {usage[c.id] ? `${usage[c.id]} transaksi` : "Belum dipakai"} · {GROUP_LABEL[c.reportGroup]}
                    {c.note ? ` · ${c.note}` : ""}
                    {c.keywords.length ? ` · kata kunci: ${c.keywords.slice(0, 5).join(", ")}${c.keywords.length > 5 ? "…" : ""}` : ""}
                  </small>
                </div>
                {c.isSystem ? (
                  <span className={cx(styles.pill, styles.pillAuto)}>Sistem · terkunci</span>
                ) : merge?.id === c.id ? (
                  <span className={styles.actions}>
                    <select className={styles.inlineSelect} value={merge.into} onChange={(e) => setMerge({ ...merge, into: e.target.value })} aria-label="Gabungkan ke">
                      <option value="">Gabungkan ke…</option>
                      {list
                        .filter((x) => x.id !== c.id && !x.isSystem)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                    <AdminButton size="sm" variant="primary" disabled={!merge.into || pending} onClick={() => run(() => removeCategory(c.id, merge.into), () => setMerge(null))}>
                      Gabungkan
                    </AdminButton>
                    <AdminButton size="sm" onClick={() => setMerge(null)}>
                      Batal
                    </AdminButton>
                  </span>
                ) : (
                  <>
                    <button type="button" className={styles.iconBtn} aria-label={`Ubah ${c.name}`} onClick={() => setCat({ id: c.id, name: c.name, kind: c.kind, reportGroup: c.reportGroup === "tax" ? "opex" : c.reportGroup, note: c.note ?? "", keywords: c.keywords.join(", ") })}>
                      <AdminIcon name="pencil-simple" size={16} />
                    </button>
                    {usage[c.id] ? (
                      <button type="button" className={styles.iconBtn} aria-label={`Gabungkan ${c.name}`} title="Gabungkan ke kategori lain" onClick={() => setMerge({ id: c.id, into: "" })}>
                        <AdminIcon name="arrows-left-right" size={16} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={`Hapus ${c.name}`}
                      onClick={async () => {
                        if (await confirm({ title: `${usage[c.id] ? "Arsipkan" : "Hapus"} ${c.name}?`, body: usage[c.id] ? `Sudah dipakai ${usage[c.id]} transaksi — kategori diarsipkan (tidak muncul di form). Pilih "Gabungkan" untuk memindahkan transaksinya.` : "Kategori belum dipakai dan akan dihapus.", confirmLabel: usage[c.id] ? "Arsipkan" : "Hapus" }))
                          run(() => removeCategory(c.id));
                      }}
                    >
                      <AdminIcon name="trash" size={16} />
                    </button>
                  </>
                )}
              </div>
            ))}
            {archived.map((c) => (
              <div key={c.id} className={styles.settingRow} style={{ opacity: 0.6 }}>
                <div>
                  {c.name} <span className={styles.pill}>Diarsipkan</span>
                  <small>{usage[c.id] ?? 0} transaksi</small>
                </div>
                <button type="button" className={styles.iconBtn} aria-label={`Aktifkan ${c.name}`} onClick={() => run(() => restoreCategory(c.id))}>
                  <AdminIcon name="undo" size={16} />
                </button>
              </div>
            ))}
          </div>
          <p className={styles.muted} style={{ marginTop: 12 }}>
            Kategori yang sudah dipakai tidak bisa dihapus — gabungkan ke kategori lain atau arsipkan.
          </p>
        </section>
      </div>

      <div className={styles.stack}>
        <section className={styles.panel}>
          <div className={styles.panelHead} style={{ marginBottom: 8 }}>
            <h3 className={styles.panelTitle}>Pajak</h3>
          </div>
          <Toggle label="PPh final UMKM" hint={tax.enabled ? "Aktif — PPh tampil di Laba Rugi & sebagai Utang pajak di Neraca." : "Belum diaktifkan — jenis & tarif pajak belum ditentukan."} checked={tax.enabled} onChange={(v) => setTax({ ...tax, enabled: v })} />
          <label className={styles.field} style={{ marginTop: 12 }}>
            <span>Tarif (% dari omzet)</span>
            <input className={styles.input} inputMode="decimal" value={tax.rate} onChange={(e) => setTax({ ...tax, rate: e.target.value.replace(/[^\d.,]/g, "") })} placeholder="0,5" />
          </label>
          <div style={{ marginTop: 12 }}>
            <AdminButton size="sm" variant="primary" disabled={pending} onClick={() => run(() => saveFinanceSettings({ taxEnabled: tax.enabled, taxRate: tax.rate ? Number(tax.rate.replace(",", ".")) : null }))}>
              Simpan pajak
            </AdminButton>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead} style={{ marginBottom: 8 }}>
            <div>
              <h3 className={styles.panelTitle}>Pencatatan otomatis</h3>
              <p className={styles.panelSub}>Sumber data dari modul lain (mulai go-live {dateLabel(settings.goLiveDate)}).</p>
            </div>
          </div>
          <Toggle label="Import peserta Kuyy (Activities)" hint="Kolom Dibayar per peserta → Tiket activity ke Saldo Kuyy. Rp0 tidak dicatat." checked={settings.autoKuyy} onChange={(v) => run(() => saveFinanceSettings({ autoKuyy: v }))} />
          <Toggle label="Tandai Lunas (Activities)" hint="Bayar manual → Tiket activity ke akun default di bawah. Batalkan lunas → koreksi." checked={settings.autoManualPaid} onChange={(v) => run(() => saveFinanceSettings({ autoManualPaid: v }))} />
          <Toggle label="Order shop" hint="Saat transfer pembeli diverifikasi → Penjualan merchandise. Order via WA dicatat manual." checked={settings.autoShop} onChange={(v) => run(() => saveFinanceSettings({ autoShop: v }))} />
          <Toggle label="Penyusutan peralatan" hint="Tiap tanggal terakhir bulan, dari pos Peralatan di Neraca." checked={settings.autoDepreciation} onChange={(v) => run(() => saveFinanceSettings({ autoDepreciation: v }))} />
          <label className={styles.field} style={{ marginTop: 12 }}>
            <span>Akun default pembayaran manual (Tandai Lunas)</span>
            <select className={styles.input} value={settings.manualPaidAccountId ?? ""} onChange={(e) => run(() => saveFinanceSettings({ manualPaidAccountId: e.target.value }))}>
              {accounts
                .filter((a) => a.isActive)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          <label className={styles.field} style={{ marginTop: 12 }}>
            <span>Akun bank untuk order shop</span>
            <select className={styles.input} value={settings.defaultBankAccountId ?? ""} onChange={(e) => run(() => saveFinanceSettings({ defaultBankAccountId: e.target.value }))}>
              {accounts
                .filter((a) => a.isActive)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
        </section>

        <section className={styles.note} style={{ flexDirection: "column" }}>
          <strong style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <AdminIcon name="shield-check" size={16} /> Akses <span className={cx(styles.pill, styles.pillNavy)}>Super Admin + Pencatat</span>
          </strong>
          Super Admin: akses penuh. Pencatat keuangan: hanya catat & lihat transaksi (tanpa laporan, neraca, pengaturan). Role lain: menu tidak tampil. Atur di Settings & Roles → modul Keuangan (Edit = penuh, Lihat = Pencatat). Semua perubahan tercatat di log.
        </section>
      </div>
      {dialog}
    </div>
  );
}
