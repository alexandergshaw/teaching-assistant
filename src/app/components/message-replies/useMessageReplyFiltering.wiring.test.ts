// useMessageReplyFiltering.ts is a hook (never rendered). Source-text checks
// pinning: the persisted status-filter key, that chip counts are computed
// over the UNFILTERED table, and that this file carries NO handledAt/skipped
// derived-map machinery (message-table-view.ts's own header: MessageThreadRow
// carries those fields itself - a discussion-style side map here would be
// dead weight this feature does not need).

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SOURCE = fs.readFileSync(path.resolve(process.cwd(), "src/app/components/message-replies/useMessageReplyFiltering.ts"), "utf-8");

describe("useMessageReplyFiltering.ts wiring", () => {
  it("persists the status-filter key as a whole string literal", () => {
    expect(SOURCE).toMatch(/const STORAGE_KEY_STATUS_FILTER = "ta-rec-msg-status-filter";/);
  });

  it("computes statusCounts over rawRows (the unfiltered table), not `rows`", () => {
    expect(SOURCE).toMatch(/computeMessageStatusCounts\(rawRows\)/);
  });

  it("carries no handledAtById/skippedById derived-map machinery (only the header comment names why not)", () => {
    expect(SOURCE).not.toMatch(/const handledAtById/);
    expect(SOURCE).not.toMatch(/const skippedById/);
  });

  it("filters the already-sorted-and-text-filtered `rows`, not `rawRows`, by status", () => {
    expect(SOURCE).toMatch(/filterThreadsByStatus\(rows, statusFilter\)/);
  });
});
