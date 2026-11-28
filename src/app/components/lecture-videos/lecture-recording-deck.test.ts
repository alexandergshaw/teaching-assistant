import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { buildSlidesPptx } from "@/lib/pptx";
import { buildLectureRecordingDeck, lectureSlideDeckBlocker } from "./lecture-recording-deck";
import { lectureDownloads, selectedLectureDownloads } from "./lecture-downloads";
import { emptyProject, keepCurrentLectureExports, type LecturePart } from "./lectureProject";

vi.mock("@/app/actions/media", () => ({ generateSlidesAction: vi.fn() }));

const part: LecturePart = {
  id: "part-1", title: "Intro to loops", focus: "Explain the for loop", source: new File(["recording"], "loops.webm", { type: "video/webm" }),
  duration: 45, cues: [], audioMode: "source", watchUrl: "",
};
const project = { ...emptyProject(), title: "Coding concepts", goal: "First-time learners", materials: "Short JavaScript examples." };
const frames = [{ timeSec: 4.75, base64: "ZmFrZQ==" }];
const draft = { presentationTitle: "Intro to loops", slides: [{ title: "Repeat a step", bullets: ["Use a for loop."] }] };

function createBrowserMock() {
  return {
    frames: vi.fn(async () => frames),
    speech: vi.fn(async () => ({ text: "Today let's repeat an operation four times.", truncated: false })),
    slides: vi.fn<typeof import("@/app/actions/media").generateSlidesAction>().mockResolvedValue(draft),
    pptx: vi.fn((value: typeof draft) => buildSlidesPptx(value)),
  };
}

describe("recording PowerPoint workflow", () => {
  it("fits drafts to the selected institution and passes only layout capacity to Gemini", async () => {
    const runtime = createBrowserMock();
    const branding = { acronym: "WNCC", fileId: "selected", fileName: "Private campus master.potx" };
    const fit = { kind: "fixed" as const, bulletSlots: [1] };
    const bytes = new Blob(["branded output"]);
    const fill = vi.fn(async () => bytes);
    const brand = vi.fn(async () => ({ fit, fill }));
    const signal = new AbortController().signal;
    const out = await buildLectureRecordingDeck(part, 0, { ...project, slideDeckBranding: branding }, signal, vi.fn(), { ...runtime, brand }, "account");
    expect(brand).toHaveBeenCalledExactlyOnceWith("account", branding, signal);
    expect(runtime.slides).toHaveBeenCalledExactlyOnceWith(expect.not.stringContaining(branding.fileName), "gemini", { frames, brandFit: fit });
    expect(fill).toHaveBeenCalledExactlyOnceWith(draft.slides);
    expect(runtime.pptx).not.toHaveBeenCalled();
    expect(out).toMatchObject({ blob: bytes, branding });
  });

  it("does not substitute standard PowerPoint or begin paid work when the selected template is missing", async () => {
    const runtime = createBrowserMock();
    const brand = vi.fn(async () => { throw new Error("Template missing"); });
    const branding = { acronym: "WNCC", fileId: "deleted", fileName: "Campus.pptx" };
    const saved = { ...part, slideDeck: { title: "Earlier deck", blob: new Blob(["saved deck"]), warnings: [] } };
    await expect(buildLectureRecordingDeck(saved, 0, { ...project, slideDeckBranding: branding }, new AbortController().signal, vi.fn(), { ...runtime, brand }, "account"))
      .rejects.toThrow("Template missing");
    expect(runtime.frames).not.toHaveBeenCalled();
    expect(runtime.speech).not.toHaveBeenCalled();
    expect(runtime.slides).not.toHaveBeenCalled();
    expect(runtime.pptx).not.toHaveBeenCalled();
    expect(saved.slideDeck.title).toBe("Earlier deck");
  });

  it("combines original speech, visible evidence, and project context into an editable PPTX", async () => {
    const runtime = createBrowserMock();
    const slideDeck = await buildLectureRecordingDeck(part, 0, project, new AbortController().signal, vi.fn(), runtime);
    expect(runtime.frames).toHaveBeenCalledExactlyOnceWith(part, expect.any(AbortSignal));
    expect(runtime.speech).toHaveBeenCalledExactlyOnceWith(part, expect.any(AbortSignal), expect.any(Function));
    expect(runtime.slides).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("Original spoken transcript:\nToday"), "gemini", { frames });
    const context = runtime.slides.mock.calls[0][0];
    expect(context).toContain("First-time learners");
    expect(context).toContain("Explain the for loop");
    expect(context).toContain("Short JavaScript examples.");
    expect(slideDeck.blob.type).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(slideDeck.warnings).toEqual([]);
    const xml = await (await JSZip.loadAsync(await slideDeck.blob.arrayBuffer())).file("ppt/slides/slide2.xml")?.async("string");
    expect(xml).toContain("<a:t>Use a for loop.</a:t>");
  });

  it("can draft a deck from an otherwise silent recording and from speech with unavailable visuals", async () => {
    const runtime = createBrowserMock();
    runtime.pptx.mockResolvedValue(new Uint8Array([0x50, 0x4b]).buffer);
    runtime.speech.mockResolvedValueOnce({ text: "", truncated: false });
    const silent = await buildLectureRecordingDeck(part, 0, project, new AbortController().signal, vi.fn(), runtime);
    expect(runtime.slides).toHaveBeenCalledWith(expect.not.stringContaining("Original spoken transcript"), "gemini", { frames });
    expect(silent.warnings).toContain("No speech was detected. The deck used visible material.");

    runtime.frames.mockRejectedValueOnce(new Error("Browser could not read keyframes"));
    const audible = await buildLectureRecordingDeck(part, 0, project, new AbortController().signal, vi.fn(), runtime);
    expect(runtime.slides).toHaveBeenLastCalledWith(expect.stringContaining("Original spoken transcript"), "gemini", { frames: [] });
    expect(audible.warnings).toContain("The deck used spoken content because the original video frames could not be read.");
  });

  it("requires evidence from the recording and does not generate from project notes alone", async () => {
    const runtime = createBrowserMock();
    runtime.frames.mockRejectedValue(new Error("No frames"));
    runtime.speech.mockResolvedValue({ text: "", truncated: false });
    await expect(buildLectureRecordingDeck(part, 0, project, new AbortController().signal, vi.fn(), runtime)).rejects.toThrow("No readable frames or spoken content");
    expect(runtime.slides).not.toHaveBeenCalled();
    expect(lectureSlideDeckBlocker({ ...part, duration: 1201 })).toMatch(/20 minutes/);
  });

  it("only replaces a previous deck after a successful generation and file build", async () => {
    const runtime = createBrowserMock();
    runtime.pptx.mockRejectedValue(new Error("Export failed"));
    const slideDeck = { title: "Earlier deck", blob: new Blob(["old deck"]), warnings: [] };
    const saved = { ...part, slideDeck };
    await expect(buildLectureRecordingDeck(saved, 0, project, new AbortController().signal, vi.fn(), runtime)).rejects.toThrow("Export failed");
    const output = readFileSync(new URL("./LectureSlideDeckOutput.tsx", import.meta.url), "utf8");
    expect(output).toMatch(/const slideDeck = await buildLectureRecordingDeck[\s\S]+signal\.throwIfAborted\(\);\s*update\(\(previous\) => \(\{ \.\.\.previous, slideDeck \}\)\);/);
    expect(keepCurrentLectureExports(saved, { ...saved, focus: "Revised focus" }).slideDeck).toBe(slideDeck);
    expect(keepCurrentLectureExports(saved, { ...saved, source: new File(["new recording"], "new.webm") }).slideDeck).toBeUndefined();
  });

  it("offers the deck as an individual artifact and includes it in selected downloads", () => {
    const slideDeck = { title: "Ready", blob: new Blob(["file"]), warnings: [] };
    const downloads = lectureDownloads({ ...part, slideDeck }, 0);
    expect(downloads.map((artifact) => artifact.kind)).toEqual(["original", "slides"]);
    expect(selectedLectureDownloads(downloads, new Set(["part-1:slides"]))).toEqual([{
      id: "part-1:slides", kind: "slides", label: "Editable slide deck (PPTX)", fileName: "part-01-Intro to loops-slides.pptx", blob: slideDeck.blob,
    }]);
  });

  it("clears cancelled progress immediately and scopes late reports to their originating run", () => {
    const output = readFileSync(new URL("./LectureSlideDeckOutput.tsx", import.meta.url), "utf8");
    expect(output).toMatch(/const clearProgress = \(\) => \{\s*if \(generation.current === attempt\) setProgress\(""\);/);
    expect(output).toContain('signal.addEventListener("abort", clearProgress, { once: true })');
    expect(output).toContain("if (!signal.aborted && generation.current === attempt) setProgress(message)");
    expect(output).toMatch(/finally \{\s*signal\.removeEventListener\("abort", clearProgress\);\s*clearProgress\(\);/);
  });
});
