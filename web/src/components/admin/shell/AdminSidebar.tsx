"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cx } from "@/lib/cx";
import { signOut } from "@/server/auth/actions";
import { initials } from "@/lib/text";
import { AdminIcon, type AdminIconName } from "../ui/AdminIcon";
import styles from "./AdminShell.module.css";

type NavItem = { label: string; href: string; icon: AdminIconName; badge?: number; ready?: boolean };

type AdminSidebarProps = {
  memberCount: number;
  ordersToProcess: number;
  user: { name: string; role: string };
  /** Menu yang tidak boleh dilihat role ini (role_permissions = none). */
  hiddenHrefs?: string[];
  /** Login Supabase aktif → tombol Keluar berfungsi. */
  canSignOut?: boolean;
};

/** Figma 25:3187 — sidebar navy: Umum · CRM · CMS, lalu Settings, Bantuan & profil admin di bawah. */
export function AdminSidebar({ memberCount, ordersToProcess, user, hiddenHrefs = [], canSignOut = false }: AdminSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const groups: { label: string; items: NavItem[] }[] = [
    { label: "Umum", items: [{ label: "Overview", href: "/admin", icon: "squares-four", ready: true }] },
    { label: "CRM", items: [{ label: "Members", href: "/admin/members", icon: "users-three", badge: memberCount, ready: true }] },
    {
      label: "CMS",
      items: [
        { label: "Activities", href: "/admin/activities", icon: "calendar-dots", ready: true },
        { label: "Venues", href: "/admin/venues", icon: "map-pin", ready: true },
        { label: "Products", href: "/admin/products", icon: "t-shirt", ready: true },
        { label: "Orders", href: "/admin/orders", icon: "receipt", badge: ordersToProcess, ready: true },
        { label: "Konten & Galeri", href: "/admin/konten", icon: "layout", ready: true },
      ],
    },
  ];
  const bottom: NavItem[] = [
    { label: "Settings & Roles", href: "/admin/settings", icon: "gear-six", ready: true },
    { label: "Bantuan", href: "/admin/bantuan", icon: "question" },
  ];

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const renderItem = (item: NavItem) => {
    if (hiddenHrefs.includes(item.href)) return null;
    const active = isActive(item.href);
    const content = (
      <>
        <AdminIcon name={item.icon} size={20} />
        <span className={styles.navLabel}>{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && <span className={styles.navBadge}>{item.badge.toLocaleString("id-ID")}</span>}
      </>
    );
    // Modul yang belum dibangun (tahap berikutnya) tampil tapi belum bisa diklik.
    return item.ready ? (
      <Link
        key={item.href}
        href={item.href}
        className={cx(styles.navItem, active && styles.navActive)}
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen(false)} // drawer HP tertutup setelah memilih menu
      >
        {content}
      </Link>
    ) : (
      <span key={item.href} className={cx(styles.navItem, styles.navDisabled)} aria-disabled="true" title="Dibangun di tahap berikutnya">
        {content}
      </span>
    );
  };

  return (
    <>
      <div className={styles.mobileBar}>
        <Image src="/images/brand/logo-lime.webp" alt="Slay Club" width={85} height={24} />
        <button type="button" className={styles.menuButton} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="admin-sidebar">
          <AdminIcon name={open ? "x" : "list-bullets"} size={22} />
          <span className="visually-hidden">Menu admin</span>
        </button>
      </div>

      <aside id="admin-sidebar" className={cx(styles.sidebar, open && styles.sidebarOpen)}>
        <div className={styles.brand}>
          <Image src="/images/brand/logo-lime.webp" alt="Slay Club" width={85} height={24} />
          <span className={styles.adminChip}>Admin</span>
        </div>

        <nav className={styles.nav} aria-label="Menu admin">
          {groups
            .filter((group) => group.items.some((item) => !hiddenHrefs.includes(item.href)))
            .map((group) => (
            <div key={group.label} className={styles.navGroup}>
              <p className={styles.navGroupLabel}>{group.label}</p>
              {group.items.map(renderItem)}
            </div>
          ))}
        </nav>

        <div className={styles.navBottom}>{bottom.map(renderItem)}</div>

        <div className={styles.profile}>
          <span className={styles.profileAvatar}>{initials(user.name)}</span>
          <span className={styles.profileText}>
            <span className={styles.profileName}>{user.name}</span>
            <span className={styles.profileRole}>{user.role}</span>
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className={styles.signOut}
              title={canSignOut ? "Keluar" : "Keluar (aktif setelah login Supabase tersambung)"}
              disabled={!canSignOut}
            >
              <AdminIcon name="sign-out" size={20} />
              <span className="visually-hidden">Keluar</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
