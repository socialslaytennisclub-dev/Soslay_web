import { CircleAlert, CircleCheck, Clock, FileText, Hourglass, Info, PackageCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { transferHowTo, verificationSla, type ShopBank } from "@/content/checkout";
import { fmtDate, fmtDateTime, fmtDayDate, fmtTime, MAX_REJECTIONS, rp, SHIPPING_LABEL } from "@/lib/checkout";
import { cx } from "@/lib/cx";
import type { MyOrder, PickupSession } from "@/server/shop/types";
import styles from "./Checkout.module.css";
import { Card, Chip, CheckoutShell, HelpLink, KV, OrderSummaryCard, StageChip, Timeline, TotalWithCode, type TimelineEntry } from "./CheckoutParts";
import { StickyBar } from "./StickyBar";
import { ChangePickup, ConfirmReceived, CopyButton, Countdown, ProofForm, ReplaceProof } from "./OrderClient";

/**
 * Halaman pesanan member: satu URL untuk seluruh perjalanan pesanan (Figma 05 Pembayaran ·
 * 06 Menunggu verifikasi · 06a Upload ulang · 07 Pembayaran diterima) + dikirim / siap diambil / selesai / batal.
 */
export function OrderView({ order, pickupSessions, memberName, bank }: { order: MyOrder; pickupSessions: PickupSession[]; memberName: string; bank: ShopBank }) {
  // Rekening yang berlaku saat pesanan dibuat; pesanan lama (sebelum snapshot) memakai pengaturan sekarang.
  const shopBank = order.bank ?? bank;
  const { stage } = order;
  const pendingProof = order.proofs.find((p) => p.status === "pending");
  const lastRejected = order.proofs.find((p) => p.status === "rejected");
  const latestProof = order.proofs.find((p) => p.status !== "replaced");
  const method = SHIPPING_LABEL[order.method];
  const crumbs = [{ label: "Shop", href: "/shop" }, { label: `Order #${order.code}`, href: `/akun/pesanan/${order.code}` }];
  const back = { label: "Order saya", href: "/akun/order#pesanan-saya" };
  const subtitle = `Pesanan #${order.code} · ${method.short}`;

  const step = stage === "awaiting_payment" || stage === "reupload" ? 2 : stage === "awaiting_verification" ? 3 : stage === "completed" ? 5 : 4;
  const title = {
    awaiting_payment: "Selesaikan pembayaran",
    reupload: "Upload ulang bukti transfer",
    awaiting_verification: "Menunggu verifikasi",
    processing: "Pembayaran diterima",
    shipped: "Pesanan dikirim",
    ready_pickup: "Siap diambil",
    completed: "Pesanan selesai",
    cancelled: "Pesanan dibatalkan",
  }[stage];

  const summaryChips =
    order.paidAt && stage !== "cancelled" ? (
      <>
        <Chip tone="lime">Lunas · Transfer {shopBank.short}</Chip>
        <StageChip stage={stage} />
      </>
    ) : (
      <StageChip stage={stage} />
    );

  const aside = (
    <aside className={styles.aside}>
      {stage === "reupload" && <PaymentHistory order={order} />}
      <OrderSummaryCard order={order} chips={summaryChips} />
      {stage !== "completed" && <HelpLink code={order.code} />}
    </aside>
  );

  // ── 05 Pembayaran & 06a Upload ulang ───────────────────────────────────────
  if (stage === "awaiting_payment" || stage === "reupload") {
    return (
      <CheckoutShell
        breadcrumb={[...crumbs, { label: "Pembayaran" }]}
        back={back}
        title={title}
        subtitle={stage === "reupload" ? subtitle : `Pesanan #${order.code} berhasil dibuat · ${fmtDate(order.placedAt)}, ${fmtTime(order.placedAt)} WIB`}
        step={step}
      >
        <div className={styles.body}>
          <div className={styles.main}>
            {stage === "reupload" && lastRejected ? (
              <div className={styles.rejected} role="alert">
                <CircleAlert size={24} />
                <div className={styles.rejectedBody}>
                  <p className={styles.rejectedTitle}>Bukti transfer belum bisa diverifikasi</p>
                  <p className={styles.rejectedReason}>Alasan: {lastRejected.rejectReason}</p>
                  {lastRejected.rejectMessage && <p className={styles.heroText}>Pesan admin: “{lastRejected.rejectMessage}”</p>}
                  {order.payDeadline && (
                    <p className={styles.rejectedDeadline}>
                      Upload ulang sebelum {fmtDayDate(order.payDeadline)} · {fmtTime(order.payDeadline)} WIB (batas diperpanjang 24 jam). Penolakan ke-{order.rejections} dari maks {MAX_REJECTIONS}.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              order.payDeadline && (
                <div className={styles.deadline}>
                  <div className={styles.deadlineText}>
                    <Clock size={22} />
                    <div>
                      <p className={styles.deadlineTitle}>
                        Transfer sebelum {fmtDayDate(order.payDeadline)} · {fmtTime(order.payDeadline)} WIB
                      </p>
                      <p className={styles.muted}>Lewat batas waktu, pesanan dibatalkan otomatis.</p>
                    </div>
                  </div>
                  <Countdown deadline={order.payDeadline} />
                </div>
              )
            )}

            <Card title={stage === "reupload" ? "Transfer ke" : "Transfer ke rekening berikut"}>
              <div className={styles.bankBox}>
                <div className={styles.bankRow}>
                  <span className={styles.bankLogo}>{shopBank.short}</span>
                  <span className={styles.personText} style={{ flex: 1 }}>
                    <span className={styles.muted}>{shopBank.bank} · No. rekening</span>
                    <span className={styles.bankNumber}>{shopBank.accountNo}</span>
                    <span className={styles.muted}>a.n. {shopBank.accountName}</span>
                  </span>
                </div>
                <CopyButton value={shopBank.accountNo.replace(/\s/g, "")} label="Salin no. rekening" />
              </div>
              <div className={styles.totalBox}>
                <span className={styles.muted}>Total transfer</span>
                <TotalWithCode total={order.total} className={styles.bigTotal} />
                {stage === "awaiting_payment" && <CopyButton value={String(order.total)} label="Salin jumlah" />}
              </div>
              {stage === "awaiting_payment" ? (
                <>
                  <p className={cx(styles.note, styles.noteLime)}>
                    <Info size={16} />
                    <span>Transfer tepat sampai 3 digit terakhir (kode unik {order.uniqueCode}) supaya admin bisa langsung mencocokkan pembayaranmu.</span>
                  </p>
                  <div className={styles.items} style={{ gap: 8 }}>
                    <p className={styles.strong} style={{ fontSize: 14 }}>
                      Cara transfer
                    </p>
                    <ol className={styles.howTo}>
                      {transferHowTo(shopBank).map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ol>
                  </div>
                </>
              ) : (
                <p className={styles.note}>
                  <Info size={16} />
                  <span>Sudah transfer? Tidak perlu transfer lagi — cukup upload bukti yang jelas.</span>
                </p>
              )}
            </Card>

            <Card title="Upload bukti transfer" aside={<span className={styles.cardAside}>JPG, PNG, PDF · maks 5 MB</span>}>
              <ProofForm
                code={order.code}
                total={order.total}
                previous={lastRejected ?? undefined}
                defaultSender={memberName}
                helper={stage === "awaiting_payment" ? "Bayar nanti? Pesanan tersimpan di Dashboard › Order — upload bukti bisa dilakukan dari sana." : undefined}
              />
            </Card>
          </div>
          {aside}
        </div>
      </CheckoutShell>
    );
  }

  // ── 06 Menunggu verifikasi · 07 diterima · dikirim · siap diambil · selesai · batal ──
  const hero = {
    awaiting_verification: {
      icon: <Hourglass size={28} />,
      tone: "",
      title: "Bukti transfer terkirim",
      text: `Admin akan mengecek mutasi rekening BCA dan memverifikasi pembayaranmu ${verificationSla}. Status di halaman ini diperbarui begitu terverifikasi.`,
    },
    processing: {
      icon: <CircleCheck size={28} />,
      tone: styles.heroIconGreen,
      title: "Pembayaran terverifikasi",
      text:
        order.method === "jnt"
          ? "Terima kasih! Pesananmu sedang dikemas dan diserahkan ke J&T maks 2 hari kerja. Nomor resi akan muncul di halaman ini."
          : order.method === "instant"
            ? "Terima kasih! Admin memesan GoSend/GrabExpress ke titik lokasimu. Link lacak kurir akan muncul di halaman ini."
            : "Terima kasih! Pesananmu disiapkan dan dibawa host ke sesi Mabar yang kamu pilih.",
    },
    shipped: {
      icon: <PackageCheck size={28} />,
      tone: styles.heroIconGreen,
      title: order.method === "jnt" ? "Pesanan dalam perjalanan" : "Kurir sedang mengantar",
      text: order.method === "jnt" ? "Lacak paketmu dengan nomor resi di bawah. Pesanan selesai otomatis 7 hari setelah dikirim." : "Pantau kurir lewat link lacak di bawah.",
    },
    ready_pickup: {
      icon: <PackageCheck size={28} />,
      tone: styles.heroIconGreen,
      title: "Pesanan siap diambil",
      text: `Tunjukkan kode pesanan #${order.code} ke host saat sesi Mabar; boleh diwakilkan.`,
    },
    completed: { icon: <CircleCheck size={28} />, tone: styles.heroIconGreen, title: "Pesanan selesai", text: "Terima kasih sudah belanja di Soslay Shop!" },
    cancelled: {
      icon: <XCircle size={28} />,
      tone: styles.heroIconRed,
      title: "Pesanan dibatalkan",
      text: `${order.cancelReason ?? "Dibatalkan admin"}. ${order.paidAt ? "Admin akan menghubungimu untuk pengembalian dana." : "Stok sudah dilepas — kamu bisa memesan lagi dari Shop."}`,
    },
  }[stage];

  const pickupLate = order.method === "pickup" && order.pickup?.late && !order.paidAt;

  return (
    <CheckoutShell breadcrumb={crumbs} back={back} title={title} subtitle={subtitle} step={stage === "cancelled" ? 1 : step}>
      <div className={styles.body}>
        <div className={styles.main}>
          <Card>
            <div className={styles.hero}>
              <span className={cx(styles.heroIcon, hero.tone)}>{hero.icon}</span>
              <div className={styles.items} style={{ gap: 8 }}>
                <p className={styles.heroTitle}>{hero.title}</p>
                <p className={styles.heroText}>{hero.text}</p>
                {order.pointsAwarded > 0 && stage !== "cancelled" && <Chip tone="lime">+{order.pointsAwarded} Slay Point sudah masuk ke akunmu</Chip>}
              </div>
            </div>
          </Card>

          {order.method === "pickup" && order.pickup && stage !== "cancelled" && stage !== "completed" && (
            <Card title="Pengambilan di Mabar Session">
              <KV
                rows={[
                  ["Sesi", `${fmtDayDate(order.pickup.startsAt)} · ${fmtTime(order.pickup.startsAt)}–${fmtTime(order.pickup.endsAt)}`],
                  ["Lokasi", order.pickup.venue],
                  ["Kode pengambilan", `#${order.code}`],
                ]}
              />
              {pickupLate ? (
                <>
                  <p className={cx(styles.note, styles.noteAmber)}>
                    <Info size={16} />
                    <span>Pembayaran belum terverifikasi sebelum H-1 sesi ini — pilih sesi Mabar lain untuk mengambil pesanan.</span>
                  </p>
                  <ChangePickup code={order.code} sessions={pickupSessions.filter((s) => s.id !== order.pickup?.id)} current={order.pickup.id} />
                </>
              ) : (
                !order.paidAt && (
                  <p className={cx(styles.note, styles.noteAmber)}>
                    <Info size={16} />
                    <span>
                      Pembayaran harus terverifikasi paling lambat {fmtDayDate(order.pickup.deadline)} · {fmtTime(order.pickup.deadline)}.
                    </span>
                  </p>
                )
              )}
            </Card>
          )}

          {(order.trackingNumber || order.trackingUrl) && (
            <Card title={order.method === "jnt" ? "Pengiriman J&T" : "Kurir Instant"}>
              <KV
                rows={[
                  ...(order.courier ? [["Kurir", order.courier] as [string, string]] : []),
                  ...(order.trackingNumber ? [["No. resi", order.trackingNumber] as [string, string]] : []),
                ]}
              />
              {order.trackingNumber && order.method === "jnt" && <CopyButton value={order.trackingNumber} label="Salin no. resi" />}
              {(order.trackingUrl || order.method === "jnt") && (
                <a className={styles.linkButton} href={order.trackingUrl ?? "https://jet.co.id/track"} target="_blank" rel="noreferrer">
                  Lacak pengiriman ›
                </a>
              )}
            </Card>
          )}

          <Card title="Status pesanan">
            <Timeline items={timeline(order)} />
          </Card>

          {stage === "awaiting_verification" && pendingProof && (
            <Card
              title="Bukti transfer kamu"
              aside={<ReplaceProof code={order.code} total={order.total} previous={pendingProof} defaultSender={memberName} />}
            >
              <div className={styles.person}>
                <a href={`/akun/pesanan/${order.code}/bukti/${pendingProof.id}`} target="_blank" rel="noreferrer" className={cx(styles.filePreview, styles.filePreviewLarge)} aria-label="Lihat bukti transfer">
                  {pendingProof.mime.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- file privat lewat route ber-otorisasi
                    <img src={`/akun/pesanan/${order.code}/bukti/${pendingProof.id}`} alt="Bukti transfer" />
                  ) : (
                    <FileText size={28} />
                  )}
                </a>
                <KV
                  rows={[
                    ["Pengirim", `${pendingProof.senderName} · ${pendingProof.senderBank}`],
                    ["Jumlah", rp(pendingProof.amount)],
                    ["Tanggal transfer", fmtDate(`${pendingProof.transferDate}T12:00:00+07:00`)],
                    ["File", pendingProof.fileName],
                  ]}
                />
              </div>
              <p className={styles.note}>
                <Info size={16} />
                <span>Bukti masih bisa diganti selama belum diverifikasi admin.</span>
              </p>
            </Card>
          )}

          {stage === "shipped" && order.method !== "pickup" && (
            <div className={styles.actionsRow}>
              <ConfirmReceived code={order.code} />
            </div>
          )}

          {(stage === "processing" || stage === "completed" || stage === "cancelled" || stage === "ready_pickup" || stage === "shipped") && (
            <StickyBar className={styles.stickyButtons}>
              <Link href="/akun/order#pesanan-saya" className={styles.outline}>
                <span className={styles.desktopOnly}>Lihat semua pesanan</span>
                <span className={styles.mobileOnly}>Pesanan saya</span>
              </Link>
              <Link href="/shop" className={styles.primary}>
                Belanja lagi
              </Link>
            </StickyBar>
          )}
          {latestProof && stage === "cancelled" && <p className={styles.muted}>Bukti terakhir: {latestProof.fileName} · {fmtDateTime(latestProof.uploadedAt)}</p>}
        </div>
        {aside}
      </div>
    </CheckoutShell>
  );
}

function PaymentHistory({ order }: { order: MyOrder }) {
  const rejected = order.proofs.filter((p) => p.status === "rejected").reverse();
  return (
    <Card title="Riwayat pembayaran">
      <Timeline
        items={[
          { title: "Pesanan dibuat", detail: fmtDateTime(order.placedAt), state: "done" },
          ...rejected.map((p, i): TimelineEntry => ({ title: `Bukti #${i + 1} ditolak`, detail: `${fmtDateTime(p.reviewedAt ?? p.uploadedAt)} · ${(p.rejectReason ?? "").toLowerCase()}`, state: "rejected" })),
          { title: "Menunggu bukti baru", state: "current" },
        ]}
      />
    </Card>
  );
}

/** Timeline "Status pesanan" per opsi pengiriman (Figma 06 / 07). */
function timeline(order: MyOrder): TimelineEntry[] {
  const latest = order.proofs.find((p) => p.status !== "replaced");
  const paid = Boolean(order.paidAt);
  const shippedLabel = { jnt: "Dikirim via J&T Express", instant: "Diantar kurir Instant", pickup: "Siap diambil di Mabar Session" }[order.method];
  const shippedTodo = { jnt: "Nomor resi tampil di sini", instant: "Link lacak kurir tampil di sini", pickup: order.pickup ? `${fmtDayDate(order.pickup.startsAt)} · ${order.pickup.venue}` : "" }[order.method];
  const entries: TimelineEntry[] = [{ title: "Pesanan dibuat", detail: fmtDateTime(order.placedAt), state: "done" }];

  if (order.stage === "cancelled") {
    if (latest) entries.push({ title: "Bukti transfer diunggah", detail: fmtDateTime(latest.uploadedAt), state: "done" });
    entries.push({ title: "Pesanan dibatalkan", detail: `${order.cancelledAt ? fmtDateTime(order.cancelledAt) + " · " : ""}${order.cancelReason ?? ""}`, state: "rejected" });
    return entries;
  }

  entries.push({ title: "Bukti transfer diunggah", detail: latest ? fmtDateTime(latest.uploadedAt) : undefined, state: latest ? "done" : "todo" });
  if (!paid) {
    const deadline = latest ? new Date(new Date(latest.uploadedAt).getTime() + 86_400_000).toISOString() : null;
    entries.push({ title: "Verifikasi pembayaran oleh admin", detail: deadline ? `Sedang dicek · paling lambat ${fmtDate(deadline)}, ${fmtTime(deadline)}` : undefined, state: order.stage === "awaiting_verification" ? "current" : "todo" });
  } else {
    entries.push({ title: "Pembayaran diverifikasi admin", detail: fmtDateTime(order.paidAt!), state: "done" });
  }
  entries.push({ title: order.method === "pickup" ? "Pesanan disiapkan" : "Pesanan dikemas", detail: order.stage === "processing" && order.method === "jnt" ? "Diserahkan ke J&T maks 2 hari kerja" : undefined, state: order.stage === "processing" ? "current" : paid ? "done" : "todo" });
  const shipped = order.stage === "shipped" || order.stage === "ready_pickup";
  entries.push({
    title: shippedLabel,
    detail: order.shippedAt ? `${fmtDateTime(order.shippedAt)}${order.trackingNumber ? ` · resi ${order.trackingNumber}` : ""}` : shippedTodo,
    state: shipped ? "current" : order.stage === "completed" ? "done" : "todo",
  });
  entries.push({ title: order.method === "pickup" ? "Sudah diambil" : "Selesai", detail: order.completedAt ? fmtDateTime(order.completedAt) : undefined, state: order.stage === "completed" ? "done" : "todo" });
  return entries;
}
