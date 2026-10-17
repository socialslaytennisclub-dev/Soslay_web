import { Button, Container } from "@/components/ui";
import styles from "./MemberCta.module.css";

const content = {
  eyebrow: "Soslay member · Collect points",
  title: ["Joined an activity?", "Don't forget to become a member."],
  body: "Every session you complete automatically earns points. Collect them and redeem them for SOSLAY merch, booking discounts, and early access to favorite slots.",
  perks: ["+50 points per completed session", "Redeem merch & booking discounts", "Early access to favorite slots"],
  cta: { label: "Become a Member — It's Free", href: "/daftar" },
  caption: "Just 1 minute · points active instantly",
};

/** Figma Website v2 375:4721 — kartu navy ajakan jadi member (Venue detail & Participant Guide). */
export function MemberCta({ embedded = false }: { embedded?: boolean }) {
  const card = (
    <aside className={styles.card} aria-labelledby="member-cta-title" data-anim="fade-up">
      <div className={styles.text}>
        <p className={styles.eyebrow}>{content.eyebrow}</p>
        <h2 id="member-cta-title" className={styles.title}>
          {content.title[0]} <br className={styles.break} />
          {content.title[1]}
        </h2>
        <p className={styles.body}>{content.body}</p>
        <ul className={styles.perks}>
          {content.perks.map((perk) => (
            <li key={perk}>
              <span aria-hidden className={styles.check}>
                ✓
              </span>
              {perk}
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.action}>
        <Button href={content.cta.href} variant="arrow">
          {content.cta.label}
        </Button>
        <p className={styles.caption}>{content.caption}</p>
      </div>
    </aside>
  );
  // `embedded`: sudah berada di dalam Container section lain (mis. Quick Tips di guide).
  if (embedded) return card;
  return (
    <section className={styles.section}>
      <Container>{card}</Container>
    </section>
  );
}
