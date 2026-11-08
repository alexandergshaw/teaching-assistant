import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LedgerNotice } from "./LedgerNotice";

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
  });
});
