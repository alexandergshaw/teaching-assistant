// Source-text pins for WALKTHROUGH-OVERHAUL S2 (one shared row for the two
// selects) and M8 (scroll the drafted slot into view on the generate edge).
// docs/walkthrough-overhaul-s2-m8-test-notes.md sections 2 and 3.B. Nothing
// renders under vitest, so the viewport movement itself is an owner-walk item.
//
// Frozen counts: A1 pins ONE styles.adaptRow and W2 pins ONE useEffect in this
// file. A later legitimate second row/effect bumps the count in the same
// commit and names the new one here.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(path.join(__dirname, "AnnouncementDraftSlot.tsx"), "utf8");

describe("S2: both selects share ONE styles.adaptRow", () => {
  const idxF = src.indexOf('label="Format to match"');
  const idxW = src.indexOf('label="Written for"');
  const idxRow = src.indexOf("styles.adaptRow");

  it("anchors resolve", () => {
    expect(idxF).toBeGreaterThan(-1);
    expect(idxW).toBeGreaterThan(-1);
  });
  it("A1: exactly one styles.adaptRow", () => {
    expect(src.split("styles.adaptRow").length - 1).toBe(1);
  });
  it("A2: the row opens before both selects", () => {
    expect(idxRow).toBeGreaterThan(-1);
    expect(idxRow).toBeLessThan(idxF);
    expect(idxRow).toBeLessThan(idxW);
  });
  it("A3: no </div> between the two selects", () => {
    expect(src.slice(Math.min(idxF, idxW), Math.max(idxF, idxW))).not.toContain("</div>");
  });
});

describe("M8: scroll gated inside one effect on the phase edge", () => {
  const idxEffect = src.indexOf("useEffect(");
  const idxReturn = src.indexOf("\n  return (");
  it("anchors resolve", () => {
    expect(idxEffect).toBeGreaterThan(-1);
    expect(idxReturn).toBeGreaterThan(idxEffect);
  });
  const win = idxEffect > -1 && idxReturn > idxEffect ? src.slice(idxEffect, idxReturn) : "";

  it("W1: routes through the pure gate and scrollIntoView", () => {
    expect(src).toContain("shouldScrollDraftIntoView");
    expect(src).toContain("scrollIntoView");
  });
  it("W2: exactly one useEffect, gate and scroll both inside its window", () => {
    expect(src.split("useEffect(").length - 1).toBe(1);
    const g = src.indexOf("shouldScrollDraftIntoView(");
    const s = src.indexOf("scrollIntoView(");
    expect(g).toBeGreaterThan(idxEffect);
    expect(g).toBeLessThan(idxReturn);
    expect(s).toBeGreaterThan(idxEffect);
    expect(s).toBeLessThan(idxReturn);
  });
  it("W3: scrollIntoView is called on a ref's .current", () => {
    expect(win).toMatch(/\.current\??\.scrollIntoView\(/);
  });
  it("W4: block nearest, no smooth behavior", () => {
    expect(win).toContain('block: "nearest"');
    expect(win).not.toMatch(/behavior:\s*"smooth"/);
  });
  it("W5: no focus move", () => {
    expect(win).not.toContain(".focus(");
  });
  it("W6: the EFFECT'S OWN closing dep array contains phase", () => {
    // Scoped to the first `}, [...]);` AFTER the useEffect( opens, i.e. the
    // effect's own dep array. The sibling useMemo (before the effect) has
    // `}, [phase, slot.draft])` and must not be able to satisfy this.
    const m = /^\s*\}, \[([^\]]*)\]\);/m.exec(src.slice(idxEffect));
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/\bphase\b/);
  });
  it("W7: the prev-phase advance is present in the effect", () => {
    expect(win).toMatch(/prevPhaseRef\.current\s*=\s*phase/);
  });
});

// WA-POST-LOCK W1 (docs/wa-post-lock-w1-test-notes.md AC-8..AC-11). Source
// pins only - nothing renders, so the rendered disabled state, the announced
// hint and focus are owner-walk items.
describe("WA-POST-LOCK: Post control and hint", () => {
  const postStart = src.indexOf('idleLabel={isScheduled ? "Schedule post"');
  const postEnd = src.indexOf("onArm={() => onPostArm(slot.id)}");
  const postSlice = postStart > -1 && postEnd > postStart ? src.slice(postStart, postEnd) : "";

  it("AC-8: anchors resolve", () => {
    expect(postStart).toBeGreaterThan(-1);
    expect(postEnd).toBeGreaterThan(postStart);
  });
  it("AC-8: Post disabled= reads slot.postLocked and keeps the four existing conditions", () => {
    expect(postSlice).toContain("slot.postLocked");
    expect(postSlice).toContain("!courseName");
    expect(postSlice).toContain(".title.trim()");
    expect(postSlice).toContain(".message.trim()");
    expect(postSlice).toContain('visibility.kind === "invalid"');
  });

  const regenStart = src.indexOf('idleLabel="Regenerate"');
  const regenEnd = src.indexOf('<Button size="small" variant="outlined" onClick={() => onCopy');
  const regenSlice = regenStart > -1 && regenEnd > regenStart ? src.slice(regenStart, regenEnd) : "";

  it("AC-9: Regenerate block is non-empty and never mentions postLocked", () => {
    expect(regenStart).toBeGreaterThan(-1);
    expect(regenEnd).toBeGreaterThan(regenStart);
    expect(regenSlice.length).toBeGreaterThan(0);
    expect(regenSlice).not.toContain("postLocked");
  });

  it("AC-10: both Post handlers are present", () => {
    expect(src).toContain("onArm={() => onPostArm(slot.id)}");
    expect(src).toContain("onConfirm={() => onPostArm(slot.id)}");
  });

  it("AC-11: the already-posted hint is a sibling opening after the postedTo block closes", () => {
    const postedStart = src.indexOf("{slot.postedTo && (");
    const postedEnd = src.indexOf(")}", postedStart);
    const hintIdx = src.indexOf("slot.postLocked && (");
    expect(postedStart).toBeGreaterThan(-1);
    expect(postedEnd).toBeGreaterThan(postedStart);
    expect(hintIdx).toBeGreaterThan(-1);
    expect(hintIdx).toBeGreaterThan(postedEnd);
  });
});
