import { expect, it } from "vitest";
import { assertGenericEvidenceCapacity } from "./generic-evidence-capacity";

it("allows ordinary inventories and refuses oversized envelopes before dispatch", () => {
  const plan = { runs: [{ language: "python" as const, entryPoint: "lab/main.py", selection: "heuristic" as const }], held: [] };
  const manifest = [{ path: "lab/main.py", sha256: "a".repeat(64) }];
  expect(() => assertGenericEvidenceCapacity({ manifest, plan, artifacts: [] })).not.toThrow();
  const artifacts = Array.from({ length: 40 }, (_, index) => ({ path: `lab/${"界".repeat(590)}${index}`, sha256: "a".repeat(64), kind: "elf", status: "unexamined" }));
  expect(() => assertGenericEvidenceCapacity({ manifest: [...manifest, ...artifacts], plan, artifacts })).toThrow("evidence exceeds");
});

it("rejects a path too long for durable evidence before starting a VM", () => {
  expect(() => assertGenericEvidenceCapacity({ manifest: [{ path: `lab/${"a".repeat(601)}`, sha256: "a".repeat(64) }], plan: { runs: [], held: [] }, artifacts: [] })).toThrow("path exceeds");
});

it("allows a normal 200-file manifest when its bounded evidence fits", () => {
  const manifest = Array.from({ length: 200 }, (_, index) => ({ path: `lab/file${index}.py`, sha256: "a".repeat(64) }));
  const plan = { runs: [{ language: "python" as const, entryPoint: manifest[0].path, selection: "heuristic" as const }], held: [] };
  expect(() => assertGenericEvidenceCapacity({ manifest, plan, artifacts: [] })).not.toThrow();
});
