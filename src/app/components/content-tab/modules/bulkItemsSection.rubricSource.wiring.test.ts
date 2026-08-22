// BulkItemsSection's account-rubric guard - reachability pin.
//
// WHY THIS FILE EXISTS. A regression pass found that BulkItemsSection.tsx is
// read by NO test in this repo, so the account-rubric half of R2
// (docs/rubric-source-module-column-route-handler-acceptance-criteria.md)
// was pinned by nothing at all: deleting
// `|| selectedRubricSource === "account"` from the Edit button left the
// entire suite green while restoring the exact failure R2 names - an Edit
// control offered for a rubric the update call cannot address, because
// getRubric/updateRubric only speak /courses/:id/rubrics/:id. The mirrored
// guard in ModulesHeaderBar.tsx got a wiring test when it was written; the
// ORIGINAL did not. That asymmetry is the whole point of this file.
//
// vitest here is node-env and collects only `src/**/*.test.ts`, so nothing
// is ever rendered - this reads the component as TEXT, the same idiom
// askAiSelection.wiring.test.ts and courseItemsView.wiring.test.ts already
// use. What is pinned is FACTS and STRUCTURE (the source is derived from the
// selected rubric; the Edit control is disabled for an account rubric; a
// visible reason accompanies it; the dropdown distinguishes the two sources)
// - never exact prose spelling. A sibling test written this same session was
// flagged for pinning literal label text, so the assertions below match
// case-insensitively on the concept instead, leaving every visible string
// free to be reworded.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SECTION_PATH = join(process.cwd(), "src/app/components/content-tab/modules/BulkItemsSection.tsx");
const source = readFileSync(SECTION_PATH, "utf8");

/** Source with comments stripped, so this component's own explanatory
 *  comments (which legitimately discuss "account" rubrics at length) can
 *  never satisfy an assertion meant to be about real code. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const code = stripComments(source);

describe("BulkItemsSection's account-rubric guard (R2)", () => {
  it("derives the selected rubric's source from the rubric list, not from a separate prop", () => {
    // Derived, so it cannot drift from what the dropdown is actually showing.
    // NOTE the `.*` rather than `[^)]*`: the find callback itself contains
    // parentheses (`(r) => r.id === bulkRubricId`), so a paren-excluding run
    // never reaches the `?.source` and the assertion fails against CORRECT
    // code - which is exactly what the first draft of this test did.
    expect(code).toMatch(/rubrics\.find\(.*\)\?\.source/);
  });

  it("disables the Edit control when the selected rubric is account-level", () => {
    // THE ASSERTION THAT WAS MISSING. Structural: the Edit button's own
    // `disabled` expression must consult the derived source. Deleting the
    // clause is what this catches.
    //
    // Anchored on `editRubricId:`, which appears ONLY inside this button's
    // own onClick. The first draft anchored on `setRubricBuilder`, whose
    // first occurrence in the file is the prop destructuring at the top -
    // so it walked back to an unrelated Button and failed against correct
    // code. Anchor on something unique to the control you mean.
    const editIdx = code.indexOf("editRubricId:");
    expect(editIdx, "the Edit control is no longer rendered").toBeGreaterThan(-1);
    const buttonStart = code.lastIndexOf("<Button", editIdx);
    expect(buttonStart).toBeGreaterThan(-1);
    const editButton = code.slice(buttonStart, editIdx);
    expect(editButton, "the Edit control no longer refuses an account-level rubric").toMatch(
      /disabled=\{[^}]*selectedRubricSource\s*===\s*"account"/
    );
  });

  it("renders a visible reason whenever that refusal applies", () => {
    // A disabled control with no stated reason is undiscoverable - this
    // repo's DownloadSelectionSection makes the same argument at length.
    // Matched on the guard plus the presence of SOME rendered text, not on
    // the wording itself.
    const guardIdx = code.indexOf('selectedRubricSource === "account" &&');
    expect(guardIdx, "no conditional reason is rendered for the refusal").toBeGreaterThan(-1);
    const block = code.slice(guardIdx, guardIdx + 400);
    expect(block).toMatch(/account/i);
    expect(block).toMatch(/edit/i);
  });

  it("distinguishes account-level entries in the dropdown itself", () => {
    // So the instructor can tell WHICH rubric will refuse before selecting
    // it, rather than discovering it from a disabled button afterwards.
    expect(code).toMatch(/r\.source\s*===\s*"account"\s*\?/);
  });

  it("still allows Associate for an account-level rubric", () => {
    // Deliberate and worth pinning: POST /courses/:id/rubric_associations
    // accepts an account rubric's id, so only EDIT is refused. A future
    // change that disables Associate too would be a real regression in
    // capability, not a tightening.
    const associateIdx = code.indexOf("onClick={bulkRubric}");
    expect(associateIdx, "the Associate control is no longer rendered").toBeGreaterThan(-1);
    const buttonStart = code.lastIndexOf("<Button", associateIdx);
    const associateButton = code.slice(buttonStart, associateIdx);
    expect(associateButton, "Associate was narrowed to course-level rubrics").not.toMatch(/selectedRubricSource/);
  });
});
