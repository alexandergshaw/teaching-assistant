// CourseItemRow - structural/wiring guard, mirroring
// courseItemsView.wiring.test.ts's own idiom for the same reason: vitest here
// is node-env and collects only src/**/*.test.ts, so nothing in this suite is
// ever rendered - this file reads CourseItemRow.tsx as TEXT. What is pinned
// below is FACTS and ORDERING (a branch is gated on this condition, two
// labels render distinct visible text) - never exact prose spelling, per this
// repo's own source-text-tests-overspecify note.
//
// These assertions used to live in courseItemsView.wiring.test.ts, reading
// CourseItemsView.tsx directly - they moved here when the per-row JSX was
// extracted into its own component (see CourseItemRow.tsx's own header for
// why: CourseItemsView.tsx was approaching this repo's 1000-line ceiling).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROW_PATH = join(process.cwd(), "src/app/components/content-tab/CourseItemRow.tsx");
const rowSource = readFileSync(ROW_PATH, "utf8");

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const stripped = stripComments(rowSource);

describe("exports the CourseItemRow component with its documented props", () => {
  it("exports CourseItemRowProps and a CourseItemRow function component", () => {
    expect(stripped).toMatch(/export interface CourseItemRowProps \{/);
    expect(stripped).toMatch(/export function CourseItemRow\(/);
  });
});

describe("New Quiz routing and labelling (D1, C2/C4, finding 6)", () => {
  // BUG FIX (live report 2026-08-22): a New Quiz row can now legitimately
  // appear in EITHER tab (bulk.ts's Assignment branch no longer excludes it),
  // so the label must fire on `isNewQuiz` alone - this component is not even
  // given the tab's own `kind`, so there is no `kind` left to gate on at all.
  it("labels a New Quiz row gated on item.isNewQuiz alone, regardless of label casing", () => {
    const guardMarker = "item.isNewQuiz && (";
    const guardStart = stripped.indexOf(guardMarker);
    expect(guardStart, "no item.isNewQuiz gated block found").toBeGreaterThan(-1);
    const blockEnd = stripped.indexOf(")}", guardStart);
    expect(blockEnd).toBeGreaterThan(guardStart);
    const guardBlock = stripped.slice(guardStart, blockEnd);
    const childrenPart = guardBlock.slice(guardMarker.length);
    expect(childrenPart).toMatch(/new\s*quiz/i);
  });

  it("labels a classic-quiz-shadow row and a graded-discussion-shadow row, each with their own guard and their own distinct VISIBLE label text", () => {
    function visibleSpanText(guardMarker: string): string {
      const start = stripped.indexOf(guardMarker);
      expect(start, `${guardMarker} gated block not found`).toBeGreaterThan(-1);
      const end = stripped.indexOf(")}", start);
      const block = stripped.slice(start, end);
      const spanOpenEnd = block.indexOf(">", block.indexOf("<span"));
      const spanCloseStart = block.indexOf("</span>");
      expect(spanOpenEnd).toBeGreaterThan(-1);
      expect(spanCloseStart).toBeGreaterThan(spanOpenEnd);
      return block.slice(spanOpenEnd + 1, spanCloseStart).trim();
    }

    const quizShadowText = visibleSpanText("item.isClassicQuizShadow && (");
    const discussionShadowText = visibleSpanText("item.isGradedDiscussionShadow && (");

    expect(quizShadowText).not.toBe(discussionShadowText);
    expect(quizShadowText).toMatch(/quiz/i);
    expect(discussionShadowText).toMatch(/discussion/i);
  });
});

describe("module column (A2/A3/A4/NIT11): the row distinguishes all four outcomes", () => {
  it("the unknown case and the no-module case are gated by two SEPARATE conditions, not one combined `||`", () => {
    const idx = stripped.indexOf("const moduleCell = !moduleInfo.known");
    expect(idx, "moduleCell computation not found").toBeGreaterThan(-1);
    const end = stripped.indexOf("return (", idx);
    const body = stripped.slice(idx, end);
    expect(body).not.toMatch(/!moduleInfo\.known\s*\|\|/);
    expect(body).toMatch(/!moduleInfo\.known/);
    expect(body).toMatch(/moduleInfo\.names\.length === 0/);
    expect(body).toMatch(/moduleInfo\.names\.join\(", "\)/);
    // NIT11: within the `!moduleInfo.known` branch, a SEPARATE condition
    // (moduleIndexFailed) distinguishes "still loading" from "genuinely
    // failed".
    expect(body).toMatch(/moduleIndexFailed/);
    // Three distinct rendered `text` literals - none may render the same
    // literal string as another, which would silently conflate two different
    // facts.
    const texts = [...body.matchAll(/text:\s*"([^"]*)"/g)].map((m) => m[1]);
    expect(texts.length).toBe(3);
    expect(new Set(texts).size).toBe(3);
  });

  it("the module cell's computed text and tooltip actually reach a rendered element inside a <span>, not a discarded local", () => {
    const idx = stripped.indexOf("const moduleCell = !moduleInfo.known");
    expect(idx).toBeGreaterThan(-1);
    const body = stripped.slice(idx);
    expect(body).toMatch(/\{moduleCell\.text\}/);
    expect(body).toMatch(/title=\{moduleCell\.title\}/);
    const textIdx = body.indexOf("{moduleCell.text}");
    const precedingSpanOpen = body.lastIndexOf("<span", textIdx);
    const precedingSpanClose = body.lastIndexOf("</span>", textIdx);
    expect(precedingSpanOpen).toBeGreaterThan(-1);
    expect(precedingSpanOpen).toBeGreaterThan(precedingSpanClose);
  });
});
