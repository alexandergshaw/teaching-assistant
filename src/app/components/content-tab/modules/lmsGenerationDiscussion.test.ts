// Direct, in-memory-fixture unit tests for lmsGenerationDiscussion.ts's pure
// helpers - extracted from useLmsGeneration.ts (step-10 fixer round). No
// vi.mock anywhere: every function here is I/O-free.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  isDiscussionKind,
  discussionCheckpointsKey,
  resolveDiscussionDeadlinesForClientPost,
} from "./lmsGenerationDiscussion";
import { GENERATION_KIND_IDS } from "@/lib/lms-generation/kinds";
import type { CanvasModule } from "@/lib/canvas-modules";
import type { ModuleTarget } from "@/lib/lms-generation/commit-plan";

function module(overrides: Partial<CanvasModule>): CanvasModule {
  return { id: 1, name: "Week 1", position: 1, published: true, itemsCount: 0, items: [], ...overrides };
}

describe("isDiscussionKind", () => {
  it("is true for introDiscussion and false for every other registered kind", () => {
    for (const id of GENERATION_KIND_IDS) {
      expect(isDiscussionKind(id)).toBe(id === "introDiscussion");
    }
  });

  // Finding 1's own caveat, made concrete: "introDiscussion" is TODAY the
  // only kind whose canvasObjectKind is "discussion", so a black-box
  // behavioural test cannot distinguish `kindId === "introDiscussion"` from
  // reading GENERATION_KIND_CONFIGS - both give identical answers until a
  // second discussion kind exists (confirmed by sabotage while writing this
  // guard: reverting isDiscussionKind to the literal string check left every
  // OTHER test in this file, useLmsGeneration.test.ts and
  // lms-generation.intro-discussion.test.ts green). This source-text check is
  // what actually pins the fix until that day comes.
  it("SABOTAGE TARGET (Finding 1): reads GENERATION_KIND_CONFIGS rather than a literal introDiscussion string comparison", () => {
    const source = readFileSync(join(process.cwd(), "src/app/components/content-tab/modules/lmsGenerationDiscussion.ts"), "utf8");
    const fnStart = source.indexOf("export function isDiscussionKind");
    const fnEnd = source.indexOf("\n}", fnStart);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toMatch(/GENERATION_KIND_CONFIGS/);
    expect(body).not.toMatch(/kindId === "introDiscussion"/);
  });
});

describe("discussionCheckpointsKey", () => {
  it("is namespaced per course - two different courseUrls never share a value", () => {
    const a = discussionCheckpointsKey("https://canvas.example.edu/courses/1");
    const b = discussionCheckpointsKey("https://canvas.example.edu/courses/2");
    expect(a).not.toBe(b);
    expect(a).toBe("ta-lms-discussion-checkpoints-https://canvas.example.edu/courses/1");
  });
});

describe("resolveDiscussionDeadlinesForClientPost", () => {
  const MODULES = [module({ id: 10, name: "Module 1" }), module({ id: 11, name: "Module 2" })];

  it("undefined for a non-discussion kind, even with a resolvable target", () => {
    const target: ModuleTarget = { kind: "existing", moduleId: 10 };
    expect(resolveDiscussionDeadlinesForClientPost("objectives", target, MODULES, "2026-01-05")).toBeUndefined();
  });

  it("undefined for introDiscussion with no target resolved yet", () => {
    expect(resolveDiscussionDeadlinesForClientPost("introDiscussion", undefined, MODULES, "2026-01-05")).toBeUndefined();
  });

  it("real deadlines for an EXISTING target whose id resolves to a real module name with a week number", () => {
    const target: ModuleTarget = { kind: "existing", moduleId: 10 };
    const result = resolveDiscussionDeadlinesForClientPost("introDiscussion", target, MODULES, "2026-01-05");
    expect(result).toBeDefined();
    expect(result!.initialPostAt).not.toBe("");
    expect(result!.repliesDueAt).not.toBe("");
    expect(result!.note).toContain("Initial post due");
  });

  it("real deadlines for a NEW target, using the typed-in name directly", () => {
    const target: ModuleTarget = { kind: "new", name: "Module 3" };
    const result = resolveDiscussionDeadlinesForClientPost("introDiscussion", target, MODULES, "2026-01-05");
    expect(result).toBeDefined();
    expect(result!.initialPostAt).not.toBe("");
  });

  // Finding 2 (fix): an "existing" target whose id is NOT in the loaded
  // module tree (a stale/mismatched `modules` prop) must refuse to guess a
  // name rather than defaulting to "" - the old `?? ""` shape fed a blank
  // name into describeMissingDeadlines and produced the FALSE reason
  // `The module name "" carries no week number...` even though the real
  // module (unresolvable here, but real in Canvas) very likely has one.
  it("SABOTAGE TARGET (Finding 2): an unresolvable existing target id gets a distinct 'could not resolve' note, never the 'no week number' lie", () => {
    const target: ModuleTarget = { kind: "existing", moduleId: 999 }; // not in MODULES
    const result = resolveDiscussionDeadlinesForClientPost("introDiscussion", target, MODULES, "2026-01-05");
    expect(result).toEqual({
      initialPostAt: "",
      repliesDueAt: "",
      note: "Could not resolve the target module's name, so no due or lock dates were set on the discussion.",
    });
    expect(result!.note).not.toContain('""');
    expect(result!.note.toLowerCase()).not.toContain("week number");
  });

  it("propagates the real 'no week number' / 'no start date' reasons unchanged when a real name IS resolved", () => {
    const noWeekModules = [module({ id: 20, name: "Course Resources" })];
    const target: ModuleTarget = { kind: "existing", moduleId: 20 };
    const result = resolveDiscussionDeadlinesForClientPost("introDiscussion", target, noWeekModules, "2026-01-05");
    expect(result).toEqual({
      initialPostAt: "",
      repliesDueAt: "",
      note: 'The module name "Course Resources" carries no week number, so no due or lock dates were set on the discussion.',
    });
  });
});
