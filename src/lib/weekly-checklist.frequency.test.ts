import { describe, expect, it } from "vitest";
import {
  checklistDeadlineKind,
  describeWeeklyChecklistDeadline,
  buildDailyChecklistDeadline,
  buildMonthlyChecklistDeadline,
  checklistDeadlineInstant,
  isChecklistItemCheckedNow,
  isWeeklyChecklistItemOverdue,
  toggleWeeklyChecklistItem,
  type WeeklyChecklistItem,
  type WeeklyChecklistDeadline,
} from "./weekly-checklist";

// ---------------------------------------------------------------------------
// Daily and monthly checklist frequencies.
//
// Contract written before implementation. Two decisions here came from the
// instructor directly and are NOT the implementer's to revisit:
//
//  1. A daily or monthly item's check applies to the CURRENT PERIOD only - it
//     comes back unchecked in the next day/month. Weekly and one-off items are
//     unchanged and stay checked until reset.
//  2. Daily items reach the calendar for the CURRENT WEEK ONLY (at most 7
//     events per item), so a 16-week course does not put ~112 events into a
//     real Google Calendar. Monthly items have no such problem (about 4 over a
//     term) and fan out normally. Calendar behaviour is asserted in
//     course-calendar-events, not here; this file covers the domain model.
//
// The existing shape convention is deliberately preserved: ONE object shape
// with ADDITIONAL optional fields, never a discriminated union. See
// WeeklyChecklistDeadline's own doc comment for why - two live consumers read
// `.weekday` unconditionally, and every pre-existing payload must keep parsing
// and keep meaning "weekly".
// ---------------------------------------------------------------------------

function item(over: Partial<WeeklyChecklistItem> & { id: string }): WeeklyChecklistItem {
  return { label: "Item", checked: false, deadline: null, ...over } as WeeklyChecklistItem;
}

// 2026-08-03 is a Monday. Fixed instants only - no Date.now() anywhere.
const MON_AUG_3 = new Date(2026, 7, 3, 9, 0, 0).getTime();
const TUE_AUG_4 = new Date(2026, 7, 4, 9, 0, 0).getTime();
const MON_SEP_7 = new Date(2026, 8, 7, 9, 0, 0).getTime();

describe("checklistDeadlineKind - the vocabulary gains daily and monthly", () => {
  it("still reports the three kinds that already existed", () => {
    expect(checklistDeadlineKind(null)).toBe("none");
    expect(checklistDeadlineKind({ weekday: 1, time: null })).toBe("recurring");
    expect(checklistDeadlineKind({ weekday: 1, time: null, date: "2026-08-03" })).toBe("one-off");
  });

  it("reports the two new kinds", () => {
    expect(checklistDeadlineKind(buildDailyChecklistDeadline(null))).toBe("daily");
    expect(checklistDeadlineKind(buildMonthlyChecklistDeadline(15, null))).toBe("monthly");
  });

  it("lets a one-off date win over a frequency, so a contradictory payload is not ambiguous", () => {
    const contradictory: WeeklyChecklistDeadline = {
      weekday: 1,
      time: null,
      date: "2026-08-03",
      frequency: "daily",
    };
    expect(checklistDeadlineKind(contradictory)).toBe("one-off");
  });

  it("treats an unrecognized frequency as the pre-existing weekly behaviour", () => {
    // Forward compatibility: a payload written by a newer build must degrade
    // to something sane rather than throwing or vanishing from the list.
    const unknown = { weekday: 1, time: null, frequency: "hourly" } as unknown as WeeklyChecklistDeadline;
    expect(checklistDeadlineKind(unknown)).toBe("recurring");
  });
});

describe("buildDailyChecklistDeadline / buildMonthlyChecklistDeadline", () => {
  it("builds a daily deadline that carries its optional time", () => {
    expect(buildDailyChecklistDeadline("17:00")?.time).toBe("17:00");
    expect(buildDailyChecklistDeadline(null)?.time).toBeNull();
  });

  it("builds a monthly deadline on the requested day of month", () => {
    expect(buildMonthlyChecklistDeadline(15, "09:30")?.dayOfMonth).toBe(15);
  });

  it("rejects a day of month outside 1-31 rather than storing nonsense", () => {
    expect(buildMonthlyChecklistDeadline(0, null)).toBeNull();
    expect(buildMonthlyChecklistDeadline(32, null)).toBeNull();
    expect(buildMonthlyChecklistDeadline(-1, null)).toBeNull();
    expect(buildMonthlyChecklistDeadline(1.5, null)).toBeNull();
  });
});

describe("describeWeeklyChecklistDeadline", () => {
  it("describes the new kinds in plain language", () => {
    expect(describeWeeklyChecklistDeadline(buildDailyChecklistDeadline(null)).toLowerCase()).toContain("daily");
    expect(describeWeeklyChecklistDeadline(buildMonthlyChecklistDeadline(15, null)).toLowerCase()).toContain("monthly");
  });

  it("includes the day of month for a monthly item", () => {
    expect(describeWeeklyChecklistDeadline(buildMonthlyChecklistDeadline(15, null))).toContain("15");
  });

  it("still describes a weekly item exactly as before", () => {
    // Guards against the new branches accidentally capturing the old path.
    const weekly = describeWeeklyChecklistDeadline({ weekday: 1, time: "17:00" });
    expect(weekly.toLowerCase()).toContain("monday");
    expect(weekly.toLowerCase()).not.toContain("daily");
    expect(weekly.toLowerCase()).not.toContain("monthly");
  });
});

describe("checklistDeadlineInstant - monthly clamps to a real calendar day", () => {
  it("resolves a monthly deadline to that day of the current month", () => {
    const at = new Date(checklistDeadlineInstant(buildMonthlyChecklistDeadline(15, null)!, MON_AUG_3));
    expect(at.getMonth()).toBe(7);
    expect(at.getDate()).toBe(15);
  });

  it("clamps day 31 to the last day of a 30-day month", () => {
    // September has 30 days. Rolling over into October instead would move the
    // deadline into the wrong month entirely, which is the classic bug here.
    const at = new Date(checklistDeadlineInstant(buildMonthlyChecklistDeadline(31, null)!, MON_SEP_7));
    expect(at.getMonth()).toBe(8);
    expect(at.getDate()).toBe(30);
  });

  it("clamps day 30 to the last day of February", () => {
    const feb = new Date(2026, 1, 10, 9, 0, 0).getTime();
    const at = new Date(checklistDeadlineInstant(buildMonthlyChecklistDeadline(30, null)!, feb));
    expect(at.getMonth()).toBe(1);
    expect(at.getDate()).toBe(28);
  });

  it("resolves a daily deadline to today", () => {
    const at = new Date(checklistDeadlineInstant(buildDailyChecklistDeadline(null)!, TUE_AUG_4));
    expect(at.getMonth()).toBe(7);
    expect(at.getDate()).toBe(4);
  });

  it("applies the deadline time when one is set", () => {
    const at = new Date(checklistDeadlineInstant(buildDailyChecklistDeadline("17:30")!, TUE_AUG_4));
    expect(at.getHours()).toBe(17);
    expect(at.getMinutes()).toBe(30);
  });
});

describe("isChecklistItemCheckedNow - a check applies to its own period", () => {
  it("clears a daily check once the calendar day has rolled over", () => {
    const daily = item({
      id: "d",
      checked: true,
      checkedAt: MON_AUG_3,
      deadline: buildDailyChecklistDeadline(null),
    });
    expect(isChecklistItemCheckedNow(daily, MON_AUG_3)).toBe(true);
    expect(isChecklistItemCheckedNow(daily, TUE_AUG_4)).toBe(false);
  });

  it("clears a monthly check once the calendar month has rolled over", () => {
    const monthly = item({
      id: "m",
      checked: true,
      checkedAt: MON_AUG_3,
      deadline: buildMonthlyChecklistDeadline(15, null),
    });
    expect(isChecklistItemCheckedNow(monthly, MON_AUG_3)).toBe(true);
    expect(isChecklistItemCheckedNow(monthly, TUE_AUG_4)).toBe(true);
    expect(isChecklistItemCheckedNow(monthly, MON_SEP_7)).toBe(false);
  });

  it("leaves weekly and one-off checks persistent, exactly as today", () => {
    // The module's documented invariant - no implicit clearing - still holds
    // for every kind that existed before this change.
    const weekly = item({ id: "w", checked: true, checkedAt: MON_AUG_3, deadline: { weekday: 1, time: null } });
    const oneOff = item({
      id: "o",
      checked: true,
      checkedAt: MON_AUG_3,
      deadline: { weekday: 1, time: null, date: "2026-08-03" },
    });
    expect(isChecklistItemCheckedNow(weekly, MON_SEP_7)).toBe(true);
    expect(isChecklistItemCheckedNow(oneOff, MON_SEP_7)).toBe(true);
  });

  it("leaves an item with no deadline persistent", () => {
    const plain = item({ id: "p", checked: true, checkedAt: MON_AUG_3, deadline: null });
    expect(isChecklistItemCheckedNow(plain, MON_SEP_7)).toBe(true);
  });

  it("reports an unchecked item as unchecked whatever its frequency", () => {
    const daily = item({ id: "d", checked: false, deadline: buildDailyChecklistDeadline(null) });
    expect(isChecklistItemCheckedNow(daily, MON_AUG_3)).toBe(false);
  });

  it("treats a checked item with no checkedAt as checked, not as expired", () => {
    // Rows written before checkedAt existed carry a check but no timestamp.
    // Silently unchecking those would look like data loss to the instructor.
    const legacy = item({ id: "l", checked: true, deadline: buildDailyChecklistDeadline(null) });
    expect(isChecklistItemCheckedNow(legacy, MON_SEP_7)).toBe(true);
  });

  it("does NOT mutate the stored item - the check expires only in the reading", () => {
    // Deliberate: the stored row keeps checked/checkedAt untouched, so this
    // needs no write path, no migration, and no background job, and the
    // module's "no implicit clearing" invariant stays literally true.
    const daily = item({
      id: "d",
      checked: true,
      checkedAt: MON_AUG_3,
      deadline: buildDailyChecklistDeadline(null),
    });
    isChecklistItemCheckedNow(daily, MON_SEP_7);
    expect(daily.checked).toBe(true);
    expect(daily.checkedAt).toBe(MON_AUG_3);
  });
});

describe("isWeeklyChecklistItemOverdue respects the per-period check", () => {
  it("makes a daily item overdue again the day after it was checked", () => {
    const daily = item({
      id: "d",
      checked: true,
      checkedAt: MON_AUG_3,
      deadline: buildDailyChecklistDeadline("08:00"),
    });
    // Checked today at 09:00 for an 08:00 deadline: not overdue.
    expect(isWeeklyChecklistItemOverdue(daily, MON_AUG_3)).toBe(false);
    // Next day past 08:00, the check no longer applies, so it is overdue.
    expect(isWeeklyChecklistItemOverdue(daily, TUE_AUG_4)).toBe(true);
  });
});

describe("toggleWeeklyChecklistItem flips the EFFECTIVE state (isChecklistItemCheckedNow), not the raw flag", () => {
  // toggleWeeklyChecklistItem (weekly-checklist.ts) reads
  // `!isChecklistItemCheckedNow(item, nowMs)` to decide the new checked
  // value, not `!item.checked`. For a daily/monthly item whose raw `checked`
  // is stale from an earlier period, the two disagree: the box DISPLAYS as
  // unchecked (isChecklistItemCheckedNow says false) even though the raw
  // flag is still true. A click on that visually-unchecked box must CHECK
  // it, not flip the raw flag straight to false.

  it("a daily item raw-checked in a PREVIOUS day: isChecklistItemCheckedNow reads false, and toggling CHECKS it, stamping checkedAt for today", () => {
    const daily = item({
      id: "d",
      checked: true,
      checkedAt: MON_AUG_3,
      deadline: buildDailyChecklistDeadline(null),
    });
    expect(isChecklistItemCheckedNow(daily, TUE_AUG_4)).toBe(false); // stale raw check, displays unchecked
    const next = toggleWeeklyChecklistItem([daily], "d", TUE_AUG_4);
    expect(next[0].checked).toBe(true);
    expect(next[0].checkedAt).toBe(TUE_AUG_4);
  });

  it("a daily item raw-checked WITHIN the CURRENT day: toggling UNCHECKS it", () => {
    const daily = item({
      id: "d",
      checked: true,
      checkedAt: MON_AUG_3,
      deadline: buildDailyChecklistDeadline(null),
    });
    const laterSameDay = MON_AUG_3 + 60_000;
    expect(isChecklistItemCheckedNow(daily, laterSameDay)).toBe(true); // still within today, displays checked
    const next = toggleWeeklyChecklistItem([daily], "d", laterSameDay);
    expect(next[0].checked).toBe(false);
    expect(next[0].checkedAt).toBeNull();
  });

  it("a monthly item raw-checked in a PREVIOUS month: isChecklistItemCheckedNow reads false, and toggling CHECKS it, stamping checkedAt for this month", () => {
    const monthly = item({
      id: "m",
      checked: true,
      checkedAt: MON_AUG_3,
      deadline: buildMonthlyChecklistDeadline(15, null),
    });
    expect(isChecklistItemCheckedNow(monthly, MON_SEP_7)).toBe(false); // rolled into a new calendar month
    const next = toggleWeeklyChecklistItem([monthly], "m", MON_SEP_7);
    expect(next[0].checked).toBe(true);
    expect(next[0].checkedAt).toBe(MON_SEP_7);
  });

  it("a monthly item raw-checked WITHIN the CURRENT month: toggling UNCHECKS it", () => {
    const monthly = item({
      id: "m",
      checked: true,
      checkedAt: MON_AUG_3,
      deadline: buildMonthlyChecklistDeadline(15, null),
    });
    expect(isChecklistItemCheckedNow(monthly, TUE_AUG_4)).toBe(true); // still within August, displays checked
    const next = toggleWeeklyChecklistItem([monthly], "m", TUE_AUG_4);
    expect(next[0].checked).toBe(false);
    expect(next[0].checkedAt).toBeNull();
  });

  it("a monthly item at the exact calendar-month boundary (checked the last instant of August): toggling on the first instant of September CHECKS it", () => {
    // The narrowest possible gap across the boundary - one second, not one of
    // this file's usual multi-week fixtures - so this pins isSameLocalMonth's
    // actual comparison (calendar month/year, not "N days apart") rather than
    // something a day-count-based bug could accidentally satisfy too.
    const AUG_31_LATE = new Date(2026, 7, 31, 23, 59, 59).getTime();
    const SEP_1_EARLY = new Date(2026, 8, 1, 0, 0, 0).getTime();
    const monthly = item({
      id: "m",
      checked: true,
      checkedAt: AUG_31_LATE,
      deadline: buildMonthlyChecklistDeadline(15, null),
    });
    expect(isChecklistItemCheckedNow(monthly, SEP_1_EARLY)).toBe(false);
    const next = toggleWeeklyChecklistItem([monthly], "m", SEP_1_EARLY);
    expect(next[0].checked).toBe(true);
    expect(next[0].checkedAt).toBe(SEP_1_EARLY);
  });

  it("control: a weekly item's toggle is unaffected - persistent, so the raw checked flag still drives the flip directly", () => {
    const weekly = item({ id: "w", checked: true, checkedAt: MON_AUG_3, deadline: { weekday: 1, time: null } });
    expect(isChecklistItemCheckedNow(weekly, MON_SEP_7)).toBe(true); // persistent: matches raw checked exactly
    const next = toggleWeeklyChecklistItem([weekly], "w", MON_SEP_7);
    expect(next[0].checked).toBe(false);
    expect(next[0].checkedAt).toBeNull();
  });

  it("control: a one-off item's toggle is unaffected - persistent, same as a weekly item", () => {
    const oneOff = item({
      id: "o",
      checked: true,
      checkedAt: MON_AUG_3,
      deadline: { weekday: 1, time: null, date: "2026-08-03" },
    });
    expect(isChecklistItemCheckedNow(oneOff, MON_SEP_7)).toBe(true); // persistent: matches raw checked exactly
    const next = toggleWeeklyChecklistItem([oneOff], "o", MON_SEP_7);
    expect(next[0].checked).toBe(false);
    expect(next[0].checkedAt).toBeNull();
  });

  it("does not mutate the input item or input array - a fresh array and a fresh object come back", () => {
    const daily = item({
      id: "d",
      checked: true,
      checkedAt: MON_AUG_3,
      deadline: buildDailyChecklistDeadline(null),
    });
    const items = [daily];
    const next = toggleWeeklyChecklistItem(items, "d", TUE_AUG_4);

    // The original item object is untouched.
    expect(daily.checked).toBe(true);
    expect(daily.checkedAt).toBe(MON_AUG_3);
    // The original array is untouched, and the result is a distinct array
    // holding a distinct (new) item object.
    expect(items[0]).toBe(daily);
    expect(next).not.toBe(items);
    expect(next[0]).not.toBe(daily);
  });
});
