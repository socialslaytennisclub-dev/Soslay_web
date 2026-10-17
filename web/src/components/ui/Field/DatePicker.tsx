"use client";

import { useEffect, useRef, useState } from "react";
import { todayIso } from "@/lib/auth";
import { cx } from "@/lib/cx";
import { Icon } from "../Icon/Icon";
import styles from "./DatePicker.module.css";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const YEARS_PER_PAGE = 12;

type View = "days" | "months" | "years";

type DatePickerProps = {
  /** ISO "YYYY-MM-DD" atau "". */
  value: string;
  max?: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
};

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/**
 * Kalender popover bergaya Soslay (menggantikan pemilih bawaan browser). Klik judul untuk lompat
 * ke daftar bulan → tahun, jadi tanggal lahir lama cepat dicapai. Kosong → langsung buka daftar tahun.
 */
export function DatePicker({ value, max = "", onSelect, onClose }: DatePickerProps) {
  const today = todayIso();
  const base = value || today;
  // Tanggal lahir kosong → mulai sekitar 20 tahun lalu.
  const [year, setYear] = useState(Number(base.slice(0, 4)) - (value ? 0 : 20));
  const [month, setMonth] = useState(Number(base.slice(5, 7)) - 1);
  const [view, setView] = useState<View>(value ? "days" : "years");
  const ref = useRef<HTMLDivElement>(null);
  const maxYear = max ? Number(max.slice(0, 4)) : 9999;

  // Fokus ke tanggal terpilih / tombol pertama saat dibuka; Esc menutup.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[aria-pressed=true], [data-grid] button:not(:disabled)")?.focus({ preventScroll: true });
  }, [view]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pageStart = Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE;

  const step = (dir: -1 | 1) => {
    if (view === "years") setYear(year + dir * YEARS_PER_PAGE);
    else if (view === "months") setYear(year + dir);
    else {
      const next = new Date(year, month + dir, 1);
      setYear(next.getFullYear());
      setMonth(next.getMonth());
    }
  };
  const nextDisabled =
    view === "years" ? pageStart + YEARS_PER_PAGE > maxYear : view === "months" ? year >= maxYear : !!max && toIso(year, month + 1, 1) > max;

  const title = view === "years" ? `${pageStart} – ${pageStart + YEARS_PER_PAGE - 1}` : view === "months" ? String(year) : `${MONTHS[month]} ${year}`;

  // Grid hari: mulai Senin, 6 baris tetap supaya tinggi kalender tidak melompat.
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(year, month, i - offset + 1);
    return { iso: toIso(date.getFullYear(), date.getMonth(), date.getDate()), day: date.getDate(), outside: date.getMonth() !== month };
  });

  return (
    <div ref={ref} className={styles.picker} role="dialog" aria-label="Choose date">
      <div className={styles.header}>
        <button type="button" className={styles.nav} onClick={() => step(-1)} aria-label="Previous">
          <Icon name="caret-down-bold" size={16} className={styles.left} />
        </button>
        <button
          type="button"
          className={styles.title}
          disabled={view === "years"}
          onClick={() => setView(view === "days" ? "months" : "years")}
          aria-label={view === "years" ? title : `${title} — change ${view === "days" ? "month" : "year"}`}
        >
          {title}
          {view !== "years" && <Icon name="caret-down-bold" size={12} />}
        </button>
        <button type="button" className={styles.nav} onClick={() => step(1)} disabled={nextDisabled} aria-label="Next">
          <Icon name="caret-down-bold" size={16} className={styles.right} />
        </button>
      </div>

      {view === "days" && (
        <>
          <div className={styles.weekdays} aria-hidden>
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className={styles.days} data-grid>
            {days.map(({ iso, day, outside }) => (
              <button
                key={iso}
                type="button"
                className={cx(styles.day, outside && styles.outside, iso === today && styles.today)}
                aria-pressed={iso === value}
                aria-label={`${day} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`}
                disabled={!!max && iso > max}
                onClick={() => onSelect(iso)}
              >
                {day}
              </button>
            ))}
          </div>
        </>
      )}

      {view === "months" && (
        <div className={styles.cells} data-grid>
          {MONTHS.map((name, i) => (
            <button
              key={name}
              type="button"
              className={styles.cell}
              aria-pressed={!!value && Number(value.slice(0, 4)) === year && Number(value.slice(5, 7)) - 1 === i}
              disabled={!!max && toIso(year, i, 1) > max}
              onClick={() => {
                setMonth(i);
                setView("days");
              }}
            >
              {name.slice(0, 3)}
            </button>
          ))}
        </div>
      )}

      {view === "years" && (
        <div className={styles.cells} data-grid>
          {Array.from({ length: YEARS_PER_PAGE }, (_, i) => pageStart + i).map((y) => (
            <button
              key={y}
              type="button"
              className={styles.cell}
              aria-pressed={!!value && Number(value.slice(0, 4)) === y}
              disabled={y > maxYear}
              onClick={() => {
                setYear(y);
                setView("months");
              }}
            >
              {y}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
