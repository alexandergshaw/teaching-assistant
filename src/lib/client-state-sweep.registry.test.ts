import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A module-scope cache (the `let hubCache = ... | null` / `const xCache = new
 * Map()` shape used throughout this codebase - see run-form-options-cache.ts's
 * own EXTENSIBILITY comment) survives a client-side sign-out completely
 * untouched, because sign-out never tears down the JS module registry on its
 * own. run-form-options-cache.ts's registerOwnerScopedCache is how a cache
 * opts into being cleared when the signed-in owner changes; client-state-
 * sweep.ts's sweepClientState covers everything else (localStorage,
 * IndexedDB). Registering is opt-IN, which means it is exactly the kind of
 * thing a future change can add a new cache and forget to do - the same
 * failure mode action-guard-coverage.test.ts exists to catch for missing
 * request guards, one directory over.
 *
 * This file applies the same two-part technique to caches instead of guards:
 * scan the source text for every module-scope declaration that follows this
 * codebase's own `...Cache` naming convention (found today in
 * useCoursesData.ts, useCourseImportActions.ts, useKbSelection.ts,
 * useCourseTasksData.ts, run-form-options-cache.ts itself, canvas/inbox.ts,
 * code-runner.ts (x2), registry-helpers.ts, and lms-export-source/
 * read-export-course-content.ts), then require every one of them to either
 * call registerOwnerScopedCache in the same file, or be named - with a
 * defended reason - in DELIBERATELY_UNREGISTERED below. A cache added later
 * that does neither fails this suite until someone makes a decision about it,
 * the same ratchet action-guard-coverage.test.ts's PINNED_UNGUARDED performs
 * for actions.
 */

const SRC_DIR = path.join(process.cwd(), "src");
// Column zero, matching this repo's own formatting convention for top-level
// declarations (the same assumption action-guard-coverage.test.ts's own
// collectActionExports makes about where a top-level function ends).
const CACHE_DECL = /^(?:export\s+)?(?:let|const)\s+([A-Za-z_][A-Za-z0-9_]*Cache)\b/;
const REGISTER_CALL = /\bregisterOwnerScopedCache\s*\(/;

interface CacheDecl {
  /** Path relative to src/, forward-slashed, e.g. "app/components/courses/useCoursesData.ts". */
  file: string;
  name: string;
  /** Whether the SAME FILE also calls registerOwnerScopedCache anywhere. */
  registered: boolean;
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

function collectModuleScopeCaches(): CacheDecl[] {
  const found: CacheDecl[] = [];
  for (const file of listSourceFiles(SRC_DIR)) {
    const text = fs.readFileSync(file, "utf8");
    const hasRegisterCall = REGISTER_CALL.test(text);
    const relFile = path.relative(SRC_DIR, file).split(path.sep).join("/");
    for (const line of text.split(/\r?\n/)) {
      const match = CACHE_DECL.exec(line);
      if (!match) continue;
      found.push({ file: relFile, name: match[1], registered: hasRegisterCall });
    }
  }
  return found;
}

/**
 * Module-scope caches that are DELIBERATELY not registered with
 * setCacheOwner, each with a one-line reason - same bar as action-guard-
 * coverage.test.ts's DELIBERATELY_PUBLIC: an entry here must actually be
 * defensible, not just a way to silence this file. Most of these are
 * server-side, non-user-specific data (a Canvas self-id keyed by base URL, an
 * external code-runner's language list, a live-modules cache keyed by
 * courseUrl) where "the signed-in app user changed" has no bearing on
 * whether the cached value is still correct.
 */
const DELIBERATELY_UNREGISTERED: Record<string, string> = {
  "lib/canvas/inbox.ts:selfIdCache":
    "Server-side module (no \"use client\"); keyed by Canvas base URL/token pair, which does not change with which app user is signed in.",
  "lib/code-runner.ts:runtimesCache":
    "Server-side module; caches an external sandbox's language/runtime list, which is identical no matter which app user is signed in.",
  "lib/code-runner.ts:wandboxCompilersCache":
    "Server-side module; same external, non-user-specific compiler list as runtimesCache in this file.",
  "lib/workflows/registry-helpers.ts:liveModulesCache":
    "Server-side module; keyed by canvasUrl with its own 120s TTL, not by which app user is signed in.",
};

/** The files expected to register a cache today. Extending this list is a
 *  deliberate act (a new cache was added and correctly wired up), same as
 *  DELIBERATELY_UNREGISTERED above for the opposite decision - this is what
 *  keeps a REMOVED registration (a regression) from passing silently. */
const EXPECTED_REGISTERED_FILES = [
  "app/components/courses/useCourseImportActions.ts",
  "app/components/courses/useCoursesData.ts",
  "app/components/knowledge/useKbSelection.ts",
  "app/components/tasks/useCourseTasksData.ts",
  "lib/lms-export-source/read-export-course-content.ts",
].sort();

describe("module-scope cache registration with setCacheOwner", () => {
  it("finds the caches this suite is built around at all", () => {
    // If this scan ever returns nothing, every assertion below passes
    // vacuously and the whole file is a dead canary.
    expect(collectModuleScopeCaches().length).toBeGreaterThan(0);
  });

  it("registers exactly the expected files - shrinking this list is a regression", () => {
    const registeredFiles = [
      ...new Set(collectModuleScopeCaches().filter((c) => c.registered).map((c) => c.file)),
    ].sort();
    expect(registeredFiles).toEqual(EXPECTED_REGISTERED_FILES);
  });

  it("accounts for every OTHER module-scope cache - a new one must be registered or defended", () => {
    const unaccounted = collectModuleScopeCaches()
      .filter((c) => !c.registered)
      .map((c) => `${c.file}:${c.name}`)
      .filter((key) => !(key in DELIBERATELY_UNREGISTERED));

    expect(
      unaccounted,
      "a module-scope cache exists that neither calls registerOwnerScopedCache in its own file " +
        "nor has a defended entry in DELIBERATELY_UNREGISTERED above - decide which it should be"
    ).toEqual([]);
  });

  it("every deliberate exception carries a reason and still exists", () => {
    const known = new Set(collectModuleScopeCaches().map((c) => `${c.file}:${c.name}`));
    for (const [key, reason] of Object.entries(DELIBERATELY_UNREGISTERED)) {
      expect(known.has(key), `${key} is listed as a deliberate exception but no longer exists`).toBe(true);
      expect(reason.trim().length, `${key} needs a stated reason`).toBeGreaterThan(10);
    }
  });
});
