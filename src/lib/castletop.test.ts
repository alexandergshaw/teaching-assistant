import { describe, it, expect, beforeAll } from "vitest";
import { buildCastletopPlan, sanitizeSheetName, buildCastletopFileName } from "./castletop-plan";
import { buildCastletopWorkbook } from "./castletop";

describe("sanitizeSheetName", () => {
  it("strips illegal characters", () => {
    const result = sanitizeSheetName("Sheet[Name]:*?/\\");
    expect(result).toBe("SheetName");
  });

  it("collapses whitespace runs to one space", () => {
    const result = sanitizeSheetName("Multiple   Spaces  Here");
    expect(result).toBe("Multiple Spaces Here");
  });

  it("trims whitespace", () => {
    const result = sanitizeSheetName("  Padded  ");
    expect(result).toBe("Padded");
  });

  it("truncates to 31 characters", () => {
    const long = "a".repeat(50);
    const result = sanitizeSheetName(long);
    expect(result).toHaveLength(31);
  });

  it("returns empty string for null", () => {
    expect(sanitizeSheetName(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(sanitizeSheetName(undefined)).toBe("");
  });

  it("returns empty string for blank", () => {
    expect(sanitizeSheetName("")).toBe("");
  });

  it("handles control characters", () => {
    const result = sanitizeSheetName("Name\x00With\x1fControl");
    expect(result).toBe("NameWithControl");
  });
});

describe("buildCastletopPlan", () => {
  it("builds title with both courseCode and courseName", () => {
    const plan = buildCastletopPlan({
      courseCode: "INFO-2350",
      courseName: "Intro to Computer Science",
      weeks: 0,
    });
    expect(plan.title).toBe("INFO-2350 Intro to Computer Science");
  });

  it("builds title with courseName only when courseCode is omitted", () => {
    const plan = buildCastletopPlan({
      courseName: "Intro to Computer Science",
      weeks: 0,
    });
    expect(plan.title).toBe("Intro to Computer Science");
  });

  it("appends instructor to title when provided", () => {
    const plan = buildCastletopPlan({
      courseCode: "INFO-2350",
      courseName: "Intro to Computer Science",
      instructor: "William A Loring",
      weeks: 0,
    });
    expect(plan.title).toBe(
      "INFO-2350 Intro to Computer Science, William A Loring"
    );
  });

  it("does not append instructor when blank", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      instructor: "",
      weeks: 0,
    });
    expect(plan.title).not.toContain(",");
  });

  it("uses sanitized term as sheetName", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      term: "Spring 2024",
      weeks: 0,
    });
    expect(plan.sheetName).toBe("Spring 2024");
  });

  it("defaults sheetName to Schedule when term is blank", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      weeks: 0,
    });
    expect(plan.sheetName).toBe("Schedule");
  });

  it("defaults contactMinutes to 50", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      weeks: 0,
    });
    expect(plan.contactMinutes).toBe(50);
  });

  it("uses provided contactMinutes when positive and finite", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      contactMinutes: 60,
      weeks: 0,
    });
    expect(plan.contactMinutes).toBe(60);
  });

  it("defaults contactMinutes to 50 when zero", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      contactMinutes: 0,
      weeks: 0,
    });
    expect(plan.contactMinutes).toBe(50);
  });

  it("defaults contactMinutes to 50 when negative", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      contactMinutes: -10,
      weeks: 0,
    });
    expect(plan.contactMinutes).toBe(50);
  });

  it("defaults contactMinutes to 50 when not finite", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      contactMinutes: Infinity,
      weeks: 0,
    });
    expect(plan.contactMinutes).toBe(50);
  });

  it("creates empty weeks array when weeks is 0", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      weeks: 0,
    });
    expect(plan.weeks).toEqual([]);
  });

  it("creates expected number of weeks", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      weeks: 3,
    });
    expect(plan.weeks).toHaveLength(3);
    expect(plan.weeks[0].label).toBe("Week 1");
    expect(plan.weeks[1].label).toBe("Week 2");
    expect(plan.weeks[2].label).toBe("Week 3");
  });

  it("includes reading row in preClass when no topic", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      weeks: 1,
      pagesPerChapter: 30,
      readingRate: 19,
    });
    const week = plan.weeks[0];
    expect(week.preClass).toHaveLength(1);
    expect(week.preClass[0].assignment).toBe("Read Chapter");
    expect(week.preClass[0].qty).toBe(30);
    expect(week.preClass[0].rate).toBe(19);
  });

  it("includes both topic and reading rows when topic exists", () => {
    const topicsByWeek = new Map([[1, "Introduction to Databases"]]);
    const plan = buildCastletopPlan({
      courseName: "Course",
      weeks: 1,
      topicsByWeek,
      pagesPerChapter: 30,
      readingRate: 19,
    });
    const week = plan.weeks[0];
    expect(week.preClass).toHaveLength(2);
    expect(week.preClass[0].assignment).toBe("Introduction to Databases");
    expect(week.preClass[1].assignment).toBe("Read Chapter");
  });

  it("uses provided readingRate default", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      weeks: 1,
      readingRate: 25,
    });
    const week = plan.weeks[0];
    expect(week.preClass[0].rate).toBe(25);
  });

  it("uses provided pagesPerChapter default", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      weeks: 1,
      pagesPerChapter: 40,
    });
    const week = plan.weeks[0];
    expect(week.preClass[0].qty).toBe(40);
  });

  it("includes class session in inClass", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      weeks: 1,
      classSessionMinutes: 120,
    });
    const week = plan.weeks[0];
    expect(week.inClass).toHaveLength(1);
    expect(week.inClass[0].minutes).toBe(120);
  });

  it("uses provided classSessionMinutes", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      weeks: 1,
      classSessionMinutes: 90,
    });
    const week = plan.weeks[0];
    expect(week.inClass[0].minutes).toBe(90);
  });

  it("includes after-class items from itemsByWeek", () => {
    const itemsByWeek = new Map([
      [
        1,
        [
          { assignment: "Problem Set 1", minutes: 120 },
          { assignment: "Reading reflection", minutes: 30 },
        ],
      ],
    ]);
    const plan = buildCastletopPlan({
      courseName: "Course",
      weeks: 1,
      itemsByWeek,
    });
    const week = plan.weeks[0];
    expect(week.afterClass).toHaveLength(2);
    expect(week.afterClass[0].assignment).toBe("Problem Set 1");
    expect(week.afterClass[1].assignment).toBe("Reading reflection");
  });

  it("has empty afterClass when no itemsByWeek entry", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      weeks: 1,
    });
    const week = plan.weeks[0];
    expect(week.afterClass).toEqual([]);
  });

  it("blockRows is at least 10", () => {
    const plan = buildCastletopPlan({
      courseName: "Course",
      weeks: 1,
    });
    expect(plan.blockRows).toBeGreaterThanOrEqual(10);
  });

  it("blockRows grows to longest list", () => {
    const itemsByWeek = new Map([
      [
        1,
        Array.from({ length: 15 }, (_, i) => ({
          assignment: `Item ${i + 1}`,
          minutes: 60,
        })),
      ],
    ]);
    const plan = buildCastletopPlan({
      courseName: "Course",
      weeks: 1,
      itemsByWeek,
    });
    expect(plan.blockRows).toBe(15);
  });
});

describe("buildCastletopWorkbook", () => {
  // buildCastletopWorkbook pulls exceljs in through a dynamic import
  // (castletop.ts:15), so the FIRST call in this file pays that library's
  // entire module-load cost and every later call reuses the cached module.
  // Observed once at 9647ms for the first test against 9-93ms for each of the
  // other fourteen. That is past vitest's default 5s testTimeout, so whichever
  // test happened to run first failed - intermittently, since a warm module
  // cache hides it entirely. The cost is real but it is SETUP, not test work,
  // so it is paid here where it belongs.
  //
  // On reproducing: deleting node_modules/.vite reliably shows the SHAPE of
  // the problem - the first test drops from ~442ms to ~39ms once this hook
  // warms the import - but does NOT reproduce the 9.6s magnitude. That extreme
  // is environmental (this repo lives under a OneDrive-synced path, where
  // reads of a large dependency tree can stall for seconds). So do not
  // conclude from a fast local run that this hook is unnecessary; its job is
  // to give that unbounded environmental cost a place to land where the
  // ceiling is an explicit 60s rather than an implicit 5s.
  //
  // Deliberately not fixed by raising testTimeout on the tests: that would
  // also raise the ceiling on the workbook building itself, masking a genuine
  // slowdown there. Deliberately not fixed by shrinking the fixture or
  // memoizing the workbook either - the fixture is already minimal (weeks: 1)
  // and each test needs its own plan; the cost is exceljs initializing, not
  // anything this repo controls.
  //
  // The explicit hook timeout is required, not decorative: vitest's default
  // hookTimeout is 10s and the measured cold load was 9647ms, which is close
  // enough that the flake would simply move from the test to the hook.
  beforeAll(async () => {
    await import("exceljs");
  }, 60_000);

  it("produces a buffer for a simple one-week plan", async () => {
    const plan = buildCastletopPlan({
      courseName: "Test Course",
      weeks: 1,
    });
    const buffer = await buildCastletopWorkbook(plan);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("sets A1 to the plan title", async () => {
    const plan = buildCastletopPlan({
      courseCode: "INFO-2350",
      courseName: "Intro to Computer Science",
      weeks: 1,
    });
    const buffer = await buildCastletopWorkbook(plan);

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(1);
    if (!ws) throw new Error("Worksheet not found");
    expect(ws.getCell("A1").value).toBe(
      "INFO-2350 Intro to Computer Science"
    );
  });

  it("sets K3 to contactMinutes", async () => {
    const plan = buildCastletopPlan({
      courseName: "Test Course",
      weeks: 1,
      contactMinutes: 60,
    });
    const buffer = await buildCastletopWorkbook(plan);

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(1);
    if (!ws) throw new Error("Worksheet not found");
    expect(ws.getCell("K3").value).toBe(60);
  });

  it("includes merged cells for headers", async () => {
    const plan = buildCastletopPlan({
      courseName: "Test Course",
      weeks: 1,
    });
    const buffer = await buildCastletopWorkbook(plan);

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(1);
    if (!ws) throw new Error("Worksheet not found");

    // Verify header cells are set correctly
    expect(ws.getCell("C2").value).toBe("Pre class work");
    expect(ws.getCell("F2").value).toBe("In class work");
    expect(ws.getCell("H2").value).toBe("After class work");

    // Verify header merges
    const merges = (ws as { model: { merges?: string[] } }).model.merges || [];
    expect(merges).toContain("C2:E2");
    expect(merges).toContain("F2:G2");
    expect(merges).toContain("H2:I2");

    // Verify grand total merge
    expect(merges).toContain("H18:I18");
  });

  it("includes merged cells for week labels", async () => {
    const plan = buildCastletopPlan({
      courseName: "Test Course",
      weeks: 2,
    });
    const buffer = await buildCastletopWorkbook(plan);

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(1);
    if (!ws) throw new Error("Worksheet not found");

    // Verify week labels are set
    expect(ws.getCell("A4").value).toBe("Week 1");
    expect(ws.getCell("A19").value).toBe("Week 2");

    // Verify week-block merges (blockRows=10 means 11 rows including total row)
    const merges = (ws as { model: { merges?: string[] } }).model.merges || [];
    expect(merges).toContain("A4:A14");
    expect(merges).toContain("A15:A25");
  });

  it("content row formulas in K/L/M", async () => {
    const plan = buildCastletopPlan({
      courseName: "Test Course",
      weeks: 1,
    });
    const buffer = await buildCastletopWorkbook(plan);

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(1);
    if (!ws) throw new Error("Worksheet not found");

    const k4 = ws.getCell("K4").value as { formula: string };
    const l4 = ws.getCell("L4").value as { formula: string };
    const m4 = ws.getCell("M4").value as { formula: string };

    expect(k4).toHaveProperty("formula");
    expect(l4).toHaveProperty("formula");
    expect(m4).toHaveProperty("formula");
    expect(k4.formula).toBe("G4/$K$3");
    expect(l4.formula).toBe("(E4+I4)/$K$3");
    expect(m4.formula).toBe("L4+K4");
  });

  it("total row formulas", async () => {
    const plan = buildCastletopPlan({
      courseName: "Test Course",
      weeks: 1,
    });
    const buffer = await buildCastletopWorkbook(plan);

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(1);
    if (!ws) throw new Error("Worksheet not found");

    // Week 1 total row is at row 14 (4 + 10 content rows)
    const k14 = ws.getCell("K14").value as { formula: string };
    const l14 = ws.getCell("L14").value as { formula: string };
    const m14 = ws.getCell("M14").value as { formula: string };
    const n14 = ws.getCell("N14").value as { formula: string };

    expect(k14.formula).toBe("SUM(K4:K13)");
    expect(l14.formula).toBe("SUM(L4:L13)");
    expect(m14.formula).toBe("SUM(M4:M13)");
    expect(n14.formula).toBe("M14");
  });

  it("grand total row in reverse week order", async () => {
    const plan = buildCastletopPlan({
      courseName: "Test Course",
      weeks: 3,
    });
    const buffer = await buildCastletopWorkbook(plan);

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(1);
    if (!ws) throw new Error("Worksheet not found");

    // Find the grand total row by looking for the "Grand Totals" cell
    let grandRow = 0;
    for (let r = 4; r <= 100; r++) {
      if (ws.getCell(`H${r}`).value === "Grand Totals") {
        grandRow = r;
        break;
      }
    }
    if (grandRow === 0) throw new Error("Grand Totals row not found");

    // Week 1 total at row 14, week 2 total at row 25, week 3 total at row 36
    const kGrand = ws.getCell(`K${grandRow}`).value as { formula: string };
    expect(kGrand.formula).toBe("K36+K25+K14");
  });

  it("average formula divides by week count", async () => {
    const plan = buildCastletopPlan({
      courseName: "Test Course",
      weeks: 2,
    });
    const buffer = await buildCastletopWorkbook(plan);

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(1);
    if (!ws) throw new Error("Worksheet not found");

    // Find the average row by looking for the "Average" cell
    let avgRow = 0;
    for (let r = 4; r <= 100; r++) {
      if (ws.getCell(`L${r}`).value === "Average") {
        avgRow = r;
        break;
      }
    }
    if (avgRow === 0) throw new Error("Average row not found");

    const mAvg = ws.getCell(`M${avgRow}`).value as { formula: string };
    expect(mAvg.formula).toBe(`M${avgRow - 1}/2`);
  });

  it("empty weeks produces no grand-total block", async () => {
    const plan = buildCastletopPlan({
      courseName: "Test Course",
      weeks: 0,
    });
    const buffer = await buildCastletopWorkbook(plan);

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(1);
    if (!ws) throw new Error("Worksheet not found");

    // No grand total row should exist beyond the header
    const cell = ws.getCell("K6");
    expect(cell.value).toBeNull();
  });

  it("freeze panes at ySplit 3", async () => {
    const plan = buildCastletopPlan({
      courseName: "Test Course",
      weeks: 1,
    });
    const buffer = await buildCastletopWorkbook(plan);

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(1);
    if (!ws) throw new Error("Worksheet not found");

    expect(ws.views).toHaveLength(1);
    const view = ws.views[0] as { ySplit?: number };
    expect(view.ySplit).toBe(3);
  });

  it("column widths are set correctly", async () => {
    const plan = buildCastletopPlan({
      courseName: "Test Course",
      weeks: 1,
    });
    const buffer = await buildCastletopWorkbook(plan);

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(1);
    if (!ws) throw new Error("Worksheet not found");

    expect(ws.getColumn("A").width).toBe(3.71);
    expect(ws.getColumn("K").width).toBe(8.29);

    // Full A-K set, exact values (frozen / reference-verified per
    // docs/REGRESSION.md entry 56)
    expect(ws.getColumn("B").width).toBe(4.14);
    expect(ws.getColumn("C").width).toBe(32.14);
    expect(ws.getColumn("D").width).toBe(4.29);
    expect(ws.getColumn("E").width).toBe(8.0);
    expect(ws.getColumn("F").width).toBe(30.29);
    expect(ws.getColumn("G").width).toBe(5.0);
    expect(ws.getColumn("H").width).toBe(53.86);
    expect(ws.getColumn("I").width).toBe(6.86);
    expect(ws.getColumn("J").width).toBe(6.43);

    // L/M/N are new and NOT reference-verified (entry 56 covers A-K only);
    // just confirm they now have a defined numeric width instead of
    // falling back to Excel's default (which is what produced "###").
    expect(typeof ws.getColumn("L").width).toBe("number");
    expect(typeof ws.getColumn("M").width).toBe("number");
    expect(typeof ws.getColumn("N").width).toBe("number");
  });

  it("grand-total block labels are bold and their text is unchanged", async () => {
    const plan = buildCastletopPlan({
      courseName: "Test Course",
      weeks: 1,
    });
    const buffer = await buildCastletopWorkbook(plan);

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(1);
    if (!ws) throw new Error("Worksheet not found");

    // Locate rows via the same sentinel-scan pattern as the existing
    // "grand total row" / "average formula" tests, rather than re-deriving
    // row arithmetic.
    let grandRow = 0;
    for (let r = 4; r <= 100; r++) {
      if (ws.getCell(`H${r}`).value === "Grand Totals") {
        grandRow = r;
        break;
      }
    }
    if (grandRow === 0) throw new Error("Grand Totals row not found");

    let labelRow = 0;
    for (let r = 4; r <= 100; r++) {
      if (ws.getCell(`K${r}`).value === "In ") {
        labelRow = r;
        break;
      }
    }
    if (labelRow === 0) throw new Error("Label row not found");

    let avgRow = 0;
    for (let r = 4; r <= 100; r++) {
      if (ws.getCell(`L${r}`).value === "Average") {
        avgRow = r;
        break;
      }
    }
    if (avgRow === 0) throw new Error("Average row not found");

    // Text is exactly unchanged, including the frozen trailing space in "In "
    expect(ws.getCell(`H${grandRow}`).value).toBe("Grand Totals");
    expect(ws.getCell(`K${labelRow}`).value).toBe("In ");
    expect(ws.getCell(`L${labelRow}`).value).toBe("Out");
    expect(ws.getCell(`M${labelRow}`).value).toBe("Total");
    expect(ws.getCell(`L${avgRow}`).value).toBe("Average");

    // Now bold, matching every adjacent number in the block
    expect(ws.getCell(`H${grandRow}`).font?.bold).toBe(true);
    expect(ws.getCell(`K${labelRow}`).font?.bold).toBe(true);
    expect(ws.getCell(`L${labelRow}`).font?.bold).toBe(true);
    expect(ws.getCell(`M${labelRow}`).font?.bold).toBe(true);
    expect(ws.getCell(`L${avgRow}`).font?.bold).toBe(true);
  });

  it("fill stays confined to the pre-class column (C); in-class (F) and after-class (H) are unhighlighted", async () => {
    const plan = buildCastletopPlan({
      courseName: "Test Course",
      weeks: 1,
    });
    const buffer = await buildCastletopWorkbook(plan);

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(1);
    if (!ws) throw new Error("Worksheet not found");

    const fillArgb = (addr: string) => {
      const fill = ws.getCell(addr).fill as
        | { fgColor?: { argb?: string } }
        | undefined;
      return fill?.fgColor?.argb;
    };

    expect(fillArgb("C3")).toBe("FFFFFF99");
    expect(fillArgb("C4")).toBe("FFFFFF99");
    // Round-tripped through xlsx, an unstyled cell can come back with a
    // fill descriptor of pattern "none" rather than a bare undefined, so
    // assert on the color (the actual highlight), not object identity.
    expect(fillArgb("F3")).toBeUndefined();
    expect(fillArgb("F4")).toBeUndefined();
    expect(fillArgb("H3")).toBeUndefined();
    expect(fillArgb("H4")).toBeUndefined();
  });

  it("totalRow gets a separator border; plain content cells do not", async () => {
    const plan = buildCastletopPlan({
      courseName: "Test Course",
      weeks: 1,
    });
    const buffer = await buildCastletopWorkbook(plan);

    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(1);
    if (!ws) throw new Error("Worksheet not found");

    // Week 1's total row is at row 14 (same row used by the existing
    // "total row formulas" test). Assert on the bottom side specifically:
    // round-tripped through xlsx, a cell that shares a styled row can come
    // back with an empty border descriptor ({}) rather than undefined, so
    // checking border presence alone is not reliable - the actual side is.
    expect(ws.getCell("K14").border?.bottom).toBeTruthy();
    expect(ws.getCell("C4").border?.bottom).toBeFalsy();
  });
});

describe("buildCastletopFileName", () => {
  it("reference case: instructorFileAs + courseCode + courseName", () => {
    const result = buildCastletopFileName({
      instructorFileAs: "Loring, William",
      courseCode: "INFO-2350",
      courseName: "Intro to Computer Science",
    });
    expect(result).toBe(
      "Loring, William_INFO-2350_Intro to Computer Science_Castletop.xlsx"
    );
  });

  it("prefers instructorFileAs over instructor when both are present", () => {
    const result = buildCastletopFileName({
      instructorFileAs: "Loring, William",
      instructor: "William A Loring",
      courseCode: "INFO-2350",
      courseName: "Intro to Computer Science",
    });
    expect(result).toBe(
      "Loring, William_INFO-2350_Intro to Computer Science_Castletop.xlsx"
    );
  });

  it("falls back to instructor when instructorFileAs is blank (whitespace-only)", () => {
    const result = buildCastletopFileName({
      instructorFileAs: "   ",
      instructor: "William A Loring",
      courseCode: "INFO-2350",
      courseName: "Intro to Computer Science",
    });
    expect(result).toBe(
      "William A Loring_INFO-2350_Intro to Computer Science_Castletop.xlsx"
    );
  });

  it("starts with the course code and has no leading underscore when both instructor fields are blank", () => {
    const result = buildCastletopFileName({
      courseCode: "INFO-2350",
      courseName: "Intro to Computer Science",
    });
    expect(result).toBe("INFO-2350_Intro to Computer Science_Castletop.xlsx");
    expect(result.startsWith("_")).toBe(false);
  });

  it("produces exactly Castletop.xlsx when every part is blank", () => {
    const result = buildCastletopFileName({
      instructorFileAs: null,
      instructor: "   ",
      courseCode: "",
      courseName: undefined,
    });
    expect(result).toBe("Castletop.xlsx");
  });

  it("sanitizes illegal characters from a part", () => {
    const result = buildCastletopFileName({
      instructorFileAs: "a/b:c*",
      courseCode: "INFO-2350",
      courseName: "Course",
    });
    expect(result).toBe("abc_INFO-2350_Course_Castletop.xlsx");
  });

  it("preserves a comma in the instructor part (guards the Last, First form)", () => {
    const result = buildCastletopFileName({
      instructorFileAs: "Loring, William",
      courseName: "Course",
    });
    expect(result).toBe("Loring, William_Course_Castletop.xlsx");
  });

  it("truncates a very long course name at a word boundary, keeps total <= 150, and still ends _Castletop.xlsx", () => {
    const longName = Array.from({ length: 30 }, () => "Chapter").join(" ");
    const result = buildCastletopFileName({
      instructorFileAs: "Loring, William",
      courseCode: "INFO-2350",
      courseName: longName,
    });

    expect(result.length).toBeLessThanOrEqual(150);
    expect(result.endsWith("_Castletop.xlsx")).toBe(true);

    const prefix = "Loring, William_INFO-2350_";
    const suffix = "_Castletop.xlsx";
    expect(result.startsWith(prefix)).toBe(true);

    const truncatedCourseName = result.slice(prefix.length, result.length - suffix.length);
    expect(truncatedCourseName.length).toBeLessThan(longName.length);
    expect(/^Chapter( Chapter)*$/.test(truncatedCourseName)).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const input = {
      instructorFileAs: "Loring, William",
      courseCode: "INFO-2350",
      courseName: "Intro to Computer Science",
    };
    expect(buildCastletopFileName(input)).toBe(buildCastletopFileName(input));
  });
});
