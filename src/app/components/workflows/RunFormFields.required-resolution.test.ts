// A SOURCE-READING guard on one line of RunFormFields.tsx: the fields handed
// to groupRunFormFields must be the ones resolveFieldRequirements produced,
// not the raw `fields` prop
// (docs/conditional-required-inputs-acceptance-criteria.md AC3 items 8/10a).
//
// WHY THIS EXISTS. Bypassing that one line reverts the entire VISIBLE half of
// conditional requiredness - a gated field silently falls back out of Setup
// and loses its required marker - and the whole suite stays green: verified by
// doing it, 8859/8859 passed. vitest.config.ts is `environment: "node"` and
// collects only `src/**/*.test.ts`, so no component is ever rendered and no
// behavioral test can reach a .tsx file. Worse, `RunFormFields.tsx` itself
// documents an auto-reveal for hidden invalid fields that was DELETED because
// "groupRunFormFields always keeps a required field in the primary Setup
// tier... If that invariant is ever weakened, this needs a real
// re-introduction." Conditional requiredness is exactly what would weaken it,
// and this line is what holds it up.
//
// Modeled on runtime-field-accessible-labels.test.ts, including its CANARY
// PAIR: a structural assertion over source text is worthless unless the
// extractor is proven able to tell a good file from a bad one, so the same
// checker runs over two inline samples below.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/** Comments in this file mention `groupRunFormFields` in prose several times,
 * and `String.match` returns only the FIRST hit - so a checker that does not
 * strip comments can be satisfied by a mention while the real call is wrong.
 * That is not a contrived mutation: the file is comment-dense by design. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\r\n]*/g, "");
}

/** True when `source` passes the resolved-before-grouped rule. */
function resolvesBeforeGrouping(rawSource: string): boolean {
  const source = stripComments(rawSource);
  const call = source.match(/groupRunFormFields\(\s*([A-Za-z0-9_]+)/);
  if (!call) return false;
  const argument = call[1];
  // The argument must be a local binding produced by resolveFieldRequirements,
  // not the component's own `fields` prop.
  if (argument === "fields") return false;
  const assignment = new RegExp(`(?:const|let)\\s+${argument}\\s*=\\s*resolveFieldRequirements\\(`);
  return assignment.test(source);
}

const SOURCE = readFileSync(
  fileURLToPath(new URL("./RunFormFields.tsx", import.meta.url)),
  "utf8"
);

describe("the checker can tell a wired file from an unwired one", () => {
  it("accepts a file that resolves first", () => {
    const good = `
      const resolvedFields = resolveFieldRequirements(fields, values);
      const sections = groupRunFormFields(resolvedFields, undefined, scope);
    `;
    expect(resolvesBeforeGrouping(good)).toBe(true);
  });

  it("rejects a file that groups the raw prop", () => {
    const bad = `
      const resolvedFields = resolveFieldRequirements(fields, values);
      const sections = groupRunFormFields(fields, undefined, scope);
    `;
    expect(resolvesBeforeGrouping(bad)).toBe(false);
  });

  it("rejects a file that never resolves at all", () => {
    const bad = `const sections = groupRunFormFields(someFields, undefined, scope);`;
    expect(resolvesBeforeGrouping(bad)).toBe(false);
  });

  it("is not fooled by a COMMENT that mentions the right call", () => {
    // The mutation that beat the first version of this checker.
    const bad = `
      // see groupRunFormFields(resolvedFields, undefined, scope) below
      const resolvedFields = resolveFieldRequirements(fields, values);
      const sections = groupRunFormFields(fields, undefined, scope);
    `;
    expect(resolvesBeforeGrouping(bad)).toBe(false);
  });

  it("is not fooled by a block comment either", () => {
    const bad = `
      /* groupRunFormFields(resolvedFields, ...) is what we want */
      const sections = groupRunFormFields(fields, undefined, scope);
    `;
    expect(resolvesBeforeGrouping(bad)).toBe(false);
  });
});

describe("RunFormFields.tsx resolves conditional requiredness before grouping", () => {
  it("imports the resolver", () => {
    expect(SOURCE).toMatch(/import\s*\{[^}]*resolveFieldRequirements[^}]*\}\s*from\s*["']@\/lib\/workflow-field-visibility["']/);
  });

  it("hands groupRunFormFields the RESOLVED fields, never the raw prop", () => {
    expect(resolvesBeforeGrouping(SOURCE)).toBe(true);
  });

  it("resolves against the form's current values", () => {
    expect(SOURCE).toMatch(/resolveFieldRequirements\(\s*fields\s*,\s*values\s*\)/);
  });
});
