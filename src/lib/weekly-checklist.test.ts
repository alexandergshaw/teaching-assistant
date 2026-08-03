import { describe, it, expect } from "vitest";
import {
  coerceWeeklyChecklist,
  describeWeeklyChecklistDeadline,
  weeklyOccurrenceInstant,
  checklistDeadlineInstant,
  isWeeklyChecklistItemOverdue,
  isOneOffChecklistDeadline,
  checklistDeadlineKind,
  resolveDeadlineForKindChange,
  buildOneOffChecklistDeadline,
  buildDailyChecklistDeadline,
  buildMonthlyChecklistDeadline,
  daysInChecklistMonth,
  parseChecklistDeadlineDate,
  summarizeWeeklyChecklist,
  countOpenWeeklyChecklistItems,
  countCheckedWeeklyChecklistItems,
  toggleWeeklyChecklistItem,
  addWeeklyChecklistItem,
  removeWeeklyChecklistItem,
  setWeeklyChecklistItemLabel,
  setWeeklyChecklistItemDeadline,
  reorderWeeklyChecklistItem,
  resetAllWeeklyChecklistChecks,
  checklistDeadlineChangeNeedsCalendarSync,
  WEEKLY_CHECKLIST_MAX_ITEMS,
  WEEKLY_CHECKLIST_MAX_LABEL_LENGTH,
  type WeeklyChecklistItem,
  type WeeklyChecklistDeadline,
} from "./weekly-checklist";

// Jan 4, 2026 is a Sunday (verified against assignment-due-rule.test.ts's
// oneOfEachWeekday, which iterates Jan 4-10 to cover every weekday once and
// derives "Monday" by walking forward from Jan 4). Day index i (0=Sunday)
// therefore falls on calendar date Jan (4 + i), 2026.
function dateForWeekday(weekday: number, hour = 0, minute = 0): Date {
  return new Date(2026, 0, 4 + weekday, hour, minute, 0, 0);
}

function item(overrides: Partial<WeeklyChecklistItem> = {}): WeeklyChecklistItem {
  return { id: "id-1", label: "Grade discussion posts", checked: false, checkedAt: null, deadline: null, ...overrides };
}

describe("coerceWeeklyChecklist", () => {
  it("never throws and returns [] for non-array input", () => {
    for (const raw of [null, undefined, "garbage", 42, {}, true]) {
      expect(() => coerceWeeklyChecklist(raw)).not.toThrow();
      expect(coerceWeeklyChecklist(raw)).toEqual([]);
    }
  });

  it("passes through a well-formed item unchanged", () => {
    const raw = [
      { id: "a", label: "Post announcement", checked: true, checkedAt: 1_700_000_000_000, deadline: { weekday: 1, time: "09:00" } },
    ];
    expect(coerceWeeklyChecklist(raw)).toEqual([
      { id: "a", label: "Post announcement", checked: true, checkedAt: 1_700_000_000_000, deadline: { weekday: 1, time: "09:00" } },
    ]);
  });

  it("defaults checked to false unless it is literally true", () => {
    expect(coerceWeeklyChecklist([{ id: "a", label: "x" }])[0].checked).toBe(false);
    expect(coerceWeeklyChecklist([{ id: "a", label: "x", checked: "true" }])[0].checked).toBe(false);
    expect(coerceWeeklyChecklist([{ id: "a", label: "x", checked: 1 }])[0].checked).toBe(false);
    expect(coerceWeeklyChecklist([{ id: "a", label: "x", checked: true }])[0].checked).toBe(true);
  });

  it("drops an entry that is not an object", () => {
    expect(coerceWeeklyChecklist(["a string", 42, null, ["nested", "array"]])).toEqual([]);
  });

  it("drops an entry with a missing or empty id", () => {
    expect(coerceWeeklyChecklist([{ label: "x" }])).toEqual([]);
    expect(coerceWeeklyChecklist([{ id: "", label: "x" }])).toEqual([]);
    expect(coerceWeeklyChecklist([{ id: "   ", label: "x" }])).toEqual([]);
    expect(coerceWeeklyChecklist([{ id: 42, label: "x" }])).toEqual([]);
  });

  it("drops an entry with a missing, non-string, or blank label", () => {
    expect(coerceWeeklyChecklist([{ id: "a" }])).toEqual([]);
    expect(coerceWeeklyChecklist([{ id: "a", label: 42 }])).toEqual([]);
    expect(coerceWeeklyChecklist([{ id: "a", label: "   " }])).toEqual([]);
  });

  it("trims the label", () => {
    expect(coerceWeeklyChecklist([{ id: "a", label: "  Grade posts  " }])[0].label).toBe("Grade posts");
  });

  it("caps the label at WEEKLY_CHECKLIST_MAX_LABEL_LENGTH", () => {
    const long = "x".repeat(WEEKLY_CHECKLIST_MAX_LABEL_LENGTH + 50);
    const out = coerceWeeklyChecklist([{ id: "a", label: long }]);
    expect(out[0].label.length).toBe(WEEKLY_CHECKLIST_MAX_LABEL_LENGTH);
  });

  it("caps the item count at WEEKLY_CHECKLIST_MAX_ITEMS, keeping the earliest entries", () => {
    const raw = Array.from({ length: WEEKLY_CHECKLIST_MAX_ITEMS + 5 }, (_, i) => ({ id: `id-${i}`, label: `item ${i}` }));
    const out = coerceWeeklyChecklist(raw);
    expect(out.length).toBe(WEEKLY_CHECKLIST_MAX_ITEMS);
    expect(out[0].id).toBe("id-0");
    expect(out[out.length - 1].id).toBe(`id-${WEEKLY_CHECKLIST_MAX_ITEMS - 1}`);
  });

  it("drops a malformed deadline (out of range, non-integer, wrong type, or missing) but keeps the item", () => {
    expect(coerceWeeklyChecklist([{ id: "a", label: "x", deadline: { weekday: 7 } }])[0].deadline).toBeNull();
    expect(coerceWeeklyChecklist([{ id: "a", label: "x", deadline: { weekday: -1 } }])[0].deadline).toBeNull();
    expect(coerceWeeklyChecklist([{ id: "a", label: "x", deadline: { weekday: 2.5 } }])[0].deadline).toBeNull();
    expect(coerceWeeklyChecklist([{ id: "a", label: "x", deadline: { weekday: "1" } }])[0].deadline).toBeNull();
    expect(coerceWeeklyChecklist([{ id: "a", label: "x", deadline: "sun" }])[0].deadline).toBeNull();
    expect(coerceWeeklyChecklist([{ id: "a", label: "x", deadline: null }])[0].deadline).toBeNull();
    expect(coerceWeeklyChecklist([{ id: "a", label: "x" }])[0].deadline).toBeNull();
  });

  it("accepts a valid weekday with no time", () => {
    expect(coerceWeeklyChecklist([{ id: "a", label: "x", deadline: { weekday: 3 } }])[0].deadline).toEqual({
      weekday: 3,
      time: null,
    });
  });

  it("drops an invalid time but keeps the weekday", () => {
    expect(
      coerceWeeklyChecklist([{ id: "a", label: "x", deadline: { weekday: 3, time: "25:00" } }])[0].deadline
    ).toEqual({ weekday: 3, time: null });
    expect(
      coerceWeeklyChecklist([{ id: "a", label: "x", deadline: { weekday: 3, time: "not-a-time" } }])[0].deadline
    ).toEqual({ weekday: 3, time: null });
  });

  it("normalizes a single-digit hour in the time", () => {
    expect(
      coerceWeeklyChecklist([{ id: "a", label: "x", deadline: { weekday: 3, time: "9:05" } }])[0].deadline
    ).toEqual({ weekday: 3, time: "09:05" });
  });
});

describe("coerceWeeklyChecklist - checkedAt", () => {
  it("defaults a missing checkedAt to null even when checked is true", () => {
    expect(coerceWeeklyChecklist([{ id: "a", label: "x", checked: true }])[0].checkedAt).toBeNull();
  });

  it("keeps a valid finite-number checkedAt when checked is true", () => {
    expect(
      coerceWeeklyChecklist([{ id: "a", label: "x", checked: true, checkedAt: 1_700_000_000_000 }])[0].checkedAt
    ).toBe(1_700_000_000_000);
  });

  it("drops a malformed checkedAt (string, NaN, Infinity, object) back to null, keeping the item checked", () => {
    for (const malformed of ["1700000000000", Number.NaN, Number.POSITIVE_INFINITY, {}, null, undefined]) {
      const out = coerceWeeklyChecklist([{ id: "a", label: "x", checked: true, checkedAt: malformed }]);
      expect(out[0].checked).toBe(true);
      expect(out[0].checkedAt).toBeNull();
    }
  });

  it("forces checkedAt to null whenever checked is false, regardless of what raw.checkedAt says", () => {
    const out = coerceWeeklyChecklist([{ id: "a", label: "x", checked: false, checkedAt: 1_700_000_000_000 }]);
    expect(out[0].checked).toBe(false);
    expect(out[0].checkedAt).toBeNull();

    const uncheckedByDefault = coerceWeeklyChecklist([{ id: "a", label: "x", checkedAt: 1_700_000_000_000 }]);
    expect(uncheckedByDefault[0].checked).toBe(false);
    expect(uncheckedByDefault[0].checkedAt).toBeNull();
  });
});

describe("describeWeeklyChecklistDeadline", () => {
  it("returns '' for null", () => {
    expect(describeWeeklyChecklistDeadline(null)).toBe("");
  });

  it("describes a day with no time", () => {
    expect(describeWeeklyChecklistDeadline({ weekday: 0, time: null })).toBe("Sundays");
    expect(describeWeeklyChecklistDeadline({ weekday: 6, time: null })).toBe("Saturdays");
  });

  it("describes a day with a time in 12-hour form", () => {
    expect(describeWeeklyChecklistDeadline({ weekday: 1, time: "09:00" })).toBe("Mondays at 9:00 AM");
    expect(describeWeeklyChecklistDeadline({ weekday: 5, time: "23:59" })).toBe("Fridays at 11:59 PM");
  });
});

describe("weeklyOccurrenceInstant / isWeeklyChecklistItemOverdue", () => {
  it("places a timed deadline's occurrence on the correct weekday of the current week, at the given time", () => {
    const now = dateForWeekday(0, 8, 0); // Sunday 08:00, the week's anchor day
    const deadline = { weekday: 3, time: "09:00" }; // Wednesday 09:00
    const occurrence = new Date(weeklyOccurrenceInstant(deadline, now.getTime()));
    expect(occurrence).toEqual(dateForWeekday(3, 9, 0));
  });

  it("treats a missing time as end of day (23:59:59.999) on the deadline's weekday", () => {
    const now = dateForWeekday(0, 8, 0);
    const occurrence = new Date(weeklyOccurrenceInstant({ weekday: 3, time: null }, now.getTime()));
    const expected = dateForWeekday(3, 23, 59);
    expected.setSeconds(59, 999);
    expect(occurrence).toEqual(expected);
  });

  it("is not overdue before this week's occurrence has passed", () => {
    const now = dateForWeekday(3, 8, 59); // Wednesday 08:59, one minute before deadline
    expect(isWeeklyChecklistItemOverdue(item({ deadline: { weekday: 3, time: "09:00" } }), now.getTime())).toBe(
      false
    );
  });

  it("is overdue once this week's occurrence has passed", () => {
    const now = dateForWeekday(3, 9, 1); // one minute after deadline
    expect(isWeeklyChecklistItemOverdue(item({ deadline: { weekday: 3, time: "09:00" } }), now.getTime())).toBe(
      true
    );
  });

  it("is overdue for an earlier weekday in the same current week (deadline already elapsed this week)", () => {
    const now = dateForWeekday(5, 12, 0); // Friday
    expect(isWeeklyChecklistItemOverdue(item({ deadline: { weekday: 0, time: null } }), now.getTime())).toBe(true);
  });

  it("is never overdue with no deadline, regardless of checked state", () => {
    const now = dateForWeekday(6, 23, 59);
    expect(isWeeklyChecklistItemOverdue(item({ deadline: null, checked: false }), now.getTime())).toBe(false);
    expect(isWeeklyChecklistItemOverdue(item({ deadline: null, checked: true }), now.getTime())).toBe(false);
  });

  it("is never overdue once checked, even if the deadline has long passed - checked state is persistent, so a stale check must not scream overdue", () => {
    const now = dateForWeekday(6, 23, 59); // Saturday, end of the week
    const overdueDeadline = { weekday: 0, time: "00:00" }; // Sunday, days ago this week
    expect(isWeeklyChecklistItemOverdue(item({ deadline: overdueDeadline, checked: false }), now.getTime())).toBe(
      true
    );
    expect(isWeeklyChecklistItemOverdue(item({ deadline: overdueDeadline, checked: true }), now.getTime())).toBe(
      false
    );
  });
});

describe("summarizeWeeklyChecklist", () => {
  it("counts total, done, and overdue", () => {
    const now = dateForWeekday(5, 12, 0); // Friday
    const items: WeeklyChecklistItem[] = [
      item({ id: "1", checked: true }),
      item({ id: "2", checked: false, deadline: { weekday: 0, time: null } }), // overdue (Sunday already passed)
      item({ id: "3", checked: false, deadline: { weekday: 6, time: null } }), // not yet due (Saturday)
      item({ id: "4", checked: false, deadline: null }),
    ];
    expect(summarizeWeeklyChecklist(items, now.getTime())).toEqual({ total: 4, doneCount: 1, overdueCount: 1 });
  });

  it("handles an empty list", () => {
    expect(summarizeWeeklyChecklist([], Date.now())).toEqual({ total: 0, doneCount: 0, overdueCount: 0 });
  });
});

describe("countOpenWeeklyChecklistItems / countCheckedWeeklyChecklistItems", () => {
  it("counts open (unchecked) and checked items", () => {
    const items = [item({ id: "1", checked: true }), item({ id: "2", checked: true }), item({ id: "3", checked: false })];
    expect(countOpenWeeklyChecklistItems(items)).toBe(1);
    expect(countCheckedWeeklyChecklistItems(items)).toBe(2);
  });

  it("returns 0 for an empty list", () => {
    expect(countOpenWeeklyChecklistItems([])).toBe(0);
    expect(countCheckedWeeklyChecklistItems([])).toBe(0);
  });
});

describe("toggleWeeklyChecklistItem", () => {
  const NOW = dateForWeekday(3, 9, 0).getTime();

  it("flips the checked flag of the matching item only", () => {
    const items = [item({ id: "1", checked: false }), item({ id: "2", checked: false })];
    const next = toggleWeeklyChecklistItem(items, "1", NOW);
    expect(next[0].checked).toBe(true);
    expect(next[1].checked).toBe(false);
  });

  it("is a no-op for an unknown id", () => {
    const items = [item({ id: "1", checked: false })];
    expect(toggleWeeklyChecklistItem(items, "missing", NOW)).toEqual(items);
  });

  it("stamps checkedAt with nowMs on unchecked -> checked", () => {
    const items = [item({ id: "1", checked: false, checkedAt: null })];
    const next = toggleWeeklyChecklistItem(items, "1", NOW);
    expect(next[0].checked).toBe(true);
    expect(next[0].checkedAt).toBe(NOW);
  });

  it("clears checkedAt back to null on checked -> unchecked", () => {
    const items = [item({ id: "1", checked: true, checkedAt: NOW - 1000 })];
    const next = toggleWeeklyChecklistItem(items, "1", NOW);
    expect(next[0].checked).toBe(false);
    expect(next[0].checkedAt).toBeNull();
  });

  it("re-checking after an uncheck stamps the new nowMs, not the old one", () => {
    const originallyChecked = [item({ id: "1", checked: true, checkedAt: NOW - 100_000 })];
    const unchecked = toggleWeeklyChecklistItem(originallyChecked, "1", NOW);
    expect(unchecked[0].checkedAt).toBeNull();

    const laterNow = NOW + 500_000;
    const rechecked = toggleWeeklyChecklistItem(unchecked, "1", laterNow);
    expect(rechecked[0].checked).toBe(true);
    expect(rechecked[0].checkedAt).toBe(laterNow);
  });
});

describe("addWeeklyChecklistItem", () => {
  it("appends the new item at the end", () => {
    const items = [item({ id: "1" })];
    const next = addWeeklyChecklistItem(items, item({ id: "2", label: "New" }));
    expect(next.map((i) => i.id)).toEqual(["1", "2"]);
  });

  it("refuses to add once the list is at WEEKLY_CHECKLIST_MAX_ITEMS", () => {
    const items = Array.from({ length: WEEKLY_CHECKLIST_MAX_ITEMS }, (_, i) => item({ id: `id-${i}` }));
    const next = addWeeklyChecklistItem(items, item({ id: "overflow" }));
    expect(next).toBe(items);
    expect(next.length).toBe(WEEKLY_CHECKLIST_MAX_ITEMS);
  });
});

describe("removeWeeklyChecklistItem", () => {
  it("removes exactly the matching item", () => {
    const items = [item({ id: "1" }), item({ id: "2" }), item({ id: "3" })];
    expect(removeWeeklyChecklistItem(items, "2").map((i) => i.id)).toEqual(["1", "3"]);
  });

  it("is a no-op for an unknown id", () => {
    const items = [item({ id: "1" })];
    expect(removeWeeklyChecklistItem(items, "missing")).toEqual(items);
  });
});

describe("setWeeklyChecklistItemLabel / setWeeklyChecklistItemDeadline", () => {
  it("trims and caps the label of the matching item only", () => {
    const items = [item({ id: "1", label: "old" }), item({ id: "2", label: "untouched" })];
    const next = setWeeklyChecklistItemLabel(items, "1", "  new label  ");
    expect(next[0].label).toBe("new label");
    expect(next[1].label).toBe("untouched");

    const long = "y".repeat(WEEKLY_CHECKLIST_MAX_LABEL_LENGTH + 20);
    expect(setWeeklyChecklistItemLabel(items, "1", long)[0].label.length).toBe(WEEKLY_CHECKLIST_MAX_LABEL_LENGTH);
  });

  it("sets and clears the deadline of the matching item only", () => {
    const items = [item({ id: "1", deadline: null }), item({ id: "2", deadline: { weekday: 2, time: null } })];
    const withDeadline = setWeeklyChecklistItemDeadline(items, "1", { weekday: 4, time: "10:00" });
    expect(withDeadline[0].deadline).toEqual({ weekday: 4, time: "10:00" });
    expect(withDeadline[1].deadline).toEqual({ weekday: 2, time: null });

    const cleared = setWeeklyChecklistItemDeadline(withDeadline, "1", null);
    expect(cleared[0].deadline).toBeNull();
  });
});

describe("reorderWeeklyChecklistItem", () => {
  it("moves an item up, swapping with its predecessor", () => {
    const items = [item({ id: "1" }), item({ id: "2" }), item({ id: "3" })];
    expect(reorderWeeklyChecklistItem(items, "2", "up").map((i) => i.id)).toEqual(["2", "1", "3"]);
  });

  it("moves an item down, swapping with its successor", () => {
    const items = [item({ id: "1" }), item({ id: "2" }), item({ id: "3" })];
    expect(reorderWeeklyChecklistItem(items, "2", "down").map((i) => i.id)).toEqual(["1", "3", "2"]);
  });

  it("is a no-op moving the first item up", () => {
    const items = [item({ id: "1" }), item({ id: "2" })];
    expect(reorderWeeklyChecklistItem(items, "1", "up")).toEqual(items);
  });

  it("is a no-op moving the last item down", () => {
    const items = [item({ id: "1" }), item({ id: "2" })];
    expect(reorderWeeklyChecklistItem(items, "2", "down")).toEqual(items);
  });

  it("is a no-op for an unknown id", () => {
    const items = [item({ id: "1" }), item({ id: "2" })];
    expect(reorderWeeklyChecklistItem(items, "missing", "up")).toEqual(items);
  });
});

describe("resetAllWeeklyChecklistChecks", () => {
  it("clears every checked item's checked flag", () => {
    const items = [item({ id: "1", checked: true }), item({ id: "2", checked: true }), item({ id: "3", checked: false })];
    const next = resetAllWeeklyChecklistChecks(items);
    expect(next.every((i) => i.checked === false)).toBe(true);
    expect(next.map((i) => i.id)).toEqual(["1", "2", "3"]);
  });

  it("clears checkedAt alongside checked - AC5: a stale timestamp must not survive a reset", () => {
    const items = [
      item({ id: "1", checked: true, checkedAt: 1_700_000_000_000 }),
      item({ id: "2", checked: true, checkedAt: 1_700_100_000_000 }),
    ];
    const next = resetAllWeeklyChecklistChecks(items);
    expect(next.every((i) => i.checkedAt === null)).toBe(true);
  });

  it("only affects the list passed in - a separate course's list is never touched", () => {
    const courseAItems = [item({ id: "a1", checked: true }), item({ id: "a2", checked: true })];
    const courseBItems = [item({ id: "b1", checked: true })];

    const resetA = resetAllWeeklyChecklistChecks(courseAItems);

    expect(resetA.every((i) => !i.checked)).toBe(true);
    // courseBItems was never passed to the function, so it must be untouched.
    expect(courseBItems.every((i) => i.checked)).toBe(true);
  });

  it("is a genuine no-op (same array reference) when nothing is checked", () => {
    const items = [item({ id: "1", checked: false }), item({ id: "2", checked: false })];
    expect(resetAllWeeklyChecklistChecks(items)).toBe(items);
  });

  it("leaves an already-unchecked item's object reference untouched while resetting others", () => {
    const untouched = item({ id: "2", checked: false });
    const items = [item({ id: "1", checked: true }), untouched];
    const next = resetAllWeeklyChecklistChecks(items);
    expect(next[1]).toBe(untouched);
  });
});

describe("countCheckedWeeklyChecklistItems (confirmation count)", () => {
  it("matches the number of items resetAllWeeklyChecklistChecks would actually change", () => {
    const items = [
      item({ id: "1", checked: true }),
      item({ id: "2", checked: false }),
      item({ id: "3", checked: true }),
      item({ id: "4", checked: true }),
    ];
    const expectedChangedCount = countCheckedWeeklyChecklistItems(items);
    const before = items.map((i) => i.checked);
    const after = resetAllWeeklyChecklistChecks(items).map((i) => i.checked);
    const actualChangedCount = before.filter((wasChecked, i) => wasChecked !== after[i]).length;
    expect(actualChangedCount).toBe(expectedChangedCount);
    expect(expectedChangedCount).toBe(3);
  });
});

describe("checklistDeadlineChangeNeedsCalendarSync", () => {
  const DEADLINE: WeeklyChecklistDeadline = { weekday: 3, time: "09:00" };
  const OTHER_DEADLINE: WeeklyChecklistDeadline = { weekday: 0, time: null };

  it("is false when the deadline was null before and stays null after (nothing to push, ever)", () => {
    expect(checklistDeadlineChangeNeedsCalendarSync(null, null)).toBe(false);
  });

  it("is true when a deadline is gained (null -> non-null) - a create is needed", () => {
    expect(checklistDeadlineChangeNeedsCalendarSync(null, DEADLINE)).toBe(true);
  });

  it("is true when a deadline is lost (non-null -> null) - stale occurrences need deleting", () => {
    expect(checklistDeadlineChangeNeedsCalendarSync(DEADLINE, null)).toBe(true);
  });

  it("is true when a non-null deadline changes to a different non-null deadline - an update is needed", () => {
    expect(checklistDeadlineChangeNeedsCalendarSync(DEADLINE, OTHER_DEADLINE)).toBe(true);
  });

  it("is true when the deadline is unchanged but non-null (e.g. a toggle or rename) - an update is needed", () => {
    expect(checklistDeadlineChangeNeedsCalendarSync(DEADLINE, DEADLINE)).toBe(true);
  });
});

// 2026-01-11 is a Sunday (Jan 4, 2026 is a Sunday - see the module anchor
// comment at the top of this file; Jan 11 is exactly one week later).
const ONE_OFF_DATE = "2026-01-11";

describe("coerceWeeklyChecklist - one-off deadlines (AC1/AC2)", () => {
  it("AC2 migration case: a payload written before this change (no `date` field at all) coerces to a recurring deadline, unchanged", () => {
    const raw = [
      { id: "a", label: "Post announcement", checked: false, checkedAt: null, deadline: { weekday: 1, time: "09:00" } },
    ];
    const out = coerceWeeklyChecklist(raw);
    expect(out[0].deadline).toEqual({ weekday: 1, time: "09:00" });
    expect(isOneOffChecklistDeadline(out[0].deadline)).toBe(false);
    expect(out[0].deadline).not.toHaveProperty("date");
  });

  it("coerces a valid one-off date, deriving weekday from the date and ignoring any raw weekday supplied", () => {
    const raw = [{ id: "a", label: "Submit grades", deadline: { weekday: 9, time: "17:00", date: ONE_OFF_DATE } }];
    const out = coerceWeeklyChecklist(raw);
    expect(out[0].deadline).toEqual({ weekday: 0, time: "17:00", date: ONE_OFF_DATE });
    expect(isOneOffChecklistDeadline(out[0].deadline)).toBe(true);
  });

  it("coerces a one-off date with no time and no raw weekday at all", () => {
    const raw = [{ id: "a", label: "Submit grades", deadline: { date: ONE_OFF_DATE } }];
    const out = coerceWeeklyChecklist(raw);
    expect(out[0].deadline).toEqual({ weekday: 0, time: null, date: ONE_OFF_DATE });
  });

  it("drops a malformed date (wrong type, wrong format, or a nonexistent calendar date) and falls back to recurring using weekday, if valid", () => {
    for (const badDate of ["not-a-date", "2026-02-30", "2026-13-01", 42, null, {}]) {
      const out = coerceWeeklyChecklist([{ id: "a", label: "x", deadline: { weekday: 2, time: "09:00", date: badDate } }]);
      expect(out[0].deadline).toEqual({ weekday: 2, time: "09:00" });
      expect(isOneOffChecklistDeadline(out[0].deadline)).toBe(false);
    }
  });

  it("never rolls Feb 30 forward into March - a malformed date must not become a DIFFERENT, wrong date", () => {
    const out = coerceWeeklyChecklist([{ id: "a", label: "x", deadline: { weekday: 1, date: "2026-02-30" } }]);
    // Falls back to recurring (weekday 1) - must NOT silently become a
    // one-off deadline dated March 2, 2026 (what `new Date(2026,1,30)` would
    // otherwise produce).
    expect(out[0].deadline).toEqual({ weekday: 1, time: null });
  });

  it("a malformed date AND a missing/invalid weekday together null out the whole deadline, same as before this change", () => {
    const out = coerceWeeklyChecklist([{ id: "a", label: "x", deadline: { time: "09:00", date: "garbage" } }]);
    expect(out[0].deadline).toBeNull();
  });

  it("keeps the item cap unchanged for a checklist made entirely of one-off items", () => {
    const raw = Array.from({ length: WEEKLY_CHECKLIST_MAX_ITEMS + 5 }, (_, i) => ({
      id: `id-${i}`,
      label: `item ${i}`,
      deadline: { date: ONE_OFF_DATE },
    }));
    const out = coerceWeeklyChecklist(raw);
    expect(out.length).toBe(WEEKLY_CHECKLIST_MAX_ITEMS);
    expect(out.every((i) => isOneOffChecklistDeadline(i.deadline))).toBe(true);
  });
});

describe("isOneOffChecklistDeadline", () => {
  it("is true when date is a non-empty string", () => {
    expect(isOneOffChecklistDeadline({ weekday: 0, time: null, date: ONE_OFF_DATE })).toBe(true);
  });

  it("is false when date is absent, null, or empty - all mean recurring", () => {
    expect(isOneOffChecklistDeadline({ weekday: 0, time: null })).toBe(false);
    expect(isOneOffChecklistDeadline({ weekday: 0, time: null, date: null })).toBe(false);
    expect(isOneOffChecklistDeadline({ weekday: 0, time: null, date: "" })).toBe(false);
  });

  it("is false for a null deadline (no deadline at all)", () => {
    expect(isOneOffChecklistDeadline(null)).toBe(false);
  });
});

describe("buildOneOffChecklistDeadline", () => {
  it("builds a one-off deadline, deriving weekday from the date", () => {
    expect(buildOneOffChecklistDeadline(ONE_OFF_DATE, "17:00")).toEqual({
      weekday: 0,
      time: "17:00",
      date: ONE_OFF_DATE,
    });
  });

  it("normalizes time the same way coerceWeeklyChecklist's normalizeTime would", () => {
    expect(buildOneOffChecklistDeadline(ONE_OFF_DATE, "9:05")).toEqual({ weekday: 0, time: "09:05", date: ONE_OFF_DATE });
    expect(buildOneOffChecklistDeadline(ONE_OFF_DATE, "25:00")).toEqual({ weekday: 0, time: null, date: ONE_OFF_DATE });
    expect(buildOneOffChecklistDeadline(ONE_OFF_DATE, null)).toEqual({ weekday: 0, time: null, date: ONE_OFF_DATE });
  });

  it("returns null for an invalid date, exactly like coerceWeeklyChecklist would reject the same input on read", () => {
    expect(buildOneOffChecklistDeadline("2026-02-30", null)).toBeNull();
    expect(buildOneOffChecklistDeadline("not-a-date", null)).toBeNull();
  });
});

describe("parseChecklistDeadlineDate", () => {
  it("parses an already-validated YYYY-MM-DD into a local-midnight Date", () => {
    expect(parseChecklistDeadlineDate(ONE_OFF_DATE)).toEqual(new Date(2026, 0, 11));
  });
});

describe("describeWeeklyChecklistDeadline - one-off", () => {
  it("describes a one-off date with no time", () => {
    expect(describeWeeklyChecklistDeadline({ weekday: 0, time: null, date: ONE_OFF_DATE })).toBe("Jan 11, 2026");
  });

  it("describes a one-off date with a time in 12-hour form", () => {
    expect(describeWeeklyChecklistDeadline({ weekday: 0, time: "17:00", date: "2026-08-15" })).toBe(
      "Aug 15, 2026 at 5:00 PM"
    );
  });
});

describe("checklistDeadlineInstant / isWeeklyChecklistItemOverdue - one-off (AC3)", () => {
  it("delegates to weeklyOccurrenceInstant unchanged for a recurring deadline (does not duplicate the arithmetic)", () => {
    const now = dateForWeekday(0, 8, 0);
    const deadline = { weekday: 3, time: "09:00" };
    expect(checklistDeadlineInstant(deadline, now.getTime())).toBe(weeklyOccurrenceInstant(deadline, now.getTime()));
  });

  it("places a one-off deadline's instant at its own date+time, ignoring nowMs entirely", () => {
    const deadline = { weekday: 0, time: "09:00", date: ONE_OFF_DATE };
    const instant = checklistDeadlineInstant(deadline, dateForWeekday(5, 12, 0).getTime());
    expect(new Date(instant)).toEqual(new Date(2026, 0, 11, 9, 0, 0, 0));
  });

  it("treats a missing time as end of day for a one-off deadline too", () => {
    const deadline = { weekday: 0, time: null, date: ONE_OFF_DATE };
    const instant = checklistDeadlineInstant(deadline, 0);
    expect(new Date(instant)).toEqual(new Date(2026, 0, 11, 23, 59, 59, 999));
  });

  it("is not overdue before a one-off deadline's date+time has passed", () => {
    const oneOff = item({ deadline: { weekday: 0, time: "09:00", date: ONE_OFF_DATE } });
    expect(isWeeklyChecklistItemOverdue(oneOff, new Date(2026, 0, 11, 8, 59).getTime())).toBe(false);
  });

  it("is overdue once a one-off deadline's date+time has passed", () => {
    const oneOff = item({ deadline: { weekday: 0, time: "09:00", date: ONE_OFF_DATE } });
    expect(isWeeklyChecklistItemOverdue(oneOff, new Date(2026, 0, 11, 9, 1).getTime())).toBe(true);
  });

  it("stays overdue indefinitely for an unchecked one-off item, long after its date - there is no 'next week' to roll it into", () => {
    const oneOff = item({ deadline: { weekday: 0, time: "09:00", date: ONE_OFF_DATE } });
    expect(isWeeklyChecklistItemOverdue(oneOff, new Date(2026, 5, 1).getTime())).toBe(true);
  });

  it("AC3: once checked, a one-off item is never overdue again, even long after its date - it stops nagging without vanishing from the list", () => {
    const oneOff = item({ checked: true, deadline: { weekday: 0, time: "09:00", date: ONE_OFF_DATE } });
    expect(isWeeklyChecklistItemOverdue(oneOff, new Date(2026, 5, 1).getTime())).toBe(false);
  });
});

describe("checklistDeadlineKind", () => {
  it("is 'none' for a null deadline", () => {
    expect(checklistDeadlineKind(null)).toBe("none");
  });

  it("is 'recurring' for a deadline with no date", () => {
    expect(checklistDeadlineKind({ weekday: 3, time: "09:00" })).toBe("recurring");
    expect(checklistDeadlineKind({ weekday: 3, time: null })).toBe("recurring");
  });

  it("is 'one-off' for a deadline with a date", () => {
    expect(checklistDeadlineKind({ weekday: 0, time: null, date: ONE_OFF_DATE })).toBe("one-off");
  });
});

// wave 2's UI (WeeklyChecklistCell.tsx) uses this to resolve what an
// existing item's deadline should become the instant its "Schedule" select
// is switched - see this function's own doc comment for the full rationale
// of each transition.
describe("resolveDeadlineForKindChange", () => {
  // Jan 4, 2026 is a Sunday (this file's own anchor - see dateForWeekday
  // above), so "today" for every case below is "2026-01-04".
  const NOW = dateForWeekday(0, 8, 0).getTime();

  describe("kind 'none'", () => {
    it("always returns null, regardless of the current deadline", () => {
      expect(resolveDeadlineForKindChange(null, "none", NOW)).toBeNull();
      expect(resolveDeadlineForKindChange({ weekday: 2, time: "09:00" }, "none", NOW)).toBeNull();
      expect(resolveDeadlineForKindChange({ weekday: 0, time: null, date: ONE_OFF_DATE }, "none", NOW)).toBeNull();
    });
  });

  describe("kind 'recurring'", () => {
    it("none -> recurring defaults to Sunday with no time", () => {
      expect(resolveDeadlineForKindChange(null, "recurring", NOW)).toEqual({ weekday: 0, time: null });
    });

    it("recurring -> recurring is a no-op, returning the exact same object", () => {
      const current: WeeklyChecklistDeadline = { weekday: 3, time: "09:00" };
      expect(resolveDeadlineForKindChange(current, "recurring", NOW)).toBe(current);
    });

    it("one-off -> recurring reuses the one-off deadline's derived weekday and time, dropping only date", () => {
      // 2026-01-07 is a Wednesday (Jan 4 + 3 days), matching weekday 3.
      const current: WeeklyChecklistDeadline = { weekday: 3, time: "17:00", date: "2026-01-07" };
      expect(resolveDeadlineForKindChange(current, "recurring", NOW)).toEqual({ weekday: 3, time: "17:00" });
    });

    it("one-off -> recurring with no time on the one-off deadline carries null time forward", () => {
      const current: WeeklyChecklistDeadline = { weekday: 5, time: null, date: "2026-01-09" };
      expect(resolveDeadlineForKindChange(current, "recurring", NOW)).toEqual({ weekday: 5, time: null });
    });
  });

  describe("kind 'one-off'", () => {
    it("none -> one-off defaults the date to today, with no time", () => {
      expect(resolveDeadlineForKindChange(null, "one-off", NOW)).toEqual({
        weekday: 0,
        time: null,
        date: "2026-01-04",
      });
    });

    it("recurring -> one-off defaults the date to today, carrying the recurring deadline's time forward", () => {
      const current: WeeklyChecklistDeadline = { weekday: 2, time: "10:30" };
      expect(resolveDeadlineForKindChange(current, "one-off", NOW)).toEqual({
        weekday: 0,
        time: "10:30",
        date: "2026-01-04",
      });
    });

    it("one-off -> one-off is a no-op, returning the exact same object", () => {
      const current: WeeklyChecklistDeadline = { weekday: 0, time: "09:00", date: ONE_OFF_DATE };
      expect(resolveDeadlineForKindChange(current, "one-off", NOW)).toBe(current);
    });
  });

  it("is pure - the same inputs always produce an equal (deep) result", () => {
    const current: WeeklyChecklistDeadline = { weekday: 2, time: "10:30" };
    const first = resolveDeadlineForKindChange(current, "one-off", NOW);
    const second = resolveDeadlineForKindChange(current, "one-off", NOW);
    expect(first).toEqual(second);
  });

  it("today's date tracks nowMs, not a fixed value", () => {
    const laterNow = dateForWeekday(2, 8, 0).getTime(); // Tuesday, 2026-01-06
    expect(resolveDeadlineForKindChange(null, "one-off", laterNow)).toEqual({
      weekday: 2,
      time: null,
      date: "2026-01-06",
    });
  });

  // Own coverage (not part of the given frequency contract file, added
  // because resolveDeadlineForKindChange's "already in kind X" no-op checks
  // needed tightening from a loose !isOneOffChecklistDeadline test to
  // checklistDeadlineKind(current) === X once daily/monthly existed - see
  // this function's own doc comment for why a daily/monthly deadline must
  // NOT be mistaken for "already recurring".
  describe("kind 'daily'", () => {
    it("none -> daily builds a real daily deadline with no time", () => {
      expect(resolveDeadlineForKindChange(null, "daily", NOW)).toEqual({ weekday: 0, time: null, frequency: "daily" });
    });

    it("daily -> daily is a no-op, returning the exact same object", () => {
      const current = buildDailyChecklistDeadline("09:00");
      expect(resolveDeadlineForKindChange(current, "daily", NOW)).toBe(current);
    });

    it("recurring -> daily carries the recurring deadline's time forward", () => {
      const current: WeeklyChecklistDeadline = { weekday: 2, time: "10:30" };
      expect(resolveDeadlineForKindChange(current, "daily", NOW)).toEqual({
        weekday: 0,
        time: "10:30",
        frequency: "daily",
      });
    });

    it("monthly -> daily carries the monthly deadline's time forward, dropping dayOfMonth", () => {
      const current = buildMonthlyChecklistDeadline(15, "17:00")!;
      expect(resolveDeadlineForKindChange(current, "daily", NOW)).toEqual({
        weekday: 0,
        time: "17:00",
        frequency: "daily",
      });
    });
  });

  describe("kind 'monthly'", () => {
    it("none -> monthly defaults the day-of-month to nowMs's own day-of-month", () => {
      // NOW is 2026-01-04 (this file's own anchor) - day of month 4.
      expect(resolveDeadlineForKindChange(null, "monthly", NOW)).toEqual({
        weekday: 0,
        time: null,
        frequency: "monthly",
        dayOfMonth: 4,
      });
    });

    it("monthly -> monthly is a no-op, returning the exact same object", () => {
      const current = buildMonthlyChecklistDeadline(15, "09:00")!;
      expect(resolveDeadlineForKindChange(current, "monthly", NOW)).toBe(current);
    });

    it("daily -> monthly carries the daily deadline's time forward", () => {
      const current = buildDailyChecklistDeadline("08:00");
      expect(resolveDeadlineForKindChange(current, "monthly", NOW)).toEqual({
        weekday: 0,
        time: "08:00",
        frequency: "monthly",
        dayOfMonth: 4,
      });
    });
  });

  it("a deadline currently in one of the OTHER new kinds is never mistaken for 'already recurring'", () => {
    // Regression guard for the loosely-typed !isOneOffChecklistDeadline check
    // this function used to have - a daily deadline is NOT one-off, so that
    // looser check would have wrongly returned it unchanged instead of
    // transforming it into a real recurring deadline.
    const current = buildDailyChecklistDeadline("09:00");
    expect(resolveDeadlineForKindChange(current, "recurring", NOW)).toEqual({ weekday: 0, time: "09:00" });
  });
});

// ---------------------------------------------------------------------------
// Own coverage beyond the given weekly-checklist.frequency.test.ts contract:
// coerceWeeklyChecklist must round-trip a daily/monthly deadline through the
// jsonb column exactly like it already does for recurring/one-off, or the
// whole feature would silently lose its frequency the moment a course is
// reloaded (coerceWeeklyChecklist is what every reader of course.weeklyChecklist
// - WeeklyChecklistCell.tsx, course-calendar-events.ts, weekly-checklist-table-helpers.ts -
// actually calls).
// ---------------------------------------------------------------------------

describe("coerceWeeklyChecklist - daily/monthly deadlines (own coverage)", () => {
  it("round-trips a daily deadline", () => {
    const raw = [{ id: "a", label: "x", deadline: { weekday: 0, time: "09:00", frequency: "daily" } }];
    expect(coerceWeeklyChecklist(raw)[0].deadline).toEqual({ weekday: 0, time: "09:00", frequency: "daily" });
  });

  it("round-trips a monthly deadline with a valid dayOfMonth", () => {
    const raw = [{ id: "a", label: "x", deadline: { weekday: 0, time: "09:00", frequency: "monthly", dayOfMonth: 15 } }];
    expect(coerceWeeklyChecklist(raw)[0].deadline).toEqual({
      weekday: 0,
      time: "09:00",
      frequency: "monthly",
      dayOfMonth: 15,
    });
  });

  it("degrades an unrecognized frequency string to recurring, dropping the frequency key entirely", () => {
    const raw = [{ id: "a", label: "x", deadline: { weekday: 2, time: "09:00", frequency: "hourly" } }];
    const out = coerceWeeklyChecklist(raw);
    expect(out[0].deadline).toEqual({ weekday: 2, time: "09:00" });
    expect(out[0].deadline).not.toHaveProperty("frequency");
  });

  it("degrades a monthly deadline with an out-of-range dayOfMonth to recurring, using a valid weekday if present", () => {
    const raw = [{ id: "a", label: "x", deadline: { weekday: 3, time: "09:00", frequency: "monthly", dayOfMonth: 45 } }];
    expect(coerceWeeklyChecklist(raw)[0].deadline).toEqual({ weekday: 3, time: "09:00" });
  });

  it("degrades a monthly deadline with a missing dayOfMonth to recurring", () => {
    const raw = [{ id: "a", label: "x", deadline: { weekday: 3, time: null, frequency: "monthly" } }];
    expect(coerceWeeklyChecklist(raw)[0].deadline).toEqual({ weekday: 3, time: null });
  });

  it("nulls out the whole deadline when a malformed monthly frequency AND an invalid weekday are both present", () => {
    const raw = [{ id: "a", label: "x", deadline: { time: "09:00", frequency: "monthly", dayOfMonth: 99 } }];
    expect(coerceWeeklyChecklist(raw)[0].deadline).toBeNull();
  });

  it("a present date wins over frequency on read, exactly as it does everywhere else in this module", () => {
    const raw = [
      { id: "a", label: "x", deadline: { weekday: 1, time: null, date: "2026-08-15", frequency: "daily" } },
    ];
    const out = coerceWeeklyChecklist(raw)[0].deadline;
    expect(isOneOffChecklistDeadline(out)).toBe(true);
    expect(out).not.toHaveProperty("frequency");
  });

  it("clamps dayOfMonth accepts the boundary values 1 and 31", () => {
    expect(
      coerceWeeklyChecklist([{ id: "a", label: "x", deadline: { time: null, frequency: "monthly", dayOfMonth: 1 } }])[0]
        .deadline
    ).toEqual({ weekday: 0, time: null, frequency: "monthly", dayOfMonth: 1 });
    expect(
      coerceWeeklyChecklist([{ id: "a", label: "x", deadline: { time: null, frequency: "monthly", dayOfMonth: 31 } }])[0]
        .deadline
    ).toEqual({ weekday: 0, time: null, frequency: "monthly", dayOfMonth: 31 });
  });
});

describe("daysInChecklistMonth (own coverage beyond the given clamp tests)", () => {
  it("returns 31/30/28/29 for the right months", () => {
    expect(daysInChecklistMonth(2026, 0)).toBe(31); // January
    expect(daysInChecklistMonth(2026, 3)).toBe(30); // April
    expect(daysInChecklistMonth(2026, 1)).toBe(28); // February, non-leap
    expect(daysInChecklistMonth(2028, 1)).toBe(29); // February, leap year
  });
});

describe("toggleWeeklyChecklistItem - period-aware flip (own coverage)", () => {
  // 2026-08-03 is a Monday, 2026-08-04 is a Tuesday (same anchor
  // weekly-checklist.frequency.test.ts uses).
  const MON_AUG_3 = new Date(2026, 7, 3, 9, 0, 0).getTime();
  const TUE_AUG_4 = new Date(2026, 7, 4, 9, 0, 0).getTime();

  it("clicking a daily item that is raw-checked from a PRIOR day CHECKS it (does not perversely uncheck it)", () => {
    // Checked yesterday (Aug 3); by Aug 4 it displays as unchecked
    // (isChecklistItemCheckedNow) even though the raw flag is still true.
    // A click on that visually-unchecked box must check it, not flip the
    // raw flag straight to false.
    const items = [
      { id: "d", label: "x", checked: true, checkedAt: MON_AUG_3, deadline: buildDailyChecklistDeadline(null) },
    ];
    const next = toggleWeeklyChecklistItem(items, "d", TUE_AUG_4);
    expect(next[0].checked).toBe(true);
    expect(next[0].checkedAt).toBe(TUE_AUG_4);
  });

  it("clicking a daily item that is still checked WITHIN the same day unchecks it", () => {
    const items = [
      { id: "d", label: "x", checked: true, checkedAt: MON_AUG_3, deadline: buildDailyChecklistDeadline(null) },
    ];
    const next = toggleWeeklyChecklistItem(items, "d", MON_AUG_3 + 1000);
    expect(next[0].checked).toBe(false);
    expect(next[0].checkedAt).toBeNull();
  });

  it("a weekly item's toggle behavior is completely unaffected (persistent kind, same as before this feature)", () => {
    const items = [
      { id: "w", label: "x", checked: true, checkedAt: MON_AUG_3, deadline: { weekday: 1, time: null } },
    ];
    // Even far in the future, a weekly item's raw-checked flag drives the
    // flip directly - isChecklistItemCheckedNow returns the same answer as
    // item.checked for this kind, so this is unchanged from before.
    const farFuture = new Date(2026, 11, 1).getTime();
    const next = toggleWeeklyChecklistItem(items, "w", farFuture);
    expect(next[0].checked).toBe(false); // was checked -> now unchecked, exactly like before
  });
});
