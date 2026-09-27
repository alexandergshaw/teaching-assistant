import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

// A39 build check (docs/a39-build-check.md BLOCKER 3, docs/a39-build-rulings.md
// RULING 56): the 87fb303 extraction moved the auto-grade checkbox and the
// Read button into SnapshotInstructionsSection.tsx and repointed the existing
// structure-test anchors to read the LEAF's internal prop names. That proves
// the leaf's own markup is wired to its props, but nothing proved the PANEL
// actually hands those props real callbacks - disconnecting
// onAutoGradeArmedChange or removing the leaf's onClick={onRead} both passed
// every other test in this directory with the panel-to-leaf seam silently
// dead.
//
// This file adds the missing half for each of the two seams the extraction
// created, one assertion per direction:
//   - "OUT": the panel passes the leaf a real callback (not a no-op) for
//     that prop.
//   - "BACK": the leaf's own control actually invokes that named prop, so a
//     value change reaches back up into the panel's state.
//
// Anchors are pinned to the literal `onAutoGradeArmedChange=` / `onRead=`
// occurrences, each of which appears EXACTLY ONCE in each file (verified
// 2026-09-27 by `grep -c` on both SnapshotGradingPanel.tsx and
// SnapshotInstructionsSection.tsx for each identifier) - a directory-wide
// `indexOf("<input")`-style scan is exactly the anchor shape MINOR 3 warned
// will bind to the wrong element once a second match appears; anchoring on
// these prop names cannot, because each name is declared as a prop exactly
// once in the leaf's own interface and is not reused by any other control in
// either file.

const SNAPSHOT_GRADING_DIR = path.resolve(process.cwd(), "src/app/components/snapshot-grading");

const panelSource = fs.readFileSync(
  path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx"),
  "utf-8"
);
const leafSource = fs.readFileSync(
  path.join(SNAPSHOT_GRADING_DIR, "SnapshotInstructionsSection.tsx"),
  "utf-8"
);

describe("the auto-grade-armed seam between the panel and SnapshotInstructionsSection", () => {
  it("OUT: the panel binds onAutoGradeArmedChange to the real state setter, not a no-op", () => {
    // Sabotage that must turn this red: SnapshotGradingPanel.tsx:815
    // onAutoGradeArmedChange={setAutoGradeArmed} -> onAutoGradeArmedChange={() => {}}
    expect(panelSource).toContain("onAutoGradeArmedChange={setAutoGradeArmed}");
  });

  it("BACK: the leaf's Checkbox onChange actually invokes onAutoGradeArmedChange with the checkbox's own checked value", () => {
    // Sabotage that must turn this red: SnapshotInstructionsSection.tsx:114
    // onChange={(e) => onAutoGradeArmedChange(e.target.checked)} -> onChange={() => onAutoGradeArmedChange(true)}
    expect(leafSource).toContain("onChange={(e) => onAutoGradeArmedChange(e.target.checked)}");
  });
});

describe("the Read-button seam between the panel and SnapshotInstructionsSection", () => {
  it("OUT: the panel binds onRead to the real handleRead handler, not a no-op", () => {
    // Sabotage that must turn this red: SnapshotGradingPanel.tsx:817
    // onRead={() => void handleRead()} -> onRead={() => {}}
    expect(panelSource).toContain("onRead={() => void handleRead()}");
  });

  it("BACK: the leaf's Read Button onClick actually invokes the onRead prop it was handed", () => {
    // Sabotage that must turn this red: SnapshotInstructionsSection.tsx:120
    // <Button variant="outlined" onClick={onRead} ...> -> onClick removed
    expect(leafSource).toContain("onClick={onRead}");
  });
});
