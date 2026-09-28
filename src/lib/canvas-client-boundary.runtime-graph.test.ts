import { describe, expect, it, vi } from "vitest";

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { walkRuntimeGraph } from "@/lib/module-graph/runtime-import-graph";
import {
  ALLOWED_ASSET_EXTENSIONS,
  ALLOWED_BARE_SPECIFIERS,
  BROWSER_SAFE_MODULES,
  FORBIDDEN_BARE_SPECIFIERS,
  FORBIDDEN_PATH_PREFIXES,
} from "@/lib/module-graph/client-boundary-policy";

// docs/build-broken-2026-09-27.md, defect 1: GradingTab.tsx -> canvas-
// credential-cta.ts -> canvas-credentials.ts -> lib/supabase reached the
// browser bundle and NOTHING existing caught it. canvas-client-boundary.
// test.ts checks only two hard-coded barrel specifiers by name;
// canvas-client-boundary.transitive.test.ts checks only whether the closure
// reaches ONE named file (canvas-core.ts); and the two walkRuntimeGraph call
// sites that existed before this file (gradingResultsHelpersWiring.test.ts,
// repoGradesFeedbackAndFiles.wiring.test.ts) root the walk at exactly two
// hard-coded directories, neither of which contains any file this incident
// touched. This file closes that gap the way the diagnosis names it: root
// the A23 walk at every "use client" ENTRY POINT in the app - the roots that
// actually matter, because they are the bundler's own roots - not at a
// directory list, and fail on any transitive value-import edge that reaches
// a forbidden path prefix (lib/supabase) or a forbidden bare specifier
// (next/headers, node:async_hooks, server-only), from ANY root.
//
// L15: this file walks a real directory tree / reads many real files, same
// slow-test convention as the other three files that do this
// (canvas-client-boundary.transitive.test.ts, runtime-import-graph.test.ts,
// gradingResultsHelpersWiring.test.ts) - raised from vitest's 5000ms default.
vi.setConfig({ testTimeout: 30_000 });

const SRC = join(process.cwd(), "src");

function readOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function hasDirective(source: string, directive: string): boolean {
  return source.slice(0, 200).includes(`"${directive}"`);
}

// Duplicated (never imported) from canvas-client-boundary.transitive.test.ts
// per this repo's own no-cross-test-file-imports rule (importing a helper
// from another *.test.ts re-runs its describe blocks).
function collectSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
  };
  walk(SRC);
  return out;
}

function findClientEntryRoots(): string[] {
  return collectSourceFiles().filter((f) => hasDirective(readOrEmpty(f), "use client"));
}

const OPTIONS = {
  srcRoot: SRC,
  forbiddenPathPrefixes: FORBIDDEN_PATH_PREFIXES,
  browserSafeModules: BROWSER_SAFE_MODULES,
  forbiddenBareSpecifiers: FORBIDDEN_BARE_SPECIFIERS,
  allowedBareSpecifiers: ALLOWED_BARE_SPECIFIERS,
  allowedAssetExtensions: ALLOWED_ASSET_EXTENSIONS,
  treatUseServerAsWall: true,
};

describe("every use-client entry point stays clear of the A23 forbidden set (lib/supabase, next/headers, node:async_hooks, server-only)", () => {
  it("finds the client entry points at all (guards the guard: a broken directive scan would start from nothing and pass vacuously)", () => {
    expect(findClientEntryRoots().length).toBeGreaterThan(50);
  });

  it("zero violations from the FULL app-wide client-entry root set", () => {
    // ONE combined call, shared visited set: a file's edges are scanned
    // exactly once regardless of which root reaches it first, so a
    // violation anywhere in this reachable set is recorded into the shared
    // `violations` array no matter which root order found it first - the
    // trap card's warning (docs/loop/traps-spec.md, newest entry) is about
    // TRAIL ATTRIBUTION under a shared visited set, never about whether the
    // violation itself gets recorded. This assertion never reads `.trail`,
    // so it cannot be misled by a misattributed prefix - see the two
    // per-root sabotage canaries below for citations that DO need an
    // accurate trail, and which walk one root at a time for exactly that
    // reason (the trap card: "if you need to attribute an edge, walk once
    // per direct edge").
    const roots = findClientEntryRoots();
    const result = walkRuntimeGraph(roots, OPTIONS);
    expect(result.violations).toEqual([]);
  });

  // Two sabotage-direction canaries, one per defect from
  // docs/build-broken-2026-09-27.md, each proving this NEW guard actually
  // discriminates rather than merely passing today. Each walks the FIXED
  // file's own PRE-FIX import target directly (a fresh call per file, so
  // the trail is not shared with anything else): the exact module the fix
  // moved away from must still show the hazard, and the module the fix
  // moved TO must still be clean - proving the fix, not just the guard.

  it("sabotage canary A (defect 2's shape): the ./grade barrel itself - what grading-drafts.ts and github-grading-run-store.ts imported restoreStampedRubricText from before the fix - is a violation reaching lib/supabase; the leaf they import it from now is clean", () => {
    const barrel = join(SRC, "lib", "grade.ts");
    const barrelCanary = walkRuntimeGraph([barrel], OPTIONS);
    expect(barrelCanary.violations.length).toBeGreaterThan(0);
    expect(barrelCanary.violations.some((v) => v.resolved?.includes("lib/supabase"))).toBe(true);

    const leaf = join(SRC, "lib", "grade", "rubric-provenance-stamp.ts");
    const leafCanary = walkRuntimeGraph([leaf], OPTIONS);
    expect(leafCanary.violations).toEqual([]);
  });

  it("sabotage canary B (defect 1's shape): canvas-credentials.ts - what canvas-credential-cta.ts imported CANVAS_CREDENTIAL_REQUIRED_MESSAGE from before the fix - is a violation reaching lib/supabase; the leaf it imports from now is clean", () => {
    const preFixTarget = join(SRC, "lib", "canvas-credentials.ts");
    const preFixCanary = walkRuntimeGraph([preFixTarget], OPTIONS);
    expect(preFixCanary.violations.length).toBeGreaterThan(0);
    expect(preFixCanary.violations.some((v) => v.resolved?.includes("lib/supabase"))).toBe(true);

    const leaf = join(SRC, "lib", "canvas-credential-message.ts");
    const leafCanary = walkRuntimeGraph([leaf], OPTIONS);
    expect(leafCanary.violations).toEqual([]);
  });

  it("every walkRuntimeGraph call in this file takes a bare identifier as its second argument, never an inline object literal that could silently drop a field", () => {
    // Same idiom as the other two walkRuntimeGraph call sites
    // (gradingResultsHelpersWiring.test.ts's R-5e,
    // repoGradesFeedbackAndFiles.wiring.test.ts's R-5e), duplicated rather
    // than imported (no-cross-test-file-imports).
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(thisFile, "utf8");
    const calls = source.match(/walkRuntimeGraph\(\s*(?:\[[^\]]*\]|\w+)\s*,\s*(\w+)\s*\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(5);
    for (const call of calls) {
      expect(call.trimEnd().endsWith("OPTIONS)")).toBe(true);
    }
  });
});
