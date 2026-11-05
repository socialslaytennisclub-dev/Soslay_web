"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CircleCheck } from "lucide-react";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { formatRupiahPlain } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { dayLabel, PAY_STATUS_LABEL, PLAN_LABEL, tripDates, tripRange, weekday, weekdayRange } from "@/lib/trips";
import type { MemberTrip } from "@/server/member/trips";
import styles from "./TripPage.module.css";

type Tab = "rundown" | "activities" | "termasuk";

/** Halaman trip member (Figma MT-2): paket & sisa pembayaran, tab Rundown · Activities · Termasuk. */
export function TripPage({ trip }: { trip: MemberTrip }) {
  const router = useRouter();
  const p = trip.package;
  const tabs: { value: Tab; label: string }[] = [
    ...(trip.rundown.length ? [{ value: "rundown" as const, label: "Rundown" }] : []),
    { value: "activities", label: `Activities (${trip.activities.length})` },
    ...(trip.inclusions.length ? [{ value: "termasuk" as const, label: "Termasuk" }] : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0].value);
  const days = tripDates(trip.startsOn, trip.endsOn).filter((d) => trip.rundown.some((r) => r.day === d));
  const [day, setDay] = useState(days[0] ?? trip.startsOn);
  const wa = p && p.remaining > 0 ? `${trip.adminWa}?text=${encodeURIComponent(`Halo admin Soslay, saya mau konfirmasi pelunasan paket ${trip.title} (sisa ${formatRupiahPlain(p.remaining)}). Bukti transfer saya kirim di sini ya.`)}` : null;
  const activityHref = (slug: string | null) => (slug ? `/akun/aktivitas/${slug}` : null);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <Image src={trip.image} alt="" fill priority sizes="100vw" className={styles.heroImage} />
        <div className={styles.heroInner}>
          <button type="button" className={styles.back} aria-label="Kembali" onClick={() => router.back()}>
            <ChevronLeft size={20} aria-hidden />
          </button>
          <span className={styles.eyebrow}>★ Special event · Tennis trip</span>
          <h1 className={styles.title}>{trip.title}</h1>
          <p className={styles.heroMeta}>
            {weekdayRange(trip.startsOn, trip.endsOn)}, {tripRange(trip.startsOn, trip.endsOn)}
            {trip.area ? ` · ${trip.area.replace(/^[^·]*·\s*/, "").replace(/,\s*/g, " · ")}` : ""}
          </p>
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.card} aria-labelledby="paket-kamu">
          <p className={styles.cardHead}>
            <span id="paket-kamu">{p ? "Paket kamu" : "Tiket kamu"}</span>
            {p && <span className={cx(styles.status, p.status === "paid" ? styles.statusPaid : styles.statusDue)}>{PAY_STATUS_LABEL[p.status]}</span>}
          </p>
          {p ? (
            <>
              <h2 className={styles.cardTitle}>Bundling · {PLAN_LABEL[p.plan]}</h2>
              <p className={styles.muted}>
                Terdaftar di {trip.activities.length} activity{trip.inclusions.length ? ` + ${trip.inclusions.filter((i) => !/activity/i.test(i)).slice(0, 4).join(", ").toLowerCase()}` : ""}.
              </p>
              <div className={styles.money}>
                <span>
                  <small>Sudah dibayar</small>
                  <strong>{formatRupiahPlain(p.paid)}</strong>
                </span>
                <span>
                  <small>{p.remaining > 0 ? `Sisa · s.d. ${p.due}` : "Sisa"}</small>
                  <strong className={p.remaining > 0 ? styles.due : undefined}>{p.remaining > 0 ? formatRupiahPlain(p.remaining) : "Lunas"}</strong>
                </span>
              </div>
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className={styles.waButton}>
                  <Icon name="whatsapp-logo-fill" size={18} /> Konfirmasi pelunasan ke admin
                </a>
              )}
            </>
          ) : (
            <>
              <h2 className={styles.cardTitle}>Tiket satuan</h2>
              <p className={styles.muted}>Kamu terdaftar di {trip.activities.length} activity trip ini. Rundown & fasilitas trip khusus pembeli paket bundling.</p>
            </>
          )}
        </section>

        <div className={styles.tabs} role="tablist" aria-label="Info trip">
          {tabs.map((t) => (
            <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} className={cx(styles.tab, tab === t.value && styles.tabOn)} onClick={() => setTab(t.value)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "rundown" && (
          <>
            <div className={styles.days}>
              {days.map((d, i) => (
                <button key={d} type="button" aria-pressed={d === day} className={cx(styles.day, d === day && styles.dayOn)} onClick={() => setDay(d)}>
                  Hari {i + 1} · {weekday(d)}
                </button>
              ))}
            </div>
            <ol className={styles.list}>
              {trip.rundown
                .filter((r) => r.day === day)
                .map((r, i) => {
                  const href = r.activity ? activityHref(r.activity.slug) : null;
                  return (
                    <li key={`${r.time}-${i}`} className={styles.item}>
                      <span className={styles.time}>{r.time.split(" ")[0]}</span>
                      <span className={styles.itemText}>
                        <strong>{r.title}</strong>
                        {r.location && <small>{r.location}</small>}
                        {r.activity &&
                          (href ? (
                            <Link href={href} className={styles.activityChip}>
                              <Icon name="tennis-ball-bold" size={14} /> Activity {r.activity.order} · lihat line-up & skor <ChevronRight size={12} aria-hidden />
                            </Link>
                          ) : (
                            <span className={styles.activityChip}>
                              <Icon name="tennis-ball-bold" size={14} /> Activity {r.activity.order}
                            </span>
                          ))}
                      </span>
                    </li>
                  );
                })}
            </ol>
          </>
        )}

        {tab === "activities" && (
          <ol className={styles.list}>
            {trip.activities.map((a) => {
              const href = activityHref(a.slug);
              const body = (
                <>
                  <span className={styles.number}>{a.order}</span>
                  <span className={styles.itemText}>
                    <strong>{a.title}</strong>
                    <small>
                      {dayLabel(a.day)} · {a.start}–{a.end} · {a.venue}
                    </small>
                  </span>
                  {href && <ChevronRight size={16} aria-hidden />}
                </>
              );
              return (
                <li key={a.order} className={styles.item}>
                  {href ? (
                    <Link href={href} className={styles.itemLink}>
                      {body}
                    </Link>
                  ) : (
                    <span className={styles.itemLink}>{body}</span>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {tab === "termasuk" && (
          <ul className={styles.list}>
            {trip.inclusions.map((item) => (
              <li key={item} className={styles.item}>
                <Icon name="seal-check-fill" size={18} className={styles.check} />
                <span className={styles.itemText}>
                  <strong>{item}</strong>
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className={styles.note}>
          <CircleCheck size={16} aria-hidden /> Detail tiap lapangan (peserta, line-up, live skor) tetap di halaman activity masing-masing.
        </p>
      </div>
    </div>
  );
}
