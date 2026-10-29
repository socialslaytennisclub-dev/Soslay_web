"use client";

import Link from "next/link";
import { useRef } from "react";
import { Button, Container, Icon, Logo } from "@/components/ui";
import { authLinks, primaryNav } from "@/content/site";
import { useCart } from "@/hooks/useCart";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useMemberUser, type MemberUser } from "@/hooks/useMemberUser";
import { useDisclosure } from "@/hooks/useDisclosure";
import { useScrolled } from "@/hooks/useScrolled";
import { cx } from "@/lib/cx";
import { firstName, initials } from "@/lib/text";
import { signOut } from "@/server/auth/actions";
import styles from "./Navbar.module.css";

/** Menu akun member di navbar (sesudah login). */
const ACCOUNT_LINKS = [
  { label: "Dashboard", href: "/akun" },
  { label: "My Activities", href: "/akun/aktivitas" },
  { label: "Order", href: "/akun/order" },
  { label: "Edit Profil", href: "/akun/profil" },
];

type NavbarProps = {
  /** `overlay` = transparan di atas hero foto, jadi solid saat scroll. */
  variant?: "overlay" | "solid";
  /** Member yang login, dari server (area /akun) — tanpa itu dibaca dari cookie sesi di browser. */
  member?: MemberUser | null;
};

export function Navbar({ variant = "solid", member: initialMember }: NavbarProps) {
  const scrolled = useScrolled();
  const menu = useDisclosure({ lockScroll: true });
  const dropdown = useDisclosure();
  const dropdownRef = useRef<HTMLLIElement>(null);
  const account = useDisclosure();
  const accountRef = useRef<HTMLDivElement>(null);
  const cart = useCart();
  const member = useMemberUser(initialMember);
  useClickOutside(dropdownRef, dropdown.close, dropdown.isOpen);
  useClickOutside(accountRef, account.close, account.isOpen);

  const { activity, links } = primaryNav;
  const isSolid = variant === "solid" || scrolled || menu.isOpen;

  return (
    <header className={cx(styles.header, isSolid && styles.solid)}>
      <Container className={styles.bar}>
        <div className={styles.left}>
          <Logo tone="lime" />

          <nav aria-label="Main navigation" className={styles.desktopNav}>
            <ul className={styles.navList}>
              <li
                ref={dropdownRef}
                className={styles.dropdown}
                onMouseEnter={dropdown.open}
                onMouseLeave={dropdown.close}
              >
                <button
                  type="button"
                  className={styles.navItem}
                  aria-expanded={dropdown.isOpen}
                  aria-controls="nav-activity-menu"
                  // Mouse/tap: hover sudah membuka → klik cukup memastikan terbuka.
                  // Keyboard (detail 0): Enter/Space men-toggle.
                  onClick={(event) => (event.detail === 0 ? dropdown.toggle() : dropdown.open())}
                >
                  {activity.label}
                  <Icon name="caret-down-bold" size={18} className={cx(styles.caret, dropdown.isOpen && styles.caretOpen)} />
                </button>
                <ul id="nav-activity-menu" className={cx(styles.dropdownMenu, dropdown.isOpen && styles.dropdownOpen)}>
                  {activity.children.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className={styles.dropdownLink} onClick={dropdown.close}>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href={activity.href} className={cx(styles.dropdownLink, styles.dropdownAll)} onClick={dropdown.close}>
                      Lihat semua aktivitas
                    </Link>
                  </li>
                </ul>
              </li>
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={styles.navItem}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className={styles.right}>
          <Link
            href={authLinks.cart.href}
            className={styles.cart}
            data-cart-target
            aria-label={cart.count > 0 ? `${authLinks.cart.label}, ${cart.count} item` : authLinks.cart.label}
          >
            <Icon name="shopping-bag-open" />
            {cart.count > 0 && (
              <span key={cart.count} className={styles.cartBadge} aria-hidden>
                {cart.count}
              </span>
            )}
          </Link>
          <span className={styles.divider} aria-hidden />
          {member ? (
            // Sudah login (Figma): pill avatar inisial + nama depan, menu akun.
            <div ref={accountRef} className={styles.account}>
              <button type="button" className={styles.accountButton} aria-expanded={account.isOpen} aria-controls="nav-account-menu" onClick={account.toggle}>
                <span className={styles.accountAvatar} aria-hidden>
                  {member.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- avatar kecil dari Storage
                    <img src={member.photo} alt="" className={styles.accountPhoto} />
                  ) : (
                    initials(member.name)
                  )}
                </span>
                <span className={styles.accountName}>{firstName(member.name)}</span>
                <Icon name="caret-down-bold" size={14} className={cx(styles.caret, account.isOpen && styles.caretOpen)} />
              </button>
              <ul id="nav-account-menu" className={cx(styles.accountMenu, account.isOpen && styles.accountMenuOpen)}>
                {ACCOUNT_LINKS.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={styles.dropdownLink} onClick={account.close}>
                      {item.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <form action={signOut}>
                    <button type="submit" className={cx(styles.dropdownLink, styles.signOut)}>
                      Keluar
                    </button>
                  </form>
                </li>
              </ul>
            </div>
          ) : (
            <Button href={authLinks.login.href} variant="primary" size="sm" className={styles.login}>
              {authLinks.login.label}
            </Button>
          )}
          <button
            type="button"
            className={cx(styles.burger, menu.isOpen && styles.burgerOpen)}
            aria-label={menu.isOpen ? "Close menu" : "Open menu"}
            aria-expanded={menu.isOpen}
            aria-controls="nav-mobile-menu"
            onClick={menu.toggle}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </Container>

      <nav
        id="nav-mobile-menu"
        aria-label="Main navigation"
        className={cx(styles.mobileMenu, menu.isOpen && styles.mobileMenuOpen)}
        hidden={!menu.isOpen}
      >
        <Container className={styles.mobileInner}>
          <p className={styles.mobileGroupLabel}>{activity.label}</p>
          <ul className={styles.mobileList}>
            {activity.children.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.mobileLink} onClick={menu.close}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className={styles.mobileList}>
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={cx(styles.mobileLink, styles.mobileLinkLarge)} onClick={menu.close}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          {member ? (
            <div className={styles.mobileAccount}>
              <Button href="/akun" variant="primary" onClick={menu.close}>
                Akun {firstName(member.name)}
              </Button>
              <form action={signOut}>
                <button type="submit" className={styles.mobileSignOut}>
                  Keluar
                </button>
              </form>
            </div>
          ) : (
            <Button href={authLinks.login.href} variant="primary" onClick={menu.close}>
              {authLinks.login.label}
            </Button>
          )}
        </Container>
      </nav>
    </header>
  );
}
