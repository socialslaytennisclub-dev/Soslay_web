import Link from "next/link";
import { Avatar } from "@/components/ui";
import { displayPhone, waNumber } from "@/lib/wa-invite";
import { LEVEL_LABEL, MEMBER_STATUS_LABEL, formatRupiahPlain, formatRupiahShort, formatShortDate } from "@/lib/admin-labels";
import { topKudos } from "@/lib/kudos";
import type { MemberDetail, MemberKudosSummary, MemberReview, MemberSpend, MemberSpendItem, MemberTimelineItem } from "@/server/admin/types";
import { AdminIcon, type AdminIconName } from "../ui/AdminIcon";
import { AdminButton, Badge, BookingBadge, Card, desktopOnlyClass, MobileCard, MobileCardList, PaymentBadge, TierBadge } from "../ui/AdminUI";
import { BookSessionForm } from "./BookSessionForm";
import { MemberNotes } from "./MemberNotes";
import reviewStyles from "../activities/SessionReviews.module.css";
import styles from "./MemberDetail.module.css";

const TIMELINE_ICON: Record<MemberTimelineItem["kind"], AdminIconName> = {
  booking: "calendar-dots",
  attended: "check-circle",
  purchase: "shopping-bag-open",
  tier: "crown-simple",
  no_show: "warning-circle",
  profile: "user",
};

const SPEND_KIND: Record<MemberSpendItem["kind"], { label: string; icon: AdminIconName }> = {
  activity: { label: "Activity", icon: "calendar-dots" },
  trip: { label: "Trip", icon: "map-pin" },
  shop: { label: "Shop", icon: "shopping-bag-open" },
};
const SPEND_LIMIT = 10;

/** Total uang yang dibayar member: tiket activity + trip + shop, lalu daftar pembayarannya. */
function SpendCard({ spend }: { spend: MemberSpend }) {
  const parts = [
    { kind: "activity" as const, ...spend.activities, unit: "activity" },
    { kind: "trip" as const, ...spend.trips, unit: "trip" },
    { kind: "shop" as const, ...spend.shop, unit: "order" },
  ];
  const shown = spend.items.slice(0, SPEND_LIMIT);
  return (
    <Card title="Total spent" subtitle="Semua yang sudah dibayar member: tiket activity, trip & shop (status lunas)" action={<Badge tone="lime">{formatRupiahPlain(spend.total)}</Badge>}>
      <dl className={styles.spendParts}>
        {parts.map((p) => (
          <div key={p.kind} className={styles.spendPart}>
            <dt>
              <AdminIcon name={SPEND_KIND[p.kind].icon} size={14} />
              {SPEND_KIND[p.kind].label}
            </dt>
            <dd>{formatRupiahPlain(p.amount)}</dd>
            <dd className={styles.spendCount}>
              {p.count} {p.unit}
            </dd>
          </div>
        ))}
      </dl>
      {shown.length ? (
        <ul className={styles.spendList}>
          {shown.map((item, i) => (
            <li key={`${item.kind}-${item.at}-${i}`}>
              <span className={styles.timelineIcon}>
                <AdminIcon name={SPEND_KIND[item.kind].icon} size={14} />
              </span>
              <span className={styles.spendText}>
                <span className={styles.cellTitle}>{item.title}</span>
                <span className={styles.cellMeta}>
                  {SPEND_KIND[item.kind].label} · {item.detail}
                </span>
              </span>
              <span className={styles.spendAmount}>{formatRupiahPlain(item.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyNote}>Belum ada pembayaran lunas.</p>
      )}
      {spend.incomplete && <p className={styles.emptyNote}>Sebagian data pembayaran gagal dimuat — total bisa kurang dari seharusnya. Muat ulang halaman.</p>}
      {spend.items.length > SPEND_LIMIT && <p className={styles.emptyNote}>+{spend.items.length - SPEND_LIMIT} pembayaran lebih lama tidak ditampilkan.</p>}
    </Card>
  );
}

/** Kudos yang diterima member (anonim, sama dengan kartu profil member) + jumlah yang ia berikan. */
function KudosCard({ kudos }: { kudos: MemberKudosSummary }) {
  const received = kudos.received;
  const top = received ? topKudos(received, 5) : [];
  return (
    <Card title="Kudos" subtitle="Apresiasi anonim dari teman main setelah activity selesai">
      {received ? (
        <>
          <dl className={styles.kudosStats}>
            <div>
              <dt>Diterima</dt>
              <dd>{received.total.toLocaleString("id-ID")}</dd>
            </div>
            <div>
              <dt>Dari</dt>
              <dd>{received.uniqueGivers.toLocaleString("id-ID")} orang</dd>
            </div>
            <div>
              <dt>Diberikan</dt>
              <dd>{kudos.given.toLocaleString("id-ID")}</dd>
            </div>
          </dl>
          <ul className={styles.pills} aria-label="Kudos teratas">
            {top.length ? (
              top.map((c) => (
                <li key={c.key}>
                  {c.label} · {c.count}
                </li>
              ))
            ) : (
              <li className={styles.pillEmpty}>Belum ada kudos</li>
            )}
          </ul>
        </>
      ) : (
        <p className={styles.emptyNote}>Kudos gagal dimuat. Muat ulang halaman.</p>
      )}
    </Card>
  );
}

const reviewDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
const REVIEW_ASPECTS = [
  ["Host", (r: MemberReview) => r.host],
  ["Venue", (r: MemberReview) => r.venue],
  ["Format", (r: MemberReview) => r.format],
] as const;

/** Semua review yang pernah diberikan member, satu per activity (terbaru dulu). */
function ReviewsCard({ reviews }: { reviews: MemberReview[] }) {
  const avg = reviews.length ? (reviews.reduce((n, r) => n + r.rating, 0) / reviews.length).toLocaleString("id-ID", { maximumFractionDigits: 1 }) : null;
  return (
    <Card title="Review yang diberikan" subtitle={reviews.length ? `${reviews.length} review · rata-rata ★ ${avg}` : "Review dibuka setelah activity selesai, sampai 7 hari"}>
      {reviews.length === 0 ? (
        <p className={styles.emptyNote}>Member ini belum pernah memberi review.</p>
      ) : (
        <ul className={reviewStyles.list}>
          {reviews.map((r) => (
            <li key={r.sessionId} className={reviewStyles.item}>
              <div className={reviewStyles.head}>
                <Link href={`/admin/activities/${r.sessionId}`} className={reviewStyles.name}>
                  {r.sessionTitle}
                </Link>
                <span className={reviewStyles.stars} aria-label={`${r.rating} dari 5 bintang`}>
                  {stars(r.rating)}
                </span>
                {r.testimonial && <Badge tone="neutral">Boleh jadi testimoni</Badge>}
                <span className={reviewStyles.date}>{reviewDate.format(new Date(r.at))}</span>
              </div>
              <p className={styles.cellMeta}>
                {[r.venueName, r.startsAt && `activity ${reviewDate.format(new Date(r.startsAt))}`].filter(Boolean).join(" · ")}
              </p>
              {REVIEW_ASPECTS.some(([, pick]) => pick(r) !== null) && (
                <div className={reviewStyles.details}>
                  {REVIEW_ASPECTS.map(([label, pick]) => {
                    const v = pick(r);
                    return v !== null && <span key={label}>{label} {v}/5</span>;
                  })}
                </div>
              )}
              {r.highlights.length > 0 && (
                <div className={reviewStyles.tags}>
                  {r.highlights.map((h) => (
                    <span key={h} className={reviewStyles.tag}>
                      {h}
                    </span>
                  ))}
                </div>
              )}
              {r.comment && <p className={reviewStyles.comment}>{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const dateTime = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const monthYear = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
const longDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

/** Admin / 03 Member Detail (Figma 25:4301). */
export const MEMBER_TABS = [
  { key: "ringkasan", label: "Ringkasan" },
  { key: "aktivitas", label: "Aktivitas" },
  { key: "booking", label: "Booking" },
  { key: "review", label: "Review" },
  { key: "spent", label: "Total spent" },
  { key: "catatan", label: "Catatan" },
] as const;
export type MemberTab = (typeof MEMBER_TABS)[number]["key"];

export function MemberDetailView({ member, bookable, tab = "ringkasan" }: { member: MemberDetail; bookable: { id: string; label: string }[]; tab?: MemberTab }) {
  const stats: { label: string; value: string }[] = [
    { label: "Sesi diikuti", value: String(member.sessionsAttended) },
    { label: "Jam bermain", value: `${member.hoursPlayed}j` },
    { label: "Kehadiran", value: `${member.attendanceRate}%` },
    { label: "Slay Point", value: member.pointsBalance.toLocaleString("id-ID") },
    { label: "Total spent", value: formatRupiahShort(member.spend.total) },
    { label: "Terakhir main", value: formatShortDate(member.lastPlayedAt) },
  ];
  const phone = displayPhone(member.phone);
  const wa = waNumber(member.phone);

  return (
    <div className={styles.page}>
      <div className={styles.topActions}>
        <Link href="/admin/members" className={styles.back}>
          <AdminIcon name="caret-left" size={16} />
          Kembali ke Members
        </Link>
        <div className={styles.actions}>
          {wa && (
            <AdminButton href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" icon="whatsapp-logo">
              WhatsApp
            </AdminButton>
          )}
          <AdminButton href={`mailto:${member.email}`} icon="envelope-simple">
            Email
          </AdminButton>
          <AdminButton variant="primary" icon="pencil-simple" href={`/admin/members/${member.id}/edit`}>
            Edit member
          </AdminButton>
        </div>
      </div>

      {/* Header profil + statistik */}
      <section className={styles.header} aria-labelledby="member-name">
        <div className={styles.identity}>
          <Avatar name={member.fullName} size={88} />
          <div className={styles.identityText}>
            <p className={styles.nameRow}>
              <span id="member-name" className={styles.name}>
                {member.fullName}
              </span>
              <TierBadge tier={member.tier} />
              <Badge tone={member.status === "active" ? "lime" : member.status === "suspended" ? "pink" : "neutral"} dot>
                {MEMBER_STATUS_LABEL[member.status]}
              </Badge>
            </p>
            <ul className={styles.contacts}>
              <li>
                <AdminIcon name="user" size={16} />@{member.kuyId}
              </li>
              <li>
                <AdminIcon name="envelope-simple" size={16} />
                {member.email}
              </li>
              <li>
                <AdminIcon name="whatsapp-logo" size={16} />
                {phone || "—"}
              </li>
              <li>
                <AdminIcon name="map-pin" size={16} />
                {member.city}
              </li>
            </ul>
            <p className={styles.since}>
              Member sejak {monthYear.format(new Date(member.joinedAt))} · Member ID {member.memberCode}
            </p>
          </div>
        </div>
        <dl className={styles.stats}>
          {stats.map((s) => (
            <div key={s.label} className={styles.stat}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <nav className={styles.tabs} aria-label="Bagian detail member">
        {MEMBER_TABS.map((t) => (
          <Link key={t.key} href={t.key === "ringkasan" ? `/admin/members/${member.id}` : `/admin/members/${member.id}?tab=${t.key}`} scroll={false} replace className={t.key === tab ? styles.tabActive : undefined} aria-current={t.key === tab ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "ringkasan" && (
        <div className={styles.summaryGrid}>
          <KudosCard kudos={member.kudos} />

          <Card title="Tennis profile">
            <dl className={styles.facts}>
              <div>
                <dt>Level</dt>
                <dd>{LEVEL_LABEL[member.level]}</dd>
              </div>
              <div>
                <dt>Frekuensi</dt>
                <dd>{member.playFrequency}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>{member.playFormat}</dd>
              </div>
              <div>
                <dt>Tangan</dt>
                <dd>{member.hand === "Right" ? "Kanan" : member.hand === "Left" ? "Kiri" : "Keduanya"}</dd>
              </div>
              <div>
                <dt>Lama bermain</dt>
                <dd>{member.playingSince}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Community preferences">
            <div className={styles.prefGroup}>
              <p className={styles.prefLabel}>Mencari</p>
              <ul className={styles.pills}>
                {member.lookingFor.length ? member.lookingFor.map((v) => <li key={v}>{v}</li>) : <li className={styles.pillEmpty}>Belum diisi</li>}
              </ul>
            </div>
            <div className={styles.prefGroup}>
              <p className={styles.prefLabel}>Tipe event favorit</p>
              <ul className={styles.pills}>
                {member.eventTypes.length ? member.eventTypes.map((v) => <li key={v}>{v}</li>) : <li className={styles.pillEmpty}>Belum diisi</li>}
              </ul>
            </div>
          </Card>

          <Card title="Akun & kontak">
            <dl className={styles.facts}>
              <div>
                <dt>Kuy ID</dt>
                <dd>{member.kuyId}</dd>
              </div>
              <div>
                <dt>Reclub ID</dt>
                <dd>{member.reclubId ?? "—"}</dd>
              </div>
              <div>
                <dt>Instagram</dt>
                <dd>@{member.instagram}</dd>
              </div>
              <div>
                <dt>Tanggal lahir</dt>
                <dd>{member.birthDate ? longDate.format(new Date(member.birthDate)) : "—"}</dd>
              </div>
              <div>
                <dt>Gender</dt>
                <dd>{member.gender === "male" ? "Laki-laki" : member.gender === "female" ? "Perempuan" : "—"}</dd>
              </div>
            </dl>
          </Card>
        </div>
      )}

      {tab === "aktivitas" && (
        <div className={styles.panel}>
          <Card title="Riwayat aktivitas" subtitle="Semua interaksi member dengan Soslay" action={<Badge tone="indigo">Terbaru</Badge>}>
            <ol className={styles.timeline}>
              {member.timeline.map((item, i) => (
                <li key={`${item.kind}-${i}`} className={styles.timelineItem}>
                  <span className={styles.timelineIcon}>
                    <AdminIcon name={TIMELINE_ICON[item.kind]} size={16} />
                  </span>
                  <div className={styles.timelineBody}>
                    <p className={styles.timelineHead}>
                      <span className={styles.timelineTitle}>{item.title}</span>
                      <Badge tone={item.badge.tone} dot>
                        {item.badge.label}
                      </Badge>
                    </p>
                    <p className={styles.timelineDetail}>{item.detail}</p>
                    <p className={styles.timelineDate}>{dateTime.format(new Date(item.at))}</p>
                  </div>
                </li>
              ))}
              {member.timeline.length === 0 && <li className={styles.emptyNote}>Belum ada aktivitas.</li>}
            </ol>
          </Card>
        </div>
      )}

      {tab === "booking" && (
        <div className={styles.panel}>
          <Card
            title="Riwayat booking"
            subtitle={`${member.sessionsAttended} sesi · kehadiran ${member.attendanceRate}%`}
            action={
              <BookSessionForm memberId={member.id} sessions={bookable} />
            }
          >
            <MobileCardList label="Riwayat booking">
              {member.bookings.map((b, i) => (
                <MobileCard
                  key={`${b.startsAt}-${i}`}
                  title={
                    <>
                      <span className={styles.cellTitle}>{b.sessionTitle}</span>
                      <span className={styles.cellMeta}>
                        {b.venueName} · {formatShortDate(b.startsAt)}
                      </span>
                    </>
                  }
                  meta={[
                    { label: "Pembayaran", value: <PaymentBadge status={b.payment} /> },
                    { label: "Kehadiran", value: <BookingBadge status={b.status} /> },
                  ]}
                />
              ))}
            </MobileCardList>
            <div className={`${styles.tableWrap} ${desktopOnlyClass}`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Sesi</th>
                    <th>Tanggal</th>
                    <th>Pembayaran</th>
                    <th>Kehadiran</th>
                  </tr>
                </thead>
                <tbody>
                  {member.bookings.map((b, i) => (
                    <tr key={`${b.startsAt}-${i}`}>
                      <td>
                        <span className={styles.cellTitle}>{b.sessionTitle}</span>
                        <span className={styles.cellMeta}>{b.venueName}</span>
                      </td>
                      <td>{formatShortDate(b.startsAt)}</td>
                      <td>
                        <PaymentBadge status={b.payment} />
                      </td>
                      <td>
                        <BookingBadge status={b.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === "review" && (
        <div className={styles.panel}>
          <ReviewsCard reviews={member.reviews} />
        </div>
      )}

      {tab === "spent" && (
        <div className={styles.panel}>
          <SpendCard spend={member.spend} />
        </div>
      )}

      {tab === "catatan" && (
        <div className={styles.panel}>
          <Card title="Catatan internal" subtitle="Hanya terlihat oleh tim">
            <MemberNotes memberId={member.id} initial={member.notes} />
          </Card>
        </div>
      )}
    </div>
  );
}
