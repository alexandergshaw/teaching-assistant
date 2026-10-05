// WA-DRAFT-LOSS AC-A3 / AC-A4: source pins that the beforeunload predicate is
// actually wired to the browser event (the reachability layer). Nothing renders
// under vitest, so the real prompt is owner-walk R-WA-DL-1.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const raw = fs.readFileSync(path.join(__dirname, "WalkthroughAnnouncementPanel.tsx"), "utf8");
const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function effectContaining(needle: string): string {
  const at = src.indexOf(needle);
  expect(at).toBeGreaterThan(-1);
  const start = src.lastIndexOf("useEffect(", at);
  const end = src.indexOf("\n  }, [", at);
  const close = src.indexOf("]);", end);
  return src.slice(start, close + 3);
}

describe("WA-DRAFT-LOSS: beforeunload wiring", () => {
  it("A3: calls shouldWarnBeforeUnload with an argument object that includes slots", () => {
    expect(src).toMatch(/shouldWarnBeforeUnload\(\{[^}]*\bslots\b(?!\s*:)[^}]*\}\)/);
  });
  it("A3: exactly one add and one remove of beforeunload", () => {
    expect(src.split('addEventListener("beforeunload"').length - 1).toBe(1);
    expect(src.split('removeEventListener("beforeunload"').length - 1).toBe(1);
  });
  it("A3: add, remove and the predicate share ONE effect; the old inline gate is gone", () => {
    const eff = effectContaining('addEventListener("beforeunload"');
    expect(eff).toContain('removeEventListener("beforeunload"');
    expect(eff).toContain("shouldWarnBeforeUnload(");
    expect(eff).not.toContain("capturing || pendingFrames > 0");
    expect(src).not.toContain("capturing || pendingFrames > 0");
  });
  it("A4: the cleanup is returned and the dependency array lists everything the predicate reads", () => {
    const eff = effectContaining('addEventListener("beforeunload"');
    expect(eff).toMatch(/return \(\) => window\.removeEventListener\("beforeunload"/);
    expect(eff).toMatch(/\}, \[capturing, pendingFrames, slots\]\);$/);
  });
  it("A3: the effect sits below the slots declaration", () => {
    expect(src.indexOf("useAnnouncementDraftSlots({")).toBeLessThan(src.indexOf('addEventListener("beforeunload"'));
  });
});
