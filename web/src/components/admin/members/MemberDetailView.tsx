import Link from "next/link";
import { Avatar } from "@/components/ui";
import { LEVEL_LABEL, MEMBER_STATUS_LABEL, formatRupiahShort, formatShortDate } from "@/lib/admin-labels";
import type { MemberDetail, MemberTimelineItem } from "@/server/admin/types";
import { AdminIcon, type AdminIconName } from "../ui/AdminIcon";
import { AdminButton, Badge, BookingBadge, Card, desktopOnlyClass, MobileCard, MobileCardList, PaymentBadge, TierBadge } from "../ui/AdminUI";
import { MemberNotes } from "./MemberNotes";
import styles from "./MemberDetail.module.css";

const TIMELINE_ICON: Record<MemberTimelineItem["kind"], AdminIconName> = {
  booking: "calendar-dots",
  attended: "check-circle",
  purchase: "shopping-bag-open",
  tier: "crown-simple",
  no_show: "warning-circle",
  profile: "user",
};

const dateTime = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const monthYear = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
const longDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

/** Admin / 03 Member Detail (Figma 25:4301). */
export function MemberDetailView({ member }: { member: MemberDetail }) {
  const stats: { label: string; value: string }[] = [
    { label: "Sesi diikuti", value: String(member.sessionsAttended) },
    { label: "Jam bermain", value: `${member.hoursPlayed}j` },
    { label: "Kehadiran", value: `${member.attendanceRate}%` },
    { label: "Slay Point", value: member.pointsBalance.toLocaleString("id-ID") },
    { label: "Total belanja", value: formatRupiahShort(member.totalSpent) },
    { label: "Terakhir main", value: formatShortDate(member.lastPlayedAt) },
  ];
  const phone = `+62 ${member.phone.replace(/(\d{3})(\d{4})(\d+)/, "$1 $2 $3")}`;

  return (
    <div className={styles.page}>
      <div className={styles.topActions}>
        <Link href="/admin/members" className={styles.back}>
          <AdminIcon name="caret-left" size={16} />
          Kembali ke Members
        </Link>
        <div className={styles.actions}>
          <AdminButton href={`https://wa.me/62${member.phone}`} target="_blank" rel="noopener noreferrer" icon="whatsapp-logo">
            WhatsApp
          </AdminButton>
          <AdminButton href={`mailto:${member.email}`} icon="envelope-simple">
            Email
          </AdminButton>
          <AdminButton variant="primary" icon="pencil-simple" disabled title="Aktif setelah database Supabase tersambung">
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
                {phone}
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
        <a href="#ringkasan" className={styles.tabActive} aria-current="true">
          Ringkasan
        </a>
        <a href="#aktivitas">Aktivitas</a>
        <a href="#booking">Booking</a>
        <a href="#catatan">Catatan</a>
      </nav>

      <div id="ringkasan" className={styles.columns}>
        <div className={styles.main}>
          <Card title="Riwayat aktivitas" subtitle="Semua interaksi member dengan Soslay" action={<Badge tone="indigo">Terbaru</Badge>}>
            <ol id="aktivitas" className={styles.timeline}>
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

          <Card
            title="Riwayat booking"
            subtitle={`${member.sessionsAttended} sesi · kehadiran ${member.attendanceRate}%`}
            action={
              <AdminButton icon="calendar-plus" size="sm" disabled title="Aktif setelah database Supabase tersambung">
                Booking-kan sesi
              </AdminButton>
            }
          >
            <span id="booking" className={styles.anchor} />
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

        <aside className={styles.side}>
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

          <Card title="Catatan internal" subtitle="Hanya terlihat oleh tim">
            <div id="catatan">
              <MemberNotes initial={member.notes} />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
