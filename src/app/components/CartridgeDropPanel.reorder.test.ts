// A40 wave 1 (RULING 106, RULING 107), remediated by RULING 109-111
// (docs/ruling-109-111.md). Nothing under vitest here renders a component
// (docs/loop/this-repo.md section 2), so this file proves things as SOURCE
// TEXT only:
//
// 1. RULING 106 - all five non-file fields (course, assignment, points, lms,
//    rubric) render above the file input in CartridgeDropPanel.tsx's DOM
//    order. That is a render-order claim, which this file can only assert
//    from string position, never from an actual mount. Render order and the
//    field labels an instructor reads are both reading claims stated as such.
//
//    STATED LIMIT (M3, RULING 109-111 report): this source-index guard bounds
//    ONLY the order of these ids as they appear in this file's JSX source
//    text. It does NOT bound the RENDERED order - a CSS `flex-direction:
//    column-reverse` or an `order` property on `.field` in page.module.css
//    (both already live idioms in that stylesheet: `order` at
//    page.module.css:6423) could invert the on-screen order with every
//    assertion here green, and nothing under vitest in this repo can see
//    that (no component is ever mounted). No such CSS exists in
//    page.module.css's `.form`/`.field` rules today - `.form` is a plain
//    flex column (page.module.css:99-103) with no `order` or
//    `column-reverse` on either selector - but this guard cannot detect one
//    being added later.
//
// 2. RULING 107 (superseded by RULING 109 below) originally required an
//    exact-key-set canary scoped to THIS ONE FILE. RULING 109 found that
//    narrowing to be the implementer's own error against DECISION 9's actual
//    wording ("that directory", "covering all of them") - the real canary is
//    directory-wide and lives in componentStorageKeys.structure.test.ts. The
//    six-key, single-file version that used to live here has been removed;
//    do not reintroduce a per-file duplicate of that canary.
//
// 3. RULING 111 - setRubricOrigin(null) must be called at both sites where
//    its sibling setSniffHint(null) already clears (the post-upload reset
//    and the catch block), so the rubric-origin caption never survives past
//    the rubric it names.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.join(process.cwd(), "src/app/components/CartridgeDropPanel.tsx"),
  "utf8"
);

// The five non-file field ids, in the order RULING 106 requires them to
// precede the file input. Order among these five is not asserted - only
// that each precedes id="cartridge-file".
const NON_FILE_FIELD_IDS = [
  "cartridge-course",
  "cartridge-assignment",
  "cartridge-points",
  "cartridge-lms",
  "cartridge-rubric",
] as const;

describe("RULING 106: all five non-file fields precede the file input in source order", () => {
  const fileIdx = SOURCE.indexOf('id="cartridge-file"');

  it("id=\"cartridge-file\" is present exactly once", () => {
    expect(fileIdx).toBeGreaterThanOrEqual(0);
    expect(SOURCE.indexOf('id="cartridge-file"', fileIdx + 1)).toBe(-1);
  });

  for (const fieldId of NON_FILE_FIELD_IDS) {
    it(`id="${fieldId}" occurs exactly once and precedes id="cartridge-file"`, () => {
      const idAttr = `id="${fieldId}"`;
      const idx = SOURCE.indexOf(idAttr);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(SOURCE.indexOf(idAttr, idx + 1)).toBe(-1);
      expect(idx).toBeLessThan(fileIdx);
    });
  }
});

// RULING 111 (docs/ruling-109-111.md). setRubricOrigin has exactly two
// occurrences in the file: the useState at :73 and the restore call at
// :136. It is never called with null anywhere, so the caption
// (`{rubricOrigin && <p>...}`, rendered directly above the file input -
// the last thing an instructor reads before the interaction that fires the
// next upload) can go on naming a course/assignment after the rubric field
// it describes has been cleared. Fix: clear it at both sites where its
// sibling setSniffHint(null) already clears - the post-upload form reset,
// and the catch block on a failed upload.
describe("RULING 111: setRubricOrigin(null) clears at both sites its sibling setSniffHint(null) clears", () => {
  // The post-upload success reset block: from the drops-list update through
  // the uploaded-event dispatch that closes the try block.
  const successStart = SOURCE.indexOf("setDrops((prev) => [drop, ...prev]);");
  const successEnd = SOURCE.indexOf(
    'window.dispatchEvent(new CustomEvent(CARTRIDGE_DROP_UPLOADED_EVENT));',
    successStart
  );

  // The catch block on a failed upload: anchored on its own unique error
  // message (never an embedded newline - this file has CRLF line endings,
  // so a two-line anchor built with a bare "\n" would silently mismatch)
  // through to the finally that closes handleFileSelect.
  const catchStart = SOURCE.indexOf('"Could not upload cartridge."');
  const catchEnd = SOURCE.indexOf("} finally {", catchStart);

  it("finds both the success-reset block and the catch block by their own anchors - a check over -1 proves nothing", () => {
    expect(successStart).toBeGreaterThan(-1);
    expect(successEnd).toBeGreaterThan(successStart);
    expect(catchStart).toBeGreaterThan(-1);
    expect(catchEnd).toBeGreaterThan(catchStart);
  });

  it("the success-reset block calls setRubricOrigin(null)", () => {
    const block = SOURCE.slice(successStart, successEnd);
    expect(block).toMatch(/setRubricOrigin\(null\);/);
  });

  it("the catch block calls setRubricOrigin(null)", () => {
    const block = SOURCE.slice(catchStart, catchEnd);
    expect(block).toMatch(/setRubricOrigin\(null\);/);
  });

  // Sabotage proof (run manually against a live mutation and observed RED;
  // see docs/ruling-109-111.md for the pasted output): with either clear
  // deleted from SOURCE, the corresponding block-scoped assertion above
  // fails. Reproduced here as a standing canary so it self-checks on every
  // run, not only the one manual pass.
  it("would fail if the success-reset clear were deleted", () => {
    const block = SOURCE.slice(successStart, successEnd).replace(/setRubricOrigin\(null\);\s*/, "");
    expect(block).not.toMatch(/setRubricOrigin\(null\);/);
  });

  it("would fail if the catch-block clear were deleted", () => {
    const block = SOURCE.slice(catchStart, catchEnd).replace(/setRubricOrigin\(null\);\s*/, "");
    expect(block).not.toMatch(/setRubricOrigin\(null\);/);
  });
});
