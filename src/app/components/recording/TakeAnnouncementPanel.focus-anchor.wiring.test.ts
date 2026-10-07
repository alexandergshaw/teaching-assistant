import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// M-focus pin for the announcement-view chat-mimic restyle. Focus-on-open is
// anchored to the panel heading: headingRef.current?.focus() fires on mount and
// on the posted transition, and silently no-ops if the heading is dropped or
// loses tabIndex={-1}. Nothing renders under vitest, so this source-text pin is
// the only guard. Comment-stripped so a comment cannot satisfy a check.

const PANEL = join(__dirname, "TakeAnnouncementPanel.tsx");

function withoutLineComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n\r]*/g, "");
}

const src = withoutLineComments(readFileSync(PANEL, "utf8"));

// Every <h2 ...> opening tag in the file that carries ref={headingRef}.
const headingTags = src.match(/<h[1-6]\b[^>]*>/g)?.filter((t) => t.includes("ref={headingRef}")) ?? [];

describe("TakeAnnouncementPanel focus anchor (M-focus)", () => {
  it("still declares headingRef", () => {
    expect(src).toMatch(/const headingRef = useRef<HTMLHeadingElement>\(null\)/);
  });

  it("still focuses it on mount and on the posted transition (both sites)", () => {
    expect(src.match(/headingRef\.current\?\.focus\(\)/g)?.length).toBe(2);
    expect(src).toMatch(/if \(posted\) headingRef\.current\?\.focus\(\)/);
  });

  it("a heading element carries ref={headingRef} AND tabIndex={-1} in BOTH return branches", () => {
    expect(headingTags.length).toBe(2);
    for (const tag of headingTags) {
      expect(tag).toContain("tabIndex={-1}");
    }
  });

  it("one anchor heading sits in the posted branch and one in the main branch", () => {
    const postedBranch = src.slice(src.indexOf("if (posted) {"), src.indexOf("const busy ="));
    const mainBranch = src.slice(src.indexOf("const busy ="));
    expect(postedBranch).toMatch(/<h2[^>]*ref=\{headingRef\}[^>]*tabIndex=\{-1\}/);
    expect(mainBranch).toMatch(/<h2[^>]*ref=\{headingRef\}[^>]*tabIndex=\{-1\}/);
  });
});
