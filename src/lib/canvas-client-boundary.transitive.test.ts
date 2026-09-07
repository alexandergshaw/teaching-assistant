import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, normalize, relative, sep } from "node:path";

/**
 * The TRANSITIVE half of the client/server boundary guard.
 *
 * `canvas-client-boundary.test.ts` checks that no `"use client"` file
 * value-imports one of the two library barrels. That is necessary and it is
 * not sufficient, and its own header says so: it checks DIRECT importers
 * only. Two of the four edges that actually broke `next build` on 2026-09-06
 * were neither a `"use client"` file nor a barrel import:
 *
 *   - `command-apply-outcome.ts` is a plain helper - no directive at all -
 *     reached from a client component through
 *     `useCommandInterface -> ModulesView`, and it imported
 *     `./canvas-modules/gradables` DEEPLY rather than through a barrel.
 *   - the same shape existed via `canvas-modules/migrations.ts`.
 *
 * So this file asks the question the bundler actually asks: starting from
 * every `"use client"` entry point and following value imports, can the
 * browser bundle reach `canvas-core.ts`? That module resolves per-user
 * credentials through `canvas-credentials.ts` -> `supabase/server.ts`, which
 * uses `next/headers` and `node:async_hooks` - the latter cannot be bundled
 * for a browser target at all, so the build does not warn, it FAILS.
 *
 * THREE RULES MAKE THIS ACCURATE, and getting any of them wrong makes the
 * test either useless or permanently red:
 *
 * 1. TYPE-ONLY IMPORTS ARE ERASED and must be ignored. This distinction IS
 *    the bug: in the file that broke the build, line 18 was `import type` and
 *    harmless while line 19 was a value import and fatal. A guard that cannot
 *    tell them apart would fail on dozens of correct files.
 * 2. A `"use server"` MODULE IS A WALL. Next replaces it with an RPC stub, so
 *    nothing it imports reaches the browser. Walking through one reports
 *    almost every file in the app and is how the first version of this
 *    detector produced 339 false positives.
 * 3. IMPORT CYCLES EXIST in this codebase and the walk must terminate.
 *
 * If this test ever fails, do NOT fix it by hiding the credential delegation
 * inside `canvas-core.ts` - that delegation is the point of the per-user
 * credential work. Move the PURE value the client wanted into a leaf that
 * imports nothing, re-export it from the server module so server callers are
 * unaffected, and point the client at the leaf directly.
 */

const SRC = join(process.cwd(), "src");
const TARGET = join(SRC, "lib", "canvas-core.ts");

function toPosix(p: string): string {
  return relative(process.cwd(), p).split(sep).join("/");
}

function readOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** Resolve an import specifier to a real file, mirroring the bundler's order. */
function resolveSpecifier(spec: string, importer: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(importer), spec));
  else return null;

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not this one
    }
  }
  return null;
}

const IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?(?:[\w*{}\s,]*?)\s*from\s+"([^"]+)"/gm;

/**
 * Every specifier this module imports for its VALUES. Skips `import type ...`
 * and a brace list whose every member is prefixed `type ` - both are erased
 * by the TypeScript transform and carry no module graph.
 */
export function valueImportSpecifiers(source: string): string[] {
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

function hasDirective(source: string, directive: string): boolean {
  return source.slice(0, 200).includes(`"${directive}"`);
}

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

/** Does this module drag TARGET into a browser bundle? */
function makeReachesTarget() {
  const memo = new Map<string, boolean>();
  const walk = (path: string, stack: Set<string>): boolean => {
    // THE MEMO CHECK COMES FIRST, and it used to come third - after a
    // readFileSync. That ordering re-read every file once per EDGE that
    // reached it rather than once per node, so the walk cost grew with the
    // repo and this test eventually blew its own 5-second timeout: not a
    // failure anyone could act on, just a red suite. Hoisting the memo above
    // the read makes it one read per node. The `use server` wall and the
    // TARGET hit are memoised too, for the same reason - both were previously
    // recomputed on every visit.
    const cached = memo.get(path);
    if (cached !== undefined) return cached;
    if (path === TARGET) {
      memo.set(path, true);
      return true;
    }
    const source = readOrEmpty(path);
    if (hasDirective(source, "use server")) {
      memo.set(path, false); // a wall, see rule 2
      return false;
    }
    if (stack.has(path)) return false; // rule 3
    memo.set(path, false);
    stack.add(path);
    let result = false;
    for (const spec of valueImportSpecifiers(source)) {
      const dep = resolveSpecifier(spec, path);
      if (dep && walk(dep, stack)) {
        result = true;
        break;
      }
    }
    stack.delete(path);
    memo.set(path, result);
    return result;
  };
  return (path: string) => walk(path, new Set());
}

describe("no browser bundle can reach canvas-core.ts", () => {
  it("finds the client entry points at all", () => {
    // Guards the guard: if the directive scan broke, the walk below would
    // start from nothing and pass vacuously forever.
    const clients = collectSourceFiles().filter((f) =>
      hasDirective(readOrEmpty(f), "use client")
    );
    expect(clients.length).toBeGreaterThan(50);
  });

  it("treats a type-only import as erased and a value import as real", () => {
    expect(valueImportSpecifiers('import type { A } from "x";\n')).toEqual([]);
    expect(valueImportSpecifiers('import { type A, type B } from "x";\n')).toEqual([]);
    expect(valueImportSpecifiers('import { A } from "x";\n')).toEqual(["x"]);
    // The exact pair that broke the build: type-only above, value below.
    expect(
      valueImportSpecifiers(
        'import type { BulkItem } from "@/lib/canvas-modules";\n' +
          'import { COURSE_COPY_TYPES } from "@/lib/canvas-modules";\n'
      )
    ).toEqual(["@/lib/canvas-modules"]);
  });

  // AN EXPLICIT, GENEROUS TIMEOUT, and it is not papering over a slow test.
  // This walks the whole repo's import graph, so its cost grows with the
  // repo - it silently drifted past vitest's 5-second default and failed as a
  // TIMEOUT, which reads like a broken test rather than a boundary violation
  // and tells a reader nothing about what to fix. The memo hoist above bought
  // most of the headroom back; this bound is what stops a slower machine or
  // another few directories turning a correct guard into a red suite again.
  // If it ever approaches this number, make the walk cheaper - do not raise
  // it a second time.
  it("no client-reachable module value-imports its way to canvas-core", { timeout: 30000 }, () => {
    const reachesTarget = makeReachesTarget();

    const reachable = new Set<string>();
    const queue = collectSourceFiles().filter((f) =>
      hasDirective(readOrEmpty(f), "use client")
    );
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (reachable.has(file)) continue;
      const source = readOrEmpty(file);
      if (hasDirective(source, "use server")) continue;
      reachable.add(file);
      for (const spec of valueImportSpecifiers(source)) {
        const dep = resolveSpecifier(spec, file);
        if (dep && !reachable.has(dep)) queue.push(dep);
      }
    }

    const violations: string[] = [];
    for (const file of reachable) {
      for (const spec of valueImportSpecifiers(readOrEmpty(file))) {
        const dep = resolveSpecifier(spec, file);
        if (dep && reachesTarget(dep)) {
          violations.push(`${toPosix(file)}\n      value-imports "${spec}" -> ${toPosix(dep)}`);
        }
      }
    }

    expect(
      violations,
      "These reach canvas-core.ts from a browser bundle, which pulls in " +
        "next/headers and node:async_hooks and FAILS the build.\n" +
        "Move the pure value into a leaf that imports nothing, re-export it " +
        "from the server module, and import the leaf directly:\n\n" +
        violations.join("\n")
    ).toEqual([]);
  });
});
