"use client";

import { useMemo, useState } from "react";
import Button from "@mui/material/Button";

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
const ACCENT = "var(--accent)";
const ACCENT_BG = "var(--accent-surface)";
// The whole-cell tint an event's row(s) sit on - kept subtle (surface-muted,
// not border-soft) now that the event's own title renders as a small chip
// (AC "events as radius-xs chips") rather than filling the cell itself.
const BUSY_BG = "var(--surface-muted)";
const BUSY_TEXT = "var(--text-secondary)";
const BORDER = "var(--border-soft)";
const MUTED = "var(--text-muted)";

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

// Compact start-to-end label for a slot cell, e.g. "9:00-9:30 AM" (shared AM/PM
// shown once) or "11:30 AM-12:00 PM" when they straddle noon. Plain hyphen, no
// long dash.
function slotRangeLabel(startMin: number, endMin: number): string {
  const start = minuteLabel(startMin);
  const end = minuteLabel(endMin);
  const startPeriod = start.slice(-2);
  const endPeriod = end.slice(-2);
  return startPeriod === endPeriod ? `${start.slice(0, -3)}-${end}` : `${start}-${end}`;
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
    return (
      <p
        style={{
          margin: 0,
          padding: "var(--space-6) var(--space-4)",
          textAlign: "center",
          color: "var(--text-secondary)",
          fontSize: "var(--font-size-md)",
        }}
      >
        No open times in your working hours over the next couple of weeks.
      </p>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--space-2)",
        }}
      >
        <Button variant="outlined" size="small" onClick={() => setPageOverride(page - 1)} disabled={page <= 0}>
          ‹ Earlier
        </Button>
        <span style={{ fontSize: "var(--font-size-sm)", color: BUSY_TEXT }}>
          Pick a highlighted time. Shaded blocks are existing events.
        </span>
        <Button variant="outlined" size="small" onClick={() => setPageOverride(page + 1)} disabled={page >= maxPage}>
          Later ›
        </Button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520, tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: 64 }} />
              {pageKeys.map((key) => (
                <th
                  key={key}
                  style={{
                    padding: "var(--space-1)",
                    // AM5's tracked-uppercase micro-label idiom, pinned
                    // exactly: font-size-2xs, weight 700, 0.06em tracking,
                    // text-secondary - not the ad hoc 13px/600/no-tracking
                    // this used before.
                    fontSize: "var(--font-size-2xs)",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--text-secondary)",
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  {model.days.get(key)?.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m}>
                <td
                  style={{
                    // AC1 nearest-token would land on --font-size-2xs (exact
                    // 11px match), but that size is reserved for the tracked-
                    // uppercase micro-label idiom (AM5) and this is a plain
                    // (non-uppercase) axis label - table meta is --font-size-
                    // xs's stated purpose, so that wins over pure numeric
                    // distance. Reported as a judgment call.
                    fontSize: "var(--font-size-xs)",
                    color: MUTED,
                    textAlign: "right",
                    paddingRight: "var(--space-2)",
                    whiteSpace: "nowrap",
                    height: 30,
                  }}
                >
                  {m % 60 === 0 ? minuteLabel(m) : ""}
                </td>
                {pageKeys.map((key) => {
                  const day = model.days.get(key);
                  const iso = day?.free.get(m);
                  const busy = day?.busy.find((b) => m < b.end && m + slotMinutes > b.start);
                  const isSelected = iso != null && iso === selectedSlot;

                  if (iso) {
                    return (
                      <td key={key} style={{ borderTop: `1px solid ${BORDER}`, padding: "var(--space-1)" }}>
                        <button
                          type="button"
                          onClick={() => onSelect(iso)}
                          title={`${slotRangeLabel(m, m + slotMinutes)}${isSelected ? " (selected)" : ""}`}
                          style={{
                            width: "100%",
                            height: 26,
                            cursor: "pointer",
                            border: `1px solid ${ACCENT}`,
                            borderRadius: "var(--radius-xs)",
                            background: isSelected ? ACCENT : ACCENT_BG,
                            // --text-on-accent (not a raw "#fff" fallback):
                            // the filled-accent case this token was added
                            // for mid-wave - see globals.css's "Foreground on
                            // a filled surface" note.
                            color: isSelected ? "var(--text-on-accent)" : ACCENT,
                            // AM6: 10px is below the 0.68rem density floor
                            // inside a fixed-width table column - left as a
                            // literal on purpose, not raised to a token.
                            fontSize: 10,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            padding: "0 var(--space-1)",
                          }}
                        >
                          {slotRangeLabel(m, m + slotMinutes)}
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
                          // A subtle whole-span tint (not the old solid
                          // border-soft fill) so an event's duration is still
                          // visible across every row it covers, while the
                          // event's own label renders as a small chip below -
                          // "events as radius-xs chips", not a whole-cell
                          // tint carrying the text.
                          background: BUSY_BG,
                          padding: "var(--space-1)",
                          overflow: "hidden",
                        }}
                        title={busy.title}
                      >
                        {isStart && (
                          <span
                            style={{
                              display: "block",
                              maxWidth: "100%",
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              textOverflow: "ellipsis",
                              padding: "0 var(--space-1)",
                              borderRadius: "var(--radius-xs)",
                              border: `1px solid ${BORDER}`,
                              background: "var(--card-background)",
                              color: BUSY_TEXT,
                              fontSize: "var(--font-size-xs)",
                              fontWeight: 500,
                            }}
                          >
                            {busy.title}
                          </span>
                        )}
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
