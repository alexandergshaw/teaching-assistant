import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LedgerNotice, copyNotQueuedText } from "./LedgerNotice";
import { formatNotQueuedList } from "./ingestLedger";

describe("submission intake ledger", () => {
  it("shows each omission's own reason without advising a full-batch retry", () => {
    const markup = renderToStaticMarkup(createElement(LedgerNotice, { view: {
      hasAny: true,
      skipped: [{ student: "Ada", reason: "too large to grade" }, { student: "Bea", reason: "session limit reached" }],
      linkNotFetched: [], failedFiles: [], accountedFor: false,
    } }));
    expect(markup).toContain("Ada (too large to grade)");
    expect(markup).toContain("Bea (session limit reached)");
    expect(markup).toContain("submit only missing work");
    expect(markup).not.toContain("Re-upload the zip");
    expect(markup).not.toContain("Skipped (too large)");
    expect(markup).toContain("Copy not queued list");
    expect(markup).toContain("This list is not saved");
  });
  it("copies each omitted item and its reason in original order", () => {
    expect(formatNotQueuedList([{ student: "Ada (item 1)", reason: "too large" }, { student: "Ada (item 2)", reason: "session limit" }])).toBe("Ada (item 1) (too large)\nAda (item 2) (session limit)");
  });
  it("reports copy failure when clipboard is unavailable or refuses access", async () => {
    expect(await copyNotQueuedText("Ada", undefined)).toBe(false);
    expect(await copyNotQueuedText("Ada", async () => { throw new Error("denied"); })).toBe(false);
    let written = ""; expect(await copyNotQueuedText("Ada", async (value) => { written = value; })).toBe(true); expect(written).toBe("Ada");
  });
});
