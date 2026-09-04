// docs/message-replies-acceptance-criteria.md M3 - the wiring wave's own
// reachability + inventory canary for the message-replies tool, mirroring
// module-deck-capture/module-deck-capture.structure.test.ts (that file's own
// header comment explains why this shape exists at all: a rendered-component
// test cannot run in this repo's node-env vitest, so reachability is proven
// by source-text assertions instead - an import alone, or a union entry with
// no matching restore-guard entry, would otherwise ship a tab that works
// until reload and then silently drops back to "record").
//
// The six .tsx files (MessageRepliesPanel.tsx and its siblings) may not
// exist on disk yet at the point this file is authored - the mount-
// reachability and per-file line-ceiling assertions below are expected RED
// until they exist ("tests that read the
// not-yet-existing files will fail - report exactly which assertions fail").
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { countLines } from "../../../lib/count-lines";

const RECORDING_TAB_PATH = path.resolve(process.cwd(), "src/app/components/RecordingTab.tsx");
const recordingTabSource = fs.readFileSync(RECORDING_TAB_PATH, "utf-8");

const MESSAGE_REPLIES_DIR = path.resolve(process.cwd(), "src/app/components/message-replies");

describe("MessageRepliesPanel is actually mounted by RecordingTab (M1 reachability)", () => {
  it('RecordingTab.tsx imports the default export from "./message-replies/MessageRepliesPanel"', () => {
    expect(recordingTabSource).toMatch(
      /import MessageRepliesPanel from "\.\/message-replies\/MessageRepliesPanel"/
    );
  });

  it("RecordingTab.tsx actually renders <MessageRepliesPanel - an import alone proves nothing", () => {
    expect(recordingTabSource).toMatch(/<MessageRepliesPanel\b/);
  });

  it('the rendered panel receives active={active && recView === "messages"} - the same always-mounted, display:none-toggled idiom every sibling inner view uses, never unmounted on tab switch', () => {
    expect(recordingTabSource).toMatch(/<MessageRepliesPanel active=\{active && recView === "messages"\}/);
  });
});

describe('"messages" is wired into BOTH the recView union AND the SEPARATE restore guard (the trap)', () => {
  it('"messages" is a member of the recView useState union type', () => {
    // Anchor on the union literal's own line - it is unique text in this
    // file - deliberately NOT a bare `source.includes('"messages"')` check,
    // which the restore guard's own occurrence would also satisfy and could
    // never fail independently of it. The union's own line is anchored on
    // the literal `"record" | "discussions" | "speed"`, which section 3/M1
    // requires to keep matching so module-deck-capture.structure.test.ts's
    // own identical anchor stays valid too.
    const unionLine = recordingTabSource
      .split("\n")
      .find((line) => line.includes('"record" | "discussions" | "speed"'));
    expect(unionLine, "expected to find the recView union type's own line in RecordingTab.tsx").toBeTruthy();
    expect(unionLine).toMatch(/"messages"/);
  });

  it('"messages" is a member of the SEPARATE localStorage restore guard\'s v === chain (the actual trap: this can be missing while the test above still passes)', () => {
    const guardStart = recordingTabSource.indexOf('localStorage.getItem("ta-rec-view")');
    expect(guardStart, "expected to find the restore guard's own localStorage read").toBeGreaterThan(-1);
    const guardEnd = recordingTabSource.indexOf(': "record";', guardStart);
    expect(guardEnd, "expected to find the restore guard's own closing fallback").toBeGreaterThan(-1);
    const guardBlock = recordingTabSource.slice(guardStart, guardEnd);
    expect(guardBlock).toMatch(/v === "messages"/);
  });

  it("the inner-view tab strip includes a messages entry, directly after the discussions entry, so the view is reachable by more than a reload or a launch event", () => {
    expect(recordingTabSource).toMatch(
      /\["discussions",\s*"[^"]+"\],\s*\["messages",\s*"[^"]+"\]/
    );
  });
});

describe('the new tabpanel div carries the display:none idiom every sibling panel carries (M1)', () => {
  it('id="rec-panel-messages" is followed by a display: recView === "messages" style expression within 200 chars', () => {
    expect(recordingTabSource).toMatch(/id="rec-panel-messages"[\s\S]{0,200}display: recView === "messages"/);
  });
});

// ---------------------------------------------------------------------------
// M3: directory-wide ta- key ORDINAL canary. recording-split.structure.
// test.ts scans only recording/* plus RecordingTab.tsx and explicitly does
// NOT see this directory (its own expectedKeys/discKeys stay unchanged per
// the recording-split canary's own scope) - so without this block, every
// ta-rec-msg-* key minted in this directory would be invisible to every
// existing gate in this repo.
//
// Ordinal, not set equality, mirroring module-deck-capture's own canary: the
// exact spelling of a future key is not what this block polices - the COUNT
// (frozen at fourteen by M5) is.
// ---------------------------------------------------------------------------
describe("directory-wide ta- key ordinal canary (M3 - this directory has no canary anywhere else)", () => {
  const files = fs.readdirSync(MESSAGE_REPLIES_DIR);
  const nonTestFiles = files.filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
  const combinedSource = nonTestFiles
    .map((f) => fs.readFileSync(path.join(MESSAGE_REPLIES_DIR, f), "utf-8"))
    .join("\n");

  const keys = combinedSource.match(/(?<![a-zA-Z])ta-[a-z-]*[a-z]/g) ?? [];
  const distinctKeys = new Set(keys);

  it("finds exactly fourteen distinct ta- keys across every non-test file in this directory (M5's ta-rec-msg-* inventory)", () => {
    expect(distinctKeys.size).toBe(14);
  });

  it("the scan's non-test file list includes MessageCaptureSettings.tsx", () => {
    expect(nonTestFiles).toContain("MessageCaptureSettings.tsx");
  });
});

describe("split structure guard (ratchet canary): every message-replies/*.ts/*.tsx file stays under 1000 lines", () => {
  it("should keep all message-replies/*.ts/*.tsx files under 1000 lines", () => {
    const files = fs.readdirSync(MESSAGE_REPLIES_DIR);
    const tsFiles = files.filter((f) => /\.(ts|tsx)$/.test(f));

    for (const file of tsFiles) {
      const filePath = path.join(MESSAGE_REPLIES_DIR, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const lineCount = countLines(content);
      expect(
        lineCount,
        `${file} should be under 1000 lines but has ${lineCount}`
      ).toBeLessThanOrEqual(1000);
    }
  });
});
