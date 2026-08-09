// Tests for scheduleBlockingUploadFields (workflow-schedule-blocking-fields.ts)
// and a SOURCE-READING guard proving ScheduleEditForm.tsx actually calls it
// instead of its old inline `f.type === "uploads" && f.required` test.
//
// WHY THE GUARD EXISTS. vitest.config.ts is `environment: "node"` and
// collects only `src/**/*.test.ts` (see this repo's other guard tests, e.g.
// src/lib/workflows/registry/steps.weekly-announcement-schedule.test.ts:31-36
// and src/app/components/workflows/RunFormFields.required-resolution.test.ts),
// so no `.tsx` is ever rendered and no behavioral test can reach
// ScheduleEditForm.tsx's JSX at all. The only way to pin "the component
// actually calls the shared predicate" - as opposed to "a predicate module
// merely exists, unused, next to a component that still has its own copy of
// the bug" - is to read the component's source text and check it. Per
// docs/REGRESSION.md entry 239 check 10's explicit warning, a structural
// assertion like that is worthless unless it is proven to be able to fail:
// this file's "canary pair" describe block runs the same checker over an
// inline WIRED sample and an inline UNWIRED sample (the exact old buggy
// condition) and asserts the checker tells them apart, before ever pointing
// it at the real file.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { scheduleBlockingUploadFields } from "./workflow-schedule-blocking-fields";
import type { RuntimeField } from "@/lib/workflows/types";

// Minimal-but-complete RuntimeField fixture builder - `required` is
// non-optional on the interface (types.ts:649), so every fixture needs a
// value for it even when the test only cares about `requiredWhen`.
function field(overrides: Partial<RuntimeField> & { fieldKey: string; type: RuntimeField["type"] }): RuntimeField {
  return {
    label: overrides.fieldKey,
    required: false,
    ...overrides,
  };
}

describe("scheduleBlockingUploadFields", () => {
  it("blocks an unconditionally required uploads field", () => {
    const fields = [field({ fieldKey: "attachment", type: "uploads", required: true })];
    expect(scheduleBlockingUploadFields(fields)).toEqual(fields);
  });

  it("blocks a conditionally required (requiredWhen) uploads field, even though `required` is statically false", () => {
    const gated = field({
      fieldKey: "cartridge",
      type: "uploads",
      required: false,
      requiredWhen: { fieldKey: "draftFrom", equals: "cartridge" },
    });
    // The whole point of this predicate: a schedule has no values, so
    // whether `draftFrom` currently equals "cartridge" is irrelevant - the
    // gate's mere EXISTENCE is what must block scheduling, because some
    // future unattended firing could satisfy it.
    expect(scheduleBlockingUploadFields([gated])).toEqual([gated]);
  });

  it("does not block an optional, ungated uploads field", () => {
    const fields = [field({ fieldKey: "optionalAttachment", type: "uploads", required: false })];
    expect(scheduleBlockingUploadFields(fields)).toEqual([]);
  });

  it("never blocks a non-uploads field, even if it is statically required or requiredWhen-gated", () => {
    const fields = [
      field({ fieldKey: "title", type: "text", required: true }),
      field({
        fieldKey: "message",
        type: "longtext",
        required: false,
        requiredWhen: { fieldKey: "draftFrom", equals: "template" },
      }),
    ];
    expect(scheduleBlockingUploadFields(fields)).toEqual([]);
  });

  it("filters a mixed list down to only the blocking uploads fields, preserving order", () => {
    const staticUploads = field({ fieldKey: "a", type: "uploads", required: true });
    const gatedUploads = field({ fieldKey: "b", type: "uploads", requiredWhen: { fieldKey: "x", equals: "y" } });
    const safeUploads = field({ fieldKey: "c", type: "uploads" });
    const requiredText = field({ fieldKey: "d", type: "text", required: true });
    const fields = [safeUploads, staticUploads, requiredText, gatedUploads];
    expect(scheduleBlockingUploadFields(fields)).toEqual([staticUploads, gatedUploads]);
  });

  it("returns an empty array for an empty field list", () => {
    expect(scheduleBlockingUploadFields([])).toEqual([]);
  });
});

/** Strips comments before matching, same as RunFormFields.required-resolution
 * .test.ts's stripComments - this file's own explanatory prose above and
 * inline JSX comment in ScheduleEditForm.tsx both mention the predicate's
 * name, so an unstripped checker could be satisfied by a comment alone. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\r\n]*/g, "");
}

/** True when `source` calls the shared predicate over `runtimeFields`,
 * rather than re-deriving the blocking condition inline. */
function callsSharedBlockingPredicate(rawSource: string): boolean {
  const source = stripComments(rawSource);
  return /scheduleBlockingUploadFields\(\s*runtimeFields\s*\)/.test(source);
}

describe("the checker can tell a wired ScheduleEditForm from an unwired one", () => {
  it("accepts a file that calls the shared predicate", () => {
    const good = `
      {scheduleBlockingUploadFields(runtimeFields).length > 0 && (
        <p>warning</p>
      )}
    `;
    expect(callsSharedBlockingPredicate(good)).toBe(true);
  });

  it("rejects a file that still runs the old inline, gate-blind test", () => {
    // This is the EXACT pre-fix condition (entry 239 check 16): it only ever
    // sees a static `required`, never a `requiredWhen` gate.
    const bad = `
      {runtimeFields.some((f) => f.type === "uploads" && f.required) && (
        <p>warning</p>
      )}
    `;
    expect(callsSharedBlockingPredicate(bad)).toBe(false);
  });

  it("rejects a file that does not reference uploads-blocking at all", () => {
    const bad = `{false && <p>warning</p>}`;
    expect(callsSharedBlockingPredicate(bad)).toBe(false);
  });

  it("is not fooled by a COMMENT that mentions the right call", () => {
    // The exact hazard this repo's other source-reading guards flag: prose
    // mentioning the function name is not a call to it.
    const bad = `
      // scheduleBlockingUploadFields(runtimeFields) is the fix, apparently
      {runtimeFields.some((f) => f.type === "uploads" && f.required) && (
        <p>warning</p>
      )}
    `;
    expect(callsSharedBlockingPredicate(bad)).toBe(false);
  });

  it("is not fooled by a block comment either", () => {
    const bad = `
      /* should call scheduleBlockingUploadFields(runtimeFields) here */
      {runtimeFields.some((f) => f.type === "uploads" && f.required) && (
        <p>warning</p>
      )}
    `;
    expect(callsSharedBlockingPredicate(bad)).toBe(false);
  });
});

describe("ScheduleEditForm.tsx is wired to the shared predicate", () => {
  const SOURCE = readFileSync(
    fileURLToPath(new URL("../app/components/workflows/ScheduleEditForm.tsx", import.meta.url)),
    "utf8"
  );

  it("imports scheduleBlockingUploadFields from the shared module", () => {
    expect(SOURCE).toMatch(
      /import\s*\{[^}]*scheduleBlockingUploadFields[^}]*\}\s*from\s*["']@\/lib\/workflow-schedule-blocking-fields["']/
    );
  });

  it("gates the warning on the shared predicate, not a raw inline test", () => {
    expect(callsSharedBlockingPredicate(SOURCE)).toBe(true);
  });

  it("no longer contains the old gate-blind inline condition", () => {
    // Guards against a partial revert that leaves both the import AND the
    // original buggy `.some(...)` test sitting side by side, unused but
    // technically present - which would pass every check above.
    expect(stripComments(SOURCE)).not.toMatch(/f\.type === "uploads" && f\.required\)/);
  });
});
