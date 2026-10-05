import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_REPLY_MARKER,
  extractRubricCriteria,
  isReplySectionMarker,
} from "@/lib/grade/rubric";
import {
  REPLY_SECTION_MARKER,
  hasReplySectionMarker,
  insertReplySectionMarker,
} from "./ReplySectionInsertField";

// A8 Wave C reachability guard (docs/a8-scoring-waves.md section 2 Wave C): the
// marker the UI inserts is the one the parser acts on, and the control is
// mounted on the rubric state that becomes header.effectiveRubric.

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const tab = stripComments(readFileSync("src/app/components/GradingTab.tsx", "utf-8"));
const field = stripComments(
  readFileSync("src/app/components/grading/ReplySectionInsertField.tsx", "utf-8")
);

const SAMPLE = "Thesis (20 pts): clear claim\nEvidence (10 pts): sources";

describe("A8 Wave C reply-section marker wiring", () => {
  it("the canonical marker is recognised by the parser's own recognizer", () => {
    expect(isReplySectionMarker(CANONICAL_REPLY_MARKER)).toBe(true);
  });

  it("anti-drift: the UI literal equals the parser constant, and its presence check is sound", () => {
    expect(REPLY_SECTION_MARKER).toBe(CANONICAL_REPLY_MARKER);
    for (const line of ["Reply section:", "  reply section:  ", "REPLY SECTION:"]) {
      expect(hasReplySectionMarker(line)).toBe(true);
      expect(isReplySectionMarker(line)).toBe(true);
    }
    expect(hasReplySectionMarker("Thesis (20 pts): replies are due")).toBe(false);
  });

  it("round-trip: a criterion after the inserted marker is tagged axis reply", () => {
    const inserted = insertReplySectionMarker(SAMPLE);
    expect(inserted).toContain(CANONICAL_REPLY_MARKER);
    const next = `${inserted}Engagement (10 pts): responds to peers\n`;
    const criteria = extractRubricCriteria(next);
    const byName = Object.fromEntries(criteria.map((c) => [c.name, c.axis]));
    expect(byName["Thesis"]).toBe("initial-post");
    expect(byName["Engagement"]).toBe("reply");
  });

  it("insertion is idempotent and handles an empty rubric", () => {
    const once = insertReplySectionMarker(SAMPLE);
    expect(insertReplySectionMarker(once)).toBe(once);
    expect(insertReplySectionMarker("")).toBe(`${CANONICAL_REPLY_MARKER}\n`);
  });

  it("the field never imports rubric.ts (client boundary; rubric.ts reaches the server DB)", () => {
    expect(field).not.toMatch(/from "@\/lib\/grade\/rubric"/);
  });

  it("GradingTab mounts the field wired to setRubric, the state behind the rubric textarea", () => {
    expect(tab).toMatch(/import ReplySectionInsertField from "\.\/grading\/ReplySectionInsertField"/);
    const m = tab.match(/<ReplySectionInsertField[^>]*\/>/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain("rubric={rubric}");
    expect(m![0]).toContain("onChange={setRubric}");
    // the same state is what the textarea reads and the form submits as "rubric"
    expect(tab).toMatch(/const \[rubric, setRubric\] = useState\(""\)/);
    expect(tab).toMatch(/name="rubric"[\s\S]{0,200}value=\{rubric\}/);
  });

  it("dead-scan canary: the scan regexes match when the mount is present", () => {
    const sample = '<ReplySectionInsertField rubric={rubric} onChange={setRubric} />';
    expect(sample.match(/<ReplySectionInsertField[^>]*\/>/)).not.toBeNull();
    expect(tab.length).toBeGreaterThan(1000);
  });
});
