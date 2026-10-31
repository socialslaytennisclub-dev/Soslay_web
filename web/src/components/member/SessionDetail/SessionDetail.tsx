import Link from "next/link";
import { CalendarDays, CalendarPlus, ChartColumn, ChevronDown, ChevronLeft, ChevronRight, Clock, CreditCard, Lock, Map as MapIcon, MapPin, MessageCircle, SquareArrowOutUpRight, Trophy, Users, Volleyball } from "lucide-react";
import { Container } from "@/components/ui";
import { cx } from "@/lib/cx";
import { CITY_TZ_LABEL, formatAngka, formatJamRange, formatRupiah, formatTanggalISO, formatTanggalPendek } from "@/lib/format";
import { planRounds, ROUND_STATUS_LABEL, skippedLabel } from "@/lib/rounds";
import { initials, teamName } from "@/lib/text";
import type { DetailMatch, DetailStanding, MemberSessionDetail } from "@/server/member/session-detail";
import { SelfCheckIn } from "@/components/member/CheckIn/SelfCheckIn";
import { Countdown } from "./Countdown";
import { HostLive } from "./HostPanel";
import { HostStartCard } from "./HostStart";
import { maxRound, perspective, PlayerLiveCard } from "./LiveCards";
import { ParticipantList } from "./ParticipantList";
import { QrCheckIn } from "./QrCheckIn";
import { DoneSide, HostResults, PhotosTab, ResultsTab } from "./Results";
import { ReviewTab } from "./ReviewForm";
import styles from "./SessionDetail.module.css";

const TAB_LABEL = {
  hasil: "Hasil",
  info: "Info",
  peserta: "Peserta",
  live: "Live",
  leaderboard: "Leaderboard",
  ronde: "Ronde",
  foto: "Foto",
  review: "Review",
} as const;

export type DetailTab = keyof typeof TAB_LABEL;

/**
 * Tab per kondisi (Figma Simplify): sebelum mulai & live → Info · Peserta · Live · Leaderboard ·
 * Ronde; selesai → Hasil · Ronde · Foto · Review · Info (host yang tidak ikut main tanpa Review).
 */
export function detailTabs(d: Pick<MemberSessionDetail, "phase" | "ticket">): DetailTab[] {
  if (d.phase !== "done") return ["info", "peserta", "live", "leaderboard", "ronde"];
  return d.ticket ? ["hasil", "ronde", "foto", "review", "info"] : ["hasil", "ronde", "foto", "info"];
}

/** Host yang tidak ikut main (Figma Simplify "Host (bukan peserta)"). */
const hostOnly = (d: MemberSessionDetail) => d.isHost && !d.ticket && !d.matches.some((m) => m.mySide);

const PANITIA_WA = "62642424792";
const BRING = ["Raket tenis", "Sepatu non-marking", "Botol minum", "Handuk & baju ganti", "QR e-ticket"];

const STATUS_CHIP = {
  upcoming: "Terdaftar",
  live: "Live",
  done: "Selesai",
} as const;

const wa = (text: string) => `https://wa.me/${PANITIA_WA}?text=${encodeURIComponent(text)}`;

function calendarUrl(d: MemberSessionDetail) {
  const stamp = (iso: string) =>
    new Date(iso)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
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
export function SessionDetail({ detail: d, tab, endedNotice = null }: { detail: MemberSessionDetail; tab: DetailTab; endedNotice?: number | null }) {
  const tabs = detailTabs(d);
  // Saat sesi berjalan / selesai, tab Live · Leaderboard · Ronde memakai lebar penuh (Figma UIF-07);
  // hasil sesi tampilan host juga penuh (HL-5b).
  const wide = (d.phase !== "upcoming" && (tab === "live" || tab === "leaderboard" || tab === "ronde")) || (tab === "hasil" && hostOnly(d));
  const doneSide = d.phase === "done" && (tab === "hasil" || tab === "foto" || tab === "review");
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
            <span className={cx(styles.status, styles[`status_${d.phase}`])}>{d.ticket?.status === "attended" ? "Hadir" : STATUS_CHIP[d.phase]}</span>
            {d.isHost && <span className={styles.hostChip}>Kamu host</span>}
          </p>
          <h1 className={styles.title}>{d.title}</h1>
          <p className={styles.meta}>
            {formatTanggalPendek(d.startsAt, d.city)} · {formatJamRange(d.start, d.end, "–")} · {d.venue.name}
          </p>
          <nav className={styles.tabs} aria-label="Bagian detail sesi">
            {tabs.map((t) => (
              <Link key={t} href={t === tabs[0] ? "?" : `?tab=${t}`} scroll={false} replace className={cx(styles.tab, tab === t && styles.tabOn)} aria-current={tab === t ? "page" : undefined}>
                {TAB_LABEL[t]}
              </Link>
            ))}
          </nav>
        </Container>
      </header>

      <div className={styles.body}>
        <Container className={cx(styles.grid, wide && styles.gridWide)}>
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
                <ParticipantList people={d.people} checkIn={d.canScore && d.phase !== "done"} sessionId={d.id} />
              </section>
            )}
            {tab === "live" && <LiveTab detail={d} />}
            {tab === "leaderboard" && <LeaderboardTab detail={d} />}
            {tab === "ronde" && <RoundsTab detail={d} />}
            {tab === "hasil" && (hostOnly(d) ? <HostResults detail={d} endedNotice={endedNotice} /> : <ResultsTab detail={d} />)}
            {tab === "foto" && <PhotosTab detail={d} />}
            {tab === "review" && <ReviewTab detail={d} />}
          </div>

          {!wide && doneSide && (
            <aside className={styles.side}>
              <DoneSide detail={d} tab={tab} />
            </aside>
          )}
          {!wide && !doneSide && (
            <aside className={styles.side}>
              {d.ticket && <Ticket detail={d} ticket={d.ticket} />}
              {!d.ticket && d.isHost && d.phase !== "done" && <HostCard detail={d} />}

              {d.registration && <Registration detail={d} registration={d.registration} />}

              <section className={styles.card} aria-labelledby="bantuan-title">
                <h2 id="bantuan-title" className={styles.cardTitle}>
                  Butuh sesuatu?
                </h2>
                <ul className={styles.helpList}>
                  <HelpLink href={calendarUrl(d)} icon={<CalendarPlus size={18} />} title="Tambah ke kalender" sub="Google Calendar" />
                  <HelpLink href={routeUrl} icon={<MapIcon size={18} />} title="Buka rute ke venue" sub={`${d.venue.name}, ${d.venue.address}`} />
                  <HelpLink href={wa(`Halo panitia Soslay, aku mau tanya soal sesi "${d.title}"${d.ticket ? ` (${d.ticket.code})` : ""}.`)} icon={<MessageCircle size={18} />} title="Hubungi panitia" sub="WhatsApp Soslay Club" />
                </ul>
                {d.phase === "upcoming" && d.ticket && (
                  <div className={styles.absent}>
                    <a href={wa(`Halo panitia Soslay, aku ${d.ticket.holder} (${d.ticket.code}) tidak bisa hadir di sesi "${d.title}".`)} target="_blank" rel="noopener noreferrer">
                      Tidak bisa hadir? Kabari host
                    </a>
                    <p className={styles.small}>Tiket non-refundable. Kabari host supaya acakan pemain bisa disesuaikan sebelum sesi mulai.</p>
                  </div>
                )}
              </section>
            </aside>
          )}
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

type TicketData = NonNullable<MemberSessionDetail["ticket"]>;
type RegistrationData = NonNullable<MemberSessionDetail["registration"]>;

function Ticket({ detail: d, ticket }: { detail: MemberSessionDetail; ticket: TicketData }) {
  return (
    <section className={styles.ticket} aria-label="E-ticket">
      <header className={styles.ticketHead}>
        <span className={styles.eyebrow}>E-ticket</span>
        <span className={styles.ticketChip}>{ticket.status === "attended" ? "Sudah check-in" : "Terdaftar"}</span>
      </header>
      <h2 className={styles.ticketTitle}>{d.title}</h2>
      <div className={styles.qr} dangerouslySetInnerHTML={{ __html: ticket.qrSvg }} role="img" aria-label={`QR e-ticket ${ticket.code}`} />
      <p className={styles.code}>
        <span>Kode booking</span>
        <strong>{ticket.code}</strong>
      </p>
      <dl className={styles.ticketMeta}>
        <div>
          <dt>Nama</dt>
          <dd>{ticket.holder}</dd>
        </div>
        <div>
          <dt>Tipe tiket</dt>
          <dd>{ticket.type}</dd>
        </div>
      </dl>
      {d.phase !== "done" && (
        <SelfCheckIn sessionId={d.id} city={d.city} opensAt={d.checkInAt} endsAt={d.endsAt} checkedIn={ticket.status === "attended"} checkedInAt={ticket.checkedInAt} fetchedAt={d.fetchedAt} variant="ticket" />
      )}
      {d.phase !== "done" && (
        <QrCheckIn
          qrSvg={ticket.qrSvg}
          code={ticket.code}
          holder={`${ticket.holder} · ${ticket.type}`}
          title={d.title}
          openNote={`Check-in dibuka ${formatTanggalPendek(d.checkInAt, d.city)} pukul ${formatTanggalPendek(d.checkInAt, d.city, "time")} ${CITY_TZ_LABEL[d.city]}`}
        />
      )}
    </section>
  );
}

function Registration({ registration: reg, detail: d }: { detail: MemberSessionDetail; registration: RegistrationData }) {
  return (
    <section className={styles.card} aria-labelledby="daftar-title">
      <header className={styles.cardHead}>
        <h2 id="daftar-title" className={styles.cardTitle}>
          Info Pendaftaran
        </h2>
        <span className={cx(styles.pill, reg.paid ? styles.pillOk : styles.pillWarn)}>{reg.paid ? "Lunas" : "Menunggu"}</span>
      </header>
      <div className={styles.payBox}>
        <span className={styles.payIcon}>
          <CreditCard size={18} aria-hidden />
        </span>
        <span>
          <small>Sumber pembayaran</small>
          <strong>{reg.sourceLabel}</strong>
        </span>
      </div>
      <dl className={styles.rows}>
        {reg.orderId && (
          <div>
            <dt>No. registrasi Kuyy</dt>
            <dd>{reg.orderId}</dd>
          </div>
        )}
        {reg.amount > 0 && (
          <div>
            <dt>Dibayar</dt>
            <dd>{formatRupiah(reg.amount)}</dd>
          </div>
        )}
        <div>
          <dt>Tanggal daftar</dt>
          <dd>{formatTanggalPendek(reg.registeredAt, d.city, "dateTime")}</dd>
        </div>
      </dl>
      <p className={styles.small}>Pembayaran diproses di Kuyy · tiket non-refundable.</p>
      {reg.kuyUrl && (
        <a className={styles.link} href={reg.kuyUrl} target="_blank" rel="noopener noreferrer">
          Lihat pesanan di Kuyy
          <SquareArrowOutUpRight size={14} aria-hidden />
        </a>
      )}
    </section>
  );
}

function InfoTab({ detail: d }: { detail: MemberSessionDetail }) {
  const facts = [
    {
      icon: <CalendarDays size={18} />,
      label: "Tanggal",
      value: formatTanggalISO(d.date, d.city),
    },
    {
      icon: <Clock size={18} />,
      label: "Waktu",
      value: `${formatJamRange(d.start, d.end, " – ")} ${CITY_TZ_LABEL[d.city]}`,
    },
    {
      icon: <MapPin size={18} />,
      label: "Lokasi",
      value: `${d.venue.name}, ${d.venue.address}`,
    },
    {
      icon: <Volleyball size={18} />,
      label: "Format",
      value: d.format.lineup ? `${d.format.label} · ${d.format.targetPoints} poin/match` : d.typeLabel,
    },
    {
      icon: <Users size={18} />,
      label: "Peserta",
      value: `${d.people.length} pemain${d.format.lineup ? ` · ${d.format.courts} court` : ""}`,
    },
    {
      icon: <Trophy size={18} />,
      label: "Level",
      value: d.levels.length ? d.levels.join(", ") : "Semua level",
    },
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

const RESULT = { win: "Menang", lose: "Kalah", draw: "Seri" } as const;

function LiveTab({ detail: d }: { detail: MemberSessionDetail }) {
  if (d.phase === "upcoming") {
    if (d.isHost && d.canScore) return <HostStartCard detail={d} />;
    return <Locked detail={d} title={`Live dimulai ${formatTanggalPendek(d.startsAt, d.city, "dateTime")}`} text="Status match kamu & court yang sedang dimainkan muncul di sini saat sesi dimulai." />;
  }
  if (!d.format.lineup || !d.matches.length || d.currentRound === null) {
    return (
      <Locked
        detail={d}
        label={d.phase === "done" ? "Sesi selesai" : "Sedang berlangsung"}
        title={d.phase === "done" ? "Sesi sudah selesai" : "Belum ada line-up"}
        text="Line-up & skor diatur host di lapangan. Skor diinput & diverifikasi oleh host."
      />
    );
  }
  // Host: kartu atas mengikuti ronde yang dipilih di Panel Host.
  if (d.isHost) return <HostLive detail={d} />;
  return <PlayerLiveCard detail={d} round={d.currentRound} />;
}

/** Kartu host di kolom samping (Figma S1-H): pengganti e-ticket untuk host yang tidak ikut main. */
function HostCard({ detail: d }: { detail: MemberSessionDetail }) {
  const present = d.people.filter((p) => p.checkedIn).length;
  return (
    <section className={styles.hostCard} aria-labelledby="host-card-title">
      <header>
        <span>Kartu host</span>
        <span className={styles.hostBadge}>Host</span>
      </header>
      <h2 id="host-card-title">{d.title}</h2>
      <p>Kamu ditunjuk admin sebagai host — check-in peserta, mulai activity, atur line-up & input skor.</p>
      <div className={styles.hostCardStat}>
        <small>Sudah check-in</small>
        <strong>
          {present}/{d.people.length} peserta
        </strong>
      </div>
      <Link href="?tab=peserta" scroll={false} replace className={styles.btnLime}>
        <Users size={16} aria-hidden />
        Check-in peserta
      </Link>
    </section>
  );
}

/** Peringkat dengan seri (Figma: "=5"): pemain dengan nilai sama berbagi nomor. */
function ranks(d: MemberSessionDetail) {
  const value = (s: DetailStanding) => (d.format.leaderboardMode === "wins" ? s.wins : s.points);
  // Standings sudah terurut → nilai sama selalu berdampingan: hitung posisi pertama & jumlahnya sekali jalan.
  const groups = new Map<number, { first: number; count: number }>();
  d.standings.forEach((s, i) => {
    const g = groups.get(value(s));
    if (g) g.count += 1;
    else groups.set(value(s), { first: i + 1, count: 1 });
  });
  return d.standings.map((s) => {
    const g = groups.get(value(s))!;
    return { s, rank: `${g.count > 1 ? "=" : ""}${g.first}`, value: value(s) };
  });
}

function Progress({ detail: d, label }: { detail: MemberSessionDetail; label: string }) {
  const done = d.matches.filter((m) => m.scoreA !== null).length;
  return (
    <div className={styles.progress}>
      <span>{label}</span>
      <span className={styles.progressCount}>
        {done} / {d.matches.length} match
      </span>
      <span className={styles.progressBar} aria-hidden>
        <span
          style={{
            width: `${d.matches.length ? (done / d.matches.length) * 100 : 0}%`,
          }}
        />
      </span>
    </div>
  );
}

function LeaderboardTab({ detail: d }: { detail: MemberSessionDetail }) {
  if (!d.format.lineup || !d.showLeaderboard) {
    return <Locked detail={d} label="Tidak tersedia" title="Leaderboard tidak dipakai di sesi ini" text="Sesi ini tidak memakai format Americano / Rotating Partner." />;
  }
  // Sebelum sesi mulai / tanpa line-up → terkunci. Begitu sesi berjalan tabel langsung tampil
  // (semua 0) supaya pemain melihat daftar lengkap; peringkat bergerak setelah skor pertama masuk.
  if (d.phase === "upcoming" || !d.standings.length) {
    return <Locked detail={d} title="Leaderboard belum dimulai" text="Peringkat live tampil di sini begitu sesi dimulai dan line-up dibuat host." />;
  }
  const started = d.standings.some((s) => s.played > 0);
  const wins = d.format.leaderboardMode === "wins";
  return (
    <section className={styles.board2} aria-labelledby="lb-title">
      <header className={styles.liveHead}>
        <h2 id="lb-title">Live Leaderboard {d.phase === "live" && <span className={styles.livePillRed}>Live</span>}</h2>
        <span className={styles.boardUpdated}>Update {formatTanggalPendek(new Date().toISOString(), d.city, "time")}</span>
      </header>
      <Progress detail={d} label="Progress Activities" />
      <table className={styles.boardTable}>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Pemain</th>
            <th scope="col">Match</th>
            <th scope="col">{wins ? "Menang" : "Poin"}</th>
          </tr>
        </thead>
        <tbody>
          {ranks(d).map(({ s, rank, value }) => (
            <tr key={s.id} className={cx(s.me && styles.boardMe2)}>
              <td className={styles.boardRank}>{started ? rank : "–"}</td>
              <td>
                <span className={styles.boardPlayer}>
                  <span className={styles.miniFace}>{initials(s.name)}</span>
                  {s.name}
                  {s.me && " (kamu)"}
                </span>
              </td>
              <td className={styles.boardMatch}>
                {s.played}/{s.total}
              </td>
              <td className={styles.boardValue}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.boardNote}>{started ? "Nilai seri berbagi peringkat (=). Hanya match yang sudah diinput host yang dihitung." : "Belum ada skor masuk — peringkat bergerak setelah host menginput skor match pertama."}</p>
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
  const plan = planRounds(d.matches, d.currentRound, d.startedRounds, d.phase);
  const { rounds } = plan;
  const current = d.currentRound ?? rounds[0];
  const skipped = skippedLabel(plan.skipped);
  const label =
    d.phase === "done"
      ? "Semua ronde selesai"
      : d.phase === "live"
        ? `Ronde ${current} dari ${maxRound(d)} sedang live${skipped ? ` · ${skipped}` : ""}`
        : `${rounds.length} ronde · mulai ${formatTanggalPendek(d.startsAt, d.city, "time")}`;

  return (
    <section className={styles.card} aria-labelledby="ronde-title">
      <h2 id="ronde-title" className="visually-hidden">
        Urutan main
      </h2>
      <div className={styles.progressCard}>
        <strong>Progress Activities</strong>
        <Progress detail={d} label={label} />
      </div>
      <p className={styles.legend}>
        <span className={styles.legendDot} aria-hidden />
        Match kamu ditandai · ronde selesai bisa dibuka untuk lihat detail
      </p>
      {rounds.map((r) => {
        const list = d.matches.filter((m) => m.round === r);
        const state = plan.statusOf(r);
        const mine = list.find((m) => m.mySide);
        const courts = (
          <ul className={styles.courtList}>
            {list.map((m) => (
              <CourtRow key={m.court} match={m} />
            ))}
          </ul>
        );
        if (state === "done") {
          const view = mine ? perspective(mine) : null;
          const result = view?.score ? (view.score.own > view.score.opp ? "win" : view.score.own < view.score.opp ? "lose" : "draw") : null;
          return (
            <details key={r} className={styles.roundDone}>
              <summary>
                <span className={styles.roundTitle}>
                  Ronde {r} <span className={cx(styles.roundPill, styles.roundPill_done)}>Selesai</span>
                </span>
                <span className={styles.roundSummary}>
                  {view ? (
                    <>
                      <span className={styles.youChip}>Kamu</span>
                      {teamName(view.own)} · {view.score?.own}–{view.score?.opp}
                    </>
                  ) : (
                    <>
                      <span className={styles.restChip}>Kamu rest</span>
                      {list.length} match · Court {list.map((m) => m.court).join(" & ")}
                    </>
                  )}
                </span>
                {result && <span className={styles[result === "draw" ? "muted" : result]}>{RESULT[result]}</span>}
                <ChevronDown size={16} aria-hidden className={styles.roundCaret} />
              </summary>
              {courts}
            </details>
          );
        }
        return (
          <div key={r} className={styles.round}>
            <h3>
              Ronde {r} <span className={cx(styles.roundPill, styles[`roundPill_${state}`])}>{state === "skipped" ? "Dilewati · dimainkan nanti" : ROUND_STATUS_LABEL[state]}</span>
              {!mine && <span className={styles.restChip}>Kamu rest</span>}
            </h3>
            {courts}
          </div>
        );
      })}
      <p className={styles.small}>Skor diperbarui setelah diinput host. Pasangan ronde berikutnya bisa berubah sesuai panggilan host.</p>
    </section>
  );
}

function CourtRow({ match: m }: { match: DetailMatch }) {
  const line = (team: string[], score: number | null, side: "a" | "b") => (
    <span className={cx(styles.courtLine, m.mySide === side && styles.courtLineMine)}>
      <span>
        {teamName(team)}
        {m.mySide === side && <span className={styles.youChip}>Kamu</span>}
      </span>
      <span>{score ?? "–"}</span>
    </span>
  );
  return (
    <li className={cx(styles.courtRow, m.mySide && styles.courtRowMine)}>
      <span className={styles.courtTag}>
        <strong>C{m.court}</strong>
        Court
      </span>
      <span className={styles.courtLines}>
        {line(m.a, m.scoreA, "a")}
        {line(m.b, m.scoreB, "b")}
      </span>
    </li>
  );
}
