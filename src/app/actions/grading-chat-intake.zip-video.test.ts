import { expect, it, vi } from "vitest";
import JSZip from "jszip";

vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn().mockResolvedValue({ id: "owner" }) }));
const inferred = vi.hoisted(() => ({ value: undefined as { byRaw: Map<string, { studentDisplay: string; citationFileName: string }> } | undefined }));
vi.mock("@/lib/grade/rubric", async (original) => ({ ...await original<object>(), inferFileNameConvention: vi.fn(async () => inferred.value) }));
import { prepareChatSubmissionAction } from "./grading-chat-intake";

it("refuses a real small ZIP whose video cannot be staged before any grading ticket exists", async () => {
  const zip = new JSZip();
  zip.file("Student/work.txt", "A complete written assignment.");
  zip.file("Student/presentation.mp4", new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]));
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const form = new FormData();
  form.set("kind", "file");
  form.set("file", new File([new Uint8Array(bytes).buffer], "submission.zip", { type: "application/zip" }));
  const outcome = await prepareChatSubmissionAction(form);
  expect(outcome.kind).toBe("refused");
  if (outcome.kind === "refused") expect(outcome.reason).toContain("nothing was queued");
});

it("refuses a video even when filename inference changes its citation extension", async () => {
  const zip = new JSZip(); zip.file("work.txt", "Code"); zip.file("clip.mp4", new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]));
  inferred.value = { byRaw: new Map([["work.txt", { studentDisplay: "Student", citationFileName: "work.txt" }], ["clip.mp4", { studentDisplay: "Student", citationFileName: "citation.txt" }]]) };
  const form = new FormData(); form.set("kind", "file"); form.set("file", new File([new Uint8Array(await zip.generateAsync({ type: "uint8array" })).buffer], "submission.zip"));
  const outcome = await prepareChatSubmissionAction(form);
  expect(outcome.kind).toBe("refused"); if (outcome.kind === "refused") expect(outcome.reason).toContain("video");
  inferred.value = undefined;
});
