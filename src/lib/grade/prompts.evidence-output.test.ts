import { expect, it } from "vitest";
import { buildSystemPrompt } from "./prompts";
it("replaces the conflicting schema and no-comment directive only for the evidence branch", () => {
  const legacy = buildSystemPrompt("instructions", "Algorithm (6 pts): logic");
  const evidence = buildSystemPrompt("instructions", "Algorithm (6 pts): logic", [{ name: "Algorithm", points: 6 }], "some", "in-overall-comment", "all", "balanced", undefined, true, false, "Unknown timing. Evidence IDs: original:0:main.py");
  expect(legacy).toContain('"score": "numeric or text score"'); expect(legacy).toContain("no per-criterion comment"); expect(legacy).not.toContain("Unknown timing.");
  expect(evidence).toContain('"score": {"earned": 0, "possible": 0}'); expect(evidence).toContain('"comment": "criterion rationale [evidence:file-id]"'); expect(evidence).toContain("Unknown timing."); expect(evidence).not.toContain("no per-criterion comment");
});