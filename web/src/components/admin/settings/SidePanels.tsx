import type { AuditEntry, Integration } from "@/server/admin/types";
import { AdminIcon, type AdminIconName } from "../ui/AdminIcon";
import { Badge } from "../ui/AdminUI";
import styles from "./Settings.module.css";

const ICON: Record<string, AdminIconName> = {
  kuy: "tennis-ball",
  reclub: "link-simple",
  payment: "coins",
  whatsapp: "whatsapp-logo",
  instagram: "instagram-logo",
};
const STATUS = {
  connected: { label: "Terhubung", tone: "lime" },
  needs_reauth: { label: "Perlu login ulang", tone: "pink" },
  disconnected: { label: "Belum terhubung", tone: "neutral" },
} as const;

const when = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export function IntegrationList({ items, detailed }: { items: Integration[]; detailed?: boolean }) {
  return (
    <ul className={styles.integrations}>
      {items.map((i) => (
        <li key={i.key} className={styles.integration}>
          <span className={styles.integrationIcon}>
            <AdminIcon name={ICON[i.key] ?? "link-simple"} size={18} />
          </span>
          <span className={styles.personText}>
            <span className={styles.strong}>{i.label}</span>
            <span className={styles.muted}>
              {i.description}
              {detailed && i.lastSyncAt && ` · sinkron terakhir ${when.format(new Date(i.lastSyncAt))}`}
            </span>
          </span>
          <Badge tone={STATUS[i.status].tone} dot>
            {STATUS[i.status].label}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export function IntegrationsCard({ items }: { items: Integration[] }) {
  return (
    <section className={styles.card}>
      <header>
        <h2 className={styles.cardTitle}>Integrasi</h2>
        <p className={styles.muted}>Sinkron booking, pembayaran & pesan</p>
      </header>
      <IntegrationList items={items} />
    </section>
  );
}

export function AuditLogCard({ entries }: { entries: AuditEntry[] }) {
  return (
    <section className={styles.card}>
      <header>
        <h2 className={styles.cardTitle}>Log aktivitas admin</h2>
        <p className={styles.muted}>7 hari terakhir</p>
      </header>
      <ol className={styles.log}>
        {entries.map((e) => (
          <li key={`${e.at}-${e.action}`}>
            <span>
              <strong>{e.actor}</strong> {e.action}
            </span>
            <span className={styles.muted}>{when.format(new Date(e.at))}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
