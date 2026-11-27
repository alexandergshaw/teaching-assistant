import { afterEach, describe, expect, it, vi } from "vitest";
import { lectureDownloads, requestLectureDownloads, selectedLectureDownloads, setLectureDownloadSelection } from "./lecture-downloads";
import { narrationWavBlocker, prepareLectureNarrationWav } from "./lecture-export-audio";
import { lectureCaptionRenderSource } from "./lecture-captions";
import { keepCurrentLectureExports, type LecturePart } from "./lectureProject";

const original = new File(["exact uploaded bytes"], "original capture.mov", { type: "video/quicktime" });
const narrationWav = new Blob(["wav"], { type: "audio/wav" });
const output = new Blob(["narrated"], { type: "video/mp4;codecs=avc1,mp4a.40.2" });
const captionedOriginal = new Blob(["original audio and captions"], { type: "video/mp4" });
const captionedNarrated = new Blob(["captioned and narrated"], { type: "video/webm" });
const audio = { name: "Voice", duration: 1, blob: new Blob(["voice"], { type: "audio/mpeg" }) };
const part: LecturePart = {
  id: "lecture-1",
  title: "Week / Review",
  focus: "",
  source: original,
  duration: 8,
  watchUrl: "",
  audioMode: "cues",
  cues: [
    { id: "ending", start: "5", end: "7", text: "Second script line", audio },
    { id: "opening", start: "0.5", end: "2", text: "First script line", audio },
  ],
  captions: { mode: "custom", custom: [{ id: "caption", start: "0.5", end: "2", text: "Reviewed caption text" }] },
  narrationWav, output, captionedOriginal, captionedNarrated,
};

describe("lecture download artifacts", () => {
  it("renders each burned-in version from its matching audio source", () => {
    expect(lectureCaptionRenderSource(part, "original")).toBe(original);
    expect(lectureCaptionRenderSource(part, "narrated")).toBe(output);
    expect(lectureCaptionRenderSource({ ...part, audioMode: "source" }, "narrated")).toBeUndefined();
    expect(lectureCaptionRenderSource({ ...part, output: undefined }, "narrated")).toBeUndefined();
  });

  it("orders and names all ready exports and preserves unmodified original bytes", async () => {
    const files = lectureDownloads(part, 0);
    expect(files.map(({ kind, fileName }) => [kind, fileName])).toEqual([
      ["original", "original capture.mov"],
      ["narration", "part-01-Week - Review-narration.wav"],
      ["transcript", "part-01-Week - Review-transcript.txt"],
      ["captions", "part-01-Week - Review-captions.vtt"],
      ["narrated", "part-01-Week - Review-narrated.mp4"],
      ["captioned-original", "part-01-Week - Review-original-captioned.mp4"],
      ["captioned-narrated", "part-01-Week - Review-narrated-captioned.webm"],
    ]);
    expect(files[0].blob).toBe(original);
    expect(await files[0].blob.text()).toBe("exact uploaded bytes");
    expect(files[1].blob).toBe(narrationWav);
    expect(await files[2].blob.text()).toBe("Reviewed caption text\n");
    expect(await files[3].blob.text()).toMatch(/^WEBVTT/);
    expect(files[4].blob).toBe(output);
    expect(files[5].blob).toBe(captionedOriginal);
    expect(files[6].blob).toBe(captionedNarrated);
    expect(files[6].label).toBe("Narrated video with burned-in captions");
  });

  it("keeps the imported narration format and exports the script when captions are off", async () => {
    const take = { ...audio, name: "voice.MP3" };
    const files = lectureDownloads({ ...part, audioMode: "take", take, captions: { mode: "off" }, output: undefined }, 2);
    expect(files.map((file) => file.kind)).toEqual(["original", "narration", "transcript"]);
    expect(files[1]).toMatchObject({ blob: take.blob, fileName: "part-03-Week - Review-narration-take.mp3" });
    expect(await files[2].blob.text()).toBe("First script line\n\nSecond script line\n");
  });

  it("offers original-audio captioned video without requiring a narration render", () => {
    const sourceOnly = { ...part, audioMode: "source" as const, output: undefined };
    const files = lectureDownloads(sourceOnly, 0);
    expect(files.map((file) => file.kind)).toEqual(["original", "transcript", "captions", "captioned-original"]);
    expect(files.at(-1)?.label).toBe("Original-audio video with burned-in captions");
    expect(lectureDownloads({ ...sourceOnly, duration: 1 }, 0).map((file) => file.kind)).toEqual(["original", "transcript"]);
  });

  it("exports the full script as text even when only some cues have voiced captions", async () => {
    const files = lectureDownloads({ ...part, captions: { mode: "narration" }, cues: [{ ...part.cues[0], audio: undefined }, part.cues[1]] }, 0);
    const transcript = files.find((file) => file.kind === "transcript");
    const captions = files.find((file) => file.kind === "captions");
    expect(await transcript?.blob.text()).toBe("First script line\n\nSecond script line\n");
    expect(await captions?.blob.text()).not.toContain("Second script line");
  });

  it("excludes unfinished and empty generated files", () => {
    const files = lectureDownloads({ ...part, narrationWav: undefined, output: new Blob(), captions: { mode: "off" } }, 0);
    expect(files.map((file) => file.kind)).toEqual(["original", "transcript"]);
  });
});

describe("lecture download selection", () => {
  it("toggles a recording group and individual files without including stale or unchecked files", () => {
    const first = lectureDownloads(part, 0);
    const second = lectureDownloads({ ...part, id: "lecture-2", title: part.title }, 1);
    const files = [...first, ...second];
    expect(second[1].fileName).not.toBe(first[1].fileName);
    const start = new Set([second[0].id, "removed-recording:original"]);
    const withFirst = setLectureDownloadSelection(start, first.map((file) => file.id), true);
    const selected = setLectureDownloadSelection(withFirst, [first[0].id], false);
    expect(selectedLectureDownloads(files, selected)).toEqual([...first.slice(1), second[0]]);
    expect(start.size).toBe(2);
  });

  it("requests each selected Blob-backed anchor separately and in displayed order", () => {
    const files = lectureDownloads(part, 0);
    const observed: string[] = [];
    const selected = selectedLectureDownloads(files, new Set([files[5].id, files[0].id, files[1].id]));
    const anchors = new Map(files.filter((file) => file.kind !== "narration").map((file) => [file.id, {
      click: () => observed.push(file.fileName),
    }]));
    expect(requestLectureDownloads(selected, anchors)).toBe(2);
    expect(observed).toEqual([files[0].fileName, files[5].fileName]);
  });
});

describe("lecture export invalidation", () => {
  it("keeps the original-captioned copy through narration changes and invalidates both copies on a caption edit", () => {
    const renamed = { ...part, title: "Renamed" };
    expect(keepCurrentLectureExports(part, renamed)).toBe(renamed);
    for (const patch of [
      { output: new Blob(["new narration"]) }, { mixSourceAudio: true }, { audioMode: "source" as const },
    ]) {
      expect(keepCurrentLectureExports(part, { ...part, ...patch })).toMatchObject({ narrationWav, captionedOriginal, captionedNarrated: undefined });
    }
    const imported = { ...part, audioMode: "take" as const, take: audio };
    expect(keepCurrentLectureExports(imported, { ...imported, take: { ...audio } })).toMatchObject({ captionedOriginal, captionedNarrated: undefined });
    expect(keepCurrentLectureExports(part, { ...part, captions: { mode: "off" } })).toMatchObject({ narrationWav, captionedOriginal: undefined, captionedNarrated: undefined });
  });

  it("drops stale cue audio and captions when cue timing or the recording changes", () => {
    const retimed = { ...part, cues: [{ ...part.cues[0], start: "4" }, part.cues[1]] };
    expect(keepCurrentLectureExports(part, retimed)).toMatchObject({ narrationWav: undefined, captionedOriginal, captionedNarrated: undefined });
    expect(keepCurrentLectureExports(part, { ...part, duration: 10 })).toMatchObject({ narrationWav: undefined, captionedOriginal: undefined, captionedNarrated: undefined });
    const sourceOnly = { ...part, audioMode: "source" as const };
    expect(keepCurrentLectureExports(sourceOnly, { ...sourceOnly, cues: retimed.cues }).captionedOriginal).toBe(captionedOriginal);
    const fromNarration = { ...part, captions: { mode: "narration" as const } };
    expect(keepCurrentLectureExports(fromNarration, { ...fromNarration, cues: retimed.cues }).captionedOriginal).toBeUndefined();
  });
});

describe("generated narration WAV", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("bounds allocation, schedules cues at their timestamps, and writes a mono WAV", async () => {
    const start = vi.fn();
    const context = {
      destination: {},
      createBufferSource: () => ({ connect: vi.fn(), start }),
      decodeAudioData: vi.fn(async () => ({})),
      startRendering: async () => ({ getChannelData: () => new Float32Array([0, 0.2, 0]) }),
    };
    const allocate = vi.fn(function () { return context; });
    vi.stubGlobal("OfflineAudioContext", allocate);
    const wav = await prepareLectureNarrationWav(part, new AbortController().signal);
    expect(allocate).toHaveBeenCalledWith(1, 192000, 24000);
    expect(start.mock.calls).toEqual([[5], [0.5]]);
    expect(wav.type).toBe("audio/wav");
    expect(await wav.slice(0, 4).text()).toBe("RIFF");
    expect(narrationWavBlocker({ ...part, duration: 1201 })).toMatch(/20 minutes/);
    expect(narrationWavBlocker({ ...part, cues: [{ ...part.cues[0], audio: undefined }] })).toMatch(/Generate audio/);
    await expect(prepareLectureNarrationWav(part, AbortSignal.abort())).rejects.toMatchObject({ name: "AbortError" });
    expect(allocate).toHaveBeenCalledOnce();
  });
});
