// ModulesHeaderBar's top-toolbar rubric "Edit" picker - account-rubric guard.
//
// ModulesHeaderBar is a React component and this vitest setup is node-env
// with no renderer, so its JSX cannot be exercised directly - this reads the
// component as TEXT, the same idiom askAiSelection.wiring.test.ts and
// bulkItemsSection.rubricSource.wiring.test.ts already use.
//
// WHAT IT GUARDS (docs/rubric-source-module-column-route-handler-acceptance-
// criteria.md, R2). Once listRubrics started returning account-level rubrics
// alongside course-level ones, they reached THIS picker too - unlabelled,
// behind an Edit button that cannot work, because getRubric/updateRubric only
// ever address /courses/:id/rubrics/:id and an account rubric's id does not
// resolve there. The fix mirrors BulkItemsSection.tsx's treatment; this file
// checks the mirroring held.
//
// PINS STRUCTURE, NOT SPELLING. An earlier version of this file asserted five
// verbatim strings - a whole statement including its whitespace, the operand
// ORDER inside a boolean expression, and a complete English sentence. All
// five would break on a prettier reformat, a swapped `a || b`, or a reworded
// label, none of which is a behaviour change; and none of them would catch a
// guard that was moved to the wrong control. This repo has a standing rule
// about exactly that (source-text-tests-overspecify: pin the fact and the
// ordering, never the spelling), and a regression pass flagged this file for
// breaking it. The assertions below match the FACT (the source is derived,
// the Edit control consults it, the click handler re-checks it, a reason is
// rendered) and leave every visible string free to be reworded.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const HEADER_BAR_PATH = join(process.cwd(), "src/app/components/content-tab/modules/ModulesHeaderBar.tsx");

/** Comments stripped first: this component's own comments legitimately
 *  discuss account rubrics at length, and must never satisfy an assertion
 *  meant to be about real code. */
const code = readFileSync(HEADER_BAR_PATH, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

/** The Edit control's own source, anchored on `editRubricId: Number(` - which
 *  appears ONLY inside that button's onClick - then walked back to the
 *  `<Button` that owns it. Anchoring on something shared (a bare
 *  `setRubricBuilder`, say, which is also a destructured prop at the top of
 *  the file) walks back to an unrelated control and asserts nothing. */
function editButtonSource(): string {
  const anchor = code.indexOf("editRubricId: Number(");
  expect(anchor, "the Edit control is no longer rendered").toBeGreaterThan(-1);
  const start = code.lastIndexOf("<Button", anchor);
  expect(start).toBeGreaterThan(-1);
  return code.slice(start, anchor);
}

describe("ModulesHeaderBar's rubric Edit picker guards against account-level rubrics (R2)", () => {
  it("derives the selected rubric's source from the rubrics list rather than assuming one", () => {
    // `.*` and not `[^)]*`: the find callback contains parentheses of its
    // own, so a paren-excluding run never reaches `?.source`.
    expect(code).toMatch(/rubrics\.find\(.*\)\?\.source/);
  });

  it("distinguishes account-level entries in the dropdown itself", () => {
    // So the instructor can tell which rubric will refuse BEFORE selecting
    // it, rather than discovering it from a dead button afterwards.
    expect(code).toMatch(/r\.source\s*===\s*"account"\s*\?/);
  });

  it("disables the Edit control when the selected rubric is account-level", () => {
    expect(editButtonSource(), "the Edit control no longer refuses an account-level rubric").toMatch(
      /disabled=\{[^}]*editRubricSource\s*===\s*"account"/
    );
  });

  it("re-checks inside the click handler, not only via the disabled attribute", () => {
    // Defence in depth, and it matters here: the same handler is reachable
    // by keyboard, and `disabled` on a MUI Button is a prop, not a promise.
    expect(editButtonSource()).toMatch(/onClick=\{[\s\S]*editRubricSource\s*===\s*"account"[\s\S]*return;/);
  });

  it("renders a visible reason whenever that refusal applies", () => {
    // A disabled control with no stated reason is undiscoverable. Matched on
    // the guard plus the presence of some rendered explanation - never the
    // sentence itself.
    const guardIdx = code.indexOf('editRubricSource === "account" &&');
    expect(guardIdx, "no conditional reason is rendered for the refusal").toBeGreaterThan(-1);
    const block = code.slice(guardIdx, guardIdx + 400);
    expect(block).toMatch(/account/i);
    expect(block).toMatch(/edit/i);
  });
});
