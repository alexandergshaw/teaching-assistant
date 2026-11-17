import { expect, it } from "vitest";
import { bindPartialEvidence } from "./partialEvidence";
import type { StudentSubmissionEntry } from "@/lib/grade/types";

const row = (student: string) => ({ student, content: "work", mergedFileCount: 1, submittedFiles: [], staticOnly: true }) as StudentSubmissionEntry;
it("binds only recorded unexamined data paths to the correct student", () => {
  const evidence = [{ student: "Ada", omissions: ["Ada/data.csv"], unexaminedDataPaths: ["Ada/data.csv"], staticOnly: true }, { student: "Lin", omissions: [], staticOnly: false }];
  const result = bindPartialEvidence([row("Ada"), row("Lin")], undefined, undefined, evidence);
  expect(result?.[0].unexaminedDataPaths).toEqual(["Ada/data.csv"]); expect(result?.[1].unexaminedDataPaths).toBeUndefined();
  expect(bindPartialEvidence([row("Ada")], undefined, undefined, [{ ...evidence[0], unexaminedDataPaths: ["other.csv"] }])).toBeNull();
});
it("binds missing source to the matching student and informs the source review", () => {
  const result = bindPartialEvidence([row("Ada"), row("Lin")], undefined, undefined, [{ student: "Ada", omissions: [], staticOnly: true, missingSource: true }, { student: "Lin", omissions: [], staticOnly: false }]);
  expect(result?.[0].missingSource).toBe(true); expect(result?.[0].content).toMatch(/source-dependent criteria are unverified/);
  expect(result?.[1].missingSource).toBeUndefined();
});
it("binds nested omissions only to the matching student", () => {
  const result = bindPartialEvidence([row("Ada"), row("Lin")], undefined, true, [{ student: "Ada", omissions: ["Ada/debug.obj"], staticOnly: true }, { student: "Lin", omissions: [], staticOnly: false }]);
  expect(result?.[0]).toMatchObject({ student: "Ada", staticOnly: true, evidenceOmissions: ["Ada/debug.obj"] });
  expect(result?.[1]).not.toHaveProperty("staticOnly"); expect(result?.[1]).not.toHaveProperty("evidenceOmissions");
});
it("refuses missing, duplicate, and mismatched student mappings", () => {
  const provenance = [{ student: "Ada", omissions: [], staticOnly: true }, { student: "Ada", omissions: [], staticOnly: false }];
  expect(bindPartialEvidence([row("Ada"), row("Lin")], undefined, true, provenance)).toBeNull();
  expect(bindPartialEvidence([row("Ada")], undefined, true, [{ student: "Lin", omissions: [], staticOnly: true }])).toBeNull();
  expect(bindPartialEvidence([row("Ada")], undefined, true, [])).toBeNull();
});
