import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Mirrors media.intro-script-diag.test.ts's own pattern: mock only the real
// I/O boundaries (auth, Supabase, the LLM client, getGeminiModel) and let
// every pure leaf this action composes with (buildWalkthroughAnnouncementPrompt,
// composeWalkthroughScriptPrompt, walkthroughAnnouncementMaxOutputTokens,
// deriveAnnouncementOutline) run FOR REAL - those already have their own
// dedicated, sabotage-checked test files (wave 1), and re-mocking them here
// would hide exactly the wiring bug this file exists to catch: whether the
// action actually threads its inputs into a real prompt and a real,
// OUTLINE-SIZED token budget, not a fixed one.
vi.mock("@/lib/supabase/auth", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({})),
}));
vi.mock("./writing-style-block", () => ({
  getWritingStyleBlock: vi.fn(),
}));
vi.mock("@/lib/llm", () => ({
  callLlm: vi.fn(),
}));
vi.mock("@/lib/gemini", () => ({
  getGeminiModel: vi.fn(() => "gemini-test-model"),
}));
vi.mock("@/lib/announcement-exemplars", () => ({
  listAnnouncementExemplars: vi.fn(),
  getMostRecentAnnouncementExemplar: vi.fn(),
  saveAnnouncementExemplar: vi.fn(),
  deleteAnnouncementExemplar: vi.fn(),
}));
vi.mock("@/lib/canvas/announcements", () => ({ createAnnouncementFromSafeHtml: vi.fn() }));
vi.mock("@/lib/canvas", () => ({
  createAnnouncementFromMarkdown: vi.fn(),
}));
// gatherWalkthroughResourcesAction (G3 Ask 3) is a PORT of the shipped
// gatherReplyResourcesAction's shape (Ruling 8) - mocking these two
// boundaries, rather than letting them run for real, mirrors
// discussion-replies-resources.test.ts's own
// `vi.mock("./learning-resource-links", ...)` pattern exactly, and keeps
// this file from making a real (network-blocked, per vitest.setup.ts) LLM
// or reachability call.
vi.mock("./learning-resources-generator", () => ({
  deriveResourceConcepts: vi.fn(),
}));
vi.mock("./learning-resource-links", () => ({
  findResourceLinksForConceptsAction: vi.fn(),
}));

import { requireUser } from "@/lib/supabase/auth";
import { getWritingStyleBlock } from "./writing-style-block";
import { callLlm } from "@/lib/llm";
import {
  listAnnouncementExemplars,
  getMostRecentAnnouncementExemplar,
  saveAnnouncementExemplar,
  deleteAnnouncementExemplar,
} from "@/lib/announcement-exemplars";
import { createAnnouncementFromMarkdown } from "@/lib/canvas";
import { createAnnouncementFromSafeHtml } from "@/lib/canvas/announcements";
import {
  draftWalkthroughAnnouncementAction,
  prepareWalkthroughAnnouncementPromptAction,
  draftWalkthroughVideoScriptAction,
  gatherWalkthroughResourcesAction,
  listAnnouncementExemplarsAction,
  getMostRecentAnnouncementExemplarAction,
  saveAnnouncementExemplarAction,
  deleteAnnouncementExemplarAction,
  postWalkthroughAnnouncementAction,
} from "./walkthrough-announcement";
import { deriveAnnouncementOutline } from "@/lib/announcement-outline";
import { derivePreviousAnnouncementOutline } from "@/lib/previous-announcement-outline";
import { encodePreviousAnnouncementHtml } from "@/lib/announcement-library-rich-text";
import { walkthroughAnnouncementMaxOutputTokens } from "@/lib/walkthrough-announcement-bounds";
import { EMPTY_ANNOUNCEMENT_OUTLINE } from "@/lib/announcement-outline-types";
import { deriveResourceConcepts } from "./learning-resources-generator";
import { findResourceLinksForConceptsAction } from "./learning-resource-links";

const USER = { id: "user-1", email: "user@example.edu" };

const CREDENTIAL_SHAPED_BODY =
  "Bad Request: the request to https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=AIzaSyREALLOOKINGSECRET123 could not be processed";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue(USER as never);
  vi.mocked(getWritingStyleBlock).mockResolvedValue("");
});

const REALISTIC_OUTLINE = deriveAnnouncementOutline(
  "Hi everyone,\n\nDue This Week\n- Homework 3\n- Quiz 2\n\nBest,\nProf."
);

// Ruling 11: emojiPolicy/researchedResources/researchOutcome are now
// REQUIRED fields on WalkthroughAnnouncementDraftInput - shared no-op values
// for tests that are not exercising the research/emoji features themselves.
const NO_RESEARCH = { kind: "off" as const };
const NO_RESEARCHED_RESOURCES: ReadonlyArray<{ title: string; url: string }> = [];

it("accepts a flat top-level placeholder map without dropping unknown fields", async () => {
  const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Current content.", outline: EMPTY_ANNOUNCEMENT_OUTLINE, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "forbidden" as const, timing: "midweek" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
  vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, status: 200, text: JSON.stringify({ title: "Update", s1_p0: "Current content." }) } as never);
  expect(await draftWalkthroughAnnouncementAction(input)).toHaveProperty("message", "Current content.");
  vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, status: 200, text: JSON.stringify({ title: "Update", s1_p0: "Current content.", other: "Important detail" }) } as never);
  expect(await draftWalkthroughAnnouncementAction(input)).toHaveProperty("error");
});

it("logs only a fixed validation category without model content", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Current content.", outline: EMPTY_ANNOUNCEMENT_OUTLINE, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "forbidden" as const, timing: "midweek" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
    vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify({ title: "", placeholders: { s1_p0: "private content" } }) } as never);
    expect(await draftWalkthroughAnnouncementAction(input)).toHaveProperty("error");
    expect(log).toHaveBeenCalledWith("Walkthrough draft validation", "missing-title");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private content");
  } finally { log.mockRestore(); }
});

it("uses the reviewed placeholder contract even if the writing style changes afterwards", async () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-signing-key");
  try {
  const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Current content.", outline: EMPTY_ANNOUNCEMENT_OUTLINE, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "forbidden" as const, timing: "midweek" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
  vi.mocked(getWritingStyleBlock).mockResolvedValueOnce("old style").mockResolvedValueOnce("new style");
  const prepared = await prepareWalkthroughAnnouncementPromptAction(input);
  if (!("prompt" in prepared)) throw new Error("Missing prompt");
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify({ title: "Update", placeholders: { s1_p0: "Current content." } }) } as never);
  const result = await draftWalkthroughAnnouncementAction({ ...input, promptOverride: prepared.prompt, promptPreparedFor: prepared.preparedFor, promptSignature: prepared.promptSignature, promptContextSignature: prepared.promptContextSignature });
  expect(result).toHaveProperty("message", "Current content.");
  expect((vi.mocked(callLlm).mock.calls[0][0].contents[0].parts[0] as { text: string }).text).toBe(prepared.prompt);
  } finally { vi.unstubAllEnvs(); }
});

it("retries an empty default response once", async () => {
  const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Current content.", outline: EMPTY_ANNOUNCEMENT_OUTLINE, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "forbidden" as const, timing: "midweek" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
  vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, status: 200, text: "" } as never).mockResolvedValueOnce({ ok: true, status: 200, text: JSON.stringify({ title: "Update", placeholders: { s1_p0: "Current content." } }) } as never);
  expect(await draftWalkthroughAnnouncementAction(input)).toHaveProperty("message", "Current content.");
  expect(callLlm).toHaveBeenCalledTimes(2);
});

it("does not retry an instructor-edited prompt", async () => {
  const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Current content.", outline: EMPTY_ANNOUNCEMENT_OUTLINE, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "forbidden" as const, timing: "midweek" as const, researchedResources: [], researchOutcome: NO_RESEARCH, promptOverride: "Instructor prompt", promptPreparedFor: USER.id };
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: "not json" } as never);
  expect(await draftWalkthroughAnnouncementAction(input)).toHaveProperty("error");
  expect(callLlm).toHaveBeenCalledTimes(1);
});

it("does not treat an edited prompt as unchanged using a prior signature", async () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-signing-key");
  try {
    const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Current content.", outline: EMPTY_ANNOUNCEMENT_OUTLINE, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "forbidden" as const, timing: "midweek" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
    const prepared = await prepareWalkthroughAnnouncementPromptAction(input);
    if (!("prompt" in prepared)) throw new Error("Missing prompt");
    vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: "not json" } as never);
    await draftWalkthroughAnnouncementAction({ ...input, promptOverride: prepared.prompt + "\nInstructor edit", promptPreparedFor: prepared.preparedFor, promptSignature: prepared.promptSignature, promptContextSignature: prepared.promptContextSignature });
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(vi.mocked(callLlm).mock.calls[0][0].generationConfig?.responseMimeType).toBeUndefined();
  } finally { vi.unstubAllEnvs(); }
});

it("rejects a signed reviewed prompt after its inputs change or it expires", async () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-signing-key");
  try {
    const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Current content.", outline: EMPTY_ANNOUNCEMENT_OUTLINE, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "forbidden" as const, timing: "midweek" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
    const prepared = await prepareWalkthroughAnnouncementPromptAction(input);
    if (!("prompt" in prepared)) throw new Error("Missing prompt");
    const reviewed = { promptOverride: prepared.prompt, promptPreparedFor: prepared.preparedFor, promptSignature: prepared.promptSignature, promptContextSignature: prepared.promptContextSignature };
    for (const changed of [{ ...input, materialsText: "Changed content." }, { ...input, emojiPolicy: "requested" as const }, { ...input, matchExample: false }]) {
      expect(await draftWalkthroughAnnouncementAction({ ...changed, ...reviewed })).toHaveProperty("error", "The reviewed prompt has expired or its inputs changed. Prepare it again.");
    }
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31 * 60_000);
    expect(await draftWalkthroughAnnouncementAction({ ...input, ...reviewed })).toHaveProperty("error", "The reviewed prompt has expired or its inputs changed. Prepare it again.");
    expect(callLlm).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); vi.unstubAllEnvs(); }
});

it("rejects mixing a signed prompt with another preparation's context", async () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-signing-key");
  try {
    const input = { courseLabel: "Course", moduleLabel: null, materialsText: "First material.", outline: EMPTY_ANNOUNCEMENT_OUTLINE, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "forbidden" as const, timing: "midweek" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
    const otherInput = { ...input, materialsText: "Second material." };
    const first = await prepareWalkthroughAnnouncementPromptAction(input);
    const second = await prepareWalkthroughAnnouncementPromptAction(otherInput);
    if (!("prompt" in first) || !("prompt" in second)) throw new Error("Missing prompt");
    expect(await draftWalkthroughAnnouncementAction({ ...otherInput, promptOverride: first.prompt, promptPreparedFor: first.preparedFor, promptSignature: first.promptSignature, promptContextSignature: second.promptContextSignature })).toHaveProperty("error", "The reviewed prompt has expired or its inputs changed. Prepare it again.");
    expect(callLlm).not.toHaveBeenCalled();
  } finally { vi.unstubAllEnvs(); }
});

it("assembles supported template sections deterministically and rejects content omitted by section data", async () => {
  const outline = deriveAnnouncementOutline("Introduction.\nComplete:\n- Read the source.\n- Submit the work.\nQuiz Details:\n- Due Sunday\n- Points 20");
  const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Current project and reading.", outline, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "forbidden" as const, timing: "beginning-of-week" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
  const sections = [{ index: 1, heading: null, paragraphs: ["Current introduction."], items: [] }, { index: 2, heading: "Complete", paragraphs: [], items: ["Read the chapter.", "Submit the project."] }];
  const message = "Current introduction.\n\nComplete\n1. Read the chapter.\n2. Submit the project.";
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify({ title: "Update", message, sections }) } as never);
  const result = await draftWalkthroughAnnouncementAction(input);
  expect(result).toHaveProperty("message", "Current introduction.\n\n## Complete\n\n- Read the chapter.\n- Submit the project.");
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify({ title: "Update", message: message + "\nDo not omit this fact.", sections }) } as never);
  expect(await draftWalkthroughAnnouncementAction(input)).toHaveProperty("error", "The draft sections did not match the complete message. Try again.");
});

it("renders newly chosen emoji only at saved example positions and respects the toggle", async () => {
  const oldIcon = String.fromCodePoint(0x1f4cc), newIcon = String.fromCodePoint(0x1f4a1);
  const outline = deriveAnnouncementOutline(`## ${oldIcon} Complete\n- Read the chapter.`);
  const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Read the current chapter.", outline, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "requested" as const, timing: "beginning-of-week" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
  const section = { index: 1, heading: "Complete", paragraphs: [], items: ["Read the current chapter."], emojis: [{ target: "heading", index: 0, position: "prefix", value: newIcon }] };
  const message = `## ${newIcon} Complete\n- Read the current chapter.`;
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify({ title: "Update", message, sections: [section] }) } as never);
  const prepared = await prepareWalkthroughAnnouncementPromptAction(input);
  if (!("prompt" in prepared)) throw new Error("Missing prompt");
  expect(prepared.prompt).not.toContain(oldIcon);
  expect(prepared.prompt).toContain("heading 0 prefix");
  const result = await draftWalkthroughAnnouncementAction(input);
  expect(result).toHaveProperty("message", `## ${newIcon} Complete\n\n- Read the current chapter.`);
  const off = await draftWalkthroughAnnouncementAction({ ...input, emojiPolicy: "forbidden" });
  expect(off).toHaveProperty("error", "The draft did not match the requested section structure. Try again.");
});

it("rejects emoji in a structured title even when the emoji toggle is off", async () => {
  const icon = String.fromCodePoint(0x1f4cc);
  const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Read the current chapter.", outline: EMPTY_ANNOUNCEMENT_OUTLINE, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "forbidden" as const, timing: "beginning-of-week" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify({ title: `${icon} Update`, message: "Read the current chapter.", sections: [{ index: 1, heading: null, paragraphs: ["Read the current chapter."], items: [] }] }) } as never);
  expect(await draftWalkthroughAnnouncementAction(input)).toHaveProperty("error", "The draft title included an unsupported emoji. Try again.");
});

it("does not return a heading and synthetic welcome after all body content is stripped", async () => {
  const outline = deriveAnnouncementOutline("Welcome!\nQuiz Details:\n- Due Sunday\n- Points 20");
  const input = { courseLabel: "Course", moduleLabel: null, materialsText: "A current quiz is available.", outline, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "forbidden" as const, timing: "beginning-of-week" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
  const message = "Quiz Details\n- https://unverified.example/old";
  const sections = [{ index: 2, heading: "Quiz Details", paragraphs: [], items: ["https://unverified.example/old"] }];
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify({ title: "Update", message, sections }) } as never);
  expect(await draftWalkthroughAnnouncementAction(input)).toHaveProperty("error", "Generated announcement has no content after removing unverified links. Try again.");
});

it("preserves a complete unstructured draft with a formatting warning", async () => {
  const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Current content.", outline: EMPTY_ANNOUNCEMENT_OUTLINE, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "forbidden" as const, timing: "beginning-of-week" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify({ title: "Update", message: "Current content." }) } as never);
  const result = await draftWalkthroughAnnouncementAction(input);
  expect(result).toHaveProperty("message", "Current content.");
  expect(result).toHaveProperty("formatFallback", true);
  const icon = String.fromCodePoint(0x1f4cc);
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify({ title: "Update", message: `${icon} Current content.` }) } as never);
  expect(await draftWalkthroughAnnouncementAction(input)).toHaveProperty("error", "The draft included unsupported emoji. Try again.");
});

it("accepts a single generated section for an unheaded example with a styled bullet list", async () => {
  const derived = derivePreviousAnnouncementOutline(encodePreviousAnnouncementHtml('<p style="color:red">Old introduction.</p><ul><li>Old item.</li></ul>'));
  const outline = { ...derived, sections: [derived.sections[0]] };
  const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Current introduction and task.", outline, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "forbidden" as const, timing: "midweek" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
  const prepared = await prepareWalkthroughAnnouncementPromptAction(input);
  if (!("prompt" in prepared)) throw new Error("Missing prompt");
  expect(prepared.prompt).toContain("an unordered list");
  expect(prepared.prompt).toContain("Return ONLY valid JSON with title and placeholders");
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify({ title: "Update", sections: [{ index: 1, heading: null, paragraphs: ["Current introduction."], items: ["Current task."], emojis: [] }] }) } as never);
  const result = await draftWalkthroughAnnouncementAction(input);
  expect(result).toHaveProperty("message");
  if (!("message" in result)) throw new Error("Missing draft");
  expect(result.message).toContain("Current introduction.");
  expect(result.message).toContain("Current task.");
});

it("preserves safe section content and the saved list kind when the model changes a heading", async () => {
  const outline = deriveAnnouncementOutline("## Complete\n1. Old task.");
  const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Current introduction and task.", outline, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "forbidden" as const, timing: "midweek" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify({ title: "Update", sections: [{ index: 1, heading: null, paragraphs: ["Current introduction."], items: ["Current task."], emojis: [] }] }) } as never);
  const result = await draftWalkthroughAnnouncementAction(input);
  expect(result).toHaveProperty("message", "Current introduction.\n\n1. Current task.");
  expect(result).toHaveProperty("formatFallback", true);
});

it("preserves the draft with a warning when there is no saved emoji position", async () => {
  const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Current content.", outline: EMPTY_ANNOUNCEMENT_OUTLINE, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "requested" as const, timing: "midweek" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
  const icon = String.fromCodePoint(0x1f4cc);
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify({ title: "Update", sections: [{ index: 1, heading: null, paragraphs: ["Current content."], items: [], emojis: [{ target: "paragraph", index: 0, position: "prefix", value: icon }] }] }) } as never);
  const result = await draftWalkthroughAnnouncementAction(input);
  expect(result).toHaveProperty("message", "Current content.");
  expect(result).toHaveProperty("formatFallback", true);
});

it("assembles plain template placeholders and selects emoji at saved positions", async () => {
  const old = String.fromCodePoint(0x1f4cc), chosen = String.fromCodePoint(0x1f4a1);
  const outline = deriveAnnouncementOutline(`## ${old} Complete\n- Old item.`);
  const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Current task.", outline, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "requested" as const, timing: "midweek" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify({ title: "Update", placeholders: { s1_i0: "Current task.", s1_emoji0: chosen } }) } as never);
  expect(await draftWalkthroughAnnouncementAction(input)).toHaveProperty("message", `## ${chosen} Complete\n\n- Current task.`);
});

it("does not discard malformed emoji text when another section was adjusted", async () => {
  const icon = String.fromCodePoint(0x1f4cc);
  const outline = deriveAnnouncementOutline(`## ${icon} Complete\n- Old task.\n\n## More\nOld content.`);
  const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Current tasks.", outline, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "requested" as const, timing: "midweek" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
  const sections = [
    { index: 1, heading: "Complete", paragraphs: [], items: ["Current task."], emojis: [{ target: "item", index: 0, position: "suffix", value: icon }] },
    { index: 2, heading: "More", paragraphs: ["Current content."], items: [], emojis: [{ target: "paragraph", index: 0, position: "prefix", value: "Important deadline" }] },
  ];
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify({ title: "Update", sections }) } as never);
  expect(await draftWalkthroughAnnouncementAction(input)).toHaveProperty("error");
});

it.each([
  ["scalar paragraph", "First current detail.", [], "First current detail."],
  ["multiline paragraph", ["First current detail.\nSecond current detail."], [], "First current detail.\n\nSecond current detail."],
])("recovers a %s without losing content", async (_label, paragraphs, items, expected) => {
  const input = { courseLabel: "Course", moduleLabel: null, materialsText: "Current details.", outline: EMPTY_ANNOUNCEMENT_OUTLINE, matchExample: true, coverageBlock: "", notes: "", emojiPolicy: "forbidden" as const, timing: "midweek" as const, researchedResources: [], researchOutcome: NO_RESEARCH };
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify({ title: "Update", sections: [{ index: 1, heading: null, paragraphs, items, emojis: [] }] }) } as never);
  const result = await draftWalkthroughAnnouncementAction(input);
  expect(result).toHaveProperty("message", expected);
  expect(result).toHaveProperty("formatFallback", true);
});
