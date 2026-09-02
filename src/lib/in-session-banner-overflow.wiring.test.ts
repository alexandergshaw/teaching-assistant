import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// A follow-up to src/lib/in-session-banner.wiring.test.ts, same pattern for
// the same reason: InSessionBanner.tsx and InSessionBanner.module.css are
// never rendered under this repo's vitest (node-env, collects only
// src/**/*.test.ts - see docs/aesthetics-pass-acceptance-criteria.md section
// 5's "Limits"), so the overflow redesign this file pins (docs/REGRESSION.md
// entry 382's follow-up: the expanded panel now WRAPS instead of
// horizontally scrolling) is verified as SOURCE TEXT, not by rendering.
// Each assertion below was sabotage-checked by hand: the corresponding line
// was temporarily reverted/broken, this file re-run and confirmed red for
// the right reason, the source restored, and this file re-run and confirmed
// green again.
const TSX_PATH = path.resolve(process.cwd(), "src/app/components/InSessionBanner.tsx");
const CSS_PATH = path.resolve(process.cwd(), "src/app/components/InSessionBanner.module.css");
const TSX = readFileSync(TSX_PATH, "utf-8");
const CSS = readFileSync(CSS_PATH, "utf-8");

function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `expected to find a ${selector} rule`).not.toBeNull();
  return match![1];
}

describe("InSessionBanner overflow redesign: the expanded panel wraps instead of scrolling", () => {
  it(".strip is a column flex container, not a horizontally-scrolling row", () => {
    const strip = ruleBody(CSS, ".strip");
    expect(strip).toMatch(/flex-direction:\s*column/);
    expect(strip).not.toMatch(/flex-wrap:\s*nowrap/);
    expect(strip).not.toMatch(/overflow-x/);
  });

  it(".courseList and .upcomingList wrap their own chips (not nowrap)", () => {
    const courseList = ruleBody(CSS, ".courseList");
    const upcomingList = ruleBody(CSS, ".upcomingList");
    expect(courseList).toMatch(/flex-wrap:\s*wrap/);
    expect(courseList).not.toMatch(/nowrap/);
    expect(upcomingList).toMatch(/flex-wrap:\s*wrap/);
    expect(upcomingList).not.toMatch(/nowrap/);
  });

  it("the individual chip <li>s still refuse to shrink, so a wrapped row never squeezes a chip", () => {
    expect(CSS).toMatch(/\.courseList\s*>\s*li\s*\{[^}]*flex-shrink:\s*0/);
    expect(CSS).toMatch(/\.upcomingList\s*>\s*li\s*\{[^}]*flex-shrink:\s*0/);
  });

  it("the static edge fade is retired: no .stripFade rule in the stylesheet and no reference to it in the component", () => {
    expect(CSS).not.toMatch(/^\.stripFade\s*\{/m);
    expect(TSX).not.toMatch(/styles\.stripFade/);
  });

  it("scroll-padding-inline is removed from .strip now that it is not a scroll container", () => {
    const strip = ruleBody(CSS, ".strip");
    expect(strip).not.toMatch(/scroll-padding-inline/);
  });

  it("the 5px vertical focus-ring clearance on .strip survives literally, unsnapped from the space scale", () => {
    const strip = ruleBody(CSS, ".strip");
    // Must still be the literal "5px" top/bottom value, not a --space-* token.
    expect(strip).toMatch(/padding:\s*5px\s+var\(--space-6\);/);
  });

  it("the zone divider is now a horizontal rule (height, not width) so it can span a wrapped, multi-row panel", () => {
    const divider = ruleBody(CSS, ".divider");
    expect(divider).toMatch(/height:\s*1px/);
    expect(divider).not.toMatch(/width:\s*1px/);
    expect(divider).toMatch(/align-self:\s*stretch/);
  });

  it("both zones' <ul>s are still two separate lists with their own aria-labels, never merged", () => {
    expect(TSX).toMatch(/aria-label="Upcoming dates"/);
    expect(TSX).toMatch(/aria-label="Courses teaching this term"/);
  });

  it(".contentInner keeps overflow: clip (not hidden), which matters more now that the panel can be taller", () => {
    expect(CSS).toMatch(/\.contentInner\s*\{[^}]*overflow:\s*clip/);
  });
});
