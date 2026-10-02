"use client";

import Link from "next/link";
import { useRef } from "react";
import { Button, Container, Icon, Logo } from "@/components/ui";
import { authLinks, primaryNav } from "@/content/site";
import { useCart } from "@/hooks/useCart";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useDisclosure } from "@/hooks/useDisclosure";
import { useScrolled } from "@/hooks/useScrolled";
import { cx } from "@/lib/cx";
import styles from "./Navbar.module.css";

type NavbarProps = {
  /** `overlay` = transparan di atas hero foto, jadi solid saat scroll. */
  variant?: "overlay" | "solid";
};

export function Navbar({ variant = "solid" }: NavbarProps) {
  const scrolled = useScrolled();
  const menu = useDisclosure({ lockScroll: true });
  const dropdown = useDisclosure();
  const dropdownRef = useRef<HTMLLIElement>(null);
  const cart = useCart();
  useClickOutside(dropdownRef, dropdown.close, dropdown.isOpen);

  const { activity, links } = primaryNav;
  const isSolid = variant === "solid" || scrolled || menu.isOpen;

  return (
    <header className={cx(styles.header, isSolid && styles.solid)}>
      <Container className={styles.bar}>
        <div className={styles.left}>
          <Logo tone="lime" />

          <nav aria-label="Navigasi utama" className={styles.desktopNav}>
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
          <Button href={authLinks.login.href} variant="primary" size="sm" className={styles.login}>
            {authLinks.login.label}
          </Button>
          <button
            type="button"
            className={cx(styles.burger, menu.isOpen && styles.burgerOpen)}
            aria-label={menu.isOpen ? "Tutup menu" : "Buka menu"}
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
        aria-label="Navigasi utama"
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
          <Button href={authLinks.login.href} variant="primary" onClick={menu.close}>
            {authLinks.login.label}
          </Button>
        </Container>
      </nav>
    </header>
  );
}
