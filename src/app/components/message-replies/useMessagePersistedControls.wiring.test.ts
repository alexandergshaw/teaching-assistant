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
});
