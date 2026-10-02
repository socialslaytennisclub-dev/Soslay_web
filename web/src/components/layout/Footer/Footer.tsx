import Link from "next/link";
import { Button, Container, Logo, Text } from "@/components/ui";
import { contact, copyright, footerColumns, socialLinks } from "@/content/site";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <Container className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <div className={styles.brandIntro}>
              <Logo tone="navy" size="lg" />
              <Text variant="body-16" tone="primary" muted className={styles.tagline}>
                {contact.tagline}
              </Text>
            </div>
            <dl className={styles.contact}>
              {[contact.phone, contact.email].map((item) => (
                <div key={item.label} className={styles.contactRow}>
                  <dt>{item.label}</dt>
                  <dd>
                    <a href={item.href}>{item.value}</a>
                  </dd>
                </div>
              ))}
            </dl>
            <Text variant="body-16" tone="primary" muted className={styles.copyright}>
              {copyright}
            </Text>
          </div>

          <div className={styles.columns} data-anim="stagger">
            {footerColumns.map((column) => (
              <nav key={column.title} aria-label={column.title} className={styles.column}>
                <Text as="h2" variant="subtitle-20" tone="primary" muted>
                  {column.title}
                </Text>
                <ul className={styles.links}>
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className={styles.link}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
            <div className={styles.column}>
              <Text as="h2" variant="subtitle-20" tone="primary" muted>
                Ikuti Kami
              </Text>
              <ul className={styles.socials}>
                {socialLinks.map((social) => (
                  <li key={social.label}>
                    <Button
                      href={social.href}
                      variant="social"
                      icon={social.icon}
                      aria-label={social.label}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className={styles.wordmarkWrap} aria-hidden>
          <Text as="span" variant="wordmark" tone="primary" className={styles.wordmark} data-anim="wordmark">
            SOSLAY
          </Text>
        </div>
        <hr className={styles.rule} />
      </Container>
    </footer>
  );
}
