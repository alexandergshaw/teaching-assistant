import { expect, it, vi } from "vitest";
import { generateVideoNarrationAction } from "@/app/actions";
import { extractVideoFrames } from "@/lib/narrate-video";
import { draftPartCues } from "./lectureWorkflow";
import { emptyProject, type LecturePart } from "./lectureProject";

vi.mock("@/app/actions", () => ({ generateVideoNarrationAction: vi.fn(), synthesizeNarrationAction: vi.fn() }));
vi.mock("@/lib/narrate-video", () => ({ extractVideoFrames: vi.fn() }));

it("uses the current video goal and notes for Gemini's generic drafting path", async () => {
  const signal = new AbortController().signal;
  const video: LecturePart = {
    id: "demo", title: "Account tour", focus: "At 2:02.5 show the settings menu.",
    source: new File([], "demo.mp4"), duration: 155, cues: [], audioMode: "cues", watchUrl: "",
  };
  const project = {
    ...emptyProject(), title: "Product onboarding", goal: "Guide first-time users through account settings.",
    guidance: "At 2:30, leave a pause.", sample: "First, open the menu.", materials: "The menu has three options.", parts: [video],
  };
  const frames = [{ timeSec: 122.8, base64: "FRAME" }];
  vi.mocked(extractVideoFrames).mockResolvedValue({ frames, durationSec: 155 });
  vi.mocked(generateVideoNarrationAction).mockResolvedValue({ segments: [{ start: 122.8, end: 129.2, text: "Open settings." }] });

  const cues = await draftPartCues(video, 0, project, signal);

  const [, count, selection] = vi.mocked(extractVideoFrames).mock.lastCall!;
  expect(count).toBe(18);
  expect(selection).toEqual({ timestampNotes: `${video.focus}\n${project.goal}\n${project.guidance}`, signal });
  const [sentFrames, duration, context, provider, mode] = vi.mocked(generateVideoNarrationAction).mock.lastCall!;
  expect([sentFrames, duration, provider, mode]).toEqual([frames, 155, "gemini", "general"]);
  for (const value of [project.title, project.goal, project.guidance, project.sample, project.materials, video.focus]) {
    expect(context).toContain(value);
  }
  expect(context).not.toMatch(/lecture|instructor/i);
  expect(cues).toEqual([{ id: expect.any(String), start: "122.8", end: "129.2", text: "Open settings." }]);
});
