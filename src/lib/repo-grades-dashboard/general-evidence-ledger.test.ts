import { beforeEach, expect, it, vi } from "vitest";
import { requireAppOwner } from "@/lib/supabase/auth";
import { settleRepoGrade } from "./ledger";
import { validGeneralExecutionEvidence } from "@/lib/grade/general-execution-evidence";
import { artifactManifestDigest } from "./artifact-dispatch";
import { sourcePlanDigest } from "./source-checkpoint";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc }) }));
const token = "8d74ee61-463c-4b3f-af5d-5fc9b55023c1";
const stage = { command: "python3 main.py", exitCode: 0, signal: null, timedOut: false, stdout: "untrusted", stderr: "", stdoutTruncated: false, stderrTruncated: false };
const evidence = { repoCommit: "a".repeat(40), inputManifest: [{ path: "lab/main.py", sha256: "b".repeat(64) }], runs: [{ language: "python" as const, entryPoint: "lab/main.py", selection: "heuristic" as const, image: "image", toolVersion: "version", networkPolicy: "deny-all" as const, compile: null, run: stage, status: "observed" as const }], held: [], coverage: { status: "unverified" as const }, artifacts: [] };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(requireAppOwner).mockResolvedValue({ id: "owner", email: "owner@example.test" }); rpc.mockResolvedValue({ data: true, error: null }); });
it("accepts 200 pinned files and rejects an over-limit manifest", () => {
  const files = [evidence.inputManifest[0], ...Array.from({ length: 199 }, (_, index) => ({ path: `lab/file${index}.txt`, sha256: "c".repeat(64) }))];
  expect(validGeneralExecutionEvidence({ ...evidence, inputManifest: files })).toBe(true);
  expect(validGeneralExecutionEvidence({ ...evidence, inputManifest: [...files, { path: "lab/extra.txt", sha256: "d".repeat(64) }] })).toBe(false);
});
it("atomically sends score and pinned observations through the fenced RPC", async () => {
  const result = { score: 80, feedback: "Source assessment", sections: { strengths: "", improvements: "", resubmitNotice: "", rawScore: "8/10" }, rubric: [{ area: "Reasoning", score: "8/10", comment: "Evidence in source" }], generalExecutionEvidence: evidence };
  await expect(settleRepoGrade({ mode: "automatic", generation: 42, token }, { outcome: "succeeded", inputsComplete: true, result })).resolves.toBe(true);
  expect(rpc).toHaveBeenCalledWith("repo_grade_settle_general_evidence", expect.objectContaining({ p_generation: 42, p_token: token, p_source_sha: evidence.repoCommit, p_evidence: evidence, p_score: 80 }));
});
it("retains unknown observations with a partial outcome, and rejects invented coverage or unbound inputs", async () => {
  const partial = { ...evidence, runs: [{ ...evidence.runs[0], run: { ...stage, timedOut: true } }] };
  await expect(settleRepoGrade({ mode: "automatic", generation: 42, token }, { outcome: "partial", generalExecutionEvidence: partial })).resolves.toBe(true);
  expect(rpc).toHaveBeenCalledWith("repo_grade_settle_general_evidence", expect.objectContaining({ p_outcome: "partial", p_score: null }));
  expect(validGeneralExecutionEvidence({ ...evidence, coverage: { status: "verified" } })).toBe(false);
  expect(validGeneralExecutionEvidence({ ...evidence, runs: [{ ...evidence.runs[0], entryPoint: "lab/other.py" }] })).toBe(false);
  expect(validGeneralExecutionEvidence({ ...evidence, runs: [], held: [{ language: "python", reason: "ambiguous" }] })).toBe(true);
  expect(validGeneralExecutionEvidence({ ...evidence, held: [{ language: "python", reason: "ambiguous" }] })).toBe(false);
  const withArtifact = { ...evidence, artifacts: [{ path: "lab/main.py", sha256: "b".repeat(64), kind: "binary", status: "unexamined" as const }] };
  await expect(settleRepoGrade({ mode: "automatic", generation: 42, token }, { outcome: "succeeded", inputsComplete: true,
    result: { score: 80, feedback: "Source assessment", sections: { strengths: "", improvements: "", resubmitNotice: "", rawScore: "8/10" }, rubric: [], generalExecutionEvidence: withArtifact } })).rejects.toThrow("Unverified general execution cannot be scored");
});
it("persists unscored source feedback with partial observations without claiming a grade", async () => {
  const reviewFeedback = { overall: "Review the source", rubric: [{ area: "Correctness", comment: "The branch is incomplete." }] };
  await expect(settleRepoGrade({ mode: "automatic", generation: 42, token }, { outcome: "partial", generalExecutionEvidence: evidence, reviewFeedback })).resolves.toBe(true);
  expect(rpc).toHaveBeenCalledWith("repo_grade_settle_general_partial_review", { p_user_id: "owner", p_generation: 42, p_token: token,
    p_source_sha: evidence.repoCommit, p_evidence: evidence, p_review_feedback: reviewFeedback });
  await expect(settleRepoGrade({ mode: "automatic", generation: 42, token }, { outcome: "partial", generalExecutionEvidence: evidence, reviewFeedback: { overall: "", rubric: [] } })).rejects.toThrow("Invalid general source review");
});
it("atomically settles a budget-deferred artifact continuation without duplicating the marker inside evidence",async()=>{
  const files=[...evidence.inputManifest,{path:"lab/a.exe",sha256:"c".repeat(64)}];
  const general={...evidence,inputManifest:files,artifacts:[{path:"lab/a.exe",sha256:"c".repeat(64),kind:"pe",status:"unexamined" as const}],continuation:{manifestSha256:artifactManifestDigest(files),paths:["lab/a.exe"]}};
  const retry=vi.fn().mockResolvedValue({data:true,error:null});rpc.mockReturnValueOnce({retry});
  await expect(settleRepoGrade({mode:"automatic",generation:42,token},{outcome:"partial",generalExecutionEvidence:general})).resolves.toBe(true);
  expect(rpc).toHaveBeenCalledWith("repo_grade_settle_artifact_continuation",expect.objectContaining({p_manifest_sha256:general.continuation.manifestSha256,p_remaining_paths:["lab/a.exe"],p_evidence:expect.not.objectContaining({continuation:expect.anything()}),p_review_feedback:null}));
  expect(retry).toHaveBeenCalledWith(false);
  expect(validGeneralExecutionEvidence({...general,continuation:{...general.continuation,paths:[null]}})).toBe(false);
});

it("settles deferred source plans without assigning a score",async()=>{
  const files=[...evidence.inputManifest,{path:"lab/main.js",sha256:"c".repeat(64)}];
  const plan={language:"javascript" as const,entryPoint:"lab/main.js",selection:"heuristic" as const};
  const sources=[{entryPoint:plan.entryPoint,language:plan.language,planSha256:sourcePlanDigest(plan)}];
  const general={...evidence,inputManifest:files,continuation:{manifestSha256:artifactManifestDigest(files),paths:[],sources}};
  const retry=vi.fn().mockResolvedValue({data:true,error:null});rpc.mockReturnValueOnce({retry});
  await expect(settleRepoGrade({mode:"automatic",generation:42,token},{outcome:"partial",generalExecutionEvidence:general})).resolves.toBe(true);
  expect(rpc).toHaveBeenCalledWith("repo_grade_settle_artifact_continuation",expect.objectContaining({p_remaining_sources:sources,p_remaining_paths:[]}));
  await expect(settleRepoGrade({mode:"automatic",generation:42,token},{outcome:"partial",generalExecutionEvidence:{...general,continuation:{...general.continuation,sources:[{...sources[0],planSha256:"a".repeat(64)}]}}})).rejects.toThrow("Invalid artifact continuation");
});
