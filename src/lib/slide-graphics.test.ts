import { describe, it, expect } from "vitest";
import {
  coerceSlideGraphic,
  graphicSlideLayout,
  matrix2x2QuadrantRects,
  processStepRects,
  MATRIX_MAX_ITEMS_PER_QUADRANT,
  PROCESS_MIN_STEPS,
  PROCESS_MAX_STEPS,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
  type Matrix2x2Graphic,
  type ProcessGraphic,
  type TableGraphic,
} from "./slide-graphics";

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
