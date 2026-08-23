// Source-text guard for the "Use Canvas discussion checkpoints" checkbox
// (step-10 fixer round, frozen contract) - vitest here is node-env and
// renders no component (this file's own sibling header comments state the
// same limit repeatedly), so this reads GenerateFromSelectionSection.tsx as
// TEXT, the same idiom generatedPreviewModal.wiring.test.ts already uses for
// this exact file.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SECTION_PATH = join(process.cwd(), "src/app/components/content-tab/modules/GenerateFromSelectionSection.tsx");
const source = readFileSync(SECTION_PATH, "utf8");

describe("GenerateFromSelectionSection - checkpoints checkbox", () => {
  it("declares useDiscussionCheckpoints/onUseDiscussionCheckpointsChange on its props interface", () => {
    expect(source).toMatch(/useDiscussionCheckpoints:\s*boolean/);
    expect(source).toMatch(/onUseDiscussionCheckpointsChange:\s*\(checked:\s*boolean\)\s*=>\s*void/);
  });

  it("SABOTAGE TARGET: is gated on introDiscussion being an offerable kind, mirroring the deck/script picker precedent", () => {
    // Pins the FACT (a boolean derived from `kinds.some(...)` testing
    // `.id === "introDiscussion"`) and the ORDERING (that boolean is declared
    // before it gates the checkbox's JSX block) - not the exact spelling.
    // Step-10 finding 3c: the previous regex pinned the arrow param's name
    // ("k"), its parenthesization, and its exact inline spacing, so a
    // behaviour-preserving reformat (renaming the param, or Prettier
    // reflowing the line) would break it despite nothing behavioural
    // changing - this repo has been bitten by exactly this twice already.
    const declMatch = source.match(
      /const\s+offersIntroDiscussion\s*=\s*kinds\.some\(\s*\(?(\w+)\)?\s*=>\s*\1\.id\s*===\s*["']introDiscussion["']\s*\)/
    );
    expect(declMatch).not.toBeNull();

    const gateMatch = source.match(/\{\s*offersIntroDiscussion\s*&&/);
    expect(gateMatch).not.toBeNull();

    // Ordering: the boolean must be declared before it gates the JSX.
    expect(declMatch!.index!).toBeLessThan(gateMatch!.index!);
  });

  it("renders a Checkbox bound to the checked/onChange props, disabled while busy - the same busy-gating every other control here uses", () => {
    expect(source).toMatch(/checked=\{useDiscussionCheckpoints\}/);
    // Pins the FACT that the handler forwards the native checkbox's
    // `.target.checked` to `onUseDiscussionCheckpointsChange`, not the exact
    // spelling of the event parameter's name (step-10 finding 3c).
    expect(source).toMatch(/onChange=\{\(?(\w+)\)?\s*=>\s*onUseDiscussionCheckpointsChange\(\s*\1\.target\.checked\s*\)\s*\}/);
    expect(source).toMatch(/disabled=\{busy !== ""\}/);
  });

  it("the tooltip states the Canvas admin requirement and what leaving it off does", () => {
    const titleMatch = source.match(/label="Use Canvas discussion checkpoints"[\s\S]*?title="([^"]+)"/);
    expect(titleMatch).not.toBeNull();
    const tooltip = titleMatch![1].toLowerCase();
    expect(tooltip).toContain("canvas admin");
    expect(tooltip).toContain("discussion checkpoints");
    expect(tooltip).toContain("normal graded discussion");
    expect(tooltip).toContain("one due date");
  });
});
