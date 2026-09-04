import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// docs/message-replies-acceptance-criteria.md M11/M12/M13 (sections 6-7):
// the sign-off and instructor-name fields with their exact labels, the
// skip-answered and "Show the whole thread" checkboxes, and the two
// deliberate ABSENCES from the discussion sibling this file's own header
// documents - no audience toggle (M10's fixed one-to-one register) and no
// Resources fieldset (section 0 drops the resource lane entirely).

const SOURCE_PATH = path.join(process.cwd(), "src/app/components/message-replies/MessageCaptureSettings.tsx");
const source = fs.readFileSync(SOURCE_PATH, "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("MessageCaptureSettings.tsx - M11's sign-off/instructor-name fields and M12/M13's checkboxes, pinned as source text", () => {
  const stripped = stripComments(source);

  it('M11: "Sign off with" TextField, size="small", placeholder "Best, Dr. Ruiz", bound to signoff/setSignoff', () => {
    const idx = stripped.indexOf('label="Sign off with"');
    expect(idx).toBeGreaterThan(-1);
    const tag = stripped.slice(stripped.lastIndexOf("<TextField", idx), idx + 300);
    expect(tag).toMatch(/size="small"/);
    expect(tag).toMatch(/placeholder="Best, Dr\. Ruiz"/);
    expect(tag).toMatch(/value=\{signoff\}/);
    expect(tag).toMatch(/onChange=\{\(e\) => setSignoff\(e\.target\.value\)\}/);
  });

  it('M11: the instructor-name field sits BESIDE the sign-off field (same .adaptRow), labelled "Your name in Canvas"', () => {
    const signoffIdx = stripped.indexOf('label="Sign off with"');
    const nameIdx = stripped.indexOf('label="Your name in Canvas"');
    expect(nameIdx).toBeGreaterThan(signoffIdx);
    // Both fields sit inside the SAME styles.adaptRow wrapper: no second
    // opening `<div className={styles.adaptRow}>` between them.
    const between = stripped.slice(signoffIdx, nameIdx);
    expect(between).not.toMatch(/className=\{styles\.adaptRow\}/);
  });

  it('M12: "Skip answered threads" checkbox is bound to skipAnswered/setSkipAnswered', () => {
    const idx = stripped.indexOf("Skip answered threads");
    const block = stripped.slice(Math.max(0, idx - 400), idx);
    expect(block).toMatch(/checked=\{skipAnswered\}/);
    expect(block).toMatch(/onChange=\{\(e\) => setSkipAnswered\(e\.target\.checked\)\}/);
  });

  it('M13: "Show the whole thread" checkbox is bound to threadExpand/setThreadExpand, and sits in the SAME row as skip-answered', () => {
    const skipIdx = stripped.indexOf("Skip answered threads");
    const showIdx = stripped.indexOf("Show the whole thread");
    expect(showIdx).toBeGreaterThan(skipIdx);
    const block = stripped.slice(skipIdx, showIdx + 200);
    expect(block).toMatch(/checked=\{threadExpand\}/);
    expect(block).toMatch(/onChange=\{\(e\) => setThreadExpand\(e\.target\.checked\)\}/);
  });

  it('M10: "Replies will not try to answer the question directly." renders directly after the ingredients TextField, gated on "answer" not being selected', () => {
    const fieldIdx = stripped.indexOf('label="Each reply should include"');
    const hintIdx = stripped.indexOf("Replies will not try to answer the question directly.");
    expect(fieldIdx).toBeGreaterThan(-1);
    expect(hintIdx).toBeGreaterThan(fieldIdx);
    expect(stripped).toMatch(
      /\{!composition\.ingredients\.includes\("answer"\) && \(\s*<p className=\{styles\.fieldHint\}>Replies will not try to answer the question directly\.<\/p>/
    );
  });

  it("M9: the instructor-name-empty degrade hint renders directly under the \"Your name in Canvas\" field, in this component - not surfaced by the panel", () => {
    const fieldIdx = stripped.indexOf('label="Your name in Canvas"');
    const hintIdx = stripped.indexOf("Set your Canvas display name so replies you already sent are recognised.");
    expect(fieldIdx).toBeGreaterThan(-1);
    expect(hintIdx).toBeGreaterThan(fieldIdx);
    expect(stripped).toMatch(/instructorName\.trim\(\) === "" && \(\s*<p className=\{styles\.fieldHint\}>Set your Canvas display name/);
  });

  it('the skip-answered/thread-expand checkbox row uses .adaptRow, not .ghActions', () => {
    const skipIdx = stripped.indexOf("Skip answered threads");
    const rowOpenIdx = stripped.lastIndexOf("<div", skipIdx);
    const tag = stripped.slice(rowOpenIdx, stripped.indexOf(">", rowOpenIdx) + 1);
    expect(tag).toMatch(/className=\{styles\.adaptRow\}/);
    expect(tag).not.toMatch(/ghActions/);
  });

  it("section 0/6: no audience SegmentedToggle - a message reply has one fixed private register, unlike the discussion tool's students/peers toggle", () => {
    expect(stripped).not.toMatch(/SegmentedToggle/);
    expect(stripped).not.toMatch(/audience/i);
  });

  it("section 0: no Resources fieldset - this feature drops the resource lane entirely", () => {
    expect(stripped).not.toMatch(/Resources</);
    expect(stripped).not.toMatch(/DiscussionResourceSettings/);
  });

  it("Capture and Replies fieldsets both use controls.section/controls.sectionLegend, matching the sibling's CC17 shape", () => {
    const legends = stripped.match(/<legend className=\{controls\.sectionLegend\}>([^<]+)<\/legend>/g) ?? [];
    expect(legends.length).toBeGreaterThanOrEqual(3); // Capture, Replies, Context
  });
});
