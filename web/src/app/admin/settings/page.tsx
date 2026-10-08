import type { Metadata } from "next";
import Link from "next/link";
import { SettingsForms } from "@/components/admin/settings/SettingsForms";
import styles from "@/components/admin/settings/Settings.module.css";
import { AuditLogCard, IntegrationList, IntegrationsCard } from "@/components/admin/settings/SidePanels";
import { RolesMatrix, TeamTable } from "@/components/admin/settings/TeamAccess";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { cx } from "@/lib/cx";
import { adminNow } from "@/server/admin/dataset";
import { ADMIN_MODULES, getSettings, listAuditLog, listIntegrations, listRoles, listStaff } from "@/server/admin/settings-repo";
import pageStyles from "../page.module.css";

export const metadata: Metadata = { title: "Settings & Roles" };

const TABS = [
  { value: "team", label: "Tim & akses" },
  { value: "general", label: "Umum" },
  { value: "membership", label: "Membership & poin" },
  { value: "payment", label: "Pembayaran" },
  { value: "notifications", label: "Notifikasi" },
  { value: "integrations", label: "Integrasi" },
] as const;

/** Admin / 09 Settings & Roles (Figma 25:6834). */
export default async function AdminSettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const raw = (await searchParams).tab;
  const tab = TABS.find((t) => t.value === (Array.isArray(raw) ? raw[0] : raw))?.value ?? "team";
  const [staff, roles, integrations, log, settings] = await Promise.all([listStaff(), listRoles(), listIntegrations(), listAuditLog(), getSettings()]);

  return (
    <>
      <AdminTopbar breadcrumb="Pengaturan / Settings & Roles" title="Settings & Roles" />
      <div className={pageStyles.content}>
        <nav className={styles.tabs} aria-label="Bagian pengaturan">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={t.value === "team" ? "/admin/settings" : `/admin/settings?tab=${t.value}`}
              className={cx(styles.tab, tab === t.value && styles.tabActive)}
              aria-current={tab === t.value ? "page" : undefined}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {tab === "team" && (
          <div className={styles.layout}>
            <div className={styles.mainCol}>
              <TeamTable staff={staff} roles={roles.map((r) => r.name)} now={adminNow().toISOString()} />
              <RolesMatrix roles={roles} modules={ADMIN_MODULES} />
            </div>
            <div className={styles.sideCol}>
              <IntegrationsCard items={integrations} />
              <AuditLogCard entries={log} />
            </div>
          </div>
        )}

        {tab === "integrations" && (
          <section className={cx(styles.card, styles.formStack)}>
            <header>
              <h2 className={styles.cardTitle}>Integrasi</h2>
              <p className={styles.muted}>API key disimpan di Supabase Vault / environment, tidak pernah di database atau browser.</p>
            </header>
            <IntegrationList items={integrations} detailed />
          </section>
        )}

        {tab !== "team" && tab !== "integrations" && <SettingsForms key={tab} tab={tab} initial={settings} />}
      </div>
    </>
  );
}
