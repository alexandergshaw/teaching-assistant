import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isValidElement } from "react";
import { renderInline } from "./LecturePlanPreviewModal";

describe("lesson plan preview tabs", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

  it("connects lecture plan tabs to the matching panel without replacing the editing controls", () => {
    const modal = read("./LecturePlanPreviewModal.tsx");
    expect(modal).toContain('<Tabs value={activeTab} onChange={(_, tab: PreviewTab) => setActiveTab(tab)}');
    expect(modal).toContain('aria-controls={`${tabsId}-panel-${tab.id}`}');
    expect(modal).toContain('id={`${tabsId}-tab-${tab.id}`}');
    expect(modal).toContain('role="tabpanel" hidden id={`${tabsId}-panel-${tab.id}`} aria-labelledby={`${tabsId}-tab-${tab.id}`}');
    expect(modal).toContain('role="tabpanel" id={`${tabsId}-panel-${activeTab}`} aria-labelledby={`${tabsId}-tab-${activeTab}`}');
    expect(modal).toContain('onClick={activeTab === "slides" ? handleReviseSlides : handleReviseProse}');
  });

  it("uses the same tab IDs in the inline preview selector and its five content panels", () => {
    const strip = read("./lesson-plan/LessonPlanPreviewTabs.tsx");
    const preview = read("./lesson-plan/index.tsx");
    expect(strip).toContain('<Tabs value={previewTab} onChange={(_, tab: PreviewTab) => onTabChange(tab)}');
    expect(strip).toContain('id={`${tabsId}-tab-${id}`} aria-controls={`${tabsId}-panel-${id}`}');
    expect(preview).toContain('tabsId={tabsId}');
    expect(preview).toContain('role="tabpanel" hidden id={`${tabsId}-panel-${id}`} aria-labelledby={`${tabsId}-tab-${id}`}');
    expect(preview).toContain('role="tabpanel" id={`${tabsId}-panel-${previewTab}`} aria-labelledby={`${tabsId}-tab-${previewTab}`}');
    for (const tab of ["intro", "slides", "examples", "assignment", "rubric"]) {
      expect(strip).toContain(`id: "${tab}"`);
      expect(preview).toContain(`previewTab === "${tab}"`);
    }
  });
});

// Entry 159 AC1.1 / loose end: renderInline carried the SAME greedy bare-URL
// regex docx-blocks.ts's INLINE_LINK_RE had before entry 159 AC1 fixed it -
// the last instance of that class. It only affects the in-app deck preview
// (never a generated document), but the fix is the identical trailing-
// punctuation stop docx-blocks.ts already uses. renderInline returns a
// ReactNode array (plain strings and <a> elements) rather than a token list,
// so these tests inspect that array directly - no @testing-library/react
// render needed for a pure text -> ReactNode function.

/** Flattens a renderInline() result into a list of { text, isLink } segments
 * so tests can assert on link boundaries without repeating the same
 * isValidElement/props plumbing in every case. */
function segments(nodes: ReturnType<typeof renderInline>): Array<{ text: string; isLink: boolean }> {
  const arr = Array.isArray(nodes) ? nodes : [nodes];
  return arr
    .map((node) => {
      if (isValidElement(node)) {
        const props = node.props as { href: string; children: string };
        expect(node.type).toBe("a");
        expect(props.children).toBe(props.href); // display text always equals the target
        return { text: props.href, isLink: true };
      }
      return { text: String(node), isLink: false };
    })
    // String.split's capturing-group form emits an empty leading/trailing
    // string when a match starts at position 0 or runs to the string's end
    // (a plain JS artifact, not something a fix here changes) - React itself
    // renders "" as nothing, so filtering it out here matches what a reader
    // of the rendered output would actually see, rather than making every
    // boundary-matching test case account for a segment nobody sees.
    .filter((s) => s.isLink || s.text !== "");
}

describe("renderInline", () => {
  it("renders a bare URL with no surrounding punctuation as a single link", () => {
    const segs = segments(renderInline("Visit https://example.com/page for more."));
    expect(segs).toEqual([
      { text: "Visit ", isLink: false },
      { text: "https://example.com/page", isLink: true },
      { text: " for more.", isLink: false },
    ]);
  });

  it("does not swallow a trailing period into the link (the exact reported defect)", () => {
    const segs = segments(renderInline("See https://academy.asana.com/. Next sentence."));
    expect(segs).toEqual([
      { text: "See ", isLink: false },
      { text: "https://academy.asana.com/", isLink: true },
      { text: ". Next sentence.", isLink: false },
    ]);
  });

  it("does not swallow a trailing comma into the link", () => {
    const segs = segments(renderInline("Try https://help.miro.com/, then stop."));
    expect(segs).toEqual([
      { text: "Try ", isLink: false },
      { text: "https://help.miro.com/", isLink: true },
      { text: ", then stop.", isLink: false },
    ]);
  });

  it("stops before an unbalanced closing paren and before a trailing semicolon in the same line", () => {
    const segs = segments(
      renderInline("Paren (https://openstax.org/) and semi https://ocw.mit.edu/; done.")
    );
    expect(segs).toEqual([
      { text: "Paren (", isLink: false },
      { text: "https://openstax.org/", isLink: true },
      { text: ") and semi ", isLink: false },
      { text: "https://ocw.mit.edu/", isLink: true },
      { text: "; done.", isLink: false },
    ]);
  });

  it("keeps a deep path in full when nothing follows it", () => {
    const segs = segments(renderInline("https://www.pmi.org/learning/library"));
    expect(segs).toEqual([{ text: "https://www.pmi.org/learning/library", isLink: true }]);
  });

  it("keeps a query string intact, only splitting off a genuine trailing punctuation mark", () => {
    const segs = segments(renderInline("Read https://x.com/a?b=c&d=e! Great."));
    expect(segs).toEqual([
      { text: "Read ", isLink: false },
      { text: "https://x.com/a?b=c&d=e", isLink: true },
      { text: "! Great.", isLink: false },
    ]);
  });

  it("renders plain text with no URL as a single non-link segment", () => {
    const segs = segments(renderInline("Just plain text, no links here."));
    expect(segs).toEqual([{ text: "Just plain text, no links here.", isLink: false }]);
  });

  // SABOTAGE CHECK (confirmed by hand): reverting the regex to the old greedy
  // form `/(https?:\/\/[^\s)]+)/g` makes the "does not swallow a trailing
  // period" test above fail - the link segment becomes
  // "https://academy.asana.com/." (period included) and the following text
  // segment becomes " Next sentence." (missing its leading ". "), so the
  // `toEqual` assertion no longer matches. This proves the test actually
  // exercises the fix rather than passing regardless of it.
});
