import { describe, expect, it, vi } from "vitest";
import { changePartCue, emptyProject, loadLectureProject, missingCueVoices, removeProjectVoiceReference, renderBlocker, type LectureAudio, type LecturePart } from "./lectureProject";

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
  it("allows original audio only even with an unfinished narration draft", () => {
    const sourceOnly: LecturePart = { ...part, audioMode: "source", output: undefined };
    const edited = changePartCue(sourceOnly, "first", (cue) => ({ ...cue, audio: undefined }));
    expect(renderBlocker(edited)).toBeUndefined();
    expect(edited.source).toBe(part.source);
    expect(edited.cues).toHaveLength(2);
    expect(renderBlocker({ ...edited, audioMode: "cues" })).toMatch(/generate audio/i);
  });

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

  it("preserves saved audio and exports when an active voice is deleted", () => {
    const project = { ...emptyProject(), parts: [part], voice: { id: "voice-1", name: "Narrator" } };
    expect(removeProjectVoiceReference(project, "voice-2", true)).toBe(project);
    const changed = removeProjectVoiceReference(project, "voice-1", false);
    expect(changed.voice).toBeUndefined();
    expect(changed.voiceSelectionRequired).toBe(true);
    expect(changed.parts).toBe(project.parts);
    expect(renderBlocker(changed.parts[0])).toBeUndefined();
    const followsDefault = { ...project, voice: undefined };
    expect(removeProjectVoiceReference(followsDefault, "voice-1", true).voiceSelectionRequired).toBe(true);
  });
});

it("opens an existing lecture under the same account and storage key", async () => {
  const project = {
    title: "Lecture 15",
    parts: [part],
    selectedId: part.id,
    voice: { id: "saved-voice", name: "Saved voice" },
    announcementBody: "Watch both recordings.",
  };
  const request = { result: { revision: 8, project }, onsuccess: () => {} };
  const get = vi.fn(() => {
    queueMicrotask(() => request.onsuccess());
    return request;
  });
  const database = { transaction: () => ({ objectStore: () => ({ get }) }), close: vi.fn() };
  const open = vi.fn(() => {
    const pending = { result: database, onsuccess: () => {} };
    queueMicrotask(() => pending.onsuccess());
    return pending;
  });
  vi.stubGlobal("indexedDB", { open });
  try {
    const saved = await loadLectureProject("instructor");
    expect(open).toHaveBeenCalledWith("teaching-assistant-lecture-videos", 1);
    expect(get).toHaveBeenCalledWith("instructor");
    expect(saved.revision).toBe(8);
    expect(saved.project).toMatchObject(project);
    expect(saved.project.parts[0].cues).toBe(part.cues);
    expect(saved.project.parts[0].output).toBe(part.output);
    expect(saved.project.goal ?? "").toBe("");
  } finally {
    vi.unstubAllGlobals();
  }
});
