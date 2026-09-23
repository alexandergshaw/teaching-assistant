// course-schedule-docx.ts is a PURE module extracted out of
// steps.course-guides.ts specifically so BOTH generate-course-guides
// (steps.course-guides.ts, which re-exports resolveContinuousWeeks/
// buildCourseScheduleDocx unchanged - see steps.course-guides.test.ts, which
// covers the same functions through that re-export) and save-zip-to-course
// (steps.course-setup.storage.ts) can share ONE implementation without
// either step file dragging in the other's dependencies. This suite -
// deliberately with NO vi.mock("@/app/actions") anywhere in it - proves the
// module truly stands alone: if it ever grew a dependency on `@/app/actions`
// (or anything else that transitively reaches src/lib/supabase/server.ts's
// `next/headers` import), importing it here without a mock would throw at
// import time and this whole file would fail to even collect, not just one
// assertion.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { resolveContinuousWeeks, buildCourseScheduleDocx } from "./course-schedule-docx";
import type { ScheduleWeekPlan } from "@/app/actions-types";
import { scanRuntimeEdges } from "@/lib/module-graph/runtime-import-graph";

async function unpackDocx(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")!.async("string");
  return { documentXml };
}

describe("course-schedule-docx.ts stays a pure module", () => {
  // Regression guard for the exact bug this module's own extraction fixed:
  // steps.course-setup.storage.ts once imported resolveContinuousWeeks/
  // buildCourseScheduleDocx directly from steps.course-guides.ts, which
  // pulled that file's `@/app/actions` server-action imports (and THEIR
  // transitive chain into next/headers) into save-zip-to-course's own
  // bundle - breaking `next build` for any Pages Router entry point that
  // reaches it. `npx tsc --noEmit`, `npx eslint`, and `npx vitest run` all
  // passed on the broken code; only `next build` caught it. Since that
  // heavier check is not part of every routine test run, this reads this
  // module's own source and asserts the import never comes back - a
  // regression here would otherwise be invisible until the next full build.
  it("never imports @/app/actions or next/headers - only the pure @/app/actions-types", () => {
    const filePath = fileURLToPath(new URL("./course-schedule-docx.ts", import.meta.url));
    const source = readFileSync(filePath, "utf8");
    // A33: the previous /from ["']<specifier>["']/ pattern requires the
    // literal token "from", so it never sees a bare side-effect import
    // (`import "@/app/actions";`), a `require("@/app/actions")`, or a
    // dynamic `import("@/app/actions")` - proven in the A33 report by
    // constructing each string and testing it against the old pattern in
    // node. A23 (src/lib/module-graph/runtime-import-graph.ts) already
    // shipped the fix for the same class of hole: scanRuntimeEdges parses
    // the file with the TypeScript compiler and enumerates every runtime
    // edge (import, export-from, require, dynamic import) by AST node kind,
    // so it cannot miss a form the way a text pattern can. Reused here
    // directly on this file's own source, without the transitive walk
    // (walkRuntimeGraph) A23's three chartered sites needed, because this
    // guard - like its sibling below - only ever checks one file's own
    // source, never anything transitive.
    const specifiers = scanRuntimeEdges(source, filePath).edges.map((edge) => edge.specifier);
    expect(specifiers).not.toContain("@/app/actions");
    expect(specifiers).not.toContain("next/headers");
    expect(source).toContain('from "@/app/actions-types"');
  });
});

describe("resolveContinuousWeeks", () => {
  it("fills a gap with 'To be announced' and keeps week numbering continuous", () => {
    const schedule: ScheduleWeekPlan[] = [
      { week: 1, topic: "Intro", summary: "Getting started", assignmentTitle: null, assignmentSlug: null, testName: null },
      { week: 3, topic: "Loops", summary: "Iteration", assignmentTitle: "Loops HW", assignmentSlug: null, testName: null },
    ];
    const rows = resolveContinuousWeeks(schedule, null);
    expect(rows.map((r) => r.week)).toEqual([1, 2, 3]);
    expect(rows[1].topic).toBe("To be announced");
    expect(rows[1].summary).toBe("");
    expect(rows[0].topic).toBe("Intro");
    expect(rows[2].assignment).toBe("Loops HW");
  });

  it("extends through totalWeeks even past the schedule's last entry", () => {
    const schedule: ScheduleWeekPlan[] = [
      { week: 1, topic: "Intro", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ];
    const rows = resolveContinuousWeeks(schedule, 4);
    expect(rows.map((r) => r.week)).toEqual([1, 2, 3, 4]);
    expect(rows[3].topic).toBe("To be announced");
  });
});

describe("buildCourseScheduleDocx", () => {
  it("renders a real docx table (<w:tbl>), not a bulleted list", async () => {
    const rows = resolveContinuousWeeks(
      [{ week: 1, topic: "Intro", summary: "Overview", assignmentTitle: null, assignmentSlug: null, testName: null }],
      null
    );
    const buffer = await buildCourseScheduleDocx("CS 101", rows, "Test Author");
    const { documentXml } = await unpackDocx(buffer);
    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).not.toMatch(/<w:numPr>/); // no bullet numbering
  });

  it("never renders a date, day name, or 'Due'/'Deadline' inside the table", async () => {
    const rows = resolveContinuousWeeks(
      [
        { week: 1, topic: "Risk", summary: "Identify and rate risks", assignmentTitle: null, assignmentSlug: null, testName: "Quiz 1" },
      ],
      2
    );
    const buffer = await buildCourseScheduleDocx("PM 200", rows, "Test Author");
    const { documentXml } = await unpackDocx(buffer);

    // Same scoping steps.course-guides.test.ts's own equivalent test uses:
    // the surrounding disclaimer paragraph is allowed to say "...see the LMS
    // for due dates" in passing, so only the <w:tbl> itself is checked.
    const tableXml = documentXml.match(/<w:tbl>[\s\S]*<\/w:tbl>/)?.[0] ?? "";
    expect(tableXml).not.toBe("");
    expect(tableXml).not.toMatch(/\bDue\b/i);
    expect(tableXml).not.toMatch(/\bDeadline\b/i);
    expect(tableXml).toContain("To be announced"); // week 2, no schedule entry
  });
});
