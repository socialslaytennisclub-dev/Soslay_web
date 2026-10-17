"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatPoints, TIER_LABEL } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { createRedemption, processRedemption } from "@/server/admin/actions/points";
import type { AdminRedemption, AdminReward, MemberChoice, RedemptionStatus } from "@/server/admin/types";
import ordersStyles from "../orders/Orders.module.css";
import settingsStyles from "../settings/Settings.module.css";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, MemberAvatar, TierBadge } from "../ui/AdminUI";
import { ActionNotice, type Notice } from "./ActionNotice";
import styles from "./Points.module.css";
import { RedemptionBadge } from "./RedemptionBadge";
import { RewardThumb } from "./RewardCatalog";

const when = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

function PanelHead({ title, subtitle, closeHref }: { title: string; subtitle?: string; closeHref: string }) {
  return (
    <header className={ordersStyles.panelHead}>
      <div>
        <h2 className={ordersStyles.panelTitle}>{title}</h2>
        {subtitle && <p className={ordersStyles.muted}>{subtitle}</p>}
      </div>
      <Link href={closeHref} scroll={false} className={ordersStyles.close} aria-label="Tutup detail">
        <AdminIcon name="x" size={18} />
      </Link>
    </header>
  );
}

/** Detail penukaran + Setujui / Tolak / Selesai (Figma 317:37 kanan). */
export function RedemptionPanel({ redemption: r, closeHref }: { redemption: AdminRedemption; closeHref: string }) {
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, start] = useTransition();
  const short = r.status === "pending" && r.memberBalance < r.points;

  const run = (status: Exclude<RedemptionStatus, "pending">, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => {
      const result = await processRedemption(r.code, status, note);
      setNotice(result.ok ? { text: result.message } : { text: result.error, error: true });
      if (result.ok) setNote("");
    });
  };

  return (
    <aside className={styles.panel} aria-label={`Penukaran ${r.code}`}>
      <PanelHead title={`#${r.code}`} subtitle={when.format(new Date(r.createdAt))} closeHref={closeHref} />
      <div className={ordersStyles.badges}>
        <RedemptionBadge status={r.status} />
      </div>

      <section className={ordersStyles.section}>
        <h3 className={ordersStyles.sectionTitle}>Member</h3>
        <Link href={`/admin/members/${r.memberId}`} className={ordersStyles.customer}>
          <MemberAvatar name={r.memberName} size={40} />
          <span className={ordersStyles.customerText}>
            <span className={ordersStyles.strongLink}>{r.memberName}</span>
            <span className={ordersStyles.muted}>{r.memberCode}</span>
          </span>
          <TierBadge tier={r.memberTier} />
        </Link>
      </section>

      <section className={ordersStyles.section}>
        <h3 className={ordersStyles.sectionTitle}>Reward</h3>
        <div className={ordersStyles.product}>
          <RewardThumb image={r.rewardImage} />
          <span className={ordersStyles.customerText}>
            <span className={ordersStyles.strong}>{r.rewardName}</span>
          </span>
          <span className={styles.ptsPill}>{formatPoints(r.points)}</span>
        </div>
        <dl className={ordersStyles.totals}>
          <div>
            <dt>Saldo member sekarang</dt>
            <dd className={cx(short && styles.minus)}>{formatPoints(r.memberBalance)}</dd>
          </div>
          {r.status === "pending" && (
            <div className={ordersStyles.grandTotal}>
              <dt>Saldo setelah disetujui</dt>
              <dd>{formatPoints(r.memberBalance - r.points)}</dd>
            </div>
          )}
        </dl>
        {short && <p className={ordersStyles.notice}>Saldo member belum cukup — penukaran tidak bisa disetujui.</p>}
        {r.note && <p className={ordersStyles.notice}>Catatan: {r.note}</p>}
        {r.handledBy && r.handledAt && (
          <p className={ordersStyles.muted}>
            Diproses {r.handledBy.split(" ")[0]} · {when.format(new Date(r.handledAt))}
          </p>
        )}
      </section>

      {(r.status === "pending" || r.status === "approved") && (
        <section className={ordersStyles.section}>
          <label className={settingsStyles.field}>
            <span className={settingsStyles.label}>{r.status === "pending" ? "Catatan / alasan tolak" : "Catatan"}</span>
            <input className={settingsStyles.input} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Opsional saat menyetujui" />
          </label>
          <div className={styles.buttons}>
            {r.status === "pending" ? (
              <>
                <AdminButton icon="x" onClick={() => run("rejected")} disabled={saving}>
                  Tolak
                </AdminButton>
                <AdminButton variant="primary" icon="check-bold" onClick={() => run("approved")} disabled={saving || short}>
                  {saving ? "Memproses…" : "Setujui"}
                </AdminButton>
              </>
            ) : (
              <>
                <AdminButton icon="x" onClick={() => run("rejected", `Batalkan #${r.code}? ${formatPoints(r.points)} dikembalikan ke member.`)} disabled={saving}>
                  Batalkan
                </AdminButton>
                <AdminButton variant="primary" icon="check-circle" onClick={() => run("fulfilled")} disabled={saving}>
                  Tandai selesai
                </AdminButton>
              </>
            )}
          </div>
        </section>
      )}
      <ActionNotice notice={notice} />
    </aside>
  );
}

/** Admin mencatat penukaran atas nama member (mis. ditukar langsung di lapangan). */
export function NewRedemptionPanel({ members, rewards, closeHref }: { members: MemberChoice[]; rewards: AdminReward[]; closeHref: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [rewardId, setRewardId] = useState(rewards[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, start] = useTransition();
  // Datalist: "Nama · SOS 0001 2507" → cocokkan kembali ke id member.
  const label = (m: MemberChoice) => `${m.name} · ${m.code}`;
  const member = members.find((m) => label(m) === query);
  const reward = rewards.find((r) => r.id === rewardId);

  const submit = () =>
    start(async () => {
      if (!member) {
        setNotice({ text: "Pilih member dari daftar.", error: true });
        return;
      }
      const result = await createRedemption(member.id, rewardId, note);
      if (result.ok && result.code) router.replace(`/admin/points?tab=redemptions&code=${result.code}`, { scroll: false });
      else if (!result.ok) setNotice({ text: result.error, error: true });
    });

  return (
    <aside className={styles.panel} aria-label="Catat penukaran">
      <PanelHead title="Catat penukaran" subtitle="Untuk penukaran langsung di lapangan atau lewat admin" closeHref={closeHref} />
      <div className={styles.form}>
        <label className={settingsStyles.field}>
          <span className={settingsStyles.label}>Member</span>
          <input className={settingsStyles.input} list="points-members" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ketik nama atau no. member" />
          <datalist id="points-members">
            {members.map((m) => (
              <option key={m.id} value={label(m)} />
            ))}
          </datalist>
          {member && (
            <span className={settingsStyles.muted}>
              {TIER_LABEL[member.tier]} · saldo {formatPoints(member.balance)}
            </span>
          )}
        </label>
        <label className={settingsStyles.field}>
          <span className={settingsStyles.label}>Reward</span>
          <select className={styles.select} value={rewardId} onChange={(e) => setRewardId(e.target.value)}>
            {rewards.map((r) => (
              <option key={r.id} value={r.id} disabled={r.stock === 0}>
                {r.name} — {formatPoints(r.pointsCost)}
                {r.stock === 0 ? " (habis)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={settingsStyles.field}>
          <span className={settingsStyles.label}>Catatan</span>
          <input className={settingsStyles.input} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="mis. ukuran XL, diambil di Menteng" />
        </label>
        {member && reward && member.balance < reward.pointsCost && (
          <p className={ordersStyles.notice}>Saldo {member.name.split(" ")[0]} kurang {formatPoints(reward.pointsCost - member.balance)}.</p>
        )}
      </div>
      <ActionNotice notice={notice} />
      <div className={styles.buttons}>
        <AdminButton variant="primary" icon="plus-bold" onClick={submit} disabled={saving || !rewardId}>
          {saving ? "Menyimpan…" : "Catat penukaran"}
        </AdminButton>
      </div>
    </aside>
  );
}
