import { beforeEach, describe, expect, it, vi } from "vitest";
const { owner, runner } = vi.hoisted(() => ({ owner: vi.fn(), runner: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: owner }));
vi.mock("@/lib/code-runner", () => ({ runSubmittedCode: runner }));
import { POST } from "@/app/api/grading-chat-repository/route";
import { rubricFingerprint } from "../research/rubric-fingerprint";
import { assembleRepositoryEvidenceEntry } from "./repository-evidence-entry";
import type { RepositoryCollectResponse, RepositoryProposeRequest, RepositoryProposeResponse, RepositoryReviewRequest } from "./repository-evidence-types";
const sha = "a".repeat(40);
const fileId = `repo:owner/repo@${sha}:src/main.py`;
const key = { sessionEpoch: "session", sourceIndex: 2 };
const rubric = "Algorithm (6 pts): Logic\nExplanation (4 pts): Reasoning";
const prior = { student: "Duplicate Name (2)", overallComment: "Original feedback", strengths: "Original praise", improvements: "Original advice", resubmitNotice: "", rubricAreas: [{ area: "Algorithm", score: "4/6", comment: "old algorithm" }, { area: "Explanation", score: "2/4", comment: "old explanation" }], totalScore: "6/10", feedback: "Original full feedback", mergedFileCount: 1, submittedFiles: [] };
const original = { student: "Duplicate Name (2)", content: "ORIGINAL_SENTINEL", mergedFileCount: 1, submittedFiles: [{ name: "original.py", extension: "py", previewContent: "original-file-sentinel", previewTruncated: false, mimeType: "text/plain" }] };
const rawProvider = `{"overallComment":"Your branch structure is clearer.","improvements":"Explain the loop boundary.","rubricResults":[{"area":"Algorithm","score":{"earned":5,"possible":6},"comment":"One branch remains incomplete. [evidence:repo:owner/repo@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:src/main.py]"},{"area":"Explanation","score":{"earned":3,"possible":4},"comment":"The loop boundary remains unclear. [evidence:original:0:original.py]"}]}`;
const rawReview = `{"coverage":["unsupported-deduction","missed-credit","identity","timing","coverage"],"findings":[{"criterionId":"0:Algorithm","category":"missed-credit","evidenceFileIds":["repo:owner/repo@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:src/main.py"],"explanation":"The fallback branch appears implemented; instructor should examine this proposed deduction."}]}`;
const fetcher = vi.fn(); let proposalOutput: string; let reviewOutput: string; let changed: boolean;
const send = (data: unknown) => POST(new Request("http://localhost/api/grading-chat-repository", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }));
beforeEach(() => {
  vi.clearAllMocks(); owner.mockResolvedValue({}); runner.mockResolvedValue(null);
  vi.stubEnv("GITHUB_TOKEN", "synthetic"); vi.stubEnv("GEMINI_API_KEY", "synthetic"); vi.stubEnv("GRADE_MAX_CHARS_PER_SUBMISSION", "1000000"); vi.stubEnv("GEMINI_MIN_OUTPUT_TOKENS", "16000"); vi.stubEnv("GEMINI_MAX_OUTPUT_TOKENS", "8192"); vi.stubEnv("GEMINI_MODEL", "gemini-3-fixture");
  proposalOutput = rawProvider; reviewOutput = rawReview; changed = false;
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.startsWith("https://api.github.com/") && url.includes("/git/trees/")) return Response.json({ truncated: false, tree: [{ path: "src/main.py", type: "blob", mode: "100644", size: 10 }] });
    if (url.startsWith("https://api.github.com/") && url.includes("/contents/")) return new Response(changed ? "changed" : "NEW_REPOSITORY_SOURCE");
    if (url.startsWith("https://generativelanguage.googleapis.com/")) {
      const wire = JSON.parse(String(init?.body)); const independent = !!wire.system_instruction;
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: independent ? reviewOutput : proposalOutput }] } }] });
    }
    throw new Error("Unexpected network boundary");
  });
});
async function request(): Promise<RepositoryProposeRequest> {
  const mapping = { stagedItemId: "staged-1", studentKey: key, scope: { owner: "owner", repo: "repo", kind: "commit" as const, requestedRef: sha, requestedPath: null }, mappingRevision: 1, basis: "instructor-confirmed" as const, originalUrl: `https://github.com/owner/repo/commit/${sha}` };
  const collected: RepositoryCollectResponse = await (await send({ operation: "collect", attemptId: "collect-1", studentKey: key, mappings: [mapping] })).json();
  return { operation: "propose", attemptId: "propose-1", revision: { ...key, mappingRevision: 1, evidenceRevision: 1, rubricFingerprint: rubricFingerprint(rubric), baseGradeRevision: 1, baseEditRevision: 1 }, base: { entry: structuredClone(original), assignmentInstructions: "Preserve frozen instructions", rubric, provider: "gemini", pointsPossible: 10, applyNamingDeduction: false, applyLengthDeduction: true }, prior: structuredClone(prior), current: { ...structuredClone(prior), totalScore: "7/10", strengths: "Instructor edit" }, evidence: [{ source: mapping, commitSha: sha, digest: collected.evidence[0].manifest.digest }], partialAcknowledged: false };
}
describe("actual route -> immutable refetch -> strict engine -> isolated review", () => {
  it("preserves original input, rubric, citations and instructor values without executing or returning duplicate source bytes", async () => {
    const input = await request(); fetcher.mockClear();
    const response = await send(input); expect(response.status).toBe(200);
    const result: RepositoryProposeResponse = await response.json();
    expect(result.proposal.proposed.rubricAreas).toEqual([
      { area: "Algorithm", score: "5/6", comment: `One branch remains incomplete. [evidence:${fileId}]` },
      { area: "Explanation", score: "3/4", comment: "The loop boundary remains unclear. [evidence:original:0:original.py]" },
    ]);
    expect(result.proposal.prior.totalScore).toBe("6/10"); expect(result.proposal.current.strengths).toBe("Instructor edit");
    expect(JSON.stringify(result)).not.toContain("NEW_REPOSITORY_SOURCE"); expect(JSON.stringify(result)).not.toContain("ORIGINAL_SENTINEL");
    const modelCall = fetcher.mock.calls.find((call) => String(call[0]).includes("generativelanguage"))!;
    const wire = JSON.parse(modelCall[1].body); const prompt = wire.contents[0].parts[0].text;
    expect(prompt).toContain("ORIGINAL_SENTINEL"); expect(prompt).toContain("original-file-sentinel"); expect(prompt).toContain("NEW_REPOSITORY_SOURCE"); expect(prompt).toContain(rubric);
    expect(prompt).not.toContain("no per-criterion comment"); expect(wire.generationConfig.maxOutputTokens).toBe(8192);
    expect(runner).not.toHaveBeenCalled();
    const reviewInput: RepositoryReviewRequest = { ...input, operation: "review", attemptId: "review-1", proposal: result.proposal };
    const reviewed = await (await send(reviewInput)).json();
    expect(reviewed.review.status).toBe("completed"); expect(reviewed.review.findings[0].criterionId).toBe("0:Algorithm"); expect(reviewed.candidateDigest).toBe(result.proposal.candidateDigest);
    const modelCalls = fetcher.mock.calls.filter((call) => String(call[0]).includes("generativelanguage")); expect(modelCalls).toHaveLength(2);
    const reviewWire = JSON.parse(modelCalls[1][1].body); expect(reviewWire.system_instruction.parts[0].text).toContain("Independently review"); expect(reviewWire.contents[0].parts[0].text).toContain(result.proposal.proposed.rubricAreas[0].comment);
    expect(fetcher.mock.calls.filter((call) => String(call[0]).includes(`/git/trees/${sha}`))).toHaveLength(2); expect(runner).not.toHaveBeenCalled();
  });
  it("refuses altered digest or malformed raw criteria and never repairs them into a proposal", async () => {
    const input = await request(); fetcher.mockClear(); changed = true;
    expect((await send(input)).status).toBe(422); expect(fetcher.mock.calls.some((call) => String(call[0]).includes("generativelanguage"))).toBe(false);
    changed = false;
    for (const invalid of [rawProvider.replace('"area":"Explanation"', '"area":"Algorithm"'), rawProvider.replace('"score":{"earned":3,"possible":4}', '"score":"3/4"'), rawProvider.replace('"rubricResults":[', '"rubricResults":[{"area":"Extra","score":{"earned":0,"possible":1},"comment":"extra"},')]) {
      proposalOutput = invalid; expect((await send(input)).status).toBe(422);
    }
    expect(runner).not.toHaveBeenCalled();
  });
  it("audits duplicate raw rubric headings and refuses unsupported providers before any refetch/spend", async () => {
    const input = await request(); fetcher.mockClear();
    for (const provider of ["other", "embedded"] as const) expect((await send({ ...input, base: { ...input.base, provider } })).status).toBe(422);
    for (const duplicate of ["Algorithm (6 pts): first\nExplanation (4 pts): prose\nAlgorithm (6 pts): duplicate", "Algorithm (6 pts): first\nExplanation (4 pts): prose\nALGORITHM! (6 pts): alias", "Algorithm (6 pts)\nExplanation (4 pts)\nALGORITHM! (6 pts)"]) {
      expect((await send({ ...input, base: { ...input.base, rubric: duplicate }, revision: { ...input.revision, rubricFingerprint: rubricFingerprint(duplicate) } })).status).toBe(422);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects forged identity, URL, execution and unavailable material fields before any fetch", async () => {
    const input = await request(); fetcher.mockClear();
    for (const forged of [{ userId: 42 }, { submissionUrl: "https://evil.test" }, { codeRun: { passed: true } }, { discussionAxes: {} }]) expect((await send({ ...input, base: { ...input.base, entry: { ...input.base.entry, ...forged } } })).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps malformed checklist and invalid review references incomplete, and refuses candidate tampering", async () => {
    const input = await request(); const proposal = (await (await send(input)).json()).proposal;
    for (const invalid of ['{"coverage":[],"findings":[]}', rawReview.replace('"0:Algorithm"', '"9:invented"'), rawReview.replace(fileId, "forged")]) {
      reviewOutput = invalid; const result = await (await send({ ...input, operation: "review", attemptId: "review-1", proposal })).json(); expect(result.review.status).toBe("incomplete");
    }
    fetcher.mockClear(); const altered = structuredClone(proposal); altered.proposed.totalScore = "10/10";
    expect((await send({ ...input, operation: "review", attemptId: "review-2", proposal: altered })).status).toBe(422);
    expect(fetcher.mock.calls.some((call) => String(call[0]).includes("generativelanguage"))).toBe(false);
  });
  it("replaces attached evidence from the original baseline on refresh and refuses recursive composition", async () => {
    const input = await request(); const first = await (await send(input)).json();
    const collected: RepositoryCollectResponse = await (await send({ operation: "collect", attemptId: "collect-2", studentKey: key, mappings: input.evidence.map((pin) => pin.source) })).json();
    const composed = assembleRepositoryEvidenceEntry(input.base.entry, collected.evidence);
    expect(composed.content.match(/NEW_REPOSITORY_SOURCE/g)).toHaveLength(1);
    const second = await (await send({ ...input, attemptId: "propose-2", revision: { ...input.revision, evidenceRevision: 2 } })).json(); expect(second.entryDigest).toBe(first.entryDigest);
    expect((await send({ ...input, base: { ...input.base, entry: composed } })).status).toBe(422);
  });
});
it("preserves two same-path repositories and distinct confirmed mapping revisions in one proposal", async () => {
  const input = await request();
  const source = { ...input.evidence[0].source, stagedItemId: "staged-second", mappingRevision: 3, scope: { ...input.evidence[0].source.scope, repo: "second" }, originalUrl: `https://github.com/owner/second/commit/${sha}` };
  const collected: RepositoryCollectResponse = await (await send({ operation: "collect", attemptId: "collect-two", studentKey: key, mappings: [input.evidence[0].source, source] })).json();
  const pins = collected.evidence.map((item, index) => ({ source: collected.mappings[index], commitSha: item.manifest.commitSha, digest: item.manifest.digest }));
  fetcher.mockClear(); const response = await send({ ...input, evidence: pins, revision: { ...input.revision, mappingRevision: 3 } }); expect(response.status).toBe(200);
  const wire = JSON.parse(fetcher.mock.calls.find((call) => String(call[0]).includes("generativelanguage"))![1].body);
  expect(wire.contents[0].parts[0].text).toContain(`repo:owner/repo@${sha}:src/main.py`); expect(wire.contents[0].parts[0].text).toContain(`repo:owner/second@${sha}:src/main.py`);
  expect(fetcher.mock.calls.filter((call) => String(call[0]).includes("/contents/"))).toHaveLength(2);
});
it("revalidates pinned evidence on a fresh server module instance without any warm lease", async () => {
  const input = await request(); fetcher.mockClear(); vi.resetModules();
  const fresh = await import("@/app/api/grading-chat-repository/route");
  const response = await fresh.POST(new Request("http://localhost/api/grading-chat-repository", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }));
  expect(response.status).toBe(200); expect(fetcher.mock.calls.filter((call) => String(call[0]).includes(`/git/trees/${sha}`))).toHaveLength(1);
  changed = true; fetcher.mockClear(); vi.resetModules(); const another = await import("@/app/api/grading-chat-repository/route");
  expect((await another.POST(new Request("http://localhost/api/grading-chat-repository", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }))).status).toBe(422);
  expect(fetcher.mock.calls.some((call) => String(call[0]).includes("generativelanguage"))).toBe(false);
});
it("refuses multibyte serialized and combined budgets before model work without truncating original material", async () => {
  const input = await request(); fetcher.mockClear();
  const oversized = { ...input, base: { ...input.base, entry: { ...input.base.entry, content: "é".repeat(1_900_000) } } };
  expect(new TextEncoder().encode(JSON.stringify(oversized)).byteLength).toBeGreaterThan(3_670_016);
  expect((await send(oversized)).status).toBe(400); expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv("GRADE_MAX_CHARS_PER_SUBMISSION", "10000000");
  input.base.entry.content = "é".repeat(1_000_000); input.base.entry.submittedFiles[0].previewContent = "é".repeat(450_000);
  expect(new TextEncoder().encode(JSON.stringify(input)).byteLength).toBeLessThan(3_670_016);
  expect((await send(input)).status).toBe(422); expect(fetcher.mock.calls.some((call) => String(call[0]).includes("generativelanguage"))).toBe(false);
  expect(input.base.entry.content.length).toBe(1_000_000);
});
it("refuses a response comparison already larger than the wire retention cap before spend", async () => {
  const input = await request(); fetcher.mockClear();
  input.prior.feedback = "p".repeat(100_000); input.current.feedback = "c".repeat(100_000); input.current.strengths = "s".repeat(100_000);
  expect((await send(input)).status).toBe(422); expect(fetcher).not.toHaveBeenCalled();
});
it("preserves total deadline across refetch and refuses a model call without its minimum reserve", async () => {
  const input = await request(); fetcher.mockClear(); const underlying = fetcher.getMockImplementation()!;
  let now = 1000; const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  fetcher.mockImplementation(async (...args) => { if (String(args[0]).includes("/contents/")) now = 42_001; return underlying(...args); });
  try { expect((await send(input)).status).toBe(422); expect(fetcher.mock.calls.some((call) => String(call[0]).includes("generativelanguage"))).toBe(false); }
  finally { clock.mockRestore(); }
});
it("enforces the complete serialized proposal response cap after a bounded valid provider result", async () => {
  const input = await request(); fetcher.mockClear();
  input.prior.feedback = "p".repeat(90_000); input.current.feedback = "c".repeat(90_000);
  proposalOutput = rawProvider.replace("Your branch structure is clearer.", "P".repeat(90_000));
  expect(new TextEncoder().encode(proposalOutput).byteLength).toBeLessThan(262_144);
  expect((await send(input)).status).toBe(422);
  expect(fetcher.mock.calls.filter((call) => String(call[0]).includes("generativelanguage"))).toHaveLength(1);
});
it("refuses a commit URL paired with a different immutable pin before all GitHub or model work", async () => {
  const input = await request(); fetcher.mockClear();
  input.evidence[0].commitSha = "b".repeat(40);
  expect((await send(input)).status).toBe(422); expect(fetcher).not.toHaveBeenCalled();
});
it("accepts uppercase spelling of the same fixed commit without broadening or changing the selected pin", async () => {
  const input = await request(); fetcher.mockClear();
  input.evidence[0].commitSha = sha.toUpperCase();
  const result = await send(input); expect(result.status).toBe(200);
  expect(fetcher.mock.calls.filter((call) => String(call[0]).includes("/git/trees/"))).toHaveLength(1);
  expect(fetcher.mock.calls.find((call) => String(call[0]).includes("/git/trees/"))![0]).toContain(`/git/trees/${sha}`);
});
it("carries a frozen word shortfall through the real strict engine and independent review", async () => {
  const input = await request(); input.base.lengthDeductionThresholdWords = 25;
  input.base.assignmentInstructions = "Minimum 500 words";
  fetcher.mockClear();
  const response = await send(input); expect(response.status).toBe(200);
  const result: RepositoryProposeResponse = await response.json();
  const gradingWire = JSON.parse(fetcher.mock.calls.find((call) => String(call[0]).includes("generativelanguage"))![1].body);
  expect(gradingWire.contents[0].parts[0].text).toContain("shortfall >= 25 words");
  expect(gradingWire.contents[0].parts[0].text).toContain("No code was executed for this revision");
  expect((await send({ ...input, operation: "review", attemptId: "review-threshold", proposal: result.proposal })).status).toBe(200);
  const calls = fetcher.mock.calls.filter((call) => String(call[0]).includes("generativelanguage"));
  expect(calls).toHaveLength(2);
  const reviewContext = JSON.parse(JSON.parse(calls[1][1].body).contents[0].parts[0].text);
  expect(reviewContext.lengthPolicy.applyLengthDeduction).toBe(true);
  expect(reviewContext.lengthPolicy.lengthDeductionThresholdWords).toBe(25);
  expect(reviewContext.lengthPolicy.directive).toContain("shortfall >= 25 words");
  expect(runner).not.toHaveBeenCalled();
});
it.each([null, "25", 1.5, 0, 1_000_001])("rejects malformed repository policy %s before any fetch", async (value) => {
  const input = await request(); fetcher.mockClear();
  expect((await send({ ...input, base: { ...input.base, lengthDeductionThresholdWords: value } })).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});

it("snapshots the threshold before asynchronous evidence collection", async () => {
  const { proposeRepositoryGrade } = await import("./repository-proposal");
  const input = await request(); input.base.lengthDeductionThresholdWords = 25;
  fetcher.mockClear();
  const pending = proposeRepositoryGrade(input, Date.now() + 50_000);
  input.base.lengthDeductionThresholdWords = 1;
  await pending;
  const wire = JSON.parse(fetcher.mock.calls.find((call) => String(call[0]).includes("generativelanguage"))![1].body);
  expect(wire.contents[0].parts[0].text).toContain("shortfall >= 25 words");
  expect(wire.contents[0].parts[0].text).not.toContain("shortfall >= 1 words");
});
