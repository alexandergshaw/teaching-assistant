// AC8's derived inventory guard - docs/modal-dismissal-focus-acceptance-
// criteria.md. The scan (the tree walk, the classification predicates, the
// four allowlists, and the derived sets) lives in modalAdoptionScan.ts, a
// non-test module shared with modalAdoption.wiring.test.ts - see that
// module's header comment for the full contract of what a "dialog site" and
// "adopts" mean.
//
// THIS FILE covers the per-site ATTRIBUTE half of the split: proof that a
// hook-only C4/C5 adopter actually hand-wired the four things ModalShell
// would otherwise have done for free (ref/tabIndex/role/aria-modal/
// aria-label on the same element, none of it on the backdrop - AC8/C4 hole
// 1), and proof of what ModalShell.tsx itself renders, which every Tier 1/2
// adopter is trusting (decision 2, entry 257 check 4, AC9). The INVENTORY
// half - which files are on which list, the count pins, the wave-2/wave-3
// double-checks, and the bundle guard on modalAdoptionScan.ts - lives in
// modalAdoption.wiring.test.ts instead.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { stripComments, HOOK_ONLY_ADOPTER_SITES, analyzeHookOnlyAdopterSource } from "./modalAdoptionScan";

describe("analyzeHookOnlyAdopterSource (AC8/C4 hole 1) - proven against fixtures first, per entry 239 check 10", () => {
  const WELL_FORMED = [
    'const { containerRef } = useModalDismiss<HTMLDivElement>({ open: true, onDismiss: () => onClose() });',
    '<div onClick={() => onClose()} style={{ position: "fixed" }}>',
    '  <div onClick={(e) => e.stopPropagation()} style={{ width: 1 }} role="dialog" aria-modal="true" aria-label="Fixture dialog" tabIndex={-1} ref={containerRef}>',
    "    child",
    "  </div>",
    "</div>",
  ].join("\n");

  it("passes the well-formed shape, and derives a RENAMED ref's local name (OfficeEditorModal.tsx's shape) instead of assuming the literal string `containerRef`", () => {
    expect(analyzeHookOnlyAdopterSource(WELL_FORMED, "f.tsx").problems).toEqual([]);
    const renamed = WELL_FORMED.replace("{ containerRef }", "{ containerRef: moveSectionContainerRef }").replace("ref={containerRef}", "ref={moveSectionContainerRef}");
    expect(analyzeHookOnlyAdopterSource(renamed, "f.tsx").problems).toEqual([]);
    // Proof a hardcoded `ref={containerRef}` string search would miss this
    // element: that literal substring is absent once the ref is renamed.
    expect(renamed).not.toContain("ref={containerRef}");
  });

  it("fails, naming the concrete defect, for each of three violations a real hook-only site could ship", () => {
    const scattered = WELL_FORMED.replace(/role="dialog" aria-modal="true" aria-label="Fixture dialog" tabIndex=\{-1\} ref=\{containerRef\}/, "ref={containerRef}")
      .replace("    child", '    <div tabIndex={-1} role="dialog" aria-modal="true" aria-label="Scattered">child</div>');
    expect(analyzeHookOnlyAdopterSource(scattered, "f.tsx").problems.some((p) => p.includes("tabIndex={-1}"))).toBe(true);

    const backdropStillHasAria = WELL_FORMED.replace('style={{ position: "fixed" }}>', 'style={{ position: "fixed" }} role="dialog">');
    expect(analyzeHookOnlyAdopterSource(backdropStillHasAria, "f.tsx").problems.some((p) => p.includes("backdrop"))).toBe(true);

    const noRef = WELL_FORMED.replace(" ref={containerRef}", "");
    expect(analyzeHookOnlyAdopterSource(noRef, "f.tsx").problems.some((p) => p.includes("ref={containerRef}"))).toBe(true);
  });
});

// Deleting `ref={containerRef}` (or its renamed equivalent) from a hook-only
// adopter leaves tsc/eslint/every other test green while the trap, the
// focusin safety net and initial focus go silently dead, AND the site still
// registers in the shared LIFO stack, making every OTHER modal non-topmost.
// This block is what would catch that.
describe("AC8/C4 hole 1 - a hook-only adopter must wire FOUR things by hand, not just import the hook", () => {
  it("finds exactly the five hook-only C4 sites, derived from the tree", () => {
    expect(HOOK_ONLY_ADOPTER_SITES.length).toBe(5);
  });

  it("every hook-only adopter carries ref/tabIndex/role/aria-modal/aria-label on the SAME element the hook scopes to, and none of it on that element's backdrop", () => {
    const failing = HOOK_ONLY_ADOPTER_SITES.map((s) => analyzeHookOnlyAdopterSource(s.strippedSource, s.path))
      .filter((r) => r.problems.length > 0)
      .map((r) => `${r.path}: ${r.problems.join("; ")}`);
    expect(failing, "a hook-only adopter must hand-wire tabIndex/ref/role/aria-modal/aria-label onto the SAME element, none on its backdrop").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Decision 2 / entry 257 check 4 / AC9 - what every one of the adopters in
// modalAdoption.wiring.test.ts's inventory is trusting ModalShell.tsx to
// actually render. No test in this repo reads ModalShell.tsx's own source
// besides this block, and generatedPreviewModal.wiring.test.ts:353-355
// accepts `<ModalShell` as a SUBSTITUTE for its own previewBackdrop/
// previewModal class check without ever verifying what the shell renders -
// these assertions are what makes that substitution honest instead of a
// blind trust.
//
// WHAT SOURCE-TEXT READING CAN AND CANNOT PROVE (per this repo's stated
// limits - vitest is node-env and renders no component): these assertions
// prove that ModalShell.tsx's JSX literally opens `.previewBackdrop` before
// `.previewModal`, with no other element's opening tag textually between
// them, and that `role="dialog"`/`aria-modal`/`aria-label` appear only after
// the content section opens, not on the backdrop. They do NOT prove a
// browser actually paints two nested boxes, that CSS custom-property
// inheritance really reaches GradingResults's navy pane the way entry 257
// check 4 assumes, or that conditional JSX evaluated only in some prop
// combination could not insert a wrapper this literal, line-based read
// would not distinguish from a sibling. Reading is the only tool available
// here; this is what it is honest to claim from it.
// ---------------------------------------------------------------------------

const MODAL_SHELL_PATH = join(process.cwd(), "src/app/components/ui/ModalShell.tsx");
const modalShellSource = stripComments(readFileSync(MODAL_SHELL_PATH, "utf8"));

describe("ModalShell.tsx renders what every adopter depends on (decision 2, entry 257 check 4, AC9)", () => {
  it("renders styles.previewBackdrop and styles.previewModal, backdrop first", () => {
    const backdropIndex = modalShellSource.indexOf("styles.previewBackdrop");
    const modalIndex = modalShellSource.indexOf("styles.previewModal");
    expect(backdropIndex, "ModalShell.tsx no longer renders styles.previewBackdrop at all").toBeGreaterThanOrEqual(0);
    expect(modalIndex, "ModalShell.tsx no longer renders styles.previewModal at all").toBeGreaterThanOrEqual(0);
    expect(
      backdropIndex,
      "styles.previewModal must appear textually after styles.previewBackdrop - the content nests inside the backdrop, not the reverse",
    ).toBeLessThan(modalIndex);
  });

  it("opens no element between the backdrop's opening tag and the content section's opening tag", () => {
    const backdropOpen = modalShellSource.indexOf("<div");
    expect(backdropOpen, "ModalShell.tsx no longer opens a <div> at all").toBeGreaterThanOrEqual(0);
    const backdropTagEnd = modalShellSource.indexOf(">", backdropOpen);
    const sectionOpen = modalShellSource.indexOf("<section", backdropTagEnd);
    expect(sectionOpen, "ModalShell.tsx no longer opens a <section> after its backdrop div").toBeGreaterThan(backdropTagEnd);
    const between = modalShellSource.slice(backdropTagEnd + 1, sectionOpen);
    expect(
      between.trim(),
      "an element was introduced between .previewBackdrop and .previewModal - decision 2 requires nothing between them, or entry 257 check 4's focus-ring inheritance into GradingResults silently breaks",
    ).toBe("");
  });

  it('puts role="dialog", aria-modal and the accessible name on the content section, not the backdrop', () => {
    const backdropOpen = modalShellSource.indexOf("<div");
    const sectionOpen = modalShellSource.indexOf("<section");
    expect(sectionOpen).toBeGreaterThan(backdropOpen);
    const backdropTag = modalShellSource.slice(backdropOpen, sectionOpen);
    const fromSectionOpen = modalShellSource.slice(sectionOpen);
    expect(
      backdropTag,
      "role, aria-modal or aria-label found on the backdrop div - decision 3 requires them on the content element only",
    ).not.toMatch(/role=|aria-modal|aria-label/);
    expect(fromSectionOpen, 'the content section must carry role="dialog"').toContain('role="dialog"');
    expect(fromSectionOpen, "the content section must carry aria-modal").toContain("aria-modal");
    expect(fromSectionOpen, "the content section must carry the accessible name (aria-label)").toContain("aria-label");
  });
});
