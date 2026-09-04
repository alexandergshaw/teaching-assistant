// useMessageKnowledgeContext.ts is a hook (never rendered by this repo's
// node-env vitest). Source-text checks pinning the two facts section 0
// requires: the copy is guarded on "messages" (not the discussion original's
// "discussions"), and keyed to the message-replies label, never the
// discussion one.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SOURCE = fs.readFileSync(path.resolve(process.cwd(), "src/app/components/message-replies/useMessageKnowledgeContext.ts"), "utf-8");

describe("useMessageKnowledgeContext.ts wiring", () => {
  it("guards the launch listener on detail.view === 'messages', never 'discussions'", () => {
    expect(SOURCE).toMatch(/detail\.view !== "messages"/);
    expect(SOURCE).not.toMatch(/detail\.view !== "discussions"/);
  });

  it("reads the message-replies-scoped label key, never the discussion one", () => {
    expect(SOURCE).toMatch(/"ta-rec-msg-kb-context-label"/);
    expect(SOURCE).not.toMatch(/"ta-rec-disc-kb-context-label"/);
  });

  it("the one-shot take (takeRecordingKnowledgeContext) appears exactly once", () => {
    const matches = SOURCE.match(/takeRecordingKnowledgeContext\(\)/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
