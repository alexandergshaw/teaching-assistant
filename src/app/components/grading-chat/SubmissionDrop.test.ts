import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { reconcileRowAfterReset, SubmissionDrop } from "./SubmissionDrop";

describe("SubmissionDrop", () => {
  it("renders the grouping choice and a file selection control without requiring a name", () => {
    const html = renderToStaticMarkup(createElement(SubmissionDrop, { disabled: false, onOne: vi.fn(), onMany: vi.fn(), onText: vi.fn() }));
    expect(html).toContain('aria-label="Add submissions"');
    expect(html).toContain("One student");
    expect(html).toContain("Multiple students");
    expect(html).toContain("Student name (optional)");
    expect(html).toContain('type="file"');
    expect(html).toContain("Preparation starts immediately.");
    expect(html).toContain("Submission text");
    expect(html).toContain("Grade text");
  });
  it("marks completed-session rows as needing review and preserves unsubmitted files on reset", () => {
    const file = new File(["work"], "work.pdf");
    expect(reconcileRowAfterReset({ id: 1, file, state: "queued" })).toMatchObject({ state: "uncertain", reason: expect.stringContaining("session changed") });
    expect(reconcileRowAfterReset({ id: 2, file, state: "staged" })).toMatchObject({ state: "uncertain" });
    const held = { id: 3, file, state: "identity" as const, assigned: "Alice" };
    expect(reconcileRowAfterReset(held)).toEqual(held);
  });});
