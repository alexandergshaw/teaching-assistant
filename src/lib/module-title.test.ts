import { describe, it, expect } from "vitest";
import { composeModuleTitle } from "./module-title";

describe("composeModuleTitle", () => {
  it("composes a plain topic unchanged from today's format", () => {
    expect(composeModuleTitle("Survey of Object Oriented Programming", 8)).toBe(
      "Module 08: Survey of Object Oriented Programming"
    );
  });

  it("returns the bare module label for an empty topic", () => {
    expect(composeModuleTitle("", 8)).toBe("Module 08");
  });

  it("returns the bare module label when the topic is only whitespace", () => {
    expect(composeModuleTitle("   ", 8)).toBe("Module 08");
  });

  it("collapses a topic that is nothing but its own repeated label", () => {
    // "Module 08: Module 08" carries zero information beyond restating this
    // module's own position twice - treated identically to an empty topic
    // (see module-title.ts for why that equivalence was chosen over a
    // separate "label-only" rule).
    expect(composeModuleTitle("Module 08: Module 08", 8)).toBe("Module 08");
  });

  it("collapses three stacked levels of its own label in one call", () => {
    expect(composeModuleTitle("Module 08: Module 08: Module 08", 8)).toBe("Module 08");
  });

  it("strips exactly one redundant leading label and keeps the real subject - the instructor's actual export shape", () => {
    // This is the exact shape pulled from the real .imscc: a hyphen
    // separator, not a colon, between the label and the subject. Must NOT
    // become "Module 08: Module 08 - Survey of Object Oriented Programming".
    expect(composeModuleTitle("Module 08 - Survey of Object Oriented Programming", 8)).toBe(
      "Module 08: Survey of Object Oriented Programming"
    );
  });

  it("strips a colon-separated leading label and keeps the real subject", () => {
    expect(composeModuleTitle("Module 08: Survey of Object Oriented Programming", 8)).toBe(
      "Module 08: Survey of Object Oriented Programming"
    );
  });

  it("strips a leading label with no separator at all (space only)", () => {
    expect(composeModuleTitle("Module 8 Survey of OOP", 8)).toBe("Module 08: Survey of OOP");
  });

  it("strips a zero-padded leading label with no separator between token and digits", () => {
    expect(composeModuleTitle("Module08: Survey of OOP", 8)).toBe("Module 08: Survey of OOP");
  });

  it("treats a leading Week label as redundant too, same as Module", () => {
    // extractModuleNumber treats "module" and "week" as interchangeable
    // tokens (see module-value.ts); composeModuleTitle follows the same
    // convention so a topic sourced from a "Week 08" style label is
    // recognized as redundant, not just a "Module 08" one.
    expect(composeModuleTitle("Week 08: Survey of OOP", 8)).toBe("Module 08: Survey of OOP");
  });

  it("preserves a MISMATCHED leading label instead of silently stripping it", () => {
    // A topic labeled "Module 07" arriving in week 8's slot is a real signal
    // that something upstream put the wrong content in this position. That
    // must survive so it can be noticed and investigated, not vanish.
    expect(composeModuleTitle("Module 07: Recursion", 8)).toBe("Module 08: Module 07: Recursion");
  });

  it("does not treat a passing mention of a module as a redundant leading label", () => {
    expect(composeModuleTitle("Comparing Module 07 and Module 08 approaches", 8)).toBe(
      "Module 08: Comparing Module 07 and Module 08 approaches"
    );
  });

  it("does not treat a passing mention as redundant even when it echoes the current week", () => {
    // The label detector is anchored to the START of the topic - a mention
    // of "Module 08" mid-sentence is real subject text, not a restated
    // label, even though its number happens to match this module's week.
    expect(composeModuleTitle("Revisiting Module 08 from a new angle", 8)).toBe(
      "Module 08: Revisiting Module 08 from a new angle"
    );
  });

  it("trims surrounding whitespace from the topic before composing", () => {
    expect(composeModuleTitle("  Loops and Recursion  ", 3)).toBe("Module 03: Loops and Recursion");
  });

  it("pads single-digit weeks to two digits", () => {
    expect(composeModuleTitle("Intro", 3)).toBe("Module 03: Intro");
  });

  it("does not truncate a double-digit week's padding", () => {
    expect(composeModuleTitle("Capstone", 12)).toBe("Module 12: Capstone");
  });

  describe("idempotence", () => {
    // THE PROPERTY THAT FIXES THE BUG: composing a title from a topic that
    // already carries its own leading module label must not add another one
    // on top. Applying composeModuleTitle to its own output, for the same
    // week, any number of times must always produce the same string as
    // applying it once - this is exactly what re-ingesting a previously
    // generated cartridge as next run's schedule source does to a title, over
    // and over, in the real bug.
    const cases: Array<{ label: string; topic: string; week: number }> = [
      { label: "plain topic with no label at all", topic: "Survey of Object Oriented Programming", week: 8 },
      { label: "empty topic", topic: "", week: 8 },
      { label: "label-only topic (redundant, collapses)", topic: "Module 08: Module 08", week: 8 },
      {
        label: "the instructor's real export shape (hyphen separator)",
        topic: "Module 08 - Survey of Object Oriented Programming",
        week: 8,
      },
      { label: "mismatched leading label (preserved, not stripped)", topic: "Module 07: Recursion", week: 8 },
      {
        label: "passing mention of a module, not a leading label",
        topic: "Comparing Module 07 and Module 08 approaches",
        week: 8,
      },
    ];

    for (const { label, topic, week } of cases) {
      it(`is a fixed point after 3+ reapplications: ${label}`, () => {
        const once = composeModuleTitle(topic, week);
        const twice = composeModuleTitle(once, week);
        const thrice = composeModuleTitle(twice, week);
        const fourTimes = composeModuleTitle(thrice, week);

        expect(twice).toBe(once);
        expect(thrice).toBe(once);
        expect(fourTimes).toBe(once);
      });
    }

    it("never grows longer no matter how many times it is re-composed (regression shape for the reported bug)", () => {
      // The reported defect: three runs of the real loop turned "Survey of
      // Object Oriented Programming" into three stacked "Module NN:"
      // prefixes. Simulate several more runs than that and confirm the
      // string stops growing after the first application.
      let title = composeModuleTitle("Survey of Object Oriented Programming", 8);
      const lengthAfterFirst = title.length;
      for (let i = 0; i < 10; i++) {
        title = composeModuleTitle(title, 8);
        expect(title.length).toBe(lengthAfterFirst);
      }
      expect(title).toBe("Module 08: Survey of Object Oriented Programming");
    });
  });
});
