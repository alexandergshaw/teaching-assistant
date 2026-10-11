import { describe, expect, it } from "vitest";
import {
  BODY_MAX,
  EMPTY_MESSAGING_DRAFT,
  MESSAGING_DRAFT_KEY,
  SUBJECT_MAX,
  parseDraft,
  serializeDraft,
} from "./messaging-draft";

describe("messaging draft ta- key", () => {
  it("uses a ta- prefixed key", () => {
    expect(MESSAGING_DRAFT_KEY).toBe("ta-live-messaging-draft");
  });

  it("round-trips subject and body through the stored string", () => {
    const draft = { subject: "Hi {{first_name}}", body: ["Your grade is {{grade}}.", "See you."].join(String.fromCharCode(10)) };
    expect(parseDraft(serializeDraft(draft))).toEqual(draft);
  });

  it("stores subject and body only - no institution, no selected students", () => {
    const parsed: Record<string, unknown> = JSON.parse(serializeDraft({ subject: "s", body: "b" }));
    expect(Object.keys(parsed).sort()).toEqual(["body", "subject", "v"]);
  });

  it("falls back to an empty draft for missing, malformed or wrong-version storage", () => {
    expect(parseDraft(null)).toEqual(EMPTY_MESSAGING_DRAFT);
    expect(parseDraft(undefined)).toEqual(EMPTY_MESSAGING_DRAFT);
    expect(parseDraft("")).toEqual(EMPTY_MESSAGING_DRAFT);
    expect(parseDraft("{not json")).toEqual(EMPTY_MESSAGING_DRAFT);
    expect(parseDraft("[]")).toEqual(EMPTY_MESSAGING_DRAFT);
    expect(parseDraft(JSON.stringify({ v: 2, subject: "x", body: "y" }))).toEqual(EMPTY_MESSAGING_DRAFT);
  });

  it("coerces non-string fields and caps oversized ones", () => {
    expect(parseDraft(JSON.stringify({ v: 1, subject: 5, body: null }))).toEqual(EMPTY_MESSAGING_DRAFT);
    const big = parseDraft(
      JSON.stringify({ v: 1, subject: "s".repeat(SUBJECT_MAX + 50), body: "b".repeat(BODY_MAX + 50) })
    );
    expect(big.subject.length).toBe(SUBJECT_MAX);
    expect(big.body.length).toBe(BODY_MAX);
  });

  it("never returns the shared EMPTY object (callers may not mutate it)", () => {
    expect(parseDraft(null)).not.toBe(EMPTY_MESSAGING_DRAFT);
  });
});
