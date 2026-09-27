// W2-8 (docs/a39-waves.md 8.2): the spelling half of the version-provenance
// leverage claim. This reads RubricProvenance.tsx as SOURCE TEXT - nothing
// under vitest here renders a component (docs/loop/this-repo.md section 2),
// so this file can only ever prove the literal is present in source, never
// that it reaches a screen.
//
// W2-7 (the fold-hazard clauses the wave plan names but does not give a
// separate file for - "rubricProvenanceLeaf.test.ts | new. W2-8, the
// spelling half" implies a structural half, and no other new file in wave
// 2's write set is a candidate) lives in this same file: each of the three
// rubric-memory-fed TextFields caps its height, and RubricProvenance mounts
// above GradingResults in GradingTab.tsx but never inside GradingResults.tsx
// itself.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.join(__dirname, "RubricProvenance.tsx"),
  "utf8"
);

const GRADING_TAB_SOURCE = fs.readFileSync(
  path.join(process.cwd(), "src/app/components/GradingTab.tsx"),
  "utf8"
);
const GRADING_RESULTS_SOURCE = fs.readFileSync(
  path.join(process.cwd(), "src/app/components/GradingResults.tsx"),
  "utf8"
);
const CARTRIDGE_DROP_SOURCE = fs.readFileSync(
  path.join(process.cwd(), "src/app/components/CartridgeDropPanel.tsx"),
  "utf8"
);

/** From the nearest preceding `<TextField`, scans forward to the first `>`
 * whose preceding character is not `=` (attribute values contain `=>`
 * arrow functions) - the same idiom autoGradeTransition.wiring.test.ts uses
 * for `<Button`. */
function enclosingTextFieldTag(text: string, idAttr: string): string {
  const idIdx = text.indexOf(idAttr);
  if (idIdx === -1) return "";
  const tagStart = text.lastIndexOf("<TextField", idIdx);
  if (tagStart === -1) return "";
  for (let i = tagStart; i < text.length; i++) {
    if (text[i] === ">" && text[i - 1] !== "=") {
      return text.slice(tagStart, i + 1);
    }
  }
  return text.slice(tagStart);
}

describe("RubricProvenance.tsx spells the run's provenance the one required way", () => {
  it("contains the literal 'Rubric used'", () => {
    expect(SOURCE).toContain("Rubric used");
  });

  it("never uses a rejected spelling", () => {
    expect(SOURCE).not.toContain("Rubric applied");
    expect(SOURCE).not.toContain("Rubric source");
    expect(SOURCE).not.toContain("Graded against");
  });

  it("reads the run's own fields, not rubric-memory.ts's storage", () => {
    // W2-3's other half: the CALLER must not have its own path into the
    // memory store. Only describeRunRubricProvenance/GradingRun may appear.
    expect(SOURCE).not.toContain("rubric-memory");
    expect(SOURCE).not.toContain("loadRubricMemory");
    expect(SOURCE).toContain("describeRunRubricProvenance");
  });
});

describe("W2-7 clause 1: every rubric-memory-fed TextField caps its height", () => {
  it("assignment-instructions carries maxRows inside its own TextField tag", () => {
    const tag = enclosingTextFieldTag(GRADING_TAB_SOURCE, 'id="assignment-instructions"');
    expect(tag).toContain('id="assignment-instructions"');
    expect(tag).toContain("maxRows");
  });

  it("rubric (GradingTab.tsx) carries maxRows inside its own TextField tag", () => {
    const tag = enclosingTextFieldTag(GRADING_TAB_SOURCE, 'id="rubric"');
    expect(tag).toContain('id="rubric"');
    expect(tag).toContain("maxRows");
  });

  it("cartridge-rubric carries maxRows inside its own TextField tag", () => {
    const tag = enclosingTextFieldTag(CARTRIDGE_DROP_SOURCE, 'id="cartridge-rubric"');
    expect(tag).toContain('id="cartridge-rubric"');
    expect(tag).toContain("maxRows");
  });
});

describe("W2-7 clause 2: RubricProvenance mounts above GradingResults in GradingTab.tsx", () => {
  it("<RubricProvenance appears, and strictly before <GradingResults", () => {
    const provenanceIdx = GRADING_TAB_SOURCE.indexOf("<RubricProvenance");
    const resultsIdx = GRADING_TAB_SOURCE.indexOf("<GradingResults");
    expect(provenanceIdx).toBeGreaterThanOrEqual(0);
    expect(resultsIdx).toBeGreaterThanOrEqual(0);
    expect(provenanceIdx).toBeLessThan(resultsIdx);
  });
});

describe("W2-7 clause 3: GradingResults.tsx never mounts RubricProvenance itself", () => {
  it("<RubricProvenance is absent from GradingResults.tsx", () => {
    expect(GRADING_RESULTS_SOURCE.indexOf("<RubricProvenance")).toBe(-1);
  });
});

// Canary: proves this test would actually fail against a stub that used one
// of the rejected spellings instead - i.e. these two `toContain`/`not
// toContain` clauses discriminate, rather than passing on any input the way
// an `indexOf(...) >= -1` idiom would (docs/a39-waves.md RULING 28's class of
// defect).
describe("canary: the assertions above actually discriminate", () => {
  const STUB_WITH_REJECTED_SPELLING = 'return <p>Rubric applied: {line}</p>;';

  it("would fail the 'never uses a rejected spelling' check against a bad stub", () => {
    expect(STUB_WITH_REJECTED_SPELLING).toContain("Rubric applied");
  });

  it("would fail the 'contains Rubric used' check against a stub missing it entirely", () => {
    const STUB_MISSING_LITERAL = "return <p>{line}</p>;";
    expect(STUB_MISSING_LITERAL).not.toContain("Rubric used");
  });
});
