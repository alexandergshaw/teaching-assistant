import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join, dirname, normalize, relative, sep } from "node:path";

/**
 * Layer C's own NOT-POSTABLE boundary: no file layer C's real panels reach
 * may value-import anything under `src/app/actions`, `src/lib/canvas*`,
 * `src/lib/lms-generation`, `src/lib/llm*`, or `src/lib/gemini*` - the
 * capability to write to Canvas or commit anything anywhere, OR the
 * capability to make a model call. This is a capability boundary, not a name
 * list: a prefix STRING test on the resolved path relative to `src`, so it
 * cannot be defeated by adding a new file under an already-forbidden
 * directory.
 *
 * `lib/llm` and `lib/gemini` were ADDED 2026-09-15 (backlog L4): layer C's
 * entire advantage (REGRESSION.md entry 423) is that it makes no model call -
 * every claim it drafts was already typed by layers A and B. Without these
 * two prefixes, re-introducing a model call into class-trends-draft.ts left
 * this guard - and every other gate - green, which is the precise failure
 * this test exists to catch. See canary 3 below for the sabotage proof.
 *
 * DUPLICATED, not imported, from canvas-client-boundary.transitive.test.ts -
 * this repo's own rule forbids cross-test-file imports (re-running that
 * file's describe blocks as a side effect). Three deliberate differences
 * from the original walker:
 *
 * 1. NO "use server" WALL, and no directive detection of any kind. A file is
 *    walked exactly like any other regardless of what pragma it carries:
 *    check if its own resolved path is forbidden; if not, read its value
 *    imports and keep walking. `app/actions` is itself a forbidden path
 *    prefix, checked before any file under it is ever read, so a wall check
 *    there would never fire regardless of whether it exists - and a small
 *    number of genuine "use server" files sit OUTSIDE app/actions/ in this
 *    repo (src/app/account/integrations/lms-actions.ts,
 *    src/app/account/people/actions.ts - neither on the forbidden-prefix
 *    list), so treating any "use server" file as an opaque wall would risk
 *    silently stopping the walk at one of those two nodes.
 * 2. The stop condition is a PATH-PREFIX PREDICATE (isForbiddenPath), not a
 *    single target file - no file read needed to decide it.
 * 3. The roots are layer C's own four files, not every "use client" file in
 *    the repo. DraftedGradesTab.tsx (which mounts ClassTrendsPanel) is
 *    deliberately excluded as a root: it legitimately imports posting
 *    actions for OTHER features on the same screen, and including it would
 *    fail the guard for reasons that have nothing to do with layer C.
 *
 * FORBIDDEN_PATH_PREFIXES: no trailing slash on ANY of the three. The
 * original design wrote "app/actions/" WITH a trailing slash, which misses
 * `src/app/actions.ts` - a real file, a pure re-export barrel that fronts
 * the whole actions directory - because "app/actions.ts".startsWith(
 * "app/actions/") is false. Same mechanism "lib/canvas" (no slash) exists to
 * avoid for `canvas-modules.ts` vs `canvas-modules/`. Dropping the slash on
 * "app/actions" the same way closes it; verified this still returns zero
 * violations over layer C's real roots (canary 3, below).
 */

const SRC = join(process.cwd(), "src");

const FORBIDDEN_PATH_PREFIXES = ["app/actions", "lib/canvas", "lib/lms-generation", "lib/llm", "lib/gemini"];

function toPosix(p: string): string {
  return relative(process.cwd(), p).split(sep).join("/");
}

/** relPath is relative to src/, POSIX-separated - the resolved import
 * target's own path, character-by-character prefix matched, never
 * segment-by-segment. */
function isForbiddenPath(absPath: string): boolean {
  const relToSrc = relative(SRC, absPath).split(sep).join("/");
  return FORBIDDEN_PATH_PREFIXES.some((prefix) => relToSrc.startsWith(prefix));
}

function readOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function resolveSpecifier(spec: string, importer: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(importer), spec));
  else return null;

  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not this one
    }
  }
  return null;
}

const IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?(?:[\w*{}\s,]*?)\s*from\s+"([^"]+)"/gm;

function valueImportSpecifiers(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    if (match[1]) continue;
    const braces = /\{([^}]*)\}/.exec(match[0]);
    if (braces) {
      const parts = braces[1]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length > 0 && parts.every((p) => p.startsWith("type "))) continue;
    }
    found.push(match[2]);
  }
  return found;
}

/** Walks every value-import edge from `rootPaths`, stopping (and recording a
 * violation) the moment a resolved target's path matches a forbidden
 * prefix. No "use server" short-circuit anywhere - every node is walked the
 * same way. */
function walkForForbiddenImports(rootPaths: string[]): string[] {
  const violations: string[] = [];
  const visited = new Set<string>();

  const visit = (path: string, stack: Set<string>) => {
    if (visited.has(path)) return;
    if (stack.has(path)) return; // import cycle guard
    visited.add(path);
    stack.add(path);

    const source = readOrEmpty(path);
    for (const spec of valueImportSpecifiers(source)) {
      const dep = resolveSpecifier(spec, path);
      if (!dep) continue;
      if (isForbiddenPath(dep)) {
        violations.push(`${toPosix(path)}\n      value-imports "${spec}" -> ${toPosix(dep)}`);
        continue; // still walk siblings, but do not descend into a forbidden node
      }
      visit(dep, stack);
    }

    stack.delete(path);
  };

  for (const root of rootPaths) {
    visit(root, new Set());
  }

  return violations;
}

describe("canary 1 - isForbiddenPath predicate discrimination (no file I/O)", () => {
  it("returns true for every known-forbidden path, including the app/actions.ts barrel", () => {
    const positives = [
      join(SRC, "app/actions/canvas-inbox.ts"),
      join(SRC, "app/actions/lms-generation-writers.ts"),
      // The barrel file itself - the exact defect this walker's own header
      // comment explains: a trailing-slash prefix misses this file, and no
      // prior canary caught that. This entry is why this canary now can.
      join(SRC, "app/actions.ts"),
      join(SRC, "lib/canvas.ts"),
      join(SRC, "lib/canvas/announcements.ts"),
      join(SRC, "lib/canvas-core.ts"),
      join(SRC, "lib/canvas-modules/fetch-helpers.ts"),
      join(SRC, "lib/lms-generation/commit-execute.ts"),
      join(SRC, "lib/llm.ts"),
      join(SRC, "lib/llm-json.ts"),
      join(SRC, "lib/gemini.ts"),
    ];
    for (const p of positives) {
      expect(isForbiddenPath(p), `expected forbidden: ${toPosix(p)}`).toBe(true);
    }
  });

  it("returns false for known-safe paths", () => {
    const negatives = [
      join(SRC, "lib/grade/class-trends.ts"),
      join(SRC, "lib/markdown.ts"),
      join(SRC, "app/components/ui/clipboard.ts"),
    ];
    for (const p of negatives) {
      expect(isForbiddenPath(p), `expected safe: ${toPosix(p)}`).toBe(false);
    }
  });
});

describe("canary 2a - the walk mechanism, on a real known-bad fixture (depth 1)", () => {
  it(
    "finds a violation rooted at WalkthroughAnnouncementPanel.tsx, a positive control - " +
      "if this ever stops finding one, the walker itself is broken",
    { timeout: 30000 },
    () => {
      const root = join(SRC, "app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx");
      const violations = walkForForbiddenImports([root]);
      expect(violations.length).toBeGreaterThan(0);
    }
  );
});

describe("canary 2b - a synthetic depth-2 fixture, proving the walk recurses", () => {
  it("finds a violation rooted at the hop-A fixture, which imports nothing forbidden itself", () => {
    const root = join(SRC, "app/components/drafted-grades/__fixtures__/notPostableCanaryHopA.ts");
    const violations = walkForForbiddenImports([root]);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.join("\n")).toContain("notPostableCanaryHopB");
  });
});

describe("canary 3 - the real check: layer C's own four files reach nothing forbidden", () => {
  it(
    "zero violations rooted at class-trends-draft.ts, classTrendsDraftState.ts, " +
      "ClassTrendsDraftPanel.tsx, ClassTrendsPanel.tsx, and classTrendsEntry.ts",
    { timeout: 30000 },
    () => {
      const roots = [
        join(SRC, "lib/grade/class-trends-draft.ts"),
        join(SRC, "app/components/drafted-grades/classTrendsDraftState.ts"),
        join(SRC, "app/components/drafted-grades/ClassTrendsDraftPanel.tsx"),
        join(SRC, "app/components/drafted-grades/ClassTrendsPanel.tsx"),
        // A16-1 (docs/a16-scope.md section 4.2, "Both:" bullet): the
        // adapter's output is built in render and handed straight to the
        // panel, never written anywhere - it must never reach a
        // posting/persisting capability either.
        join(SRC, "app/components/grading-results/classTrendsEntry.ts"),
      ];
      const violations = walkForForbiddenImports(roots);
      expect(
        violations,
        "Layer C must never reach a posting/writing capability - see this file's header comment.\n" +
          violations.join("\n")
      ).toEqual([]);
    }
  );
});
