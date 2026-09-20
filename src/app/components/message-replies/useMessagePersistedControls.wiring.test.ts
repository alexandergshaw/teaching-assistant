// useMessagePersistedControls.ts is a hook (this repo's vitest is node-env
// and renders nothing - see useMessageRows.ts's own header). Source-text
// checks pinning the nine keys M5 assigns this file, as whole string
// literals (never a template literal - see the file's own header on why).

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SOURCE = fs.readFileSync(path.resolve(process.cwd(), "src/app/components/message-replies/useMessagePersistedControls.ts"), "utf-8");

describe("useMessagePersistedControls.ts wiring", () => {
  it("persists exactly the nine controls M5 assigns this file, as whole string literals", () => {
    for (const key of [
      "ta-rec-msg-course",
      "ta-rec-msg-instructor-name",
      "ta-rec-msg-ingredients",
      "ta-rec-msg-formality",
      "ta-rec-msg-address-name",
      "ta-rec-msg-signoff",
      "ta-rec-msg-skip-answered",
      "ta-rec-msg-thread-expand",
      "ta-rec-msg-save-video",
    ]) {
      expect(SOURCE, `expected the literal "${key}" in useMessagePersistedControls.ts`).toContain(`"${key}"`);
    }
  });

  it("does not persist any OTHER feature's key (kb-context-label stays useMessageKnowledgeContext.ts's own)", () => {
    expect(SOURCE).not.toContain("kb-context-label");
    expect(SOURCE).not.toContain("ta-rec-msg-table");
    expect(SOURCE).not.toContain("ta-rec-msg-sort");
    expect(SOURCE).not.toContain("ta-rec-msg-filter");
    expect(SOURCE).not.toContain("ta-rec-msg-status-filter");
  });

  it("skipAnswered defaults ON: only an explicit stored '0' turns it off", () => {
    expect(SOURCE).toMatch(/STORAGE_KEY_SKIP_ANSWERED\) !== "0"/);
  });

  // A20 (docs/a20-scope.md AC1, RULING B3): message-replies.structure.test.ts's
  // own "finds exactly N distinct ta- keys" canary is a COUNT - a key that is
  // read but never written would move that count exactly as a correctly
  // wired key would, and the canary cannot tell the two apart. This is a
  // genuine read+write assertion instead, the same DIRECT/INDIRECT
  // distinction recording-split.structure.test.ts's own C5c comment
  // documents for this directory's STORAGE_KEY_* convention.
  it("A20: a STORAGE_KEY_AUTO_DOWNLOAD const bound to \"ta-rec-msg-auto-download\", read AND written through that identifier", () => {
    expect(SOURCE).toMatch(/const STORAGE_KEY_AUTO_DOWNLOAD = "ta-rec-msg-auto-download";/);
    expect(SOURCE).toMatch(/readLocalStorage\(STORAGE_KEY_AUTO_DOWNLOAD\)/);
    expect(SOURCE).toMatch(/writeLocalStorage\(STORAGE_KEY_AUTO_DOWNLOAD,/);
  });
});
