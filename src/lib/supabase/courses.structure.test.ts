// Structure guard for the courses.ts split.
//
// `src/lib/supabase/courses.ts` reached 996 of this repo's 1000-line cap, and
// the last two changes to it both shortened doc comments purely to make room -
// the cap deleting explanation rather than protecting it (docs/REGRESSION.md
// entry 225 records the instruction to split rather than grow, and the
// 2026-08-10 note recording that it was not honoured). The split moves the
// types, the row-mapper layer and the jsonb file helpers into siblings and
// leaves `courses.ts` as CRUD plus a re-export barrel.
//
// This file is the oracle, and it was written and run BEFORE the split so the
// values below describe the pre-split truth rather than being read back off
// the post-split code. Three things it pins, each of which is a real way a
// mechanical split of this file goes wrong:
//
// 1. THE PUBLIC SURFACE. 26 exports, frozen as a literal list. ~90 files
//    import from this module (`Course` alone is the most-imported type in the
//    repo) and FIVE test files do `vi.mock("@/lib/supabase/courses", factory)`
//    - a module-factory mock intercepts the specifier the system under test
//    imports, so if a split "tidied" call sites onto the new sub-modules,
//    every one of those mocks would silently stop intercepting and the tests
//    would start hitting real Supabase code with NOTHING reported. That is why
//    the barrel is not optional here.
//
// 2. NO IMPORT CYCLE. The sub-modules must never import from `./courses`.
//    Because the tempting wrong import (`import type { Course } from
//    "./courses"`) is a TYPE import, it is erased at compile time and `tsc`
//    stays green - so no other gate in this repo would catch it.
//
// 3. THE LINE CAP, MECHANICALLY. Nothing enforced it on this directory; the
//    only line-count test in the repo is scoped to the recording tab. That is
//    precisely how this file reached 996 unnoticed.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import * as courses from "./courses";

/**
 * Every public export of `src/lib/supabase/courses.ts`, captured from the file
 * BEFORE the split. A split is only correct if this list is unchanged: not one
 * name added, not one removed. Type-only exports do not survive to runtime, so
 * they are checked separately by the source-text assertion below.
 */
const RUNTIME_EXPORTS = [
  "appendCourseCastletopFile",
  "appendCourseExportFile",
  "appendCourseMaterialFile",
  "appendCourseMiscFile",
  "countCoursesByInstitution",
  "createCourse",
  "deleteCourse",
  "getCourse",
  "listCourses",
  "removeCourseCastletopFile",
  "removeCourseExportFile",
  "removeCourseMaterialFile",
  "removeCourseMiscFile",
  "updateCourse",
  "updateCourseCsv",
  "updateCourseExportModuleAdditions",
  "updateCourseMaterials",
  "updateCourseProject",
  "updateCourseRepoPairing",
  "updateCourseRubric",
] as const;

/** The seven exported TYPES. They vanish at runtime, so they are pinned by
 * source text on the barrel instead. */
const TYPE_EXPORTS = [
  "Course",
  "CourseCustomTile",
  "CourseInput",
  "CourseIntegration",
  "CourseMaterialFile",
  "CourseRepo",
  "CourseStudentRepo",
] as const;

/** Every file the split may produce. `courses.ts` itself must always exist. */
const GROUP = [
  "src/lib/supabase/courses.ts",
  "src/lib/supabase/courses.types.ts",
  "src/lib/supabase/courses.row.ts",
  "src/lib/supabase/courses.files.ts",
];

function readIfPresent(relativePath: string): string {
  const full = join(process.cwd(), relativePath);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("the public surface is unchanged by the split", () => {
  it("every runtime export is still reachable from @/lib/supabase/courses", () => {
    for (const name of RUNTIME_EXPORTS) {
      expect(typeof (courses as Record<string, unknown>)[name], `${name} missing from the barrel`).toBe("function");
    }
  });

  it("exports exactly these 20 runtime names - nothing quietly added or dropped", () => {
    const actual = Object.keys(courses).filter((k) => typeof (courses as Record<string, unknown>)[k] === "function");
    expect(actual.sort()).toEqual([...RUNTIME_EXPORTS].sort());
  });

  it("every exported TYPE is still exported from the barrel by name", () => {
    // Types are erased at runtime, so this is a source-text check. Under
    // `isolatedModules` a re-export of a type MUST use `export type { ... }`;
    // a bare `export { Course }` fails the build.
    const source = readIfPresent("src/lib/supabase/courses.ts");
    expect(source.length).toBeGreaterThan(200);
    for (const name of TYPE_EXPORTS) {
      expect(source, `${name} is no longer exported from courses.ts`).toMatch(
        new RegExp(`\\b${name}\\b`)
      );
    }
  });

  it("keeps the five function signatures that mocked call sites depend on", () => {
    // Arity is the cheapest observable proxy for "the signature did not move".
    // These five are the ones with `vi.mock("@/lib/supabase/courses")` factories
    // pointed at them.
    expect(courses.listCourses.length).toBe(1);
    expect(courses.getCourse.length).toBe(2);
    expect(courses.createCourse.length).toBe(2);
    expect(courses.updateCourse.length).toBe(3);
    expect(courses.deleteCourse.length).toBe(2);
    expect(courses.countCoursesByInstitution.length).toBe(2);
  });
});

describe("the split introduces no import cycle", () => {
  it("no sibling module imports from ./courses - the barrel is one-directional", () => {
    // A type-only cycle is erased by the compiler, so tsc stays green and this
    // is the only thing that would catch it.
    for (const path of GROUP.slice(1)) {
      const source = stripComments(readIfPresent(path));
      if (!source) continue;
      expect(source, `${path} imports from the barrel, creating a cycle`).not.toMatch(
        /from\s+["']\.\/courses["']/
      );
    }
  });

  it("the barrel does not re-export the row layer's internals", () => {
    // `table`, `COLUMNS`, `toCourse`, `toRow` are module-private today. If the
    // split has to export them for its siblings, they must NOT reach the public
    // surface, or callers will start importing them and the next split gets
    // harder rather than easier.
    const runtimeKeys = Object.keys(courses);
    for (const internal of ["table", "COLUMNS", "toCourse", "toRow"]) {
      expect(runtimeKeys, `${internal} leaked onto the public barrel`).not.toContain(internal);
    }
  });
});

describe("deleteCourse stays where its source-text guard can see it", () => {
  it("is physically defined in courses.ts, not re-exported from a sibling", () => {
    // taskCellAttachments.wiring.test.ts proves the Storage-sweep-before-row-
    // delete ordering by searching deleteCourse's LITERAL SOURCE TEXT in this
    // file. A re-export line does not contain its body, so moving this function
    // silently disarms that guard - and the thing it guards is orphaned,
    // invisible, billable Storage objects.
    const source = readIfPresent("src/lib/supabase/courses.ts");
    expect(source).toContain("export async function deleteCourse");
  });
});

describe("the line cap is enforced mechanically now, not by memory", () => {
  it("every file in the courses group is under 1000 lines", () => {
    for (const path of GROUP) {
      const source = readIfPresent(path);
      if (!source) continue;
      const lines = source.split(/\r?\n/).length;
      expect(lines, `${path} is ${lines} lines`).toBeLessThan(1000);
    }
  });

  it("courses.ts itself has real headroom after the split, not one line of it", () => {
    // The whole point. 996/1000 is what caused two separate changes to delete
    // explanation to fit. Anything above 800 means the split did not actually
    // relieve the pressure.
    const lines = readIfPresent("src/lib/supabase/courses.ts").split(/\r?\n/).length;
    expect(lines).toBeLessThan(800);
  });
});

describe("the load-bearing comments survive the move", () => {
  // These record invariants NOTHING else in the repo states. A mechanical
  // block-move drops them silently, and the cap pressure that caused this split
  // is exactly the force that tempts someone to trim them. Each is pinned by a
  // distinctive phrase, checked across the whole group so it does not matter
  // which file it lands in.
  const PHRASES = [
    // Why the table is not called `courses`.
    "pre-existing, unrelated `courses` table",
    // Why countCoursesByInstitution filters in JS rather than with .eq().
    "silently undercount",
    // Why course_project is omitted from toRow.
    "dedicated writer only",
    // The INVERSE rule for plain scalar columns.
    "must always be carried by the caller",
    // Why grades-due clears both columns together.
    "a stray time can never persist without its date",
    // Why the jsonb file columns are omitted from CourseInput.
    "do not add them here or to CourseInput",
    // deleteCourse's sweep ordering.
    "so the course survives for a retry",
    // The legacy-duplicate hazard in appendCourseExportFile.
    "legacy rows may hold duplicates",
    // The generated-file rule readers must honour.
    "Absent on every instructor upload",
    // breaks never shifting week numbering.
    "never shifts week numbering",
  ];

  /** Comment prose with its line furniture removed and whitespace collapsed,
   * so a phrase still matches after the split rewraps it. Every one of these
   * comments is wrapped at ~76 characters, which puts a `\n   * ` or `\n  // `
   * in the middle of most sentences - a naive substring search finds none of
   * them, and would have failed here for the wrong reason. */
  function commentProse(text: string): string {
    return text
      .replace(/^\s*(\/\/|\*|\/\*\*|\/\*|\*\/)/gm, " ")
      .replace(/\s+/g, " ");
  }

  const groupText = commentProse(GROUP.map(readIfPresent).join("\n"));

  it("canary: the group was actually read and its prose normalized", () => {
    expect(groupText.length).toBeGreaterThan(5000);
    // Proves the normalizer actually joins a wrapped sentence, rather than
    // passing because the phrase happened to fit on one line.
    expect(commentProse("// must always be carried by\n  // the caller")).toContain(
      "must always be carried by the caller"
    );
  });

  it.each(PHRASES)("still explains: %s", (phrase) => {
    expect(groupText).toContain(phrase.replace(/\s+/g, " "));
  });
});
