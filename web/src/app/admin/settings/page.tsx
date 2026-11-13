import type { Metadata } from "next";
import Link from "next/link";
import { SettingsForms } from "@/components/admin/settings/SettingsForms";
import { ShopSettingsForm } from "@/components/admin/settings/ShopSettings";
import styles from "@/components/admin/settings/Settings.module.css";
import { AuditLogCard, IntegrationList, IntegrationsCard } from "@/components/admin/settings/SidePanels";
import { RolesMatrix, TeamTable } from "@/components/admin/settings/TeamAccess";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { cx } from "@/lib/cx";
import { adminNow } from "@/server/admin/dataset";
import { getAdminSession } from "@/server/admin/session";
import { getShopSettings } from "@/server/shop/settings";
import { ADMIN_MODULES, getSettings, listAuditLog, listIntegrations, listRoles, listStaff } from "@/server/admin/settings-repo";
import pageStyles from "../page.module.css";

export const metadata: Metadata = { title: "Settings & Roles" };

const TABS = [
  { value: "team", label: "Tim & akses" },
  { value: "general", label: "Umum" },
  { value: "membership", label: "Membership & poin" },
  { value: "payment", label: "Pembayaran" },
  { value: "shop", label: "Shop & pengiriman" },
  { value: "notifications", label: "Notifikasi" },
  { value: "integrations", label: "Integrasi" },
  { value: "log", label: "Log aktivitas" },
] as const;

/** Admin / 09 Settings & Roles (Figma 25:6834). */
export default async function AdminSettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const raw = (await searchParams).tab;
  const tab = TABS.find((t) => t.value === (Array.isArray(raw) ? raw[0] : raw))?.value ?? "team";
  // Log aktivitas hanya dimuat di tab-nya sendiri (dulu di kolom kanan Tim & akses — terlalu panjang).
  const [staff, roles, integrations, log, settings, session, shop] = await Promise.all([
    listStaff(),
    listRoles(),
    listIntegrations(),
    tab === "log" ? listAuditLog() : Promise.resolve([]),
    getSettings(),
    getAdminSession(),
    tab === "shop" ? getShopSettings() : Promise.resolve(null),
  ]);

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
              <TeamTable staff={staff} roles={roles.map((r) => r.name)} now={adminNow().toISOString()} currentUserId={session.mode === "live" ? session.userId : undefined} />
              {/* key: matriks di-reset setelah izin tersimpan / role baru dibuat */}
              <RolesMatrix key={JSON.stringify(roles)} roles={roles} modules={ADMIN_MODULES} />
            </div>
            <div className={styles.sideCol}>
              <IntegrationsCard items={integrations} />
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

        {tab === "log" && <AuditLogCard entries={log} />}

        {tab === "shop" && shop && <ShopSettingsForm key={JSON.stringify(shop)} initial={shop} />}

        {tab !== "team" && tab !== "integrations" && tab !== "log" && tab !== "shop" && <SettingsForms key={tab} tab={tab} initial={settings} />}
      </div>
    </>
  );
}
