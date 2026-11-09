import { describe, expect, it } from "vitest";
import { applyRecoveredRoles, parseRecovery, recoveryKey, recoverySnapshot } from "./recovery";

describe("PowerPoint draft recovery", () => {
  const definition = { version: 1 as const, slides: [{ id: "slide1", ordinal: 1, text: "private slide text", role: "title" as const }] };
  it("stores only name, source references and classifications, not raw source text", () => {
    const snapshot = recoverySnapshot("Lesson", "source", "a".repeat(64), null, definition, false);
    expect(JSON.stringify(snapshot)).not.toContain("private slide text");
    expect(recoveryKey("a")).not.toBe(recoveryKey("b"));
    expect(parseRecovery(JSON.stringify(snapshot))).toEqual(snapshot);
  });
  it("rejects malformed and duplicate role records", () => {
    const snapshot = recoverySnapshot("Lesson", "source", "a".repeat(64), null, definition, false);
    expect(parseRecovery(JSON.stringify({ ...snapshot, roles: [{ id: "slide1", role: "bad" }] }))).toBeNull();
    expect(parseRecovery(JSON.stringify({ ...snapshot, roles: [...snapshot.roles, ...snapshot.roles] }))).toBeNull();
    expect(parseRecovery(JSON.stringify({ ...snapshot, sourceDigest: "" }))).toBeNull();
  });
  it("restores roles only onto the exact verified inventory", () => {
    expect(applyRecoveredRoles(definition, [{ id: "slide1", role: "closing" }])?.slides[0]).toMatchObject({ text: "private slide text", role: "closing" });
    expect(applyRecoveredRoles(definition, [{ id: "different", role: "closing" }])).toBeNull();
  });
});
