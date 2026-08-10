// Contract for the parts of "attach files to a Tasks-grid cell" that are not
// pure (docs/task-cell-attachments-acceptance-criteria.md). Written BEFORE the
// implementation.
//
// Three halves:
//
// (1) BEHAVIOUR - the two pure functions that decide what the grid shows and
// says, plus the one that must NOT learn about attachments at all.
//
// (2) THE CELL BLOB MUST STAY CLEAN - AC1 item 5. An implementer who puts a
// count on the cell object ships silent data loss: coerceTaskCellMap drops
// unknown keys on every read and setTaskCellStatus rebuilds the cell on every
// status click. That is the single most valuable assertion in this file.
//
// (3) WIRING - read as source text, because vitest is node-env and collects
// only src/**/*.test.ts, so no .tsx is ever rendered. Same idiom as
// taskInstructionIndicator.wiring.test.ts and taskNoteIndicator.wiring.test.ts
// in this directory.
//
// A pre-implementation audit found that an earlier draft of this file could be
// passed 100% by an implementation where the instructor's files were never
// displayed and every upload 403'd. Three habits fix that class of hole and
// are worth keeping: comments are stripped for EVERY source assertion (a
// commented-out line otherwise satisfies a `toContain`); every `it` using a
// negative assertion first asserts the file is non-empty (a missing file
// otherwise satisfies every `not.toContain`); and a value being COMPUTED is
// never accepted as evidence that it is USED.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { taskCellIndicatorSet } from "./taskCellIndicators";
import { taskCellAccessibleName } from "@/lib/course-tasks-view";
import { coerceTaskCellMap, setTaskCellStatus, type TaskCell, type TaskDefinition } from "@/lib/course-tasks";

/** Source with comments stripped, or "" when the file does not exist yet - so
 * a missing file fails its own canary with a clear message instead of throwing
 * during collection and taking every other test down with it. */
function readSource(relativePath: string): string {
  const full = join(process.cwd(), relativePath);
  if (!existsSync(full)) return "";
  return readFileSync(full, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

/** Asserts the file was actually read before any negative assertion runs
 * against it. Without this, `expect("").not.toContain(x)` passes for every x. */
function present(source: string, what: string): string {
  expect(source.length, `${what} does not exist yet`).toBeGreaterThan(200);
  return source;
}

// -----------------------------------------------------------------------
// (1) BEHAVIOUR

describe("taskCellIndicatorSet: the note mark also means `has files` (AC3 item 15)", () => {
  it("omitting the count entirely behaves exactly as before this feature", () => {
    expect(taskCellIndicatorSet("", "", undefined)).toEqual({ note: false, instruction: false, error: false });
    expect(taskCellIndicatorSet("a note", "", undefined).note).toBe(true);
  });

  it("a cell with NO text note but one or more files still shows the note mark", () => {
    expect(taskCellIndicatorSet("", "", undefined, 1).note).toBe(true);
    expect(taskCellIndicatorSet("", "", undefined, 20).note).toBe(true);
  });

  it("a cell with neither a note nor files shows no mark", () => {
    expect(taskCellIndicatorSet("", "", undefined, 0).note).toBe(false);
    expect(taskCellIndicatorSet("   ", "", undefined, 0).note).toBe(false);
  });

  it("a whitespace-only note with files still counts as marked - the files are the reason, not the blank note", () => {
    expect(taskCellIndicatorSet("   ", "", undefined, 2).note).toBe(true);
  });

  it("a negative, fractional or non-finite count can never turn the mark on by accident", () => {
    expect(taskCellIndicatorSet("", "", undefined, -1).note).toBe(false);
    expect(taskCellIndicatorSet("", "", undefined, Number.NaN).note).toBe(false);
    expect(taskCellIndicatorSet("", "", undefined, 0.4).note).toBe(false);
  });

  it("the count does not disturb the other two indicators, and none suppresses another", () => {
    expect(taskCellIndicatorSet("", "guidance", "boom", 3)).toEqual({ note: true, instruction: true, error: true });
    expect(taskCellIndicatorSet("", "", undefined, 3)).toEqual({ note: true, instruction: false, error: false });
  });
});

const NOW = 1_700_000_000_000;

const task: TaskDefinition = {
  id: "syllabus-uploaded",
  label: "Syllabus uploaded?",
  view: "term",
  group: "independent",
  cadence: "once",
  builtIn: true,
};

const doneCell: TaskCell = { status: "done", note: "", doneAt: NOW };

describe("taskCellAccessibleName: the file count is spoken, not left to a tooltip (AC3 items 16-17)", () => {
  it("omitting the count behaves exactly as before this feature - frozen literals", () => {
    expect(taskCellAccessibleName("Databases", task, doneCell, NOW)).toBe("Databases, Syllabus uploaded?: Done");
    expect(taskCellAccessibleName("Databases", task, doneCell, NOW, true)).toBe(
      "Databases, Syllabus uploaded?: Done. Institution instructions available."
    );
  });

  it("a count of zero is identical to omitting it - frozen literal", () => {
    expect(taskCellAccessibleName("Databases", task, doneCell, NOW, false, 0)).toBe(
      "Databases, Syllabus uploaded?: Done"
    );
  });

  it("one file is singular - frozen literal", () => {
    expect(taskCellAccessibleName("Databases", task, doneCell, NOW, false, 1)).toBe(
      "Databases, Syllabus uploaded?: Done. 1 file attached."
    );
  });

  it("several files are plural - frozen literal", () => {
    expect(taskCellAccessibleName("Databases", task, doneCell, NOW, false, 3)).toBe(
      "Databases, Syllabus uploaded?: Done. 3 files attached."
    );
  });

  it("appends AFTER the instruction sentence, so every existing oracle still matches on its prefix", () => {
    expect(taskCellAccessibleName("Databases", task, doneCell, NOW, true, 2)).toBe(
      "Databases, Syllabus uploaded?: Done. Institution instructions available. 2 files attached."
    );
  });

  it("combines with a note without doubling its terminator - frozen literal", () => {
    const noted: TaskCell = { status: "open", note: "waiting on the dean", doneAt: null };
    expect(taskCellAccessibleName("Databases", task, noted, NOW, false, 2)).toBe(
      "Databases, Syllabus uploaded?: Not done, note: waiting on the dean. 2 files attached."
    );
  });

  it("does not double a note's own trailing question mark", () => {
    const noted: TaskCell = { status: "open", note: "confirmed with dept?", doneAt: null };
    expect(taskCellAccessibleName("Databases", task, noted, NOW, false, 1)).toBe(
      "Databases, Syllabus uploaded?: Not done, note: confirmed with dept? 1 file attached."
    );
  });
});

// -----------------------------------------------------------------------
// (2) THE CELL BLOB MUST STAY CLEAN (AC1 item 5)

describe("no attachment data ever reaches the task cell blob (AC1 item 5)", () => {
  it("coerceTaskCellMap still drops any fourth key, so a count stored there would vanish on the next read", () => {
    const coerced = coerceTaskCellMap({
      "syllabus-uploaded": { status: "done", note: "", doneAt: 1, attachmentCount: 3, attachments: ["a"] },
    });
    const cell = coerced["syllabus-uploaded"];
    expect(cell).toEqual({ status: "done", note: "", doneAt: 1 });
    expect(Object.keys(cell).sort()).toEqual(["doneAt", "note", "status"]);
  });

  it("setTaskCellStatus still returns exactly the three-key cell, so a status click cannot carry attachment data", () => {
    const withExtra = { status: "open", note: "n", doneAt: null, attachmentCount: 2 } as unknown as TaskCell;
    expect(Object.keys(setTaskCellStatus(withExtra, "done", NOW)).sort()).toEqual(["doneAt", "note", "status"]);
  });

  it("src/lib/course-tasks.ts never learns the word attachment - the cell module and the attachment module stay separate", () => {
    const source = present(readSource("src/lib/course-tasks.ts"), "src/lib/course-tasks.ts");
    expect(source.toLowerCase()).not.toContain("attachment");
  });

  it("the cell-writing action never learns it either", () => {
    const source = present(readSource("src/app/actions/course-tasks.ts"), "src/app/actions/course-tasks.ts");
    expect(source.toLowerCase()).not.toContain("attachment");
  });
});

// -----------------------------------------------------------------------
// (3) WIRING

describe("useCourseTasksData loads attachments once, and USES what it loaded (AC4 items 18-20)", () => {
  const source = readSource("src/app/components/tasks/useCourseTasksData.ts");

  it("canary: the file was read and still has its known reload shape", () => {
    expect(source.length).toBeGreaterThan(200);
    expect(source).toContain("const reload = useCallback(async");
  });

  it("the attachment fetch sits inside the SAME Promise.all as the four existing fetches", () => {
    const allIdx = source.indexOf("await Promise.all([");
    expect(allIdx).toBeGreaterThan(-1);
    const body = source.slice(allIdx, source.indexOf("]);", allIdx));
    expect(body).toContain("listCourseHubAction()");
    expect(body).toContain("listTaskInstructionsAction()");
    expect(body).toContain("listTaskAttachmentsAction()");
  });

  it("BINDS the attachment result to a name - a fetch whose rows are dropped is the failure this guards", () => {
    const allIdx = source.indexOf("await Promise.all([");
    const destructure = source.slice(Math.max(0, allIdx - 300), allIdx);
    expect(destructure).toMatch(/attachmentRows|attachmentResult|attachmentsResult/);
  });

  it("feeds that bound result into indexTaskAttachments - not an empty array, and not a second index of its own", () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\bindexTaskAttachments\b[^}]*\}\s*from\s*["']@\/lib\/course-task-attachments["']/
    );
    expect(source).toMatch(/indexTaskAttachments\(\s*(attachmentRows|attachmentResult|attachmentsResult)/);
  });

  it("stores the index in state and exposes it, so the grid can actually read it", () => {
    expect(source).toMatch(/setAttachments\(/);
    expect(source).toMatch(/return \{[\s\S]*\battachments,/);
  });

  it("fetches attachments exactly once - never per course, per row or per cell", () => {
    expect(source.match(/listTaskAttachmentsAction\(/g)?.length).toBe(1);
  });
});

describe("the attachment read is paginated, not silently truncated (AC4 item 19)", () => {
  const source = readSource("src/lib/supabase/course-task-attachments.ts");

  it("canary: the data module exists and reads the new table", () => {
    expect(source.length).toBeGreaterThan(200);
    expect(source).toContain("course_task_attachments");
  });

  it("orders explicitly - PostgREST guarantees no order without it", () => {
    expect(source).toContain(".order(");
  });

  it("pages with .range() rather than .limit() - PostgREST's 1000-row default is a server ceiling .limit() cannot exceed", () => {
    const s = present(source, "the data module");
    expect(s).toContain(".range(");
  });

  it("loops until a short page comes back, so a user with more than one page loses nothing", () => {
    expect(source).toMatch(/while\s*\(|for\s*\(/);
  });

  it("maps rows through an explicitly typed mapper - a typed Supabase select otherwise collapses to `never`", () => {
    expect(source).toMatch(/function\s+mapTaskAttachment/);
  });
});

describe("TaskCell takes a COUNT, and takes it from its props (AC3 item 15, AC4 item 20)", () => {
  const source = readSource("src/app/components/tasks/TaskCell.tsx");

  it("canary: the file was read and still renders the note mark", () => {
    expect(source.length).toBeGreaterThan(200);
    expect(source).toContain("styles.noteMarker");
  });

  it("declares attachmentCount as a real prop - not a local constant that is permanently zero", () => {
    const propsIdx = source.indexOf("export interface TaskCellProps");
    expect(propsIdx).toBeGreaterThan(-1);
    const props = source.slice(propsIdx, source.indexOf("}", source.indexOf("{", propsIdx)));
    expect(props).toMatch(/attachmentCount:\s*number/);
    expect(source).not.toMatch(/const\s+attachmentCount\s*=/);
  });

  it("passes that prop as taskCellIndicatorSet's fourth argument", () => {
    expect(source).toMatch(/taskCellIndicatorSet\(\s*cell\.note,\s*instruction,\s*error,\s*attachmentCount\s*\)/);
  });

  it("passes the same prop as taskCellAccessibleName's sixth, so the mark and the spoken name cannot disagree", () => {
    expect(source).toMatch(
      /taskCellAccessibleName\(\s*courseName,\s*task,\s*cell,\s*nowMs,\s*indicators\.instruction,\s*attachmentCount\s*\)/
    );
  });

  it("the note mark is still gated on indicators.note, never a re-derived note-or-files condition", () => {
    const idx = source.indexOf("styles.noteMarker");
    expect(source.slice(Math.max(0, idx - 60), idx)).toContain("indicators.note &&");
  });

  it("asks the tab to open the dialog rather than rendering one per cell", () => {
    const s = present(source, "TaskCell.tsx");
    expect(s).toMatch(/onOpenAttachments/);
    expect(s).not.toContain("<TaskAttachmentsDialog");
  });

  it("never fetches, uploads or signs anything itself", () => {
    const s = present(source, "TaskCell.tsx");
    expect(s).not.toContain("useSupabase");
    expect(s).not.toContain("createSignedUrl");
    expect(s).not.toContain("listTaskAttachmentsAction");
  });
});

describe("the count is threaded from the tab down to the cell (AC4 item 20)", () => {
  const row = readSource("src/app/components/tasks/TaskGridRow.tsx");
  const grid = readSource("src/app/components/tasks/TasksGrid.tsx");

  it("canary: both files were read", () => {
    expect(row.length).toBeGreaterThan(200);
    expect(grid.length).toBeGreaterThan(200);
  });

  it("TasksGrid forwards the whole attachments map, the same way it forwards instructions", () => {
    expect(grid).toContain("attachments={attachments}");
  });

  it("TaskGridRow resolves the per-cell count through the shared helper and hands TaskCell a number", () => {
    expect(row).toMatch(/taskAttachmentsAt\(\s*attachments,\s*course\.id,\s*task\.id\s*\)/);
    expect(row).toMatch(/attachmentCount=\{/);
  });
});

describe("exactly one attachments dialog exists, at tab level (AC5 items 22-25)", () => {
  const tab = readSource("src/app/components/TasksTab.tsx");

  it("canary: the file was read", () => {
    expect(tab.length).toBeGreaterThan(200);
  });

  it("renders the dialog once, driven by a single selected-cell state", () => {
    expect(tab.match(/<TaskAttachmentsDialog/g)?.length).toBe(1);
    expect(tab).toMatch(/attachmentTarget|attachmentsTarget/);
  });

  it("restores focus to the grid cell that opened it, so the roving-tabindex grid does not lose its focused cell", () => {
    const s = present(tab, "TasksTab.tsx");
    expect(s).toMatch(/focusCell|focusTaskCell|restoreFocus/);
  });
});

describe("the dialog: upload, list, remove, download (AC5 items 23-30)", () => {
  const source = readSource("src/app/components/tasks/TaskAttachmentsDialog.tsx");

  it("canary: the component exists", () => {
    expect(source.length).toBeGreaterThan(200);
  });

  it("is an MUI Dialog, matching ManageTasksDialog in this same directory", () => {
    expect(source).toMatch(/from\s*["']@mui\/material\/Dialog["']/);
  });

  it("uses a real file input allowing several files at once", () => {
    expect(source).toContain('type="file"');
    expect(source).toContain("multiple");
  });

  it("has exactly one polite status region, and writes to it", () => {
    const s = present(source, "the dialog");
    expect(s.match(/role="status"/g)?.length).toBe(1);
    expect(s).not.toContain('aria-live="assertive"');
    // The region must receive messages from more than one path - an empty
    // live region satisfies a presence check and announces nothing.
    expect((s.match(/setStatusMessage\(|setAnnouncement\(/g)?.length ?? 0)).toBeGreaterThanOrEqual(3);
  });

  it("names each remove control after its own file, inside the list's own map", () => {
    const s = present(source, "the dialog");
    const mapIdx = s.search(/\.map\(/);
    expect(mapIdx).toBeGreaterThan(-1);
    expect(s.slice(mapIdx)).toMatch(/aria-label=\{`Remove "\$\{[^}]+\}"`\}/);
  });

  it("downloads through a Blob and never navigates to the signed URL - `download` is ignored cross-origin", () => {
    const s = present(source, "the dialog");
    expect(s).toContain("URL.createObjectURL");
    expect(s).not.toMatch(/\.href\s*=\s*(signedUrl|url|data\.signedUrl)/);
    expect(s).not.toMatch(/window\.location/);
    expect(s).not.toContain("window.open(");
    expect(s).not.toContain("location.assign(");
  });

  it("delegates upload ordering and the size cap to the tested helper rather than re-implementing them", () => {
    const s = present(source, "the dialog");
    expect(s).toMatch(
      /import\s*\{[^}]*\buploadTaskAttachment\b[^}]*\}\s*from\s*["']@\/lib\/course-task-attachments["']/
    );
    expect(s).toContain("uploadTaskAttachment(");
    expect(s).not.toContain("exceedsTaskAttachmentSize(");
  });

  it("enforces the per-cell count cap itself, since only it knows how many are already loaded", () => {
    expect(source).toContain("MAX_ATTACHMENTS_PER_CELL");
    expect(source).toContain("taskAttachmentCountCapMessage()");
  });

  it("uploads with the browser Supabase client and the shared path builder, never base64 through an action", () => {
    const s = present(source, "the dialog");
    expect(s).toContain("useSupabase");
    expect(s).not.toContain("readFileBase64");
    expect(s).not.toContain("readAsDataURL");
    expect(s).not.toContain("btoa(");
    expect(s).not.toContain("base64");
  });
});

describe("the server actions carry metadata only, and every one is owner-scoped (AC2 item 10)", () => {
  const source = readSource("src/app/actions/course-task-attachments.ts");

  it("canary: the actions file exists", () => {
    expect(source.length).toBeGreaterThan(100);
  });

  it("never receives file bytes in any encoding", () => {
    const s = present(source, "the actions file");
    expect(s).not.toContain("base64");
    expect(s).not.toContain("readAsDataURL");
  });

  it("calls requireOwner at least once per exported action", () => {
    const exported = source.match(/export async function/g)?.length ?? 0;
    expect(exported).toBeGreaterThan(0);
    expect(source.match(/requireOwner\(/g)?.length ?? 0).toBeGreaterThanOrEqual(exported);
  });
});

describe("deleting a course removes its attachment objects, not just its rows (AC6 item 31)", () => {
  const source = readSource("src/lib/supabase/courses.ts");

  it("canary: the file was read and still contains deleteCourse", () => {
    expect(source.length).toBeGreaterThan(200);
    expect(source).toContain("export async function deleteCourse");
  });

  it("collects and removes this course's attachment objects BEFORE the row delete cascades them away", () => {
    const idx = source.indexOf("export async function deleteCourse");
    const body = source.slice(idx, idx + 2000);
    // The ORDER is the contract; how the removal is spelled is not. An
    // earlier version of this assertion searched for the literal `.remove(`,
    // which forced the chunking helper to be shaped as an object with a
    // `.remove()` method purely to satisfy a substring search - a test
    // dictating an API. Any call whose name says it removes or sweeps
    // counts.
    const collectIdx = body.search(/storage_path|storagePath/);
    const removeIdx = body.search(/\.remove\(|[Rr]emove[A-Za-z]*\(|[Ss]weep[A-Za-z]*\(/);
    const deleteIdx = body.search(/\.delete\(\)/);
    expect(collectIdx).toBeGreaterThan(-1);
    expect(removeIdx).toBeGreaterThan(collectIdx);
    expect(deleteIdx).toBeGreaterThan(removeIdx);
  });
});
