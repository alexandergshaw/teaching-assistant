import { describe, expect, it } from "vitest";
import { changePartCue, missingCueVoices, renderBlocker, type LectureAudio, type LecturePart } from "./lectureProject";

const clip: LectureAudio = { blob: new Blob(), duration: 2, name: "Narration" };
const part: LecturePart = {
  id: "part-1",
  title: "Lecture part",
  focus: "",
  source: new File([], "lecture.webm"),
  duration: 10,
  cues: [
    { id: "first", start: "0", end: "3", text: "First example.", audio: clip },
    { id: "second", start: "4", end: "7", text: "Second example.", audio: clip },
  ],
  audioMode: "cues",
  watchUrl: "",
  output: new Blob(),
};

describe("lecture export readiness", () => {
  it("blocks overlapping or overlong cues", () => {
    expect(renderBlocker(part)).toBeUndefined();
    expect(renderBlocker(changePartCue(part, "second", (cue) => ({ ...cue, start: "2" }))))
      .toMatch(/timing/i);
    expect(renderBlocker(changePartCue(part, "first", (cue) => ({ ...cue, end: "1" }))))
      .toMatch(/timing/i);
  });

  it("can retry missing narration without replacing audio on other cues", () => {
    const edited = changePartCue(part, "first", (cue) => ({ ...cue, text: "New example.", audio: undefined }));
    expect(missingCueVoices(edited).map((cue) => cue.id)).toEqual(["first"]);
    expect(edited.cues[1]).toBe(part.cues[1]);
    expect(edited.output).toBeUndefined();
    expect(renderBlocker(edited)).toMatch(/generate audio/i);
  });

  it("keeps an imported-take export when the notes change", () => {
    const imported = { ...part, audioMode: "take" as const, take: clip };
    expect(changePartCue(imported, "first", (cue) => ({ ...cue, text: "Notes only." })).output).toBe(part.output);
    expect(renderBlocker({ ...imported, take: { ...clip, duration: 11 } })).toMatch(/longer/i);
  });
});
