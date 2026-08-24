// Frozen-literal tests for current-events-assignment-plan.ts. Every expected
// value is hand-written against the AC's own spec (section 3b, D2, D4, W2) -
// never derived by calling dueDateForWeek a second time and comparing the
// implementation against itself, which would let a bug in the shared date
// arithmetic silently become "the spec" (docs/DEV_LOOP.md step 9's warning).
import { describe, it, expect } from "vitest";
import { planCurrentEventsAssignments, type CurrentEventsPlanInput } from "./current-events-assignment-plan";
import { currentEventsAssignmentTitle } from "./current-events-assignment";

// A fixed baseline input, reused and overridden per test so each test only
// varies the one thing it is checking.
function baseInput(overrides: Partial<CurrentEventsPlanInput> = {}): CurrentEventsPlanInput {
  return {
    modules: [
      { id: 1, name: "Module 01: Intro", items: [{ title: "Syllabus" }] },
      { id: 2, name: "Module 02: Loops", items: [{ title: "Loops Reading" }] },
    ],
    selectedModuleIds: new Set([1, 2]),
    startDate: "2026-01-05", // a Monday
    assignmentDueRule: "sun|23:59",
    courseRowUnavailable: false,
    ...overrides,
  };
}

describe("planCurrentEventsAssignments - deadline computation (frozen literal)", () => {
  it("computes the exact due-date instant for a known start date, week and rule", () => {
    // start = Monday 2026-01-05 (local midnight). Week 2's Monday is
    // 2026-01-12. The rule is sun|23:59, so week 2's Sunday is 2026-01-18 at
    // 23:59 LOCAL time. Frozen literal: built independently of
    // dueDateForWeek, from a plain local Date constructor.
    const expectedLocal = new Date(2026, 0, 18, 23, 59, 0, 0);
    const plan = planCurrentEventsAssignments(baseInput());
    const entry = plan.entries.find((e) => e.moduleId === 2);
    expect(entry?.dueAtIso).toBe(expectedLocal.toISOString());
    expect(entry?.deadlineReason).toBe("ok");
  });

  it("the deadline text is describeCurrentEventsDeadline's own rendering of that same instant", () => {
    const plan = planCurrentEventsAssignments(baseInput());
    const entry = plan.entries.find((e) => e.moduleId === 2);
    // 2026-01-18 is a Sunday.
    expect(entry?.deadlineText).toBe("Sunday, January 18, 2026 at 11:59 PM");
  });

  it("applies the default sun|23:59 rule when assignmentDueRule is null", () => {
    const plan = planCurrentEventsAssignments(baseInput({ assignmentDueRule: null }));
    const entry = plan.entries.find((e) => e.moduleId === 1);
    // Week 1's Monday is the start date itself, 2026-01-05; its Sunday is 2026-01-11.
    const expectedLocal = new Date(2026, 0, 11, 23, 59, 0, 0);
    expect(entry?.dueAtIso).toBe(expectedLocal.toISOString());
  });

  it("applies the default sun|23:59 rule when assignmentDueRule is malformed", () => {
    const plan = planCurrentEventsAssignments(baseInput({ assignmentDueRule: "garbage" }));
    const entry = plan.entries.find((e) => e.moduleId === 1);
    const expectedLocal = new Date(2026, 0, 11, 23, 59, 0, 0);
    expect(entry?.dueAtIso).toBe(expectedLocal.toISOString());
  });

  it("honors a non-default explicit rule (Wednesday at 09:00)", () => {
    const plan = planCurrentEventsAssignments(baseInput({ assignmentDueRule: "wed|09:00" }));
    const entry = plan.entries.find((e) => e.moduleId === 1);
    // Week 1's Monday is 2026-01-05; Wednesday of that week is 2026-01-07.
    const expectedLocal = new Date(2026, 0, 7, 9, 0, 0, 0);
    expect(entry?.dueAtIso).toBe(expectedLocal.toISOString());
  });

  it("week comes from the module NAME, not its position in the array", () => {
    // Module at array index 0 is named "Module 05" - its week must be 5, not 1.
    const input = baseInput({
      modules: [
        { id: 10, name: "Module 05: Out of order", items: [] },
        { id: 11, name: "Module 01: Also out of order", items: [] },
      ],
      selectedModuleIds: new Set([10, 11]),
    });
    const plan = planCurrentEventsAssignments(input);
    const entryAtIndex0 = plan.entries.find((e) => e.moduleId === 10);
    const entryAtIndex1 = plan.entries.find((e) => e.moduleId === 11);
    expect(entryAtIndex0?.week).toBe(5);
    expect(entryAtIndex1?.week).toBe(1);
    // And the computed instants differ accordingly - week 5's Sunday vs week 1's Sunday.
    expect(entryAtIndex0?.dueAtIso).not.toBe(entryAtIndex1?.dueAtIso);
  });
});

describe("planCurrentEventsAssignments - the three no-deadline reasons", () => {
  it("reports no-course-row when courseRowUnavailable is true, regardless of otherwise-valid inputs", () => {
    const plan = planCurrentEventsAssignments(baseInput({ courseRowUnavailable: true }));
    for (const entry of plan.entries) {
      expect(entry.deadlineReason).toBe("no-course-row");
      expect(entry.dueAtIso).toBeNull();
      expect(entry.deadlineText).toBe("");
    }
  });

  it("reports no-course-start-date when startDate is null and the course row IS available", () => {
    const plan = planCurrentEventsAssignments(baseInput({ startDate: null }));
    for (const entry of plan.entries) {
      expect(entry.deadlineReason).toBe("no-course-start-date");
      expect(entry.dueAtIso).toBeNull();
    }
  });

  it("reports no-course-start-date when startDate is malformed", () => {
    const plan = planCurrentEventsAssignments(baseInput({ startDate: "not-a-date" }));
    for (const entry of plan.entries) {
      expect(entry.deadlineReason).toBe("no-course-start-date");
    }
  });

  it("reports no-week-number when the module name carries no week number, even with a valid course row and start date", () => {
    const input = baseInput({
      modules: [{ id: 3, name: "Capstone Project", items: [] }],
      selectedModuleIds: new Set([3]),
    });
    const plan = planCurrentEventsAssignments(input);
    expect(plan.entries[0].deadlineReason).toBe("no-week-number");
    expect(plan.entries[0].dueAtIso).toBeNull();
  });

  it("the three reasons are distinguishable from each other, not just from ok", () => {
    const noRow = planCurrentEventsAssignments(baseInput({ courseRowUnavailable: true, startDate: null }));
    // courseRowUnavailable wins over a simultaneously-null startDate.
    expect(noRow.entries[0].deadlineReason).toBe("no-course-row");

    const noStart = planCurrentEventsAssignments(baseInput({ startDate: null }));
    expect(noStart.entries[0].deadlineReason).toBe("no-course-start-date");

    const noWeek = planCurrentEventsAssignments(
      baseInput({ modules: [{ id: 9, name: "Orientation", items: [] }], selectedModuleIds: new Set([9]) })
    );
    expect(noWeek.entries[0].deadlineReason).toBe("no-week-number");

    const reasons = new Set([noRow.entries[0].deadlineReason, noStart.entries[0].deadlineReason, noWeek.entries[0].deadlineReason]);
    expect(reasons.size).toBe(3);
  });

  it("an entry with no deadline is still action 'create' - it is not dropped from the plan", () => {
    const plan = planCurrentEventsAssignments(baseInput({ startDate: null }));
    expect(plan.entries).toHaveLength(2);
    for (const entry of plan.entries) {
      expect(entry.action).toBe("create");
    }
    expect(plan.createCount).toBe(2);
  });
});

describe("planCurrentEventsAssignments - idempotency (D2, byte-for-byte planBulkModuleCreation's match rule)", () => {
  it("marks a module already-present when an item title matches the derived title exactly", () => {
    const title = currentEventsAssignmentTitle("Module 01: Intro");
    const input = baseInput({
      modules: [{ id: 1, name: "Module 01: Intro", items: [{ title }] }],
      selectedModuleIds: new Set([1]),
    });
    const plan = planCurrentEventsAssignments(input);
    expect(plan.entries[0].action).toBe("already-present");
    expect(plan.createCount).toBe(0);
    expect(plan.skipCount).toBe(1);
  });

  it("matches case-insensitively", () => {
    const title = currentEventsAssignmentTitle("Module 01: Intro").toUpperCase();
    const input = baseInput({
      modules: [{ id: 1, name: "Module 01: Intro", items: [{ title }] }],
      selectedModuleIds: new Set([1]),
    });
    const plan = planCurrentEventsAssignments(input);
    expect(plan.entries[0].action).toBe("already-present");
  });

  it("matches whitespace-insensitively (leading/trailing whitespace on the item title)", () => {
    const title = `  ${currentEventsAssignmentTitle("Module 01: Intro")}  `;
    const input = baseInput({
      modules: [{ id: 1, name: "Module 01: Intro", items: [{ title }] }],
      selectedModuleIds: new Set([1]),
    });
    const plan = planCurrentEventsAssignments(input);
    expect(plan.entries[0].action).toBe("already-present");
  });

  it("does NOT match a similar-but-different title", () => {
    const input = baseInput({
      modules: [{ id: 1, name: "Module 01: Intro", items: [{ title: "Intro - Current Events Researched" }] }],
      selectedModuleIds: new Set([1]),
    });
    const plan = planCurrentEventsAssignments(input);
    expect(plan.entries[0].action).toBe("create");
  });

  it("does NOT match against another module's items - only the SAME module's items count", () => {
    const title = currentEventsAssignmentTitle("Module 02: Loops");
    const input = baseInput({
      modules: [
        { id: 1, name: "Module 01: Intro", items: [{ title }] }, // wrong module's items carry module 2's title
        { id: 2, name: "Module 02: Loops", items: [] },
      ],
      selectedModuleIds: new Set([1, 2]),
    });
    const plan = planCurrentEventsAssignments(input);
    const entry1 = plan.entries.find((e) => e.moduleId === 1);
    const entry2 = plan.entries.find((e) => e.moduleId === 2);
    expect(entry1?.action).toBe("create"); // module 1 has no item matching ITS OWN title
    expect(entry2?.action).toBe("create"); // module 2 has no items at all
  });

  it("an already-present entry still carries its computed deadline fields", () => {
    const title = currentEventsAssignmentTitle("Module 01: Intro");
    const input = baseInput({
      modules: [{ id: 1, name: "Module 01: Intro", items: [{ title }] }],
      selectedModuleIds: new Set([1]),
    });
    const plan = planCurrentEventsAssignments(input);
    expect(plan.entries[0].action).toBe("already-present");
    expect(plan.entries[0].deadlineReason).toBe("ok");
    expect(plan.entries[0].dueAtIso).not.toBeNull();
  });
});

describe("planCurrentEventsAssignments - selection and ordering", () => {
  it("returns entries in `modules` (Canvas) order, not selection-set insertion order", () => {
    const input = baseInput({
      modules: [
        { id: 1, name: "Module 01: A", items: [] },
        { id: 2, name: "Module 02: B", items: [] },
        { id: 3, name: "Module 03: C", items: [] },
      ],
      // Selected out of order relative to `modules`.
      selectedModuleIds: new Set([3, 1]),
    });
    const plan = planCurrentEventsAssignments(input);
    expect(plan.entries.map((e) => e.moduleId)).toEqual([1, 3]);
  });

  it("only selected modules appear - an unselected module is entirely absent from the plan", () => {
    const input = baseInput({
      modules: [
        { id: 1, name: "Module 01: A", items: [] },
        { id: 2, name: "Module 02: B", items: [] },
        { id: 3, name: "Module 03: C", items: [] },
      ],
      selectedModuleIds: new Set([2]),
    });
    const plan = planCurrentEventsAssignments(input);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].moduleId).toBe(2);
  });

  it("an empty selection produces an empty plan with zero counts and no error", () => {
    const plan = planCurrentEventsAssignments(baseInput({ selectedModuleIds: new Set() }));
    expect(plan.entries).toEqual([]);
    expect(plan.createCount).toBe(0);
    expect(plan.skipCount).toBe(0);
    expect(plan.error).toBeNull();
  });
});

describe("planCurrentEventsAssignments - itemTitles and title passthrough", () => {
  it("carries the module's own item titles through unchanged, for the generator's grounding (AC12)", () => {
    const input = baseInput({
      modules: [{ id: 1, name: "Module 01: Intro", items: [{ title: "Syllabus" }, { title: "Welcome Video" }] }],
      selectedModuleIds: new Set([1]),
    });
    const plan = planCurrentEventsAssignments(input);
    expect(plan.entries[0].itemTitles).toEqual(["Syllabus", "Welcome Video"]);
  });

  it("the entry's title is exactly currentEventsAssignmentTitle(moduleName), never re-derived differently", () => {
    const plan = planCurrentEventsAssignments(baseInput());
    const entry = plan.entries.find((e) => e.moduleId === 2);
    expect(entry?.title).toBe(currentEventsAssignmentTitle("Module 02: Loops"));
  });
});
