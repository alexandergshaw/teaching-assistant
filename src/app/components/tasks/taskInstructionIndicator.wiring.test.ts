// Wiring guard for the per-institution task-instruction indicator
// (docs/task-institution-instructions-acceptance-criteria.md AC2/AC3/AC4).
// course-tasks-view.test.ts and task-instruction-accessible-name.test.ts
// already pin the PURE halves of this feature (taskCellAccessibleName's new
// parameter, and everything task-institution-instructions.ts itself does);
// taskCellIndicators.test.ts pins the pure indicator-set decision. None of
// those can see whether the .tsx layer actually WIRES those pure functions
// into what renders, rather than computing a value and silently discarding
// it - vitest is node-env and collects only src/**/*.test.ts (AGENTS.md/
// CLAUDE.md-linked project notes), so no .tsx is ever rendered here. This
// file reads the four wiring-relevant components/hook as TEXT instead, the
// same idiom src/app/components/repo-grades/repoGrades.wiring.test.ts and
// src/app/components/content-tab/bulkCreateModules.wiring.test.ts both use
// for exactly this class of "implemented but not actually wired" risk
// (REGRESSION entry 239 check 10: "a structural assertion without a canary
// is worthless" - every heuristic checker below is proven against inline
// fixtures before being trusted against the real files).
//
// Two risks this guards against:
//
// Risk 1 (AC2 items 6-7 - "THIS IS THE DEFECT THIS FEATURE WOULD OTHERWISE
// SHIP"): a call site could compare `course.institution` against a raw
// stored institution string instead of going through resolveTaskInstruction/
// taskInstructionKey, silently reintroducing the casing bug the pure layer
// was built specifically to prevent. Checked across every file this wave
// touches that ever sees a course's institution.
//
// Risk 2 (AC4 item 16): TaskCell.tsx could compute taskCellIndicatorSet's
// result and then render its three markers off some OTHER, re-derived
// condition (e.g. `cell.note &&` directly, as the code looked like before
// this feature) - which would make taskCellIndicators.test.ts's guarantees
// meaningless in practice, since the component would not actually be using
// the tested function's output.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const TASK_CELL_PATH = join(process.cwd(), "src/app/components/tasks/TaskCell.tsx");
const taskCellSource = readFileSync(TASK_CELL_PATH, "utf8");
const TASK_GRID_ROW_PATH = join(process.cwd(), "src/app/components/tasks/TaskGridRow.tsx");
const taskGridRowSource = readFileSync(TASK_GRID_ROW_PATH, "utf8");
const TASKS_GRID_PATH = join(process.cwd(), "src/app/components/tasks/TasksGrid.tsx");
const tasksGridSource = readFileSync(TASKS_GRID_PATH, "utf8");
const USE_COURSE_TASKS_DATA_PATH = join(process.cwd(), "src/app/components/tasks/useCourseTasksData.ts");
const useCourseTasksDataSource = readFileSync(USE_COURSE_TASKS_DATA_PATH, "utf8");
const COURSE_TASKS_VIEW_PATH = join(process.cwd(), "src/lib/course-tasks-view.ts");
const courseTasksViewSource = readFileSync(COURSE_TASKS_VIEW_PATH, "utf8");

/**
 * Strips `//` line comments and `/* *\/` block comments from `text` before
 * searching it - so an explanatory comment that NAMES a function (e.g. "this
 * is NOT where resolveTaskInstruction is called") can never be mistaken for
 * that function actually being imported/called/compared against. Matches
 * bulkCreateModules.wiring.test.ts's own stripComments (same repo, same
 * idiom) rather than importing it - each wiring-test file keeps its own copy
 * per that file's own convention.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("stripComments (canary: proves comment-stripping actually discriminates)", () => {
  it("removes a line comment but keeps real code on the same line untouched", () => {
    expect(stripComments("const x = 1; // resolveTaskInstruction mentioned here")).toBe("const x = 1; ");
  });

  it("removes a block comment spanning multiple lines", () => {
    expect(stripComments("const x = 1;\n/* resolveTaskInstruction\n   mentioned here */\nconst y = 2;")).toBe(
      "const x = 1;\n\nconst y = 2;"
    );
  });

  it("leaves a real (non-commented) call site intact", () => {
    expect(stripComments("const v = resolveTaskInstruction(map, inst, id);")).toContain(
      "resolveTaskInstruction(map, inst, id)"
    );
  });
});

/** True when `text` (after stripping comments) imports `symbolName` from
 * `fromModule` AND actually calls it at least once. Mirrors
 * repoGrades.wiring.test.ts's usesSharedFunction. */
function importsAndCalls(text: string, symbolName: string, fromModule: string): boolean {
  const stripped = stripComments(text);
  const importPattern = new RegExp(`import\\s*\\{[^}]*\\b${symbolName}\\b[^}]*\\}\\s*from\\s*["']${fromModule}["']`);
  return importPattern.test(stripped) && stripped.includes(`${symbolName}(`);
}

describe("importsAndCalls (canary: proves the import+call check actually discriminates)", () => {
  it("true when imported from the named module and called", () => {
    const fixture = `import { resolveTaskInstruction } from "@/lib/task-institution-instructions";\nconst v = resolveTaskInstruction(map, inst, id);`;
    expect(importsAndCalls(fixture, "resolveTaskInstruction", "@/lib/task-institution-instructions")).toBe(true);
  });

  it("false when called but never imported from that module (a local reimplementation)", () => {
    const fixture = `function resolveTaskInstruction() { return ""; }\nconst v = resolveTaskInstruction();`;
    expect(importsAndCalls(fixture, "resolveTaskInstruction", "@/lib/task-institution-instructions")).toBe(false);
  });

  it("false when imported but never actually called (dead import)", () => {
    const fixture = `import { resolveTaskInstruction } from "@/lib/task-institution-instructions";`;
    expect(importsAndCalls(fixture, "resolveTaskInstruction", "@/lib/task-institution-instructions")).toBe(false);
  });

  it("false when only mentioned inside a comment (never a real import or call)", () => {
    const fixture = `// we deliberately do NOT call resolveTaskInstruction here`;
    expect(importsAndCalls(fixture, "resolveTaskInstruction", "@/lib/task-institution-instructions")).toBe(false);
  });
});

/** True when `text` (after stripping comments) contains a raw comparison of
 * SOMETHING.institution against another value with ===/!==/==/!=, the exact
 * shape AC2 item 6 says would silently defeat the casing normalization.
 * `resolveTaskInstruction(instructions, course.institution, task.id)` does
 * NOT match this - `.institution` there is a function ARGUMENT, not the
 * left/right side of a comparison operator. */
function hasRawInstitutionComparison(text: string): boolean {
  return /\.institution\s*[!=]==?[^=]/.test(stripComments(text));
}

describe("hasRawInstitutionComparison (canary: proves the raw-comparison detector actually discriminates)", () => {
  it("detects a raw equality comparison on .institution", () => {
    expect(hasRawInstitutionComparison("if (course.institution === row.institution) return true;")).toBe(true);
  });

  it("detects a raw inequality comparison on .institution", () => {
    expect(hasRawInstitutionComparison("if (a.institution !== b.institution) return false;")).toBe(true);
  });

  it("does NOT flag .institution used as a plain function argument", () => {
    expect(
      hasRawInstitutionComparison("resolveTaskInstruction(instructions, course.institution, task.id)")
    ).toBe(false);
  });

  it("does NOT flag .institution mentioned only inside a comment", () => {
    expect(hasRawInstitutionComparison("// never compare course.institution === anything raw here")).toBe(false);
  });
});

describe("TaskGridRow.tsx resolves the institution instruction through resolveTaskInstruction, never a raw comparison (AC2 item 7, AC3 item 11)", () => {
  it("canary: the file was actually read and contains its known column-loop shape", () => {
    expect(taskGridRowSource.length).toBeGreaterThan(200);
    expect(taskGridRowSource).toContain("const task = col.task;");
  });

  it("imports resolveTaskInstruction from the lib module and actually calls it", () => {
    expect(importsAndCalls(taskGridRowSource, "resolveTaskInstruction", "@/lib/task-institution-instructions")).toBe(
      true
    );
  });

  it("calls resolveTaskInstruction with the row's own course.institution and the column's task.id - not some other pair", () => {
    expect(taskGridRowSource).toContain("resolveTaskInstruction(instructions, course.institution, task.id)");
  });

  it("passes the resolved value straight to TaskCell's instruction prop", () => {
    expect(taskGridRowSource).toContain("instruction={instruction}");
  });

  it("never compares .institution raw, and never imports taskInstructionMapKey (the key is only ever formed inside resolveTaskInstruction itself)", () => {
    expect(hasRawInstitutionComparison(taskGridRowSource)).toBe(false);
    expect(stripComments(taskGridRowSource)).not.toContain("taskInstructionMapKey");
  });
});

describe("TasksGrid.tsx only passes instructions through - it resolves nothing itself (pass-through only, per this wave's file list)", () => {
  it("canary: the file was actually read and contains the TaskGridRow render call", () => {
    expect(tasksGridSource.length).toBeGreaterThan(200);
    expect(tasksGridSource).toContain("<TaskGridRow");
  });

  it("forwards the instructions prop straight to TaskGridRow", () => {
    expect(tasksGridSource).toContain("instructions={instructions}");
  });

  it("never itself imports or calls resolveTaskInstruction or buildTaskInstructionMap (those decisions live in TaskGridRow/useCourseTasksData, not here)", () => {
    const stripped = stripComments(tasksGridSource);
    expect(stripped).not.toContain("resolveTaskInstruction(");
    expect(stripped).not.toContain("buildTaskInstructionMap(");
  });

  it("never compares .institution raw", () => {
    expect(hasRawInstitutionComparison(tasksGridSource)).toBe(false);
  });
});

describe("useCourseTasksData.ts loads instructions once per mount, alongside courses/cells/defs (AC3 item 12)", () => {
  it("canary: the file was actually read and contains its known reload shape", () => {
    expect(useCourseTasksDataSource.length).toBeGreaterThan(200);
    expect(useCourseTasksDataSource).toContain("const reload = useCallback(async");
  });

  it("imports listTaskInstructionsAction from the dedicated action module (not the @/app/actions barrel, which does not re-export it)", () => {
    expect(importsAndCalls(useCourseTasksDataSource, "listTaskInstructionsAction", "@/app/actions/task-institution-instructions")).toBe(
      true
    );
  });

  it("imports and calls buildTaskInstructionMap from the pure lib module", () => {
    expect(importsAndCalls(useCourseTasksDataSource, "buildTaskInstructionMap", "@/lib/task-institution-instructions")).toBe(
      true
    );
  });

  it("listTaskInstructionsAction is called inside the SAME Promise.all as the existing course/task/def fetches - not a separate later round trip", () => {
    const allIdx = useCourseTasksDataSource.indexOf("await Promise.all([");
    expect(allIdx).toBeGreaterThan(-1);
    const closeIdx = useCourseTasksDataSource.indexOf("]);", allIdx);
    const body = useCourseTasksDataSource.slice(allIdx, closeIdx);
    expect(body).toContain("listCourseHubAction()");
    expect(body).toContain("listTaskInstructionsAction()");
  });

  it("the returned hook object exposes `instructions` for callers to thread down", () => {
    const returnIdx = useCourseTasksDataSource.lastIndexOf("return {");
    expect(returnIdx).toBeGreaterThan(-1);
    expect(useCourseTasksDataSource.slice(returnIdx)).toContain("instructions,");
  });

  it("never compares .institution raw anywhere in this file", () => {
    expect(hasRawInstitutionComparison(useCourseTasksDataSource)).toBe(false);
  });
});

describe("TaskCell.tsx's three corner marks are driven by taskCellIndicatorSet's own return value, not re-derived inline (AC4 item 16)", () => {
  it("canary: the file was actually read and contains its known marker JSX", () => {
    expect(taskCellSource.length).toBeGreaterThan(200);
    expect(taskCellSource).toContain("styles.noteMarker");
    expect(taskCellSource).toContain("styles.instructionMarker");
    expect(taskCellSource).toContain("styles.errorMarker");
  });

  it("imports taskCellIndicatorSet from the pure sibling module and calls it once, assigned to `indicators`", () => {
    expect(importsAndCalls(taskCellSource, "taskCellIndicatorSet", "./taskCellIndicators")).toBe(true);
    expect(taskCellSource).toContain("const indicators = taskCellIndicatorSet(cell.note, instruction, error);");
  });

  it("the note marker's render condition is indicators.note, not a re-derived cell.note check", () => {
    const idx = taskCellSource.indexOf("styles.noteMarker");
    const before = taskCellSource.slice(Math.max(0, idx - 60), idx);
    expect(before).toContain("indicators.note &&");
  });

  it("the instruction marker's render condition is indicators.instruction, not a re-derived instruction check", () => {
    const idx = taskCellSource.indexOf("styles.instructionMarker");
    const before = taskCellSource.slice(Math.max(0, idx - 60), idx);
    expect(before).toContain("indicators.instruction &&");
  });

  it("the error marker's render condition is indicators.error, not a re-derived error check", () => {
    const idx = taskCellSource.indexOf("styles.errorMarker");
    const before = taskCellSource.slice(Math.max(0, idx - 60), idx);
    expect(before).toContain("indicators.error &&");
  });

  it("all three markers are gated inside the SAME button as StatusGlyph (one shared element, so all four - status plus three marks - can coexist), never a sibling element that could be removed independently", () => {
    const buttonOpenIdx = taskCellSource.indexOf("<StatusGlyph status={effectiveStatus} />");
    const buttonCloseIdx = taskCellSource.indexOf("</button>", buttonOpenIdx);
    expect(buttonOpenIdx).toBeGreaterThan(-1);
    expect(buttonCloseIdx).toBeGreaterThan(buttonOpenIdx);
    const between = taskCellSource.slice(buttonOpenIdx, buttonCloseIdx);
    expect(between).toContain("styles.noteMarker");
    expect(between).toContain("styles.instructionMarker");
    expect(between).toContain("styles.errorMarker");
  });

  it("taskCellAccessibleName is called with indicators.instruction as its 5th argument, not a hardcoded true/false", () => {
    expect(taskCellSource).toContain(
      "taskCellAccessibleName(courseName, task, cell, nowMs, indicators.instruction)"
    );
  });

  it("the title/tooltip mentions instruction presence via indicators.instruction, never the instruction body text itself", () => {
    expect(taskCellSource).toContain('if (indicators.instruction) statusTitleParts.push("Institution instructions available");');
    // AC4 item 17: the body would be the `instruction` string itself - the
    // title-building code must never interpolate it directly.
    const titleFnIdx = taskCellSource.indexOf("const statusTitleParts");
    const titleFnEnd = taskCellSource.indexOf("const cellTitle", titleFnIdx);
    const titleBody = taskCellSource.slice(titleFnIdx, titleFnEnd);
    expect(titleBody).not.toContain("${instruction}");
  });

  it("never compares .institution raw anywhere in this file (it only ever receives an already-resolved string, never an institution)", () => {
    expect(hasRawInstitutionComparison(taskCellSource)).toBe(false);
  });
});

describe("course-tasks-view.ts's taskCellAccessibleName extension keeps every existing call site compiling (optional, defaulted parameter)", () => {
  it("canary: the file was actually read and contains the known function signature", () => {
    expect(courseTasksViewSource.length).toBeGreaterThan(500);
    expect(courseTasksViewSource).toContain("export function taskCellAccessibleName(");
  });

  it("hasInstruction defaults to false, so a 4-argument call site (every existing caller/test) behaves exactly as before", () => {
    expect(stripComments(courseTasksViewSource)).toContain("hasInstruction: boolean = false");
  });

  it("appends the instruction mention via appendSentence, not a blind template-literal concatenation", () => {
    const fnIdx = courseTasksViewSource.indexOf("export function taskCellAccessibleName(");
    const fnEnd = courseTasksViewSource.indexOf("\n}", fnIdx);
    const body = courseTasksViewSource.slice(fnIdx, fnEnd);
    expect(body).toContain('appendSentence(base, "Institution instructions available")');
  });
});
