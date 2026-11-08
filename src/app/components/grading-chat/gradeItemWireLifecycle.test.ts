import { afterEach, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => {
  const slots: { value: unknown }[] = []; let cursor = 0;
  return { begin: () => { cursor = 0; }, useState: (initial: unknown) => { const slot = slots[cursor++] ??= { value: typeof initial === "function" ? (initial as () => unknown)() : initial }; return [slot.value, (next: unknown) => { slot.value = typeof next === "function" ? (next as (previous: unknown) => unknown)(slot.value) : next; }]; }, useRef: (initial: unknown) => (slots[cursor++] ??= { value: { current: initial } }).value };
});
vi.mock("react", () => ({ useState: hooks.useState, useRef: hooks.useRef }));
vi.mock("@/app/actions/grading-chat-intake", () => ({ resolveChatRunHeaderAction: vi.fn(async () => ({ kind: "ok", effectiveRubric: "Rubric", criteriaNames: [], rubricUsed: "", rubricFingerprint: "" })), prepareChatSubmissionAction: vi.fn(), prepareCompositeSubmissionAction: vi.fn() }));
import { prepareChatSubmissionAction } from "@/app/actions/grading-chat-intake";
import { ITEM_REQUEST_BYTE_BUDGET } from "@/app/components/grading/incrementalRunPlan";
import { useContinuousGradingRun } from "./useContinuousGradingRun";

afterEach(() => vi.unstubAllGlobals());
it("grades an admissible sibling and keeps a named failed oversized row and its video reference", async () => {
  const videoRef = { storagePath: "owner/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4", sizeBytes: 30 };
  vi.mocked(prepareChatSubmissionAction).mockResolvedValue({ kind: "entries", pointsPossible: null, entries: [
    { student: "Ada", content: "answer", mergedFileCount: 1, submittedFiles: [] },
    { student: "Lin", content: "x".repeat(ITEM_REQUEST_BYTE_BUDGET), mergedFileCount: 1, submittedFiles: [{ name: "video.mp4", extension: "mp4", mimeType: "video/mp4", previewContent: "video", previewTruncated: false, videoRef }] },
  ] });
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ result: { student: "Ada", overallComment: "", strengths: "", improvements: "", resubmitNotice: "", rubricAreas: [], totalScore: "9/10", feedback: "", mergedFileCount: 1, submittedFiles: [] } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const useDriver = () => { hooks.begin(); return useContinuousGradingRun({ provider: "gemini" }); };
  await useDriver().beginSession({ assignmentInstructions: "Instructions", rubric: "Rubric" });
  await useDriver().submit({ kind: "url", url: "https://example.test/work" });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const results = useDriver().results;
  expect(results.find(row => row.student === "Ada")?.ungraded).toBeUndefined();
  const failed = results.find(row => row.student === "Lin");
  expect(failed?.ungraded?.message).toContain("request size limit");
  expect(failed?.submittedFiles[0].videoRef).toEqual(videoRef);
  // A local preflight performs no server cleanup; the retained reference is not proof of deletion.
});
