import { describe, it, expect, vi, beforeEach } from "vitest";

// GRADE-INFER-MERGE W1 (docs/grade-infer-merge-w1-test-notes.md, section 4).
// A file the model did NOT name must never inherit a DIFFERENT file's
// model-inferred name. This file adds no export (a legal "no caller"
// exception: it is a test leaf).
//
// The lookup is built through the REAL production builder
// (inferFileNameConvention, with only the model call mocked), so the test is
// type-correct on both sides of the fix and red/green is shown by swapping
// production code, never the test.
//
// Invariant (a) is the UNIVERSAL kill: an un-named file's parsed identity does
// not depend on the lookup at all. Invariant (b) is a CORPUS-RESTRICTED
// structural companion: valid ONLY over the same-leaf-foldered / flat corpus
// below. Do NOT run (b) over cross-folder convention shapes (a legitimate
// cross-folder single student is a multi-directory row with no byRaw hits and
// violates (b) after the fix too), and (b) is vacuous for nested zips because
// a44ContainerRelativeDir strips the zip container.

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { inferFileNameConvention } from "./rubric";
import {
  a44ContainerRelativeDir,
  groupSubmissionsByStudent,
  parseSubmissionFileName,
} from "./utils";
import type { InferredFileNameLookup } from "./types";

const mockCallLlm = vi.mocked(callLlm);

interface Shape {
  name: string;
  files: Array<{ path: string; chain: string[] }>;
  // Whether invariant (b) applies (same-leaf-foldered / flat corpus only).
  checkStructural: boolean;
}

const SHAPES: Shape[] = [
  {
    name: "F15 folder",
    files: [
      { path: "AlvarezMaria/essay.txt", chain: [] },
      { path: "BrownTom/essay.txt", chain: [] },
    ],
    checkStructural: true,
  },
  {
    name: "nested zip",
    files: [
      { path: "bulk.zip/main.py", chain: ["bulk.zip"] },
      { path: "bulk2.zip/main.py", chain: ["bulk2.zip"] },
    ],
    checkStructural: false,
  },
  {
    name: "F6 three folders",
    files: [
      { path: "AlvarezMaria/essay.txt", chain: [] },
      { path: "BrownTom/essay.txt", chain: [] },
      { path: "ChenLi/essay.txt", chain: [] },
    ],
    checkStructural: true,
  },
  {
    name: "flat convention",
    files: [{ path: "Ada Lovelace_2024-01-01_120000_essay.txt", chain: [] }],
    checkStructural: true,
  },
  {
    name: "flat stem",
    files: [{ path: "essay.txt", chain: [] }],
    checkStructural: true,
  },
];

function subsets<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let mask = 0; mask < 1 << items.length; mask += 1) {
    out.push(items.filter((_, i) => (mask & (1 << i)) !== 0));
  }
  return out;
}

async function buildLookup(
  allPaths: string[],
  named: string[]
): Promise<InferredFileNameLookup> {
  const items = named.map((path) => ({
    rawFileName: path,
    studentName: `Model Named ${allPaths.indexOf(path) + 1}`,
    assignmentFileName: path.split("/").pop() ?? path,
  }));
  mockCallLlm.mockResolvedValue({ ok: true as const, text: JSON.stringify({ items }) } as never);
  return inferFileNameConvention(allPaths, "gemini");
}

beforeEach(() => {
  mockCallLlm.mockReset();
});

describe("invariant (a): an un-named file's identity does not depend on the inferred lookup", () => {
  for (const shape of SHAPES) {
    it(`${shape.name}: every un-named file parses identically with and without the lookup`, async () => {
      const allPaths = shape.files.map((f) => f.path);
      let checked = 0;
      for (const named of subsets(allPaths)) {
        const lookup = await buildLookup(allPaths, named);
        for (const f of shape.files) {
          if (named.includes(f.path)) continue;
          const withLookup = parseSubmissionFileName(f.path, lookup, f.chain);
          const without = parseSubmissionFileName(f.path, undefined, f.chain);
          expect(withLookup, `${shape.name} / ${f.path} / named=${JSON.stringify(named)}`).toEqual(without);
          checked += 1;
        }
      }
      expect(checked).toBeGreaterThan(0);
    });
  }
});

describe("invariant (b), corpus-restricted: a multi-directory row is made only of byRaw-named files", () => {
  for (const shape of SHAPES.filter((s) => s.checkStructural)) {
    it(`${shape.name}: any row spanning 2+ container-relative directories has a byRaw hit for every member`, async () => {
      const allPaths = shape.files.map((f) => f.path);
      const chainOf = new Map(shape.files.map((f) => [f.path, f.chain]));
      const submissions: Record<string, string> = {};
      const zipParents: Record<string, string[]> = {};
      for (const f of shape.files) {
        submissions[f.path] = f.path;
        zipParents[f.path] = f.chain;
      }
      for (const named of subsets(allPaths)) {
        const lookup = await buildLookup(allPaths, named);
        const rows = groupSubmissionsByStudent(submissions, lookup, undefined, zipParents);
        for (const row of rows) {
          const members = row.submittedFiles.map((s) => s.previewContent);
          const dirs = new Set(
            members.map((p) => a44ContainerRelativeDir(p, chainOf.get(p) ?? []))
          );
          if (dirs.size < 2) continue;
          for (const p of members) {
            expect(
              lookup.byRaw.has(p),
              `${shape.name}: ${p} in multi-dir row "${row.student}" has no byRaw hit (named=${JSON.stringify(named)})`
            ).toBe(true);
          }
        }
      }
    });
  }
});
