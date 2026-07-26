import { describe, it, expect } from "vitest";
import { buildCastletopPlan, sanitizeSheetName } from "./castletop-plan";
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
  });
});
