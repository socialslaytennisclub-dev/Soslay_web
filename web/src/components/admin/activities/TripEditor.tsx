"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatRupiahPlain } from "@/lib/admin-labels";
import { cx } from "@/lib/cx";
import { amountDigits, amountDisplay } from "@/lib/finance/format";
import { wibParts } from "@/lib/format";
import { addDays, dayLabel, settlementDue, shortDate, TRIP_PLACEHOLDER, TRIP_TYPE, tripDates, tripDays, tripRange } from "@/lib/trips";
import { discardSessionUploads, uploadSessionCover } from "@/server/admin/actions/sessions";
import { saveTrip, type TripActivityInput, type TripInput, type TripRundownInput } from "@/server/admin/actions/trips";
import type { TripCandidate, TripDetail } from "@/server/admin/types";
import { FormCard, TextArea, Toggle } from "../ui/AdminForm";
import { AdminIcon } from "../ui/AdminIcon";
import { AdminButton, Badge, PickerInput } from "../ui/AdminUI";
import { FinanceModal } from "../finance/FinanceModal";
import { toast } from "../ui/Toaster";
import { useUploadCleanup } from "../ui/useUploadCleanup";
import styles from "./SessionEditor.module.css";
import trip from "./Trip.module.css";

type ActivityForm = { key: string; id?: string; title: string; venueName: string; date: string; start: string; end: string; capacity: string; soldSingle: boolean; price: string; singleQuota: string; kuyUrl: string; meta?: string };
type RundownForm = { key: string; day: string; time: string; title: string; location: string; activityKey: string | null };

const num = (s: string) => Number(s || 0);
// Acak global: disimpan di sessions.trip_key / trips.create_key (unik di database), bukan hanya di form.
const newKey = () => `k${crypto.randomUUID()}`;

const TYPES_HINT = "Tennis Escape = trip: berisi beberapa activity (court), rundown & paket bundling. Form berubah otomatis.";

type Props = {
  initial: TripDetail | null;
  venues: { name: string; city: string; image: string }[];
  types: { slug: string; label: string }[];
  candidates: TripCandidate[];
};

/** Admin / 05x Buat trip — Tennis Escape (Figma 05x, 05x-4, 05x-5). */
export function TripEditor({ initial, venues, types, candidates }: Props) {
  const router = useRouter();
  const uploads = useUploadCleanup(discardSessionUploads);
  // Trip baru: key tetap selama form terbuka → simpan ulang (respons hilang, klik dua kali) memperbarui trip yang sama.
  const [createKey] = useState(newKey);
  // Versi trip yang dilihat form ini; dikirim saat simpan (trip diubah di tab / admin lain → ditolak).
  const [version, setVersion] = useState(initial?.version);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [area, setArea] = useState(initial?.area ?? "");
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? "");
  const [cover, setCover] = useState<string | null>(initial?.coverPath ?? null);
  const [status, setStatus] = useState<"draft" | "published">(initial?.status === "published" ? "published" : "draft");
  const [visibility, setVisibility] = useState<TripInput["visibility"]>(initial?.visibility ?? "public");
  const [homepage, setHomepage] = useState(initial?.showOnHomepage ?? false);
  const [showRundown, setShowRundown] = useState(initial?.showRundown ?? true);
  const [priceNormal, setPriceNormal] = useState(String(initial?.priceNormal ?? ""));
  const [priceEarly, setPriceEarly] = useState(initial?.priceEarlyBird === null || initial?.priceEarlyBird === undefined ? "" : String(initial.priceEarlyBird));
  const [earlyUntil, setEarlyUntil] = useState(initial?.earlyBirdUntil ?? "");
  const [quota, setQuota] = useState(String(initial?.packageQuota ?? ""));
  const [minDp, setMinDp] = useState(String(initial?.minDp ?? ""));
  const [inclusions, setInclusions] = useState<string[]>(initial?.inclusions ?? []);
  const [newInclusion, setNewInclusion] = useState("");
  const [activities, setActivities] = useState<ActivityForm[]>(
    () =>
      initial?.activities.map((a) => ({
        key: a.id,
        id: a.id,
        title: a.title,
        venueName: a.venueName,
        date: wibParts(a.startsAt).date,
        start: wibParts(a.startsAt).time,
        end: wibParts(a.endsAt).time,
        capacity: String(a.capacity),
        soldSingle: a.soldSingle,
        price: String(a.price),
        singleQuota: a.singleQuota === null ? "" : String(a.singleQuota),
        kuyUrl: a.kuyUrl,
        meta: `${a.typeLabel} · ${a.booked} peserta`,
      })) ?? [],
  );
  const [openKey, setOpenKey] = useState<string | null>(initial?.activities[0]?.id ?? null);
  const [rundown, setRundown] = useState<RundownForm[]>(() => initial?.rundown.map((r) => ({ key: r.id, day: r.day, time: r.time, title: r.title, location: r.location, activityKey: r.sessionId })) ?? []);
  const [rundownDay, setRundownDay] = useState(initial?.startsOn ?? "");
  const [addMenu, setAddMenu] = useState(false);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickQuery, setPickQuery] = useState("");
  const [saving, startSaving] = useTransition();
  const [uploading, startUploading] = useTransition();
  const sold = initial?.bookings.filter((b) => !b.cancelled).length ?? 0;

  const days = startsOn && endsOn && endsOn >= startsOn ? tripDates(startsOn, endsOn) : [];
  const activeDay = days.includes(rundownDay) ? rundownDay : (days[0] ?? "");
  const venueImage = (name: string) => venues.find((v) => v.name === name)?.image ?? TRIP_PLACEHOLDER;
  const coverSrc = cover ?? (activities[0] ? venueImage(activities[0].venueName) : TRIP_PLACEHOLDER);
  const patch = (key: string, p: Partial<ActivityForm>) => setActivities((list) => list.map((a) => (a.key === key ? { ...a, ...p } : a)));

  const addNewActivity = () => {
    const key = newKey();
    setActivities((list) => [...list, { key, title: "", venueName: venues[0]?.name ?? "", date: startsOn, start: "07:00", end: "10:00", capacity: "16", soldSingle: true, price: "", singleQuota: "", kuyUrl: "" }]);
    setOpenKey(key);
    setAddMenu(false);
  };

  const pickable = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    const inForm = new Set(activities.map((a) => a.id).filter(Boolean));
    return candidates
      .filter((c) => !inForm.has(c.id))
      .filter((c) => (!startsOn || c.date >= startsOn) && (!endsOn || c.date <= endsOn))
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.venueName.toLowerCase().includes(q));
  }, [candidates, activities, startsOn, endsOn, pickQuery]);

  const attachPicked = () => {
    const chosen = candidates.filter((c) => picked.has(c.id));
    setActivities((list) => [
      ...list,
      ...chosen.map((c) => ({
        key: c.id,
        id: c.id,
        title: c.title,
        venueName: c.venueName,
        date: c.date,
        start: c.start,
        end: c.end,
        capacity: String(c.capacity),
        soldSingle: c.price > 0,
        price: String(c.price),
        singleQuota: "",
        kuyUrl: c.kuyUrl,
        meta: `${c.typeLabel} · ${c.booked} peserta`,
      })),
    ]);
    const tight = chosen.filter((c) => c.capacity < c.booked + sold);
    if (tight.length) toast.error(`Kapasitas kurang untuk ${sold} pembeli paket: ${tight.map((c) => c.title).join(", ")} — naikkan kapasitasnya.`);
    setPicked(new Set());
    setPicking(false);
  };

  const removeActivity = (key: string) => {
    setActivities((list) => list.filter((a) => a.key !== key));
    setRundown((list) => list.map((r) => (r.activityKey === key ? { ...r, activityKey: null } : r)));
  };

  const uploadCover = (file: File | undefined) => {
    if (!file) return;
    startUploading(async () => {
      const form = new FormData();
      form.set("file", file);
      const r = await uploadSessionCover(form);
      if (!r.ok) return void toast.error(r.error);
      uploads.track(r.url);
      setCover(r.url);
    });
  };

  const input = (publish?: boolean): TripInput => ({
    id: initial?.id,
    title,
    description,
    area,
    startsOn,
    endsOn,
    coverPath: cover,
    status: publish ? "published" : status,
    visibility,
    showOnHomepage: homepage,
    showRundown,
    priceNormal: num(priceNormal),
    priceEarlyBird: priceEarly === "" ? null : num(priceEarly),
    earlyBirdUntil: priceEarly === "" ? null : earlyUntil || null,
    packageQuota: num(quota),
    minDp: num(minDp),
    inclusions,
    createKey: initial ? undefined : createKey,
    version,
    activities: activities.map(
      (a): TripActivityInput => ({
        id: a.id,
        key: a.key,
        title: a.title,
        venueName: a.venueName,
        date: a.date,
        start: a.start,
        end: a.end,
        capacity: num(a.capacity),
        soldSingle: a.soldSingle,
        price: num(a.price),
        singleQuota: a.singleQuota === "" ? null : num(a.singleQuota),
        kuyUrl: a.kuyUrl,
      }),
    ),
    rundown: days.flatMap((d) => rundown.filter((r) => r.day === d).map((r): TripRundownInput => ({ day: r.day, time: r.time, title: r.title, location: r.location, activityKey: r.activityKey }))),
  });

  const save = (publish?: boolean) =>
    startSaving(async () => {
      const r = await uploads.save(() => saveTrip(input(publish)), { isNew: !initial, stored: [initial?.coverPath], current: [cover] });
      toast.result(r);
      if (!r.ok) return;
      if (publish) setStatus("published");
      // Sampai data baru tiba (editor di-mount ulang saat versi trip berubah): pakai id sesi & versi terbaru,
      // agar simpan berikutnya memperbarui sesi yang sama dan tidak ditolak sebagai basi.
      const ids = r.activityIds ?? {};
      setActivities((list) => list.map((a) => (a.id || !ids[a.key] ? a : { ...a, id: ids[a.key] })));
      if (r.version) setVersion(r.version);
      router.replace(`/admin/activities/trip/${r.id}`);
      router.refresh();
    });

  const isDraft = status === "draft";
  const priceSummary = [
    ...(priceEarly ? [{ label: "Bundling early bird", sub: earlyUntil ? `manual · s.d. ${shortDate(earlyUntil)}` : "manual", value: formatRupiahPlain(num(priceEarly)) }] : []),
    { label: "Bundling normal", sub: "manual", value: priceNormal ? formatRupiahPlain(num(priceNormal)) : "—" },
    ...activities.map((a, i) => ({ label: `Activity ${i + 1} · ${a.title || "Tanpa nama"}`, sub: a.soldSingle ? "Kuyy" : "tidak dijual satuan", value: a.soldSingle && a.price ? formatRupiahPlain(num(a.price)) : "—" })),
  ];

  return (
    <div className={styles.editor}>
      <div className={styles.bar}>
        <div className={styles.barLeft}>
          <Link href="/admin/activities" className={styles.back}>
            <AdminIcon name="caret-left" size={16} />
            Activities
          </Link>
          <Badge tone={initial ? (status === "published" ? "lime" : "neutral") : "indigo"} dot>
            {initial ? (status === "published" ? "Published" : "Draft") : "Trip baru"}
          </Badge>
          <span className={trip.typeChip}>Tennis Escape</span>
        </div>
        <div className={styles.barActions}>
          {initial && (
            <>
              <AdminButton href={`/akun/trip/${initial.slug}`} target="_blank" size="sm" icon="eye">
                Pratinjau
              </AdminButton>
              <AdminButton href={`/admin/activities/trip/${initial.id}/peserta`} size="sm" icon="users-three">
                Peserta & pembayaran
              </AdminButton>
            </>
          )}
          {isDraft && (
            <AdminButton size="sm" icon="check-bold" onClick={() => save()} disabled={saving}>
              Simpan draft
            </AdminButton>
          )}
          <AdminButton variant="primary" size="sm" icon={isDraft ? "globe-simple" : "check-bold"} onClick={() => save(isDraft)} disabled={saving}>
            {saving ? "Menyimpan…" : isDraft ? "Publikasikan" : "Simpan perubahan"}
          </AdminButton>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.main}>
          <FormCard title="Info trip" subtitle="Tampil di halaman Activity, banner My Activities & halaman trip">
            <label className={styles.field}>
              <span className={styles.label}>Judul trip *</span>
              <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Rally in Paradise · Bali" />
            </label>
            <fieldset className={styles.fieldset}>
              <legend className={styles.label}>Tipe sesi *</legend>
              <div className={styles.segmentWrap}>
                {types.map((t) => (
                  <button
                    key={t.slug}
                    type="button"
                    aria-pressed={t.slug === TRIP_TYPE}
                    className={cx(styles.option, t.slug === TRIP_TYPE && styles.optionOn)}
                    disabled={Boolean(initial) && t.slug !== TRIP_TYPE}
                    title={initial && t.slug !== TRIP_TYPE ? "Trip yang sudah dibuat tidak bisa diubah jadi sesi biasa" : undefined}
                    onClick={() => t.slug !== TRIP_TYPE && router.push(`/admin/activities/new?type=${t.slug}`)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <span className={trip.hint}>{TYPES_HINT}</span>
            </fieldset>
            <TextArea label="Deskripsi" value={description} onChange={setDescription} maxLength={500} />
            <div className={styles.cols2}>
              <label className={styles.field}>
                <span className={styles.label}>Kota / area</span>
                <span className={styles.affix}>
                  <AdminIcon name="map-pin" size={16} />
                  <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Bali · Ubud, Kintamani, Sanur" />
                </span>
              </label>
              <div className={styles.field}>
                <span className={styles.label}>
                  Tanggal trip * {days.length > 0 && <span className={styles.muted}>({days.length} hari)</span>}
                </span>
                <span className={trip.dateRange}>
                  <PickerInput type="date" className={styles.input} value={startsOn} aria-label="Tanggal mulai" onChange={(e) => setStartsOn(e.target.value)} />
                  <span className={styles.muted}>–</span>
                  <PickerInput type="date" className={styles.input} value={endsOn} min={startsOn} aria-label="Tanggal selesai" onChange={(e) => setEndsOn(e.target.value)} />
                </span>
              </div>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Foto cover *</span>
              <div className={styles.coverRow}>
                <span className={styles.cover}>
                  <Image src={coverSrc} alt="" fill sizes="(min-width: 768px) 180px, 100vw" />
                </span>
                <label
                  className={cx(styles.dropzone, uploading && styles.dropzoneBusy)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    uploadCover(e.dataTransfer.files[0]);
                  }}
                >
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden" disabled={uploading} onChange={(e) => (uploadCover(e.target.files?.[0]), (e.target.value = ""))} />
                  <AdminIcon name="upload-simple" size={20} />
                  <strong>{uploading ? "Mengupload…" : cover ? "Ganti foto" : "Tarik foto ke sini atau pilih file"}</strong>
                  <span className={styles.muted}>Foto cover juga dipakai di banner trip member</span>
                </label>
              </div>
            </div>
          </FormCard>

          <section id="activities" className={trip.anchor}>
            <FormCard
              title={`Activities dalam trip (${activities.length})`}
              subtitle="Setiap activity = 1 court/sesi. Pembeli bundling otomatis terdaftar di semua activity."
              action={
                <span className={trip.addWrap}>
                  <AdminButton size="sm" icon="plus-bold" iconAfter="caret-down" onClick={() => setAddMenu((v) => !v)} aria-expanded={addMenu}>
                    Tambah activity
                  </AdminButton>
                  {addMenu && (
                    <span className={trip.addMenu} role="menu">
                      <button type="button" role="menuitem" onClick={addNewActivity}>
                        <AdminIcon name="plus-bold" size={16} />
                        <span>
                          <strong>Buat activity baru</strong>
                          <small>Isi nama, venue, tanggal & jam, kapasitas. Activity dibuat langsung di dalam trip.</small>
                        </span>
                      </button>
                      <button type="button" role="menuitem" onClick={() => (setPicking(true), setAddMenu(false))}>
                        <AdminIcon name="link-simple" size={16} />
                        <span>
                          <strong>Ambil dari activity yang sudah ada</strong>
                          <small>Hubungkan sesi yang sudah dibuat (mis. sudah publish & ada peserta Kuyy).</small>
                        </span>
                      </button>
                    </span>
                  )}
                </span>
              }
            >
              {activities.length === 0 && <p className={styles.muted}>Belum ada activity. Tambahkan court/sesi yang dimainkan selama trip.</p>}
              <ol className={trip.activityList}>
                {activities.map((a, i) => {
                  const open = openKey === a.key;
                  const pill = a.soldSingle ? `Satuan · ${a.price ? formatRupiahPlain(num(a.price)) : "Rp—"} · Kuyy` : "Tidak dijual satuan";
                  return (
                    <li key={a.key} className={cx(trip.activity, open && trip.activityOpen)}>
                      <button type="button" className={trip.activityHead} aria-expanded={open} onClick={() => setOpenKey(open ? null : a.key)}>
                        <span className={trip.activityBadge}>Activity {i + 1}</span>
                        <span className={trip.activityText}>
                          <strong>{a.title || "Activity baru"}</strong>
                          <small>
                            {a.date ? dayLabel(a.date) : "Tanggal belum diisi"} · {a.start}–{a.end} · {a.venueName} · {a.capacity || 0} orang{a.meta ? ` · ${a.meta}` : ""}
                          </small>
                        </span>
                        <span className={cx(trip.pill, !a.soldSingle && trip.pillMuted)}>{pill}</span>
                        <AdminIcon name={open ? "caret-down" : "caret-right"} size={16} />
                      </button>
                      {open && (
                        <div className={trip.activityBody}>
                          <div className={styles.cols2}>
                            <label className={styles.field}>
                              <span className={styles.label}>Nama activity *</span>
                              <input className={styles.input} value={a.title} onChange={(e) => patch(a.key, { title: e.target.value })} placeholder="mis. Lapangan Maya Ubud" />
                            </label>
                            <label className={styles.field}>
                              <span className={styles.label}>Venue</span>
                              <span className={styles.selectWrap}>
                                <select className={cx(styles.input, styles.select)} value={a.venueName} onChange={(e) => patch(a.key, { venueName: e.target.value })}>
                                  {venues.map((v) => (
                                    <option key={v.name} value={v.name}>
                                      {v.name} · {v.city}
                                    </option>
                                  ))}
                                </select>
                                <AdminIcon name="caret-down" size={14} />
                              </span>
                            </label>
                          </div>
                          <div className={styles.cols3}>
                            <label className={styles.field}>
                              <span className={styles.label}>Tanggal</span>
                              <span className={styles.selectWrap}>
                                <select className={cx(styles.input, styles.select)} value={a.date} onChange={(e) => patch(a.key, { date: e.target.value })}>
                                  {!days.includes(a.date) && <option value={a.date}>{a.date ? `${dayLabel(a.date)} (di luar trip)` : "Pilih tanggal"}</option>}
                                  {days.map((d) => (
                                    <option key={d} value={d}>
                                      {dayLabel(d)}
                                    </option>
                                  ))}
                                </select>
                                <AdminIcon name="caret-down" size={14} />
                              </span>
                            </label>
                            <div className={styles.field}>
                              <span className={styles.label}>Jam</span>
                              <span className={trip.dateRange}>
                                <PickerInput type="time" className={styles.input} value={a.start} aria-label="Jam mulai" onChange={(e) => patch(a.key, { start: e.target.value })} />
                                <span className={styles.muted}>–</span>
                                <PickerInput type="time" className={styles.input} value={a.end} aria-label="Jam selesai" onChange={(e) => patch(a.key, { end: e.target.value })} />
                              </span>
                            </div>
                            <label className={styles.field}>
                              <span className={styles.label}>Kapasitas</span>
                              <span className={styles.affix}>
                                <input inputMode="numeric" value={a.capacity} onChange={(e) => patch(a.key, { capacity: amountDigits(e.target.value) })} />
                                <span className={styles.muted}>orang</span>
                              </span>
                            </label>
                          </div>
                          <div className={trip.single}>
                            <Toggle label="Dijual satuan (via Kuyy)" hint="Untuk peserta yang hanya ikut activity ini. Harga bisa beda tiap activity." checked={a.soldSingle} onChange={(v) => patch(a.key, { soldSingle: v })} />
                            {a.soldSingle && (
                              <>
                                <div className={styles.cols2}>
                                  <label className={styles.field}>
                                    <span className={styles.label}>Harga satuan</span>
                                    <span className={styles.affix}>
                                      <span className={styles.muted}>Rp</span>
                                      <input inputMode="numeric" value={amountDisplay(a.price)} onChange={(e) => patch(a.key, { price: amountDigits(e.target.value) })} />
                                    </span>
                                  </label>
                                  <label className={styles.field}>
                                    <span className={styles.label}>Kuota satuan</span>
                                    <span className={styles.affix}>
                                      <input inputMode="numeric" value={a.singleQuota} onChange={(e) => patch(a.key, { singleQuota: amountDigits(e.target.value) })} placeholder={String(Math.max(num(a.capacity) - sold, 0))} />
                                      <span className={styles.muted}>orang</span>
                                    </span>
                                    <span className={styles.muted}>Sisa kursi setelah peserta bundling</span>
                                  </label>
                                </div>
                                <label className={styles.field}>
                                  <span className={styles.label}>Link booking Kuyy</span>
                                  <span className={styles.affix}>
                                    <AdminIcon name="link-simple" size={16} />
                                    <input inputMode="url" value={a.kuyUrl} onChange={(e) => patch(a.key, { kuyUrl: e.target.value })} placeholder="kuy.id/soslay/nama-activity" />
                                  </span>
                                </label>
                              </>
                            )}
                          </div>
                          <div className={trip.detailNote}>
                            <AdminIcon name="question" size={16} />
                            <span>
                              <strong>Detail lain diatur di halaman activity</strong>
                              Foto, format & skor, lapangan, host & fotografer, level, Slay Point, waitlist — diatur di Edit activity. Trip hanya menghubungkan activity.
                            </span>
                            {a.id ? (
                              <AdminButton href={`/admin/activities/${a.id}`} size="sm" variant="primary" iconAfter="arrow-up-right">
                                Edit activity
                              </AdminButton>
                            ) : (
                              <span className={styles.muted}>Simpan trip dulu</span>
                            )}
                          </div>
                          <button type="button" className={trip.remove} onClick={() => removeActivity(a.key)}>
                            <AdminIcon name="trash" size={14} /> {a.id ? "Lepas dari trip (sesi tetap ada)" : "Hapus activity ini"}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </FormCard>
          </section>

          <section id="rundown" className={trip.anchor}>
            <FormCard
              title="Rundown & rangkaian acara"
              subtitle="Tampil di halaman trip member (banner di My Activities). Tidak menggantikan halaman tiap activity."
              action={
                <AdminButton size="sm" icon="plus-bold" disabled={!activeDay} onClick={() => setRundown((list) => [...list, { key: newKey(), day: activeDay, time: "", title: "", location: "", activityKey: null }])}>
                  Tambah baris
                </AdminButton>
              }
            >
              {days.length === 0 ? (
                <p className={styles.muted}>Isi tanggal trip dulu untuk menyusun rundown per hari.</p>
              ) : (
                <>
                  <div className={trip.dayTabs} role="tablist" aria-label="Hari trip">
                    {days.map((d, i) => (
                      <button key={d} type="button" role="tab" aria-selected={d === activeDay} className={cx(trip.dayTab, d === activeDay && trip.dayTabOn)} onClick={() => setRundownDay(d)}>
                        Hari {i + 1} · {dayLabel(d)}
                      </button>
                    ))}
                  </div>
                  <ul className={trip.rundown}>
                    {rundown.filter((r) => r.day === activeDay).length === 0 && <li className={styles.muted}>Belum ada acara di hari ini.</li>}
                    {rundown
                      .filter((r) => r.day === activeDay)
                      .map((r) => {
                        const set = (p: Partial<RundownForm>) => setRundown((list) => list.map((x) => (x.key === r.key ? { ...x, ...p } : x)));
                        return (
                          <li key={r.key} className={cx(trip.rundownRow, r.activityKey && trip.rundownLinked)}>
                            <input className={cx(styles.input, trip.rundownTime)} value={r.time} placeholder="07.00 – 10.00" aria-label="Jam" onChange={(e) => set({ time: e.target.value })} />
                            <span className={trip.rundownText}>
                              <input className={styles.input} value={r.title} placeholder="Kegiatan" aria-label="Kegiatan" onChange={(e) => set({ title: e.target.value })} />
                              <input className={styles.input} value={r.location} placeholder="Lokasi" aria-label="Lokasi" onChange={(e) => set({ location: e.target.value })} />
                            </span>
                            <span className={styles.selectWrap}>
                              <select className={cx(styles.input, styles.select)} value={r.activityKey ?? ""} aria-label="Tautkan ke activity" onChange={(e) => set({ activityKey: e.target.value || null })}>
                                <option value="">Tanpa activity</option>
                                {activities.map((a, i) => (
                                  <option key={a.key} value={a.key}>
                                    ↪ Activity {i + 1}
                                  </option>
                                ))}
                              </select>
                              <AdminIcon name="caret-down" size={14} />
                            </span>
                            <button type="button" className={trip.iconBtn} aria-label="Hapus baris" onClick={() => setRundown((list) => list.filter((x) => x.key !== r.key))}>
                              <AdminIcon name="trash" size={16} />
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </>
              )}
              <Toggle label="Tampilkan rundown ke peserta" hint="Peserta bundling melihat semua hari; peserta satuan hanya melihat activity yang dibeli + info trip." checked={showRundown} onChange={setShowRundown} />
            </FormCard>
          </section>

          <FormCard title="Paket bundling (bayar manual)" subtitle="1 paket = semua activity + fasilitas trip. Dibayar transfer; DP & pelunasan dicatat di tab Peserta & pembayaran." action={<span className={trip.typeChip}>Manual</span>}>
            <div className={trip.prices}>
              <div className={cx(trip.priceCard, trip.priceEarly)}>
                <span className={styles.label}>Early bird</span>
                <span className={trip.priceInput}>
                  <span>Rp</span>
                  <input inputMode="numeric" value={amountDisplay(priceEarly)} placeholder="kosong = tanpa early bird" aria-label="Harga early bird" onChange={(e) => setPriceEarly(amountDigits(e.target.value))} />
                </span>
                <label className={trip.priceSub}>
                  Berlaku jika DP masuk s.d.
                  <PickerInput type="date" className={styles.input} value={earlyUntil} max={startsOn || undefined} aria-label="Batas early bird" onChange={(e) => setEarlyUntil(e.target.value)} />
                </label>
              </div>
              <div className={trip.priceCard}>
                <span className={styles.label}>Normal</span>
                <span className={trip.priceInput}>
                  <span>Rp</span>
                  <input inputMode="numeric" value={amountDisplay(priceNormal)} aria-label="Harga normal" onChange={(e) => setPriceNormal(amountDigits(e.target.value))} />
                </span>
                <span className={trip.priceSub}>{earlyUntil ? `Mulai ${shortDate(addDays(earlyUntil, 1))}` : "Berlaku untuk semua pembeli"}</span>
              </div>
            </div>
            <div className={styles.cols3}>
              <label className={styles.field}>
                <span className={styles.label}>Kuota paket</span>
                <span className={styles.affix}>
                  <input inputMode="numeric" value={quota} onChange={(e) => setQuota(amountDigits(e.target.value))} />
                  <span className={styles.muted}>paket</span>
                </span>
                {sold > num(quota) && <span className={styles.error}>Sudah terjual {sold} paket.</span>}
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Minimal DP</span>
                <span className={styles.affix}>
                  <span className={styles.muted}>Rp</span>
                  <input inputMode="numeric" value={amountDisplay(minDp)} onChange={(e) => setMinDp(amountDigits(e.target.value))} />
                </span>
              </label>
              <div className={styles.field}>
                <span className={styles.label}>Pelunasan</span>
                <span className={cx(styles.input, trip.readonly)}>
                  <AdminIcon name="calendar-dots" size={16} /> {startsOn ? `H-14 · ${shortDate(settlementDue(startsOn))}` : "H-14"}
                </span>
                <span className={styles.muted}>Dihitung otomatis dari tanggal mulai trip</span>
              </div>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Termasuk dalam paket</span>
              <div className={trip.chips}>
                {inclusions.map((item) => (
                  <span key={item} className={trip.chip}>
                    <AdminIcon name="check-bold" size={12} /> {item}
                    <button type="button" aria-label={`Hapus ${item}`} onClick={() => setInclusions((l) => l.filter((x) => x !== item))}>
                      <AdminIcon name="x" size={12} />
                    </button>
                  </span>
                ))}
                <form
                  className={trip.chipAdd}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = newInclusion.trim();
                    if (v && !inclusions.includes(v)) setInclusions((l) => [...l, v]);
                    setNewInclusion("");
                  }}
                >
                  <input value={newInclusion} onChange={(e) => setNewInclusion(e.target.value)} placeholder="+ Tambah (mis. Villa 2 malam)" aria-label="Tambah item termasuk" />
                </form>
              </div>
            </div>
            <p className={trip.financeNote}>
              <AdminIcon name="hand-coins" size={16} />
              Keuangan: pembayaran bundling masuk sebagai Tiket activity terkait trip ini. Biaya bersama (villa, transport, makan, fotografer) dicatat ke trip & hanya dibebankan ke peserta bundling.
            </p>
          </FormCard>
        </div>

        <aside className={styles.side}>
          <FormCard title="Publikasi">
            <label className={styles.field}>
              <span className={styles.label}>Status</span>
              <span className={styles.selectWrap}>
                <select className={cx(styles.input, styles.select)} value={status} onChange={(e) => setStatus(e.target.value as "draft" | "published")}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
                <AdminIcon name="caret-down" size={14} />
              </span>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Visibilitas</span>
              <span className={styles.selectWrap}>
                <select className={cx(styles.input, styles.select)} value={visibility} onChange={(e) => setVisibility(e.target.value as TripInput["visibility"])}>
                  <option value="public">Publik</option>
                  <option value="members">Member</option>
                  <option value="link">Link</option>
                </select>
                <AdminIcon name="caret-down" size={14} />
              </span>
            </label>
            <Toggle label="Tampilkan di homepage" hint="Sebagai special event" checked={homepage} onChange={setHomepage} />
          </FormCard>

          <FormCard title="Ringkasan harga">
            <ul className={trip.summary}>
              {priceSummary.map((p) => (
                <li key={p.label}>
                  <span>
                    {p.label}
                    <small>{p.sub}</small>
                  </span>
                  <strong>{p.value}</strong>
                </li>
              ))}
            </ul>
            {startsOn && endsOn && (
              <p className={styles.muted}>
                {tripRange(startsOn, endsOn)} · {tripDays(startsOn, endsOn)} hari · pelunasan {shortDate(settlementDue(startsOn))}
              </p>
            )}
          </FormCard>

          <FormCard title="Host & fotografer">
            <p className={styles.muted}>Host & fotografer diatur per activity (Edit activity › Host & fotografer). Host trip otomatis mendapat akses Panel Host di activity yang ia pegang.</p>
          </FormCard>
        </aside>
      </div>

      <FinanceModal
        open={picking}
        onClose={() => setPicking(false)}
        title="Ambil dari activity yang sudah ada"
        subtitle={`Pilih sesi yang mau dihubungkan ke ${title || "trip ini"}. Activity tetap memakai data & pesertanya sendiri.`}
        wide
        footer={
          <>
            <span className={styles.muted}>{picked.size} activity dipilih</span>
            <span className={trip.modalActions}>
              <AdminButton onClick={() => setPicking(false)}>Batal</AdminButton>
              <AdminButton variant="primary" icon="link-simple" disabled={!picked.size} onClick={attachPicked}>
                Hubungkan ke trip
              </AdminButton>
            </span>
          </>
        }
      >
        <span className={trip.pickFilters}>
          <span className={styles.affix}>
            <AdminIcon name="magnifying-glass" size={16} />
            <input value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} placeholder="Cari judul sesi atau venue…" aria-label="Cari sesi" />
          </span>
          <span className={trip.typeChip}>{startsOn && endsOn ? `${tripRange(startsOn, endsOn, false)} (tanggal trip)` : "Isi tanggal trip"}</span>
        </span>
        <ul className={trip.pickList}>
          {pickable.length === 0 && <li className={styles.muted}>Tidak ada sesi di dalam tanggal trip.</li>}
          {pickable.map((c) => {
            const disabled = Boolean(c.otherTrip);
            return (
              <li key={c.id}>
                <label className={cx(trip.pickItem, picked.has(c.id) && trip.pickItemOn, disabled && trip.pickItemOff)}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={picked.has(c.id)}
                    onChange={() =>
                      setPicked((s) => {
                        const next = new Set(s);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })
                    }
                  />
                  <span>
                    <strong>
                      {c.title} <span className={trip.typeChip}>{c.typeLabel}</span>
                    </strong>
                    <small>
                      {dayLabel(c.date)} · {c.start}–{c.end} · {c.venueName}
                    </small>
                    <small className={disabled ? trip.danger : undefined}>{disabled ? `Sudah terhubung ke trip "${c.otherTrip}"` : `${c.booked}/${c.capacity} peserta · ${formatRupiahPlain(c.price)} · ${c.statusLabel}`}</small>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className={trip.warn}>
          <strong>Saat dihubungkan</strong>
          <ul>
            <li>Harga sesi dipakai sebagai harga satuan (Kuyy) — bisa diubah di Edit activity.</li>
            <li>Peserta yang sudah ada tetap tercatat sebagai peserta satuan.</li>
            <li>Semua pembeli paket bundling otomatis ditambahkan; pastikan kapasitas cukup ({sold} paket + peserta yang ada).</li>
            <li>Tanggal di luar tanggal trip tidak bisa dipilih. 1 activity hanya bisa masuk 1 trip.</li>
          </ul>
        </div>
      </FinanceModal>
    </div>
  );
}
