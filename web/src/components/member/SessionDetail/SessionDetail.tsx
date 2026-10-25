import Link from "next/link";
import {
  CalendarDays,
  CalendarPlus,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Lock,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  SquareArrowOutUpRight,
  Trophy,
  Users,
  Volleyball,
} from "lucide-react";
import { Container } from "@/components/ui";
import { cx } from "@/lib/cx";
import { CITY_TZ_LABEL, formatAngka, formatJamRange, formatRupiah, formatTanggalISO, formatTanggalPendek } from "@/lib/format";
import { initials } from "@/lib/text";
import type { MemberSessionDetail } from "@/server/member/session-detail";
import { Countdown } from "./Countdown";
import { ParticipantList } from "./ParticipantList";
import { QrCheckIn } from "./QrCheckIn";
import styles from "./SessionDetail.module.css";

export const DETAIL_TABS = [
  { key: "info", label: "Info" },
  { key: "peserta", label: "Peserta" },
  { key: "live", label: "Live" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "ronde", label: "Ronde" },
] as const;

export type DetailTab = (typeof DETAIL_TABS)[number]["key"];

const PANITIA_WA = "62642424792";
const BRING = ["Raket tenis", "Sepatu non-marking", "Botol minum", "Handuk & baju ganti", "QR e-ticket"];

const STATUS_CHIP = { upcoming: "Terdaftar", live: "Sedang berlangsung", done: "Selesai" } as const;

const wa = (text: string) => `https://wa.me/${PANITIA_WA}?text=${encodeURIComponent(text)}`;

function calendarUrl(d: MemberSessionDetail) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: d.title,
    dates: `${stamp(d.startsAt)}/${stamp(d.endsAt)}`,
    details: `Social Slay Tennis Club · ${d.typeLabel}. Bawa QR e-ticket untuk check-in.`,
    location: `${d.venue.name}, ${d.venue.address}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Halaman detail sesi peserta (Figma UIF-06 · Activity Detail). Tab via ?tab= supaya bisa dibagikan. */
export function SessionDetail({ detail: d, tab }: { detail: MemberSessionDetail; tab: DetailTab }) {
  const routeUrl = d.venue.mapsUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.venue.name} ${d.venue.address}`)}`;

  return (
    <>
      <header className={styles.top}>
        <Container className={styles.topInner}>
          <p className={styles.back}>
            <Link href="/akun/aktivitas">
              <ChevronLeft size={16} aria-hidden />
              Kembali ke My Activities
            </Link>
            <span className={cx(styles.status, styles[`status_${d.phase}`])}>{d.ticket.status === "attended" ? "Hadir" : STATUS_CHIP[d.phase]}</span>
          </p>
          <h1 className={styles.title}>{d.title}</h1>
          <p className={styles.meta}>
            {formatTanggalPendek(d.startsAt, d.city)} · {formatJamRange(d.start, d.end, "–")} · {d.venue.name}
          </p>
          <nav className={styles.tabs} aria-label="Bagian detail sesi">
            {DETAIL_TABS.map((t) => (
              <Link key={t.key} href={t.key === "info" ? "?" : `?tab=${t.key}`} scroll={false} replace className={cx(styles.tab, tab === t.key && styles.tabOn)} aria-current={tab === t.key ? "page" : undefined}>
                {t.label}
              </Link>
            ))}
          </nav>
        </Container>
      </header>

      <div className={styles.body}>
        <Container className={styles.grid}>
          <div className={styles.main}>
            {tab === "info" && <InfoTab detail={d} />}
            {tab === "peserta" && (
              <section className={styles.card} aria-labelledby="peserta-title">
                <header className={styles.cardHead}>
                  <div>
                    <h2 id="peserta-title" className={styles.cardTitle}>
                      Peserta
                    </h2>
                    <p className={styles.muted}>
                      {d.people.length}/{d.capacity} slot terisi · check-in dibuka {formatTanggalPendek(d.checkInAt, d.city, "dateTime")}
                    </p>
                  </div>
                </header>
                <ParticipantList people={d.people} />
              </section>
            )}
            {tab === "live" && <LiveTab detail={d} />}
            {tab === "leaderboard" && <LeaderboardTab detail={d} />}
            {tab === "ronde" && <RoundsTab detail={d} />}
          </div>

          <aside className={styles.side}>
            <section className={styles.ticket} aria-label="E-ticket">
              <header className={styles.ticketHead}>
                <span className={styles.eyebrow}>E-ticket</span>
                <span className={styles.ticketChip}>{d.ticket.status === "attended" ? "Sudah check-in" : "Terdaftar"}</span>
              </header>
              <h2 className={styles.ticketTitle}>{d.title}</h2>
              <div className={styles.qr} dangerouslySetInnerHTML={{ __html: d.ticket.qrSvg }} role="img" aria-label={`QR e-ticket ${d.ticket.code}`} />
              <p className={styles.code}>
                <span>Kode booking</span>
                <strong>{d.ticket.code}</strong>
              </p>
              <dl className={styles.ticketMeta}>
                <div>
                  <dt>Nama</dt>
                  <dd>{d.ticket.holder}</dd>
                </div>
                <div>
                  <dt>Tipe tiket</dt>
                  <dd>{d.ticket.type}</dd>
                </div>
              </dl>
              {d.phase !== "done" && (
                <QrCheckIn
                  qrSvg={d.ticket.qrSvg}
                  code={d.ticket.code}
                  holder={`${d.ticket.holder} · ${d.ticket.type}`}
                  title={d.title}
                  openNote={`Check-in dibuka ${formatTanggalPendek(d.checkInAt, d.city)} pukul ${formatTanggalPendek(d.checkInAt, d.city, "time")} ${CITY_TZ_LABEL[d.city]}`}
                />
              )}
            </section>

            <section className={styles.card} aria-labelledby="daftar-title">
              <header className={styles.cardHead}>
                <h2 id="daftar-title" className={styles.cardTitle}>
                  Info Pendaftaran
                </h2>
                <span className={cx(styles.pill, d.registration.paid ? styles.pillOk : styles.pillWarn)}>{d.registration.paid ? "Lunas" : "Menunggu"}</span>
              </header>
              <div className={styles.payBox}>
                <span className={styles.payIcon}>
                  <CreditCard size={18} aria-hidden />
                </span>
                <span>
                  <small>Sumber pembayaran</small>
                  <strong>{d.registration.sourceLabel}</strong>
                </span>
              </div>
              <dl className={styles.rows}>
                {d.registration.orderId && (
                  <div>
                    <dt>No. registrasi Kuyy</dt>
                    <dd>{d.registration.orderId}</dd>
                  </div>
                )}
                {d.registration.amount > 0 && (
                  <div>
                    <dt>Dibayar</dt>
                    <dd>{formatRupiah(d.registration.amount)}</dd>
                  </div>
                )}
                <div>
                  <dt>Tanggal daftar</dt>
                  <dd>{formatTanggalPendek(d.registration.registeredAt, d.city, "dateTime")}</dd>
                </div>
              </dl>
              <p className={styles.small}>Pembayaran diproses di Kuyy · tiket non-refundable.</p>
              {d.registration.kuyUrl && (
                <a className={styles.link} href={d.registration.kuyUrl} target="_blank" rel="noopener noreferrer">
                  Lihat pesanan di Kuyy
                  <SquareArrowOutUpRight size={14} aria-hidden />
                </a>
              )}
            </section>

            <section className={styles.card} aria-labelledby="bantuan-title">
              <h2 id="bantuan-title" className={styles.cardTitle}>
                Butuh sesuatu?
              </h2>
              <ul className={styles.helpList}>
                <HelpLink href={calendarUrl(d)} icon={<CalendarPlus size={18} />} title="Tambah ke kalender" sub="Google Calendar" />
                <HelpLink href={routeUrl} icon={<MapIcon size={18} />} title="Buka rute ke venue" sub={`${d.venue.name}, ${d.venue.address}`} />
                <HelpLink href={wa(`Halo panitia Soslay, aku mau tanya soal sesi "${d.title}" (${d.ticket.code}).`)} icon={<MessageCircle size={18} />} title="Hubungi panitia" sub="WhatsApp Soslay Club" />
              </ul>
              {d.phase === "upcoming" && (
                <div className={styles.absent}>
                  <a href={wa(`Halo panitia Soslay, aku ${d.ticket.holder} (${d.ticket.code}) tidak bisa hadir di sesi "${d.title}".`)} target="_blank" rel="noopener noreferrer">
                    Tidak bisa hadir? Kabari host
                  </a>
                  <p className={styles.small}>Tiket non-refundable. Kabari host supaya acakan pemain bisa disesuaikan sebelum sesi mulai.</p>
                </div>
              )}
            </section>
          </aside>
        </Container>
      </div>
    </>
  );
}

function HelpLink({ href, icon, title, sub }: { href: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noopener noreferrer" className={styles.help}>
        <span className={styles.helpIcon} aria-hidden>
          {icon}
        </span>
        <span className={styles.helpText}>
          <strong>{title}</strong>
          <small>{sub}</small>
        </span>
        <ChevronRight size={18} aria-hidden className={styles.helpCaret} />
      </a>
    </li>
  );
}

function InfoTab({ detail: d }: { detail: MemberSessionDetail }) {
  const facts = [
    { icon: <CalendarDays size={18} />, label: "Tanggal", value: formatTanggalISO(d.date, d.city) },
    { icon: <Clock size={18} />, label: "Waktu", value: `${formatJamRange(d.start, d.end, " – ")} ${CITY_TZ_LABEL[d.city]}` },
    { icon: <MapPin size={18} />, label: "Lokasi", value: `${d.venue.name}, ${d.venue.address}` },
    { icon: <Volleyball size={18} />, label: "Format", value: d.format.lineup ? `${d.format.label} · ${d.format.targetPoints} poin/match` : d.typeLabel },
    { icon: <Users size={18} />, label: "Peserta", value: `${d.people.length} pemain${d.format.lineup ? ` · ${d.format.courts} court` : ""}` },
    { icon: <Trophy size={18} />, label: "Level", value: d.levels.length ? d.levels.join(", ") : "Semua level" },
  ];
  const others = d.people.filter((p) => !p.me).map((p) => p.name);
  const named = others.slice(0, 3).map((n) => n.split(" ")[0]);
  const rest = others.length - named.length;

  return (
    <>
      {d.phase === "upcoming" && (
        <section className={styles.banner}>
          <div>
            <span className={styles.eyebrowDark}>Sesi dimulai dalam</span>
            <h2 className={styles.bannerTitle}>Siap turun ke court?</h2>
            <p>
              Check-in dibuka pukul {formatTanggalPendek(d.checkInAt, d.city, "time")} {CITY_TZ_LABEL[d.city]}. Datang 30 menit lebih awal untuk registrasi & pembagian court.
            </p>
          </div>
          <Countdown target={d.startsAt} />
        </section>
      )}
      {d.phase === "live" && (
        <section className={styles.banner}>
          <div>
            <span className={styles.eyebrowDark}>Sedang berlangsung</span>
            <h2 className={styles.bannerTitle}>Sesi sudah dimulai</h2>
            <p>Tunjukkan QR e-ticket ke panitia kalau belum check-in. Cek tab Ronde untuk court & partner kamu.</p>
          </div>
        </section>
      )}

      <section className={styles.card} aria-labelledby="detail-title">
        <h2 id="detail-title" className={styles.cardTitle}>
          Detail Sesi
        </h2>
        <dl className={styles.facts}>
          {facts.map((f) => (
            <div key={f.label} className={styles.fact}>
              <span className={styles.factIcon} aria-hidden>
                {f.icon}
              </span>
              <span>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </span>
            </div>
          ))}
        </dl>
        {d.description && <p className={styles.description}>{d.description}</p>}
      </section>

      <section className={styles.card} aria-labelledby="ringkas-peserta">
        <header className={styles.cardHead}>
          <h2 id="ringkas-peserta" className={styles.cardTitle}>
            Peserta
          </h2>
          <span className={styles.pill}>
            {d.people.length}/{d.capacity} slot terisi
          </span>
        </header>
        <ul className={styles.faces} aria-label="Peserta sesi">
          {d.people.slice(0, 7).map((p, i) => (
            <li key={p.id} className={cx(styles.face, styles[`face${i % 4}`])} title={p.name}>
              {initials(p.name)}
            </li>
          ))}
          {d.people.length > 7 && <li className={cx(styles.face, styles.faceMore)}>+{d.people.length - 7}</li>}
        </ul>
        {named.length > 0 && (
          <p className={styles.muted}>
            Kamu main bareng {named.join(", ")}
            {rest > 0 ? ` dan ${formatAngka(rest)} pemain lainnya` : ""}.{d.format.lineup ? " Partner tiap ronde diumumkan saat check-in." : ""}
          </p>
        )}
        <Link href="?tab=peserta" scroll={false} replace className={styles.link}>
          Lihat semua peserta
          <ChevronRight size={14} aria-hidden />
        </Link>
      </section>

      {d.format.lineup && d.showLeaderboard && (
        <section className={styles.liveCard}>
          <span className={styles.liveIcon} aria-hidden>
            <ChartColumn size={22} />
          </span>
          <div>
            <h2>Live Leaderboard</h2>
            <p>Skor tiap court & poin individu tampil di sini begitu event dimulai.</p>
          </div>
          {d.phase === "upcoming" ? (
            <span className={styles.livePill}>Dibuka {formatTanggalPendek(d.startsAt, d.city, "dateTime")}</span>
          ) : (
            <Link href="?tab=leaderboard" scroll={false} replace className={styles.livePillOn}>
              Lihat leaderboard
            </Link>
          )}
        </section>
      )}

      <section className={styles.card} aria-labelledby="bawa-title">
        <h2 id="bawa-title" className={styles.cardTitle}>
          Yang perlu dibawa
        </h2>
        <ul className={styles.chips}>
          {BRING.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** State terkunci (Figma 2b–2d): ikon gembok, label, judul, hitung mundur, link ke Info. */
function Locked({ detail: d, title, text, label = "Belum bisa diakses" }: { detail: MemberSessionDetail; title: string; text: string; label?: string }) {
  return (
    <section className={cx(styles.card, styles.locked)}>
      <span className={styles.lockIcon} aria-hidden>
        <Lock size={22} />
      </span>
      <span className={styles.lockLabel}>{label}</span>
      <h2 className={styles.lockTitle}>{title}</h2>
      <p className={styles.muted}>{text}</p>
      {d.phase === "upcoming" && <Countdown target={d.startsAt} size="sm" />}
      <Link href="?" scroll={false} replace className={styles.link}>
        Lihat info sesi →
      </Link>
    </section>
  );
}

function LiveTab({ detail: d }: { detail: MemberSessionDetail }) {
  if (d.phase === "upcoming") {
    return <Locked detail={d} title={`Live dimulai ${formatTanggalPendek(d.startsAt, d.city, "dateTime")}`} text="Status match kamu & court yang sedang dimainkan muncul di sini saat sesi dimulai." />;
  }
  const myMatches = d.matches.filter((m) => m.mine);
  const next = myMatches.find((m) => m.scoreA === null);
  if (!d.format.lineup || !d.matches.length) {
    return <Locked detail={d} label={d.phase === "done" ? "Sesi selesai" : "Sedang berlangsung"} title={d.phase === "done" ? "Sesi sudah selesai" : "Belum ada line-up"} text="Line-up & skor diatur host di lapangan. Skor diinput & diverifikasi oleh host." />;
  }
  return (
    <section className={styles.card} aria-labelledby="live-title">
      <h2 id="live-title" className={styles.cardTitle}>
        {d.phase === "done" ? "Rekap match kamu" : next ? `Match berikutnya · Ronde ${next.round}` : "Semua match kamu sudah selesai"}
      </h2>
      <p className={styles.muted}>Skor diinput & diverifikasi oleh host. Halaman ini diperbarui saat dibuka ulang.</p>
      <MatchList matches={myMatches} />
    </section>
  );
}

function LeaderboardTab({ detail: d }: { detail: MemberSessionDetail }) {
  if (!d.format.lineup || !d.showLeaderboard) {
    return <Locked detail={d} label="Tidak tersedia" title="Leaderboard tidak dipakai di sesi ini" text="Sesi ini tidak memakai format Americano / Rotating Partner." />;
  }
  if (!d.standings.length) {
    return <Locked detail={d} title="Leaderboard belum dimulai" text="Peringkat live muncul setelah match pertama terverifikasi host." />;
  }
  const metric = d.format.leaderboardMode === "wins" ? "Menang" : "Poin";
  return (
    <section className={styles.card} aria-labelledby="lb-title">
      <header className={styles.cardHead}>
        <h2 id="lb-title" className={styles.cardTitle}>
          Leaderboard
        </h2>
        <span className={styles.pill}>Urut {metric.toLowerCase()}</span>
      </header>
      <ol className={styles.board}>
        {d.standings.map((s, i) => (
          <li key={s.id} className={cx(styles.boardRow, s.me && styles.boardMe)}>
            <span className={styles.rank}>{i + 1}</span>
            <span className={styles.boardName}>
              {s.name}
              {s.me && <small> (kamu)</small>}
            </span>
            <span className={styles.boardStat}>
              <strong>{d.format.leaderboardMode === "wins" ? s.wins : s.points}</strong>
              <small>
                {d.format.leaderboardMode === "wins" ? `${s.points} poin` : `${s.wins} menang`} · {s.played} match
              </small>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RoundsTab({ detail: d }: { detail: MemberSessionDetail }) {
  if (!d.format.lineup) {
    return <Locked detail={d} label="Tidak tersedia" title="Sesi ini tanpa urutan main" text="Pembagian court diatur langsung oleh host di lapangan." />;
  }
  if (!d.matches.length) {
    return <Locked detail={d} title="Urutan main belum diumumkan" text="Line-up dibuat host setelah check-in — urutan pasangan muncul di sini." />;
  }
  const rounds = [...new Set(d.matches.map((m) => m.round))];
  return (
    <section className={styles.card} aria-labelledby="ronde-title">
      <h2 id="ronde-title" className={styles.cardTitle}>
        Urutan main
      </h2>
      <p className={styles.muted}>Match kamu ditandai. Line-up bisa diubah host selama ronde belum dimainkan.</p>
      {rounds.map((r) => (
        <div key={r} className={styles.round}>
          <h3>Ronde {r}</h3>
          <MatchList matches={d.matches.filter((m) => m.round === r)} />
        </div>
      ))}
    </section>
  );
}

function MatchList({ matches }: { matches: MemberSessionDetail["matches"] }) {
  return (
    <ul className={styles.matches}>
      {matches.map((m) => (
        <li key={`${m.round}-${m.court}`} className={cx(styles.match, m.mine && styles.matchMine)}>
          <span className={styles.court}>
            <strong>C{m.court}</strong>R{m.round}
          </span>
          <span className={styles.team}>{m.a.join(" & ")}</span>
          <span className={styles.score}>{m.scoreA === null ? "vs" : `${m.scoreA}–${m.scoreB}`}</span>
          <span className={cx(styles.team, styles.teamRight)}>{m.b.join(" & ")}</span>
        </li>
      ))}
    </ul>
  );
}
