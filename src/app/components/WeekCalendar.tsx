"use client";

import { useMemo, useState } from "react";

export interface CalendarEventBlock {
  startISO: string;
  endISO: string;
  title: string;
}

interface WeekCalendarProps {
  timeZone: string;
  workStartHour: number;
  workEndHour: number;
  slotMinutes: number;
  /** ISO start times of the bookable open slots. */
  slots: string[];
  /** Real events in the window, drawn as busy blocks behind the slots. */
  events: CalendarEventBlock[];
  selectedSlot: string | null;
  onSelect: (iso: string) => void;
}

const DAYS_PER_PAGE = 5;

// Brand palette (matches the rest of the app).
const ACCENT = "#2563eb";
const ACCENT_BG = "#eff4ff";
const BUSY_BG = "#e5e7eb";
const BUSY_TEXT = "#6b7280";
const BORDER = "#e5e7eb";
const MUTED = "#9ca3af";

// Wall-clock parts of an ISO instant in a given IANA time zone.
function zonedParts(iso: string, timeZone: string): { dateKey: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const hour = Number(m.hour) % 24;
  return { dateKey: `${m.year}-${m.month}-${m.day}`, minutes: hour * 60 + Number(m.minute) };
}

function dayLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function minuteLabel(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60);
  const min = totalMinutes % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${period}`;
}

export default function WeekCalendar({
  timeZone,
  workStartHour,
  workEndHour,
  slotMinutes,
  slots,
  events,
  selectedSlot,
  onSelect,
}: WeekCalendarProps) {
  const model = useMemo(() => {
    // dateKey -> { label, free: Map<startMinute, iso>, busy: [{start,end,title}] }
    const days = new Map<
      string,
      { label: string; free: Map<number, string>; busy: Array<{ start: number; end: number; title: string }> }
    >();
    const ensure = (dateKey: string, label: string) => {
      let d = days.get(dateKey);
      if (!d) {
        d = { label, free: new Map(), busy: [] };
        days.set(dateKey, d);
      }
      return d;
    };

    for (const iso of slots) {
      const { dateKey, minutes } = zonedParts(iso, timeZone);
      ensure(dateKey, dayLabel(iso, timeZone)).free.set(minutes, iso);
    }
    for (const ev of events) {
      const s = zonedParts(ev.startISO, timeZone);
      const e = zonedParts(ev.endISO, timeZone);
      // Clamp to a single day; a rare multi-day event just fills its first day.
      const end = e.dateKey === s.dateKey ? e.minutes : workEndHour * 60;
      ensure(s.dateKey, dayLabel(ev.startISO, timeZone)).busy.push({
        start: s.minutes,
        end,
        title: ev.title,
      });
    }

    const orderedKeys = [...days.keys()].sort();
    // The page to open on: the one holding the earliest open slot.
    const firstSlotKey = slots.length
      ? orderedKeys.find((k) => (days.get(k)?.free.size ?? 0) > 0)
      : undefined;
    const firstSlotPage = firstSlotKey
      ? Math.floor(orderedKeys.indexOf(firstSlotKey) / DAYS_PER_PAGE)
      : 0;

    return { days, orderedKeys, firstSlotPage };
  }, [slots, events, timeZone, workEndHour]);

  const [pageOverride, setPageOverride] = useState<number | null>(null);
  const maxPage = Math.max(0, Math.ceil(model.orderedKeys.length / DAYS_PER_PAGE) - 1);
  const page = Math.min(pageOverride ?? model.firstSlotPage, maxPage);
  const pageKeys = model.orderedKeys.slice(page * DAYS_PER_PAGE, page * DAYS_PER_PAGE + DAYS_PER_PAGE);

  const rows: number[] = [];
  for (let m = workStartHour * 60; m + slotMinutes <= workEndHour * 60; m += slotMinutes) rows.push(m);

  if (model.orderedKeys.length === 0) {
    return <p style={{ color: MUTED }}>No open times in your working hours over the next couple of weeks.</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <button type="button" onClick={() => setPageOverride(page - 1)} disabled={page <= 0}>
          ‹ Earlier
        </button>
        <span style={{ fontSize: 13, color: BUSY_TEXT }}>
          Pick a highlighted time. Shaded blocks are existing events.
        </span>
        <button type="button" onClick={() => setPageOverride(page + 1)} disabled={page >= maxPage}>
          Later ›
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520, tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: 64 }} />
              {pageKeys.map((key) => (
                <th key={key} style={{ padding: "6px 4px", fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>
                  {model.days.get(key)?.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m}>
                <td style={{ fontSize: 11, color: MUTED, textAlign: "right", paddingRight: 8, whiteSpace: "nowrap", height: 30 }}>
                  {m % 60 === 0 ? minuteLabel(m) : ""}
                </td>
                {pageKeys.map((key) => {
                  const day = model.days.get(key);
                  const iso = day?.free.get(m);
                  const busy = day?.busy.find((b) => m < b.end && m + slotMinutes > b.start);
                  const isSelected = iso != null && iso === selectedSlot;

                  if (iso) {
                    return (
                      <td key={key} style={{ borderTop: `1px solid ${BORDER}`, padding: 2 }}>
                        <button
                          type="button"
                          onClick={() => onSelect(iso)}
                          style={{
                            width: "100%",
                            height: 26,
                            cursor: "pointer",
                            border: `1px solid ${ACCENT}`,
                            borderRadius: 6,
                            background: isSelected ? ACCENT : ACCENT_BG,
                            color: isSelected ? "#fff" : ACCENT,
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {isSelected ? "Selected" : "Open"}
                        </button>
                      </td>
                    );
                  }
                  if (busy) {
                    const isStart = busy.start >= m && busy.start < m + slotMinutes;
                    return (
                      <td
                        key={key}
                        style={{
                          borderTop: `1px solid ${BORDER}`,
                          background: BUSY_BG,
                          color: BUSY_TEXT,
                          fontSize: 11,
                          padding: "2px 6px",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                          maxWidth: 0,
                        }}
                        title={busy.title}
                      >
                        {isStart ? busy.title : ""}
                      </td>
                    );
                  }
                  return <td key={key} style={{ borderTop: `1px solid ${BORDER}`, height: 30 }} />;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
