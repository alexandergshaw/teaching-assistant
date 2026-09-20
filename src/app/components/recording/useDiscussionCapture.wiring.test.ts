import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// A20 (docs/a20-scope.md AC5, RULING M1/Y3/W3/W5): this file did not exist
// before A20 - useDiscussionCapture.ts is a hook this repo's node-env vitest
// never renders, so the only way to check "the auto-download call exists
// exactly once, inside the mounted branch, guarded correctly, and never
// fires post-unmount" is a source-text slice, mirroring the already-shipped
// idiom at repoGrades.wiring.test.ts (slicing a handler's body between two
// literal anchors, then `toContain`/count on the slice).
//
// This is ALSO the removal test for A20's own leverage claim (Section 1 of
// the scope doc): the claim is "the download call exists, fires exactly
// once, only when requested, only while mounted" - a source-text fact, not
// an unobservable click. Delete the `triggerFileDownload(...)` call and
// assertion 3 below (the "exactly once" count) goes from 1 to 0 - RED.

const SOURCE_PATH = path.join(process.cwd(), "src/app/components/recording/useDiscussionCapture.ts");
const source = fs.readFileSync(SOURCE_PATH, "utf8");

describe("useDiscussionCapture.ts - A20's auto-download call, pinned by anchor-sliced source text (AC5)", () => {
  // Both outer anchors must resolve BEFORE anything below reads the slice -
  // an unresolved indexOf gives -1, and slice(x, -1) silently widens to
  // nearly the whole file rather than failing loudly (RULING W5).
  const outerStart = source.indexOf("onstop = () => {");
  const outerEnd = source.indexOf("recorder.start();", outerStart);

  it("assertion 1 (anchor resolves): finds recorder.onstop's opening brace", () => {
    expect(outerStart, "expected to find recorder.onstop's opening brace").toBeGreaterThan(-1);
  });

  it("assertion 2 (anchor resolves): finds recorder.start(); after onstop's opening brace", () => {
    expect(outerEnd, "expected to find recorder.start(); after onstop's opening brace").toBeGreaterThan(outerStart);
  });

  const outerSlice = outerStart > -1 && outerEnd > outerStart ? source.slice(outerStart, outerEnd) : "";

  it("assertion 3 (removal test): triggerFileDownload( appears exactly once inside recorder.onstop", () => {
    const matches = outerSlice.match(/triggerFileDownload\(/g) ?? [];
    expect(matches.length).toBe(1);
  });

  // RULING W3's replacement for round 2's unbuildable (b)/(c): slice the
  // outer body by ITS OWN literal anchors to isolate just the mounted
  // branch, rather than reasoning about brace-matching or an enclosing `if`.
  const mountedStart = outerSlice.indexOf("if (mountedRef.current) {");
  const mountedEnd = outerSlice.indexOf("} else {", mountedStart);

  it("assertion 3 (anchor resolves, mounted sub-slice): finds if (mountedRef.current) {", () => {
    expect(mountedStart, "expected to find if (mountedRef.current) { inside recorder.onstop").toBeGreaterThan(-1);
  });

  it("assertion 4 (anchor resolves, mounted sub-slice): finds } else { after the mounted branch opens", () => {
    expect(mountedEnd, "expected to find } else { after if (mountedRef.current) {").toBeGreaterThan(mountedStart);
  });

  const mountedSlice = mountedStart > -1 && mountedEnd > mountedStart ? outerSlice.slice(mountedStart, mountedEnd) : "";
  const outsideMounted = mountedStart > -1 ? outerSlice.slice(0, mountedStart) + outerSlice.slice(mountedEnd) : outerSlice;

  it("assertion 5: triggerFileDownload( occurs exactly once inside the mounted branch and zero times outside it", () => {
    const insideMatches = mountedSlice.match(/triggerFileDownload\(/g) ?? [];
    const outsideMatches = outsideMounted.match(/triggerFileDownload\(/g) ?? [];
    expect(insideMatches.length).toBe(1);
    expect(outsideMatches.length).toBe(0);
  });

  it("assertion 6: opts.autoDownload guards the triggerFileDownload call specifically - not merely present ANYWHERE in the mounted branch (setLastSessionAutoDownload(opts.autoDownload) also contains that text and must not satisfy this alone)", () => {
    const guardIdx = mountedSlice.indexOf("if (opts.autoDownload)");
    expect(guardIdx, "expected an if (opts.autoDownload) guard inside the mounted branch").toBeGreaterThan(-1);
    const guardBlockEnd = mountedSlice.indexOf("}", guardIdx);
    expect(guardBlockEnd).toBeGreaterThan(guardIdx);
    const guardedBody = mountedSlice.slice(guardIdx, guardBlockEnd);
    expect(guardedBody).toContain("triggerFileDownload(");
  });

  // RULING M-F: downloadFileNameBase must be READ (not merely declared) in
  // the same mounted sub-slice that computes the auto-download filename -
  // dropping the argument at a call site would otherwise silently produce
  // "recording.<ext>" instead of the pinned per-surface stem, for the same
  // blob the manual link names correctly.
  it("A20/AC6 (M-F): downloadFileNameBase is read inside the mounted branch's filename expression", () => {
    expect(mountedSlice).toMatch(/opts\.downloadFileNameBase/);
  });

  it("the call uses videoExtensionFromMimeType on the resolved mime type, not a hardcoded extension", () => {
    expect(mountedSlice).toMatch(/videoExtensionFromMimeType\(resolvedMimeType\)/);
  });
});
