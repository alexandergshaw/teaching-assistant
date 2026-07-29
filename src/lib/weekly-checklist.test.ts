import { describe, it, expect } from "vitest";
import {
  coerceWeeklyChecklist,
  describeWeeklyChecklistDeadline,
  weeklyOccurrenceInstant,
  isWeeklyChecklistItemOverdue,
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
  WEEKLY_CHECKLIST_MAX_ITEMS,
  WEEKLY_CHECKLIST_MAX_LABEL_LENGTH,
  type WeeklyChecklistItem,
} from "./weekly-checklist";

// Jan 4, 2026 is a Sunday (verified against assignment-due-rule.test.ts's
// oneOfEachWeekday, which iterates Jan 4-10 to cover every weekday once and
// derives "Monday" by walking forward from Jan 4). Day index i (0=Sunday)
// therefore falls on calendar date Jan (4 + i), 2026.
function dateForWeekday(weekday: number, hour = 0, minute = 0): Date {
  return new Date(2026, 0, 4 + weekday, hour, minute, 0, 0);
}

function item(overrides: Partial<WeeklyChecklistItem> = {}): WeeklyChecklistItem {
  return { id: "id-1", label: "Grade discussion posts", checked: false, deadline: null, ...overrides };
}

describe("coerceWeeklyChecklist", () => {
  it("never throws and returns [] for non-array input", () => {
    for (const raw of [null, undefined, "garbage", 42, {}, true]) {
      expect(() => coerceWeeklyChecklist(raw)).not.toThrow();
      expect(coerceWeeklyChecklist(raw)).toEqual([]);
    }
  });

  it("passes through a well-formed item unchanged", () => {
    const raw = [{ id: "a", label: "Post announcement", checked: true, deadline: { weekday: 1, time: "09:00" } }];
    expect(coerceWeeklyChecklist(raw)).toEqual([
      { id: "a", label: "Post announcement", checked: true, deadline: { weekday: 1, time: "09:00" } },
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
  it("flips the checked flag of the matching item only", () => {
    const items = [item({ id: "1", checked: false }), item({ id: "2", checked: false })];
    const next = toggleWeeklyChecklistItem(items, "1");
    expect(next[0].checked).toBe(true);
    expect(next[1].checked).toBe(false);
  });

  it("is a no-op for an unknown id", () => {
    const items = [item({ id: "1", checked: false })];
    expect(toggleWeeklyChecklistItem(items, "missing")).toEqual(items);
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
