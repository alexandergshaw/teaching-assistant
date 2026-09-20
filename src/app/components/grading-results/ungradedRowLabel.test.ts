// Oracle for src/app/components/grading-results/ungradedRowLabel.ts.
// RES-5 (docs/a12-a13-scope.md, Ruling U1): the check ruled that
// `data-ungraded-state` alone (A12/A13) is invisible, and required (1) a
// visible treatment keyed on that attribute and (2) a frozen visible-label
// literal, rendered as a text node inside the same tbody region AC-4/AC-5
// already use - the strongest instrument available given that no component
// is ever rendered by any test in this repo (vitest is node-env).
//
// Per docs/loop/no-cross-test-file-imports (memory): stripComments and
// tbodyMapRegion are duplicated from ungradedDisclosure.test.ts rather than
// imported, so importing this file never re-runs that file's describe
// blocks.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RowDisclosureState } from "./ungradedDisclosure";
import { UNGRADED_ROW_LABEL, describeUngradedRowLabel } from "./ungradedRowLabel";

// The full set of RowDisclosureState members, transcribed from
// ungradedDisclosure.ts's own type declaration - not invented. Kept as a
// literal array (rather than relying on the Record type alone) so a state
// added to the union without a corresponding array update here is a
// visible diff at review time, matching AC-3b's frozen-set idiom.
const ALL_STATES: RowDisclosureState[] = [
  "postable",
  "refused",
  "rescued",
  "grading-failed",
  "not-attempted-count-bound",
  "not-attempted-run-deadline",
];

describe("UNGRADED_ROW_LABEL / describeUngradedRowLabel", () => {
  it("has exactly the six RowDisclosureState members, no more and no fewer", () => {
    expect(Object.keys(UNGRADED_ROW_LABEL).sort()).toEqual([...ALL_STATES].sort());
  });

  it("postable maps to null - an ordinary graded row gets no label", () => {
    expect(describeUngradedRowLabel("postable")).toBeNull();
  });

  // Frozen literals: this is the point of the freeze (unlike other
  // source-text tests in this repo, which pin the fact and never the
  // spelling), so the exact strings are asserted, not just their presence.
  it("refused: frozen literal", () => {
    expect(describeUngradedRowLabel("refused")).toBe("Not posted - needs review before posting");
  });

  it("rescued: frozen literal", () => {
    expect(describeUngradedRowLabel("rescued")).toBe("Not posted - scored by hand, review separately");
  });

  it("grading-failed: frozen literal", () => {
    expect(describeUngradedRowLabel("grading-failed")).toBe("Not posted - grading failed");
  });

  it("not-attempted-count-bound: frozen literal", () => {
    expect(describeUngradedRowLabel("not-attempted-count-bound")).toBe(
      "Not posted - not graded (run limit reached)"
    );
  });

  it("not-attempted-run-deadline: frozen literal", () => {
    expect(describeUngradedRowLabel("not-attempted-run-deadline")).toBe(
      "Not posted - not graded (time limit reached)"
    );
  });

  // Design decision this leaf makes deliberately (its own header comment):
  // the five non-postable states are NOT interchangeable - each gets its
  // own literal, not one shared marker string. This proves that choice
  // rather than just asserting each string individually.
  it("every non-postable state has a distinct, non-empty label", () => {
    const nonPostable = ALL_STATES.filter((s) => s !== "postable");
    const labels = nonPostable.map((s) => describeUngradedRowLabel(s));
    for (const label of labels) {
      expect(typeof label).toBe("string");
      expect((label as string).length).toBeGreaterThan(0);
    }
    expect(new Set(labels).size).toBe(nonPostable.length);
  });

  // All non-postable labels share the "Not posted" family vocabulary
  // (the same prefix describeSkippedStatus's fallback already uses in
  // GradingResults.tsx), which is what makes the marker read as one visible
  // category while its suffix still differs per state.
  it("every non-postable label starts with the shared family prefix", () => {
    const nonPostable = ALL_STATES.filter((s) => s !== "postable");
    for (const state of nonPostable) {
      expect(describeUngradedRowLabel(state)).toMatch(/^Not posted - /);
    }
  });
});

describe("GradingResults.tsx source-text wiring - the visible label is rendered", () => {
  function readComponentSource(): string {
    return readFileSync(fileURLToPath(new URL("../GradingResults.tsx", import.meta.url)), "utf8");
  }

  // Duplicated from ungradedDisclosure.test.ts (no-cross-test-file-imports).
  function stripComments(source: string): string {
    return source
      .split(/\r?\n/)
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
  }

  function tbodyMapRegion(source: string): string {
    const stripped = stripComments(source);
    const mapStart = stripped.indexOf("sortedResults.map(");
    if (mapStart === -1) throw new Error("sortedResults.map( not found in GradingResults.tsx");
    const trClose = stripped.indexOf("</tr>", mapStart);
    if (trClose === -1) throw new Error("</tr> not found after sortedResults.map( in GradingResults.tsx");
    return stripped.slice(mapStart, trClose + "</tr>".length);
  }

  it("canary: the detection discriminates a known-good fixture from known-bad ones", () => {
    const good =
      "sortedResults.map((result) => { const l = describeUngradedRowLabel(state); return (<tr><td>{l}</td></tr>); })";
    const badNoCall = "sortedResults.map((result) => { return (<tr><td /></tr>); })";
    expect(tbodyMapRegion(good)).toMatch(/describeUngradedRowLabel\(/);
    expect(tbodyMapRegion(badNoCall)).not.toMatch(/describeUngradedRowLabel\(/);
  });

  it("the real file calls describeUngradedRowLabel inside the tbody map region", () => {
    const region = tbodyMapRegion(readComponentSource());
    expect(region).toMatch(/describeUngradedRowLabel\(/);
  });

  it("the real file imports describeUngradedRowLabel from the new leaf", () => {
    const source = stripComments(readComponentSource());
    expect(source).toMatch(
      /import\s*{\s*describeUngradedRowLabel\s*}\s*from\s*["']\.\/grading-results\/ungradedRowLabel["']/
    );
  });

  // S9-style control: a trailing-comment copy of the call is not mistaken
  // for a live one.
  it("a trailing-comment copy of the call is not mistaken for a live one", () => {
    const trailingCommentSabotage =
      "sortedResults.map((result) => { return (<tr // describeUngradedRowLabel(state)\n><td /></tr>); })";
    expect(tbodyMapRegion(trailingCommentSabotage)).not.toMatch(/describeUngradedRowLabel\(/);
  });
});
