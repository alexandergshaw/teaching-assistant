import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Guard for the class of bug that broke `next build`: a "use client" module
 * pulling a VALUE (not type-only) out of the raw `@/lib/canvas` or
 * `@/lib/canvas-modules` library barrels instead of going through the
 * "use server" action layer (or a dedicated client-safe leaf).
 *
 * WHY THIS MATTERS NOW AND DID NOT BEFORE. Both barrels re-export from
 * canvas-core.ts's resolvers (resolveInstitution, resolveCourse, etc.), which
 * used to read `process.env` directly. Since the per-user credential wave
 * (canvas-core.ts -> canvas-credentials.ts -> effective-identity.ts ->
 * owner-context.ts), those resolvers reach `node:async_hooks`
 * (AsyncLocalStorage) and `next/headers` (via supabase/server.ts) - genuinely
 * server-only, unbundleable for a browser target. A `"use server"` file that
 * imports the barrel is fine (Next replaces its exports with an RPC stub in
 * the client bundle, and the real implementation - and everything IT imports
 * - never ships to the browser). A plain "use client" file that imports the
 * SAME barrel gets no such rewrite: whatever it names, and everything that
 * export's own module transitively imports, is bundled into the browser
 * chunk verbatim.
 *
 * THE ACTUAL INCIDENT: CourseCopyModal.tsx and useCartridgeToCanvas.ts both
 * imported `COURSE_COPY_TYPES` - nine literal `{ key, label }` pairs, no
 * dependencies of any kind - from `@/lib/canvas-modules`. That barrel's
 * copy.ts re-exports the constant from a client-safe leaf
 * (src/lib/canvas-modules/copy-types.ts) but ALSO imports `../canvas-core` at
 * its own top level for its other (resolver-dependent) exports, so pulling
 * ANYTHING through the barrel dragged the whole chain in. Turbopack failed
 * with "the chunking context (unknown) does not support external modules
 * (request: node:async_hooks)", attributed to whichever client chunk item
 * happened to merge with the offending module - CoursePicker.tsx in the
 * observed failure, though CoursePicker.tsx itself imports neither barrel by
 * value. Fixed by pointing both consumers at the client-safe leaf
 * (`@/lib/canvas-modules/copy-types`) directly, per that file's own header
 * ("A client component must import from THIS module directly, never through
 * the barrel").
 *
 * WHAT THIS TEST DOES NOT COVER. It only inspects direct imports in "use
 * client" files, not transitive ones (a plain, non-"use client" helper module
 * that a client component imports, which itself value-imports a barrel).
 * That is a real gap, but scanning the full transitive graph needs a real
 * module resolver, not a text scan - the direct-import check below is the
 * fast, `vitest`-speed net for the exact shape that broke `next build` here,
 * matching this repo's existing readFileSync ratchets (use-server-
 * exports.test.ts, canvas-credentials.exports.test.ts) rather than replacing
 * `next build` outright.
 *
 * Per this repo's own emoji-scan lesson (AGENTS.md): a detector that silently
 * matches nothing still "passes". The canary describe block below proves
 * both helpers actually fire on known-bad fixtures before the real scan is
 * trusted.
 */

/** Barrels whose value exports are unsafe from a "use client" module - see
 * the header above for why. Matched as EXACT specifiers only (the regex
 * below requires the closing quote immediately after), so `@/lib/canvas-url`,
 * `@/lib/canvas-core`, `@/lib/canvas-credentials`, etc. are never matched. */
const UNSAFE_BARRELS = ["@/lib/canvas", "@/lib/canvas-modules"];

interface ImportViolation {
  line: number;
  specifier: string;
  binding: string;
}

/** True when `text`'s first non-blank, non-comment line is the "use client"
 * directive - the same skip-leading-comments rule this repo's use-server-
 * exports.test.ts already uses for "use server". */
function isUseClientModuleText(text: string): boolean {
  const lines = text.split(/\r?\n/);
  let inBlockComment = false;

  for (const rawLine of lines) {
    let remainder = rawLine.trim();
    if (remainder === "") continue;

    if (inBlockComment) {
      const end = remainder.indexOf("*/");
      if (end === -1) continue;
      remainder = remainder.slice(end + 2).trim();
      inBlockComment = false;
      if (remainder === "") continue;
    }

    if (remainder.startsWith("//")) continue;

    if (remainder.startsWith("/*")) {
      const end = remainder.indexOf("*/", 2);
      if (end === -1) {
        inBlockComment = true;
        continue;
      }
      remainder = remainder.slice(end + 2).trim();
      if (remainder === "") continue;
    }

    return /^['"]use client['"];?$/.test(remainder);
  }

  return false;
}

/**
 * Find every import from one of UNSAFE_BARRELS that names at least one
 * binding NOT marked `type` - i.e. a real value import, which forces the
 * bundler to include that barrel's module graph in this file's chunk.
 *
 * Handles the import forms actually used in this codebase:
 *   - `import type { A, B } from "SPEC";`              -> fully erased, safe
 *   - `import { A, B } from "SPEC";`                    -> A and B, unsafe
 *   - `import { A, type B } from "SPEC";`                -> A unsafe, B safe
 *   - `import { type A, type B } from "SPEC";`           -> fully safe
 *   - multi-line variants of any of the above
 *   - `import * as ns from "SPEC";` / `import Default from "SPEC";` -> unsafe
 *
 * Operates purely on in-memory text - never touches disk itself - so the
 * canary fixtures below can drive it directly.
 */
function findClientUnsafeBarrelImports(text: string): ImportViolation[] {
  const violations: ImportViolation[] = [];

  for (const specifier of UNSAFE_BARRELS) {
    const escaped = specifier.replace(/[/]/g, "\\/");
    // Group 1: the clause between `import` and `from` (a braced list, a
    // namespace form, or a bare default binding).
    //   - `^` (with the `m` flag) anchors the match to the START of a line,
    //     so an unrelated "import" keyword mentioned inside a comment or a
    //     doc string is never matched (this file's own comments name these
    //     specifiers in plain text, which would otherwise be misread as a
    //     real import).
    //   - `(?:(?!;)[\s\S])*?` is a non-greedy "any character that is not a
    //     semicolon", so the clause can span multiple lines (a multi-line
    //     brace list) but can never cross into a LATER, unrelated import
    //     statement - without this, a lazy `[\s\S]*?` would swallow every
    //     import between the first "import" in the file and the first
    //     occurrence of `from "SPECIFIER"` anywhere below it, however far
    //     away, misattributing every binding in between.
    const importRe = new RegExp(
      `^import\\s+((?:(?!;)[\\s\\S])*?)\\s+from\\s+["']${escaped}["']`,
      "gm"
    );
    let match: RegExpExecArray | null;
    while ((match = importRe.exec(text)) !== null) {
      const clause = match[1].trim();
      const line = text.slice(0, match.index).split(/\r?\n/).length;

      if (/^type\s+/.test(clause)) continue; // `import type ...` - fully erased

      if (clause.startsWith("{") && clause.endsWith("}")) {
        const inner = clause.slice(1, -1);
        const bindings = inner
          .split(",")
          .map((b) => b.trim())
          .filter((b) => b.length > 0);
        for (const binding of bindings) {
          if (/^type\s+/.test(binding)) continue;
          violations.push({ line, specifier, binding });
        }
        continue;
      }

      // Namespace (`* as ns`) or bare default binding - always a value import.
      violations.push({ line, specifier, binding: clause });
    }
  }

  return violations;
}

describe("client-unsafe-barrel-import detector (canary: proves the detector actually detects)", () => {
  describe("isUseClientModuleText", () => {
    it("recognizes the directive as the first line", () => {
      expect(isUseClientModuleText('"use client";\n\nexport default function C() {}\n')).toBe(true);
    });

    it("skips leading blank lines and comments before the directive", () => {
      const fixture = ["", "// header", '"use client";', "", "export default function C() {}", ""].join("\n");
      expect(isUseClientModuleText(fixture)).toBe(true);
    });

    it("returns false for a plain module with no directive", () => {
      expect(isUseClientModuleText("export const x = 1;\n")).toBe(false);
    });

    it("returns false for a \"use server\" module", () => {
      expect(isUseClientModuleText('"use server";\n\nexport async function f() {}\n')).toBe(false);
    });
  });

  describe("findClientUnsafeBarrelImports", () => {
    it("flags the exact historical bug: a bare value import from the canvas-modules barrel", () => {
      const fixture = 'import { COURSE_COPY_TYPES } from "@/lib/canvas-modules";\n';
      const violations = findClientUnsafeBarrelImports(fixture);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toMatchObject({
        line: 1,
        specifier: "@/lib/canvas-modules",
        binding: "COURSE_COPY_TYPES",
      });
    });

    it("flags only the non-type binding in a mixed single-line import", () => {
      const fixture = 'import { COURSE_COPY_TYPES, type FileUploadTicket } from "@/lib/canvas-modules";\n';
      const violations = findClientUnsafeBarrelImports(fixture);
      expect(violations).toHaveLength(1);
      expect(violations[0].binding).toBe("COURSE_COPY_TYPES");
    });

    it("flags only the non-type binding in a mixed MULTI-line import", () => {
      const fixture = [
        "import {",
        "  COURSE_COPY_TYPES,",
        "  type FileUploadTicket,",
        '} from "@/lib/canvas-modules";',
        "",
      ].join("\n");
      const violations = findClientUnsafeBarrelImports(fixture);
      expect(violations).toHaveLength(1);
      expect(violations[0].binding).toBe("COURSE_COPY_TYPES");
      expect(violations[0].line).toBe(1);
    });

    it("reports zero violations for a fully type-only single-line import", () => {
      const fixture = 'import type { BulkItem, BulkKind, SelectiveNode } from "@/lib/canvas-modules";\n';
      expect(findClientUnsafeBarrelImports(fixture)).toEqual([]);
    });

    it("reports zero violations for a fully type-only MULTI-line import", () => {
      const fixture = [
        "import type {",
        "  CanvasAddableContent,",
        "  CanvasModule,",
        '} from "@/lib/canvas-modules";',
        "",
      ].join("\n");
      expect(findClientUnsafeBarrelImports(fixture)).toEqual([]);
    });

    it("reports zero violations when every named binding is individually marked `type`", () => {
      const fixture = 'import { type BulkItem, type BulkKind } from "@/lib/canvas-modules";\n';
      expect(findClientUnsafeBarrelImports(fixture)).toEqual([]);
    });

    it("does not match a similarly-named but distinct specifier (canvas-core, canvas-url)", () => {
      const fixture = [
        'import { resolveInstitution } from "@/lib/canvas-core";',
        'import { parseCanvasCourseId } from "@/lib/canvas-url";',
        "",
      ].join("\n");
      expect(findClientUnsafeBarrelImports(fixture)).toEqual([]);
    });

    it("flags a value import from the client-safe leaf's own client-safe replacement path only if reached through the plain barrel, not the leaf itself", () => {
      // The fix for the historical bug is importing from the LEAF
      // (@/lib/canvas-modules/copy-types) rather than the barrel
      // (@/lib/canvas-modules) - the leaf is a different specifier and must
      // never be flagged.
      const fixture = 'import { COURSE_COPY_TYPES } from "@/lib/canvas-modules/copy-types";\n';
      expect(findClientUnsafeBarrelImports(fixture)).toEqual([]);
    });

    it("flags a namespace import", () => {
      const fixture = 'import * as canvasModules from "@/lib/canvas-modules";\n';
      const violations = findClientUnsafeBarrelImports(fixture);
      expect(violations).toHaveLength(1);
      expect(violations[0].binding).toBe("* as canvasModules");
    });
  });
});

describe("no \"use client\" module value-imports @/lib/canvas or @/lib/canvas-modules (real source scan)", () => {
  function walk(dir: string, out: string[]): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, out);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
      out.push(full);
    }
    return out;
  }

  const srcRoot = path.resolve(process.cwd(), "src");
  const allSourceFiles = walk(srcRoot, []);
  const useClientFiles = allSourceFiles.filter((file) =>
    isUseClientModuleText(fs.readFileSync(file, "utf-8"))
  );

  it("finds more than 100 \"use client\" modules under src/ (so this test cannot pass by scanning zero files)", () => {
    expect(useClientFiles.length).toBeGreaterThan(100);
  });

  it("has no client-unsafe barrel import in any \"use client\" module", () => {
    const failures: string[] = [];

    for (const file of useClientFiles) {
      const text = fs.readFileSync(file, "utf-8");
      const relativePath = path.relative(process.cwd(), file);
      for (const violation of findClientUnsafeBarrelImports(text)) {
        failures.push(`${relativePath}:${violation.line}: imports "${violation.binding}" from "${violation.specifier}"`);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Found ${failures.length} client-unsafe barrel import(s). A "use client" module may only ` +
          `TYPE-import from @/lib/canvas or @/lib/canvas-modules (those barrels re-export canvas-core.ts's ` +
          `resolvers, which are genuinely server-only - see this file's own header). Get the value instead ` +
          `from a "use server" action (the @/lib/actions barrel) or, for a pure constant like ` +
          `COURSE_COPY_TYPES, from its dedicated client-safe leaf ` +
          `(e.g. @/lib/canvas-modules/copy-types) directly.\n\n` +
          failures.join("\n")
      );
    }
  });
});
