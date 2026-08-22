// ModulesHeaderBar is a React component and this vitest setup is node-env
// with no renderer (see useRubrics.test.ts's own header comment for the
// established precedent), so its JSX cannot be exercised directly. This
// pins finding 7 (docs/rubric-source-module-column-route-handler-
// acceptance-criteria.md): the top-toolbar rubric "Edit" picker gained the
// same account-rubric gap BulkItemsSection.tsx's bulk rubric picker already
// guards against - account rubrics reaching this list unlabelled, behind an
// Edit button that 404s (getRubric/updateRubric only ever address
// /courses/:id/rubrics/:id, never an account rubric's id). The fix mirrors
// BulkItemsSection.tsx's existing treatment exactly, and this file checks
// that mirroring held, the same source-text idiom
// askAiSelection.wiring.test.ts already uses.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const HEADER_BAR_PATH = join(
  process.cwd(),
  "src/app/components/content-tab/modules/ModulesHeaderBar.tsx"
);

const source = readFileSync(HEADER_BAR_PATH, "utf8");

describe("ModulesHeaderBar's rubric Edit picker guards against account-level rubrics (finding 7)", () => {
  it("computes editRubricSource by matching editRubricId against the rubrics list, not hard-coding a source", () => {
    expect(source).toContain(
      'const editRubricSource = rubrics.find((r) => r.id === editRubricId)?.source;'
    );
  });

  it("labels account-level rubrics in the Edit dropdown, same as BulkItemsSection.tsx", () => {
    expect(source).toContain('r.source === "account" ? " (account-level)" : ""');
  });

  it("disables the Edit button's `disabled` attribute when the selected rubric is account-level", () => {
    expect(source).toContain('disabled={editRubricId === "" || editRubricSource === "account"}');
  });

  it("guards the click handler itself against firing on an account-level rubric, not just the disabled attribute", () => {
    expect(source).toContain('if (editRubricId === "" || editRubricSource === "account") return;');
  });

  it("shows a visible reason when an account-level rubric is selected, same wording as BulkItemsSection.tsx", () => {
    expect(source).toContain(
      "Account-level rubrics are shared across courses and can&apos;t be edited here."
    );
    expect(source).toContain('editRubricSource === "account" && (');
  });
});
