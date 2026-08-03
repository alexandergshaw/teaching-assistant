import { describe, it, expect } from "vitest";
import {
  coerceSlideGraphic,
  graphicSlideLayout,
  matrix2x2QuadrantRects,
  processStepRects,
  enforceGraphicsForApplied,
  MATRIX_MAX_ITEMS_PER_QUADRANT,
  PROCESS_MIN_STEPS,
  PROCESS_MAX_STEPS,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
  type Matrix2x2Graphic,
  type ProcessGraphic,
  type TableGraphic,
  type GraphicGapSlide,
} from "./slide-graphics";
import {
  conceptCountForMinutes,
  MIN_CONCEPTS_PER_LECTURE,
  MAX_CONCEPTS_PER_LECTURE,
} from "./lecture-concepts";

// ── Fixtures ─────────────────────────────────────────────────────────────

function validMatrixRaw() {
  return {
    kind: "matrix2x2",
    xAxisLabel: "Interest",
    yAxisLabel: "Power",
    quadrants: {
      topLeft: { label: "Keep Satisfied", items: ["Finance Director"] },
      topRight: { label: "Manage Closely", items: ["Sponsor", "Steering Committee"] },
      bottomLeft: { label: "Monitor", items: [] },
      bottomRight: { label: "Keep Informed", items: ["End Users"] },
    },
  };
}

function validProcessRaw() {
  return {
    kind: "process",
    steps: [
      { label: "Initiate", caption: "Charter signed" },
      { label: "Plan", caption: "Baseline set" },
      { label: "Execute" },
      { label: "Close", caption: "Lessons logged" },
    ],
  };
}

function validTableRaw() {
  return {
    kind: "table",
    headers: ["Risk", "Owner", "Response"],
    rows: [
      ["Vendor delay", "PM", "Add buffer"],
      ["Scope creep", "Sponsor", "Change control"],
    ],
  };
}

describe("coerceSlideGraphic", () => {
  describe("non-object / missing-kind inputs", () => {
    it("returns undefined for undefined", () => {
      expect(coerceSlideGraphic(undefined)).toBeUndefined();
    });

    it("returns undefined for null", () => {
      expect(coerceSlideGraphic(null)).toBeUndefined();
    });

    it("returns undefined for a string", () => {
      expect(coerceSlideGraphic("matrix2x2")).toBeUndefined();
    });

    it("returns undefined for a number", () => {
      expect(coerceSlideGraphic(42)).toBeUndefined();
    });

    it("returns undefined for an array", () => {
      expect(coerceSlideGraphic([1, 2, 3])).toBeUndefined();
    });

    it("returns undefined when kind is missing", () => {
      expect(coerceSlideGraphic({ xAxisLabel: "A" })).toBeUndefined();
    });

    it("returns undefined for an unrecognized kind (e.g. a chart)", () => {
      expect(coerceSlideGraphic({ kind: "barChart", data: [1, 2, 3] })).toBeUndefined();
    });
  });

  describe("matrix2x2", () => {
    it("accepts a fully valid matrix", () => {
      const result = coerceSlideGraphic(validMatrixRaw()) as Matrix2x2Graphic;
      expect(result).toBeDefined();
      expect(result.kind).toBe("matrix2x2");
      expect(result.xAxisLabel).toBe("Interest");
      expect(result.yAxisLabel).toBe("Power");
      expect(result.quadrants.topRight.items).toEqual(["Sponsor", "Steering Committee"]);
      expect(result.quadrants.bottomLeft.items).toEqual([]);
    });

    it("degrades to undefined when a quadrant is missing entirely", () => {
      const raw = validMatrixRaw();
      // @ts-expect-error - deliberately malformed for the test
      delete raw.quadrants.bottomRight;
      expect(coerceSlideGraphic(raw)).toBeUndefined();
    });

    it("degrades to undefined when a quadrant has no label", () => {
      const raw = validMatrixRaw();
      raw.quadrants.topLeft.label = "";
      expect(coerceSlideGraphic(raw)).toBeUndefined();
    });

    it("degrades to undefined when quadrants is not an object", () => {
      const raw = { ...validMatrixRaw(), quadrants: "not an object" };
      expect(coerceSlideGraphic(raw)).toBeUndefined();
    });

    it("degrades to undefined when xAxisLabel is blank", () => {
      const raw = { ...validMatrixRaw(), xAxisLabel: "   " };
      expect(coerceSlideGraphic(raw)).toBeUndefined();
    });

    it("degrades to undefined when yAxisLabel is missing", () => {
      const raw = validMatrixRaw();
      // @ts-expect-error - deliberately malformed for the test
      delete raw.yAxisLabel;
      expect(coerceSlideGraphic(raw)).toBeUndefined();
    });

    it("caps items per quadrant at MATRIX_MAX_ITEMS_PER_QUADRANT", () => {
      const raw = validMatrixRaw();
      raw.quadrants.topRight.items = ["a", "b", "c", "d", "e", "f"];
      const result = coerceSlideGraphic(raw) as Matrix2x2Graphic;
      expect(result.quadrants.topRight.items).toHaveLength(MATRIX_MAX_ITEMS_PER_QUADRANT);
      expect(result.quadrants.topRight.items).toEqual(["a", "b", "c", "d"]);
    });

    it("trims whitespace and drops blank items", () => {
      const raw = validMatrixRaw();
      raw.quadrants.topLeft.items = ["  Finance Director  ", "   ", "", "IT Manager"];
      const result = coerceSlideGraphic(raw) as Matrix2x2Graphic;
      expect(result.quadrants.topLeft.items).toEqual(["Finance Director", "IT Manager"]);
    });

    it("trims axis labels", () => {
      const raw = { ...validMatrixRaw(), xAxisLabel: "  Interest  ", yAxisLabel: "  Power  " };
      const result = coerceSlideGraphic(raw) as Matrix2x2Graphic;
      expect(result.xAxisLabel).toBe("Interest");
      expect(result.yAxisLabel).toBe("Power");
    });

    it("drops non-string items", () => {
      const raw = validMatrixRaw();
      // @ts-expect-error - deliberately malformed for the test
      raw.quadrants.topLeft.items = ["Real item", 42, null, { nested: true }];
      const result = coerceSlideGraphic(raw) as Matrix2x2Graphic;
      expect(result.quadrants.topLeft.items).toEqual(["Real item"]);
    });
  });

  describe("process", () => {
    it("accepts a valid process with a caption-less step", () => {
      const result = coerceSlideGraphic(validProcessRaw()) as ProcessGraphic;
      expect(result).toBeDefined();
      expect(result.kind).toBe("process");
      expect(result.steps).toHaveLength(4);
      expect(result.steps[0]).toEqual({ label: "Initiate", caption: "Charter signed" });
      expect(result.steps[2]).toEqual({ label: "Execute" });
      expect("caption" in result.steps[2]).toBe(false);
    });

    it("degrades to undefined below PROCESS_MIN_STEPS after filtering blanks", () => {
      const raw = { kind: "process", steps: [{ label: "Only one" }, { label: "" }] };
      expect(coerceSlideGraphic(raw)).toBeUndefined();
    });

    it("accepts exactly PROCESS_MIN_STEPS steps", () => {
      const raw = {
        kind: "process",
        steps: Array.from({ length: PROCESS_MIN_STEPS }, (_, i) => ({ label: `Step ${i + 1}` })),
      };
      const result = coerceSlideGraphic(raw) as ProcessGraphic;
      expect(result.steps).toHaveLength(PROCESS_MIN_STEPS);
    });

    it("caps steps at PROCESS_MAX_STEPS", () => {
      const raw = {
        kind: "process",
        steps: Array.from({ length: 10 }, (_, i) => ({ label: `Step ${i + 1}` })),
      };
      const result = coerceSlideGraphic(raw) as ProcessGraphic;
      expect(result.steps).toHaveLength(PROCESS_MAX_STEPS);
      expect(result.steps[PROCESS_MAX_STEPS - 1].label).toBe(`Step ${PROCESS_MAX_STEPS}`);
    });

    it("drops a blank-caption field rather than keeping an empty string", () => {
      const raw = { kind: "process", steps: [{ label: "A", caption: "   " }, { label: "B" }, { label: "C" }] };
      const result = coerceSlideGraphic(raw) as ProcessGraphic;
      expect("caption" in result.steps[0]).toBe(false);
    });

    it("drops steps with a blank label but keeps the rest, when still >= minimum", () => {
      const raw = {
        kind: "process",
        steps: [{ label: "A" }, { label: "   " }, { label: "B" }, { label: "C" }],
      };
      const result = coerceSlideGraphic(raw) as ProcessGraphic;
      expect(result.steps.map((s) => s.label)).toEqual(["A", "B", "C"]);
    });

    it("degrades to undefined when steps is missing or not an array", () => {
      expect(coerceSlideGraphic({ kind: "process" })).toBeUndefined();
      expect(coerceSlideGraphic({ kind: "process", steps: "not an array" })).toBeUndefined();
    });
  });

  describe("table", () => {
    it("accepts a valid table", () => {
      const result = coerceSlideGraphic(validTableRaw()) as TableGraphic;
      expect(result).toBeDefined();
      expect(result.kind).toBe("table");
      expect(result.headers).toEqual(["Risk", "Owner", "Response"]);
      expect(result.rows).toEqual([
        ["Vendor delay", "PM", "Add buffer"],
        ["Scope creep", "Sponsor", "Change control"],
      ]);
    });

    it("degrades to undefined when headers is empty after trimming", () => {
      const raw = { kind: "table", headers: ["", "  "], rows: [["a", "b"]] };
      expect(coerceSlideGraphic(raw)).toBeUndefined();
    });

    it("degrades to undefined when rows is empty", () => {
      const raw = { kind: "table", headers: ["A", "B"], rows: [] };
      expect(coerceSlideGraphic(raw)).toBeUndefined();
    });

    it("degrades to undefined when headers or rows is missing/not an array", () => {
      expect(coerceSlideGraphic({ kind: "table", rows: [["a"]] })).toBeUndefined();
      expect(coerceSlideGraphic({ kind: "table", headers: ["A"] })).toBeUndefined();
      expect(coerceSlideGraphic({ kind: "table", headers: "A,B", rows: [["a", "b"]] })).toBeUndefined();
    });

    it("caps columns at TABLE_MAX_COLUMNS", () => {
      const headers = ["A", "B", "C", "D", "E", "F", "G"];
      const raw = { kind: "table", headers, rows: [headers.map((_, i) => `r${i}`)] };
      const result = coerceSlideGraphic(raw) as TableGraphic;
      expect(result.headers).toHaveLength(TABLE_MAX_COLUMNS);
      expect(result.headers).toEqual(["A", "B", "C", "D", "E"]);
      expect(result.rows[0]).toHaveLength(TABLE_MAX_COLUMNS);
    });

    it("caps rows at TABLE_MAX_ROWS", () => {
      const raw = {
        kind: "table",
        headers: ["A"],
        rows: Array.from({ length: 10 }, (_, i) => [`row ${i}`]),
      };
      const result = coerceSlideGraphic(raw) as TableGraphic;
      expect(result.rows).toHaveLength(TABLE_MAX_ROWS);
    });

    it("pads a short (ragged) row to the header count with blanks", () => {
      const raw = { kind: "table", headers: ["A", "B", "C"], rows: [["only one"]] };
      const result = coerceSlideGraphic(raw) as TableGraphic;
      expect(result.rows[0]).toEqual(["only one", "", ""]);
    });

    it("truncates a long (ragged) row to the header count, never rendering it ragged", () => {
      const raw = { kind: "table", headers: ["A", "B"], rows: [["x", "y", "z", "extra"]] };
      const result = coerceSlideGraphic(raw) as TableGraphic;
      expect(result.rows[0]).toEqual(["x", "y"]);
      result.rows.forEach((row) => expect(row).toHaveLength(result.headers.length));
    });

    it("drops a blank header column and the matching cell in every row", () => {
      const raw = {
        kind: "table",
        headers: ["Risk", "", "Owner"],
        rows: [
          ["Vendor delay", "unused", "PM"],
          ["Scope creep", "unused", "Sponsor"],
        ],
      };
      const result = coerceSlideGraphic(raw) as TableGraphic;
      expect(result.headers).toEqual(["Risk", "Owner"]);
      expect(result.rows).toEqual([
        ["Vendor delay", "PM"],
        ["Scope creep", "Sponsor"],
      ]);
    });

    it("drops non-array rows while keeping valid ones", () => {
      const raw = { kind: "table", headers: ["A"], rows: [["ok"], "not a row", ["also ok"]] };
      const result = coerceSlideGraphic(raw) as TableGraphic;
      expect(result.rows).toEqual([["ok"], ["also ok"]]);
    });

    it("trims whitespace in header and cell text", () => {
      const raw = { kind: "table", headers: ["  Risk  "], rows: [["  Vendor delay  "]] };
      const result = coerceSlideGraphic(raw) as TableGraphic;
      expect(result.headers).toEqual(["Risk"]);
      expect(result.rows).toEqual([["Vendor delay"]]);
    });
  });
});

describe("graphicSlideLayout", () => {
  it("splits content into a bullets band above and a graphic band below", () => {
    const content = { x: 0.45, y: 1.0, w: 12.4, h: 5.35 };
    const { bulletsArea, graphicArea } = graphicSlideLayout(content, 1.3);
    expect(bulletsArea).toEqual({ x: 0.45, y: 1.0, w: 12.4, h: 1.3 });
    // Default gap is 0.15.
    expect(graphicArea.y).toBeCloseTo(1.0 + 1.3 + 0.15);
    expect(graphicArea.x).toBe(0.45);
    expect(graphicArea.w).toBe(12.4);
    expect(graphicArea.h).toBeCloseTo(5.35 - 1.3 - 0.15);
  });

  it("respects a custom gap", () => {
    const content = { x: 0, y: 0, w: 10, h: 6 };
    const { graphicArea } = graphicSlideLayout(content, 1, 0.5);
    expect(graphicArea.y).toBeCloseTo(1.5);
    expect(graphicArea.h).toBeCloseTo(4.5);
  });

  it("never returns a negative graphic height", () => {
    const content = { x: 0, y: 0, w: 10, h: 2 };
    const { graphicArea } = graphicSlideLayout(content, 5, 1);
    expect(graphicArea.h).toBe(0);
  });
});

describe("matrix2x2QuadrantRects", () => {
  it("tiles the area into four equal quadrants with a gap", () => {
    const area = { x: 0, y: 0, w: 10, h: 8 };
    const quads = matrix2x2QuadrantRects(area, 0.2);
    const close = (rect: { x: number; y: number; w: number; h: number }, expected: { x: number; y: number; w: number; h: number }) => {
      expect(rect.x).toBeCloseTo(expected.x);
      expect(rect.y).toBeCloseTo(expected.y);
      expect(rect.w).toBeCloseTo(expected.w);
      expect(rect.h).toBeCloseTo(expected.h);
    };
    close(quads.topLeft, { x: 0, y: 0, w: 4.9, h: 3.9 });
    close(quads.topRight, { x: 5.1, y: 0, w: 4.9, h: 3.9 });
    close(quads.bottomLeft, { x: 0, y: 4.1, w: 4.9, h: 3.9 });
    close(quads.bottomRight, { x: 5.1, y: 4.1, w: 4.9, h: 3.9 });
  });

  it("keeps quadrants within the original area bounds (no overflow)", () => {
    const area = { x: 1, y: 2, w: 9, h: 7 };
    const quads = matrix2x2QuadrantRects(area);
    const maxX = Math.max(quads.topRight.x + quads.topRight.w, quads.bottomRight.x + quads.bottomRight.w);
    const maxY = Math.max(quads.bottomLeft.y + quads.bottomLeft.h, quads.bottomRight.y + quads.bottomRight.h);
    expect(maxX).toBeCloseTo(area.x + area.w);
    expect(maxY).toBeCloseTo(area.y + area.h);
  });

  it("offsets from a non-zero origin", () => {
    const area = { x: 2, y: 3, w: 4, h: 4 };
    const quads = matrix2x2QuadrantRects(area, 0);
    expect(quads.topLeft).toEqual({ x: 2, y: 3, w: 2, h: 2 });
    expect(quads.bottomRight).toEqual({ x: 4, y: 5, w: 2, h: 2 });
  });
});

describe("enforceGraphicsForApplied", () => {
  const validProcess: ProcessGraphic = {
    kind: "process",
    steps: [{ label: "A" }, { label: "B" }, { label: "C" }],
  };

  function slide(title: string, graphic?: GraphicGapSlide["graphic"]): GraphicGapSlide {
    return graphic ? { title, graphic } : { title };
  }

  // Z5-AC1 (Week 8 OOP visual-density fix): SUPERSEDES the old "is a no-op
  // for a coding course" test - enforceGraphicsForApplied is no longer a
  // hard no-op for `kind !== "applied"`. "Artifact:"/"Judgment Call:" stay
  // irrelevant to coding (no coding contract ever produces those titles),
  // but "Agenda:" is now coding-required too - see the describe blocks below
  // this one for the full coding-side coverage this test used to prevent.
  it("never flags Artifact:/Judgment Call: for a coding course - those titles are applied-only and coding never produces them", () => {
    const slides = [slide("Artifact: a register"), slide("Judgment Call: a tradeoff")];
    const result = enforceGraphicsForApplied(slides, "coding");
    expect(result.missing).toEqual([]);
    expect(result.slides).toBe(slides);
  });

  it("is still a genuine no-op for applied-only titles even mixed with coding-required ones that DO carry a graphic", () => {
    const slides = [
      slide("Artifact: a register"),
      slide("Judgment Call: a tradeoff"),
      slide("Agenda: this week", validProcess),
    ];
    const result = enforceGraphicsForApplied(slides, "coding");
    expect(result.missing).toEqual([]);
  });

  describe("coding-deck graphic requirements (Z5-AC1, the Week 8 OOP visual-density fix)", () => {
    it("flags a coding Agenda slide with no graphic", () => {
      const slides = [slide("Agenda: Object-Oriented Programming")];
      const result = enforceGraphicsForApplied(slides, "coding");
      expect(result.missing).toEqual([{ index: 0, title: "Agenda: Object-Oriented Programming" }]);
    });

    it("flags a coding Terminology slide with no graphic", () => {
      const slides = [slide("Terminology: Key Vocabulary")];
      const result = enforceGraphicsForApplied(slides, "coding");
      expect(result.missing).toEqual([{ index: 0, title: "Terminology: Key Vocabulary" }]);
    });

    it("does not flag a coding Agenda/Terminology slide that already carries a valid graphic", () => {
      const slides = [
        slide("Agenda: Object-Oriented Programming", validProcess),
        slide("Terminology: Key Vocabulary", validProcess),
      ];
      const result = enforceGraphicsForApplied(slides, "coding");
      expect(result.missing).toEqual([]);
    });

    it("flags a concept-intro slide (the slide immediately after a Section divider) with no graphic", () => {
      const slides = [
        slide("Section 1: Inheritance"),
        slide("Inheritance lets a child class reuse a parent's behavior"),
      ];
      const result = enforceGraphicsForApplied(slides, "coding");
      expect(result.missing).toEqual([
        { index: 1, title: "Inheritance lets a child class reuse a parent's behavior" },
      ]);
    });

    it("does not flag a concept-intro slide that already carries a valid graphic", () => {
      const slides = [slide("Section 1: Inheritance"), slide("Inheritance reuses a parent's behavior", validProcess)];
      const result = enforceGraphicsForApplied(slides, "coding");
      expect(result.missing).toEqual([]);
    });

    it("does not flag a slide that merely comes second - only a real 'Section <n>:' divider immediately before it triggers the concept-intro requirement", () => {
      const slides = [slide("Case Study: a real event"), slide("Agenda: this week", validProcess)];
      const result = enforceGraphicsForApplied(slides, "coding");
      expect(result.missing).toEqual([]);
    });

    it("matches 'Section <n>:' with any digit, not just 'Section 1:'", () => {
      const slides = [slide("Section 12: Polymorphism"), slide("Polymorphism lets one interface take many forms")];
      const result = enforceGraphicsForApplied(slides, "coding");
      expect(result.missing).toEqual([
        { index: 1, title: "Polymorphism lets one interface take many forms" },
      ]);
    });

    it("never flags Example/Walkthrough/Practice/Answer slides, even ones that follow a Section divider", () => {
      const slides: GraphicGapSlide[] = [
        { title: "Section 1: Inheritance" },
        { title: "Inheritance reuses a parent's behavior", graphic: validProcess },
        { title: "Example: Inheritance", code: "class Dog(Animal): pass" },
        { title: "Walkthrough: Inheritance", code: "class Dog(Animal): pass" },
        { title: "Practice: Inheritance", code: "class Dog(Animal): pass" },
        { title: "Answer: Inheritance", code: "class Cat(Animal): pass" },
      ];
      const result = enforceGraphicsForApplied(slides, "coding");
      expect(result.missing).toEqual([]);
    });

    // SABOTAGE (proves the `!slide.code` guard in isCodingConceptIntroSlide
    // actually matters): a malformed deck where the model skipped the
    // concept-intro slide, so an Example slide (which carries "code") lands
    // directly after the Section divider instead. Without the guard, this
    // slide would be wrongly flagged as missing a graphic - and even if
    // "repaired", buildSlidesPptx (src/lib/pptx.ts) ignores "graphic"
    // whenever "code" is present, so the repair would render invisibly. This
    // test fails if the `!slide.code` check is removed from
    // isCodingConceptIntroSlide.
    it("never flags a code-bearing slide even when it wrongly lands directly after a Section divider", () => {
      const slides: GraphicGapSlide[] = [
        { title: "Section 1: Inheritance" },
        { title: "Example: Inheritance", code: "class Dog(Animal): pass" },
      ];
      const result = enforceGraphicsForApplied(slides, "coding");
      expect(result.missing).toEqual([]);
    });

    it("reports every coding gap with its correct index, in slide order", () => {
      const slides = [
        slide("Case Study: a real event"),
        slide("Agenda: this week"),
        slide("Section 1: Encapsulation"),
        slide("Encapsulation bundles data with the code that operates on it"),
        { title: "Example: Encapsulation", code: "self._x = 1" } as GraphicGapSlide,
        slide("Terminology: Key Vocabulary"),
      ];
      const result = enforceGraphicsForApplied(slides, "coding");
      expect(result.missing).toEqual([
        { index: 1, title: "Agenda: this week" },
        { index: 3, title: "Encapsulation bundles data with the code that operates on it" },
        { index: 5, title: "Terminology: Key Vocabulary" },
      ]);
    });

    it("never mutates or drops a slide for coding either - slides comes back exactly as it went in", () => {
      const slides = [slide("Agenda: this week"), slide("Section 1: Inheritance")];
      const result = enforceGraphicsForApplied(slides, "coding");
      expect(result.slides).toBe(slides);
    });
  });

  it("flags an Artifact slide with no graphic", () => {
    const slides = [slide("Principle: risk"), slide("Artifact: a register")];
    const result = enforceGraphicsForApplied(slides, "applied");
    expect(result.missing).toEqual([{ index: 1, title: "Artifact: a register" }]);
  });

  it("flags a Judgment Call slide with no graphic", () => {
    const slides = [slide("Judgment Call: cost vs. schedule")];
    const result = enforceGraphicsForApplied(slides, "applied");
    expect(result.missing).toEqual([{ index: 0, title: "Judgment Call: cost vs. schedule" }]);
  });

  it("flags an Agenda slide with no graphic", () => {
    const slides = [slide("Agenda: Project Scheduling")];
    const result = enforceGraphicsForApplied(slides, "applied");
    expect(result.missing).toEqual([{ index: 0, title: "Agenda: Project Scheduling" }]);
  });

  it("does not flag an Artifact/Judgment Call/Agenda slide that already carries a valid graphic", () => {
    const slides = [
      slide("Agenda: this week", validProcess),
      slide("Artifact: a register", validProcess),
      slide("Judgment Call: cost vs. schedule", validProcess),
    ];
    const result = enforceGraphicsForApplied(slides, "applied");
    expect(result.missing).toEqual([]);
  });

  it("never flags a slide type outside the required set, graphic or not", () => {
    const slides = [
      slide("Principle: scope"),
      slide("In Practice: a case"),
      slide("Your Turn: try it"),
      slide("Model Response: a strong answer"),
      slide("Section 1: scheduling"),
      slide("Bridge: scope to schedule"),
    ];
    const result = enforceGraphicsForApplied(slides, "applied");
    expect(result.missing).toEqual([]);
  });

  it("reports every gap with its correct index, in slide order", () => {
    const slides = [
      slide("Principle: scope"),
      slide("Artifact: a register"),
      slide("Judgment Call: a tradeoff"),
      slide("Your Turn: try it", validProcess),
      slide("Agenda: never actually first, but still checked"),
    ];
    const result = enforceGraphicsForApplied(slides, "applied");
    expect(result.missing).toEqual([
      { index: 1, title: "Artifact: a register" },
      { index: 2, title: "Judgment Call: a tradeoff" },
      { index: 4, title: "Agenda: never actually first, but still checked" },
    ]);
  });

  it("never mutates or drops a slide - slides comes back exactly as it went in", () => {
    const slides = [slide("Principle: scope"), slide("Artifact: a register")];
    const result = enforceGraphicsForApplied(slides, "applied");
    expect(result.slides).toBe(slides);
    expect(result.slides).toEqual([slide("Principle: scope"), slide("Artifact: a register")]);
  });

  // RCA13 (RCA round 3): the Agenda slide's mandatory graphic used to always
  // be "process", but "process" only accepts PROCESS_MIN_STEPS-PROCESS_MAX_
  // STEPS (3-6) steps while the CONCEPT PLAN's concept count ranges 2-7 (see
  // lecture-concepts.ts's conceptCountForMinutes) - at 2 concepts (a
  // 20-minute lecture) coerceProcess returned undefined (below the 3-step
  // floor) and this guard reported an unfixable Agenda gap; at 7 concepts (75
  // minutes and above) coerceProcess silently truncated to 6, dropping the
  // 7th concept from the slide whose entire job is to map the lecture. The
  // fix (slide-prompt.ts's AGENDA SLIDE rule) does NOT change the graphic
  // caps (entry 110 AC4 pins them) - it switches the REQUIRED shape to
  // "table" outside the 3-6 range, which this guard already accepts, since it
  // was never a gate on the graphic's *kind* to begin with (see the "does not
  // flag an Artifact/Judgment Call/Agenda slide that already carries a valid
  // graphic" test above, which already used a shape-agnostic check). These
  // tests confirm the actual failure mode is gone: every concept count this
  // app can produce yields a graphic enforceGraphicsForApplied accepts.
  describe("RCA13: the Agenda graphic is satisfiable at every concept count", () => {
    /** Mirrors slide-prompt.ts's AGENDA SLIDE rule: 3-6 concepts get a
     * "process" graphic (one step per concept); 2 or 7 concepts (the only
     * values conceptCountForMinutes can produce outside 3-6, since it is
     * clamped to MIN_CONCEPTS_PER_LECTURE..MAX_CONCEPTS_PER_LECTURE, i.e.
     * 2..7) get a "table" instead, capped at TABLE_MAX_ROWS. */
    function buildAgendaGraphicRaw(concepts: string[]): Record<string, unknown> {
      if (concepts.length >= PROCESS_MIN_STEPS && concepts.length <= PROCESS_MAX_STEPS) {
        return { kind: "process", steps: concepts.map((c) => ({ label: c })) };
      }
      return {
        kind: "table",
        headers: ["Section", "What You Will Be Able To Do"],
        rows: concepts.slice(0, TABLE_MAX_ROWS).map((c) => [c, `Explain and apply ${c}`]),
      };
    }

    it.each([20, 50, 75, 120, 150])(
      "a %i-minute lecture's concept count coerces to a valid, unflagged Agenda graphic",
      (minutes) => {
        const count = conceptCountForMinutes(minutes);
        const concepts = Array.from({ length: count }, (_, i) => `Concept ${i + 1}`);
        const graphic = coerceSlideGraphic(buildAgendaGraphicRaw(concepts));
        expect(graphic).toBeDefined();

        const result = enforceGraphicsForApplied([{ title: "Agenda: this week", graphic }], "applied");
        expect(result.missing).toEqual([]);
      }
    );

    it("SABOTAGE - always using process (the pre-fix behavior) fails at the 2-concept floor", () => {
      const count = conceptCountForMinutes(20);
      expect(count).toBe(MIN_CONCEPTS_PER_LECTURE); // entry 99 AC3: "20 minutes yields 2"
      const concepts = Array.from({ length: count }, (_, i) => `Concept ${i + 1}`);
      const alwaysProcess = coerceSlideGraphic({ kind: "process", steps: concepts.map((c) => ({ label: c })) });
      expect(alwaysProcess).toBeUndefined();
    });

    it("2 concepts (the 20-minute floor): a table holds both with nothing lost", () => {
      const concepts = ["Concept One", "Concept Two"];
      const table = coerceSlideGraphic(buildAgendaGraphicRaw(concepts)) as TableGraphic;
      expect(table.kind).toBe("table");
      expect(table.rows).toHaveLength(2);
      expect(table.rows.map((r) => r[0])).toEqual(concepts);
    });

    it("7 concepts (the 75-minute-and-above ceiling): the table's 6-row cap holds the first 6, never all 7", () => {
      const count = conceptCountForMinutes(75);
      expect(count).toBe(MAX_CONCEPTS_PER_LECTURE); // entry 99 AC3: "75 minutes and above yield 7"
      const concepts = Array.from({ length: count }, (_, i) => `Concept ${i + 1}`);
      const table = coerceSlideGraphic(buildAgendaGraphicRaw(concepts)) as TableGraphic;
      expect(table.kind).toBe("table");
      expect(table.rows).toHaveLength(TABLE_MAX_ROWS);
      expect(table.rows.map((r) => r[0])).toEqual(concepts.slice(0, 6));
      // The 7th concept is not in the table - slide-prompt.ts's AGENDA SLIDE
      // rule requires the slide's own bullets (which already list every
      // concept per that rule's first sentence) to still name it, so it is
      // never silently dropped from the deck - that half of the fix is a
      // prompt-text requirement, pinned in slide-prompt.test.ts, not
      // something a graphic-coercion test can observe.
    });
  });
});

describe("processStepRects", () => {
  it("returns an empty array for a non-positive count", () => {
    expect(processStepRects({ x: 0, y: 0, w: 10, h: 2 }, 0)).toEqual([]);
    expect(processStepRects({ x: 0, y: 0, w: 10, h: 2 }, -1)).toEqual([]);
  });

  it("lays out equal-width boxes left to right that fill the area exactly", () => {
    const area = { x: 0, y: 0, w: 10, h: 2 };
    const rects = processStepRects(area, 4, 0.2);
    expect(rects).toHaveLength(4);
    rects.forEach((r) => {
      expect(r.y).toBe(0);
      expect(r.h).toBe(2);
    });
    // Each box is the same width, and the last box's right edge lands on the
    // area's right edge (the gaps + boxes exactly fill the width).
    const lastRect = rects[rects.length - 1];
    expect(lastRect.x + lastRect.w).toBeCloseTo(area.x + area.w);
    expect(rects[0].w).toBeCloseTo(rects[1].w);
  });

  it("places a single step across the full width", () => {
    const area = { x: 1, y: 1, w: 8, h: 3 };
    const rects = processStepRects(area, 1);
    expect(rects).toEqual([{ x: 1, y: 1, w: 8, h: 3 }]);
  });
});
