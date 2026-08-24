import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { transposeModuleItemDueDate, type ModulePatternDueDateInput } from "./module-pattern-transpose";

// Every date-arithmetic assertion below is anchored to a fixed, explicit IANA
// zone (America/Chicago) rather than the host machine's default timezone,
// set here and restored after the suite. Two reasons this zone and not "the
// ambient TZ": (1) the AC's own measured instants (D5's weekday-flip, D5b's
// DST boundary) were recorded against this exact zone and its UTC-6 (winter)
// / UTC-5 (summer) offsets, so pinning it lets this suite assert those exact
// ISO instants rather than a looser "some offset applies" claim; (2) a test
// that instead trusted the ambient TZ would pass by accident on a machine
// already set to America/Chicago and prove nothing on a CI runner set to
// UTC, where the D5 hazard (decomposing with `.getUTC*` instead of `.get*`)
// cannot even manifest, because local and UTC agree at UTC+0. Confirmed by
// direct probe before writing this suite: Node re-resolves `process.env.TZ`
// on each Date localization call within the same process, so setting it in
// `beforeAll`/`afterAll` is sufficient without a process restart, and
// restoring it after the suite keeps this file from leaking a timezone
// override into any sibling test file that shares the same worker.
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Chicago";
});
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const BASE_INPUT: ModulePatternDueDateInput = {
  sourceDueAtIso: null,
  startDate: "2026-01-12",
  assignmentDueRule: "thu|23:59",
  targetWeek: 3,
};

describe("transposeModuleItemDueDate - D13's three outcomes", () => {
  it("outcome 'no-due-date': no course start date, regardless of source due date", () => {
    const result = transposeModuleItemDueDate({ ...BASE_INPUT, startDate: null, sourceDueAtIso: "2026-01-30T05:59:00.000Z" });
    expect(result).toEqual({ dueAtIso: null, outcome: "no-due-date" });
  });

  it("outcome 'no-due-date': no resolvable target week, regardless of source due date", () => {
    const result = transposeModuleItemDueDate({ ...BASE_INPUT, targetWeek: null, sourceDueAtIso: "2026-01-30T05:59:00.000Z" });
    expect(result).toEqual({ dueAtIso: null, outcome: "no-due-date" });
  });

  it("outcome 'course-due-rule': no source due date falls back to the course's own rule", () => {
    const result = transposeModuleItemDueDate({ ...BASE_INPUT, sourceDueAtIso: null, targetWeek: 3, assignmentDueRule: "thu|23:59" });
    expect(result.outcome).toBe("course-due-rule");
    // Week 3 of a term starting 2026-01-12, Thursday 23:59 rule.
    expect(result.dueAtIso).toBe("2026-01-30T05:59:00.000Z");
  });

  it("outcome 'course-due-rule': an unparseable assignmentDueRule falls back further, to the sun|23:59 default", () => {
    const result = transposeModuleItemDueDate({ ...BASE_INPUT, sourceDueAtIso: null, targetWeek: 3, assignmentDueRule: "not-a-rule" });
    expect(result.outcome).toBe("course-due-rule");
    // Sunday 23:59 of week 3 - Monday-anchored week start + 6 days.
    expect(result.dueAtIso).not.toBeNull();
    expect(new Date(result.dueAtIso as string).getDay()).toBe(0);
  });

  it("outcome 'transposed-from-item': a source due date is decomposed and recomposed against the target week", () => {
    const result = transposeModuleItemDueDate({ ...BASE_INPUT, sourceDueAtIso: "2026-01-30T05:59:00.000Z", targetWeek: 5 });
    expect(result.outcome).toBe("transposed-from-item");
    expect(result.dueAtIso).toBe("2026-02-13T05:59:00.000Z");
  });

  it("an unparseable sourceDueAtIso is treated like a null source and falls back to 'course-due-rule'", () => {
    const result = transposeModuleItemDueDate({ ...BASE_INPUT, sourceDueAtIso: "not-a-date", targetWeek: 3, assignmentDueRule: "thu|23:59" });
    expect(result.outcome).toBe("course-due-rule");
    expect(result.dueAtIso).toBe("2026-01-30T05:59:00.000Z");
  });
});

describe("D5: local-vs-UTC decomposition - the weekday flips on the real instant the AC measured", () => {
  // 2026-01-30T05:59:00.000Z is dueDateForWeek's own output for a Thursday
  // 23:59 rule, week 3, term start 2026-01-12 (America/Chicago) - the exact
  // instant the AC's header cites. Local getters read Thursday 23:59; UTC
  // getters on the identical Date object read Friday 05:59.
  const instant = new Date("2026-01-30T05:59:00.000Z");

  it("sanity: local and UTC getters disagree on both weekday and hour for this instant", () => {
    expect(instant.getDay()).toBe(4); // Thursday, local
    expect(instant.getHours()).toBe(23);
    expect(instant.getMinutes()).toBe(59);
    expect(instant.getUTCDay()).toBe(5); // Friday, UTC
    expect(instant.getUTCHours()).toBe(5);
    expect(instant.getUTCMinutes()).toBe(59);
  });

  it("transposeModuleItemDueDate recomposes onto the LOCAL Thursday, not the UTC Friday", () => {
    const result = transposeModuleItemDueDate({ ...BASE_INPUT, sourceDueAtIso: instant.toISOString(), targetWeek: 5 });
    const due = new Date(result.dueAtIso as string);
    expect(due.getDay()).toBe(4); // Thursday
    expect(due.getHours()).toBe(23);
    expect(due.getMinutes()).toBe(59);
  });

  // Sabotage proof, run by hand and reported rather than committed as a
  // standing test (a test that hardcodes the broken behaviour as "correct"
  // would defeat its own purpose): temporarily changing
  // `decomposeLocalDueDate` in module-pattern-transpose.ts to read
  // `date.getUTCDay()` / `date.getUTCHours()` / `date.getUTCMinutes()`
  // instead of the local getters reddened exactly this test - the recomposed
  // result moved from Thursday 23:59 local to Friday 05:59 local, i.e.
  // `dueAtIso` became "2026-02-13T11:59:00.000Z" instead of
  // "2026-02-13T05:59:00.000Z". Restoring the local getters returned the
  // suite to green. See the final report for the exact before/after output.
  it("pins the exact recomposed instant, so the sabotage above has a concrete number to move", () => {
    const result = transposeModuleItemDueDate({ ...BASE_INPUT, sourceDueAtIso: instant.toISOString(), targetWeek: 5 });
    expect(result.dueAtIso).toBe("2026-02-13T05:59:00.000Z");
  });
});

describe("D5b: DST safety across the 2026-03-08 boundary - dueDateForWeek is reused, never reimplemented", () => {
  // Term starting 2026-01-12 (Monday). Week 8's Thursday is 2026-03-05 (CST,
  // UTC-6); week 9's Thursday is 2026-03-12 (CDT, UTC-5) - the DST
  // transition (2026-03-08, second Sunday of March) falls between them.
  const week8 = transposeModuleItemDueDate({ ...BASE_INPUT, sourceDueAtIso: null, targetWeek: 8, assignmentDueRule: "thu|23:59" });
  const week9 = transposeModuleItemDueDate({ ...BASE_INPUT, sourceDueAtIso: null, targetWeek: 9, assignmentDueRule: "thu|23:59" });

  it("both sides of the boundary read back as local Thursday 23:59", () => {
    const dueWeek8 = new Date(week8.dueAtIso as string);
    const dueWeek9 = new Date(week9.dueAtIso as string);
    expect(dueWeek8.getDay()).toBe(4);
    expect(dueWeek8.getHours()).toBe(23);
    expect(dueWeek8.getMinutes()).toBe(59);
    expect(dueWeek9.getDay()).toBe(4);
    expect(dueWeek9.getHours()).toBe(23);
    expect(dueWeek9.getMinutes()).toBe(59);
  });

  it("pins the exact UTC instants either side of the DST transition (CST -6, then CDT -5)", () => {
    expect(week8.dueAtIso).toBe("2026-03-06T05:59:00.000Z");
    expect(week9.dueAtIso).toBe("2026-03-13T04:59:00.000Z");
  });

  it("the tempting millisecond-offset alternative would NOT reproduce week 9's instant - it lands on Friday 00:59, a day and an hour off", () => {
    const shortcutInstant = new Date(new Date(week8.dueAtIso as string).getTime() + 7 * 24 * 60 * 60 * 1000);
    // The shortcut's own wrong answer, pinned as a fact rather than merely
    // asserted "wrong", so a future reader can see exactly how it fails.
    expect(shortcutInstant.toISOString()).toBe("2026-03-13T05:59:00.000Z");
    expect(shortcutInstant.getDay()).toBe(5); // Friday, not Thursday
    expect(shortcutInstant.getHours()).toBe(0); // 00:59, not 23:59
    expect(shortcutInstant.getMinutes()).toBe(59);
    // And, the point of the test: it disagrees with the real, DST-safe
    // answer this module actually returns.
    expect(shortcutInstant.toISOString()).not.toBe(week9.dueAtIso);
  });
});

// D5's structural guard, sabotage-checkable independent of any date fixture:
// this file must be STRUCTURALLY INCAPABLE of decomposing a UTC instant with
// UTC getters. Scans the file's own TEXT (never imports it, since the guard
// is about what the file CONTAINS, not what it exports) for `.getUTC*(`
// calls. The header comment NAMES `.getUTCDay(` and `.getUTCHours(` in prose
// explaining why they are forbidden - a naive raw-text scan would flag its
// own explanation as a violation, so `stripComments` runs first, exactly as
// entry 330 check 4 established for the sibling current-events guard, and
// canaries are carried in BOTH directions below.
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("D5 structural guard: this file cannot decompose a UTC instant with UTC getters", () => {
  const rawSourceText = fs.readFileSync(path.resolve(__dirname, "module-pattern-transpose.ts"), "utf-8");
  const codeOnly = stripComments(rawSourceText);

  it("contains no .getUTC*( call in code", () => {
    expect(codeOnly).not.toMatch(/\.getUTC(Day|Hours|Minutes|Date|Month|FullYear|Seconds)\(/);
  });

  // Sabotage-checkable canary, direction 1: the guard's own rationale
  // comments DO mention the forbidden getters in prose - if this test ever
  // fails, either the rationale was deleted (a real regression in the
  // file's documentation) or `stripComments` stopped stripping (a real
  // regression in the guard itself, which would let a genuine violation
  // slip through unnoticed, since the check above would then also be
  // scanning these very comments).
  it("canary: the raw (unstripped) source does mention the forbidden UTC getters in its own comments", () => {
    expect(rawSourceText).toMatch(/\.getUTCDay\(/);
    expect(rawSourceText).toMatch(/\.getUTCHours\(/);
  });

  // Canary, direction 2 (the other half of "both directions"): proves the
  // scan above is reading real, substantial source text and not silently
  // matching against an empty or truncated string.
  it("read more than 500 characters of real source", () => {
    expect(rawSourceText.length).toBeGreaterThan(500);
  });
});
