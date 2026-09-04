// useMessageRepliesRunLog.ts is a hook (never rendered). Source-text checks
// pinning that it reads `rawRows` (the UNFILTERED table), never a filtered
// `rows`, into the log input - a search-box keystroke must never make the
// downloaded log silently omit a row.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SOURCE = fs.readFileSync(path.resolve(process.cwd(), "src/app/components/message-replies/useMessageRepliesRunLog.ts"), "utf-8");

describe("useMessageRepliesRunLog.ts wiring", () => {
  it("threads rawRows into buildMessageRepliesLog's input, never a bare `rows`", () => {
    expect(SOURCE).toMatch(/rawRows,\s*\n\s*\}\),/);
    expect(SOURCE).not.toMatch(/\brows:\s*args\.rows\b/);
  });

  it("calls buildMessageRepliesLog exactly once, inside a useMemo", () => {
    const calls = SOURCE.match(/buildMessageRepliesLog\(/g) ?? [];
    expect(calls.length).toBe(1);
    expect(SOURCE).toMatch(/useMemo\(\s*\(\)\s*=>\s*\n?\s*buildMessageRepliesLog\(/);
  });
});
