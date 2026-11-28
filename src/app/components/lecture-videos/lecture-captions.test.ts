import { describe, expect, it, vi } from "vitest";
import { LIVE_SAMPLE_RATE } from "@/lib/live-class/wav";
import { lectureCaptionBlob, lectureCaptionCues, lectureCaptionError, lectureCaptionMode, parseLectureCaptionFile } from "./lecture-captions";
import { captionDraftsFromTranscript, lectureCaptionAudioSource, transcribeLectureCaptions, transcribeLectureRecordingSpeech } from "./lecture-caption-transcription";
import type { LecturePart } from "./lectureProject";

const source = new File(["video"], "part.mp4", { type: "video/mp4" });
const outgoing = new Blob(["narrated"], { type: "video/mp4" });
const take = { blob: new Blob(["audio"], { type: "audio/mpeg" }), duration: 8, name: "take.mp3" };
const part: LecturePart = {
  id: "part", title: "Demo", focus: "", source, duration: 10,
  cues: [{ id: "cue", start: "1.001", end: "9", text: "Keep <this> & that", audio: { ...take, duration: 2 } }],
  audioMode: "cues", watchUrl: "",
};

describe("Narrated Videos caption tracks", () => {
  it("accepts standard SRT and VTT timestamps and strips style markup", () => {
    const srt = "\uFEFF1\r\n00:00:00,900 --> 00:00:02,110\r\n<i>First &amp; second</i>.\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,200\r\nThird.";
    const vtt = "WEBVTT\nKind: captions\n\nNOTE skip this block\n\ncue-1\n00:00.900 --> 00:02.110 line:90%\n<v Riley><b>First &amp; second</b>.</v>\n\n00:03.000 --> 00:04.200\nThird.";
    const expected = [
      { id: expect.any(String), start: "0.9", end: "2.11", text: "First & second." },
      { id: expect.any(String), start: "3", end: "4.2", text: "Third." },
    ];
    expect(parseLectureCaptionFile(srt, "captions.srt")).toEqual(expected);
    expect(parseLectureCaptionFile(vtt, "captions.vtt")).toEqual(expected);
  });

  it("rejects reversed timestamps and malformed headers", () => {
    expect(() => parseLectureCaptionFile("WEBVTT\n\n00:01.000 --> 00:00.100\nText", "captions.vtt")).toThrow("invalid time range");
    expect(() => parseLectureCaptionFile("00:00.100 --> 00:01.000\nText", "captions.vtt")).toThrow("missing its WEBVTT header");
  });

  it("keeps old voiced-cue timing and exports escaped WebVTT text before render", async () => {
    expect(lectureCaptionMode(part)).toBe("narration");
    expect(lectureCaptionCues(part)).toEqual([{ start: 1.001, end: 3.001, text: "Keep <this> & that" }]);
    expect(await lectureCaptionBlob(part)?.text()).toContain("00:00:01.001 --> 00:00:03.001\nKeep &lt;this&gt; &amp; that");
    expect(lectureCaptionBlob({ ...part, audioMode: "source" })).toBeUndefined();
    expect(lectureCaptionBlob({ ...part, audioMode: "take", captions: { mode: "narration" } })).toBeUndefined();
  });

  it("preserves custom text on any audio track, while blocking invalid and overlapping cues", () => {
    const custom = [
      { id: "one", start: "0", end: "2", text: "First" },
      { id: "two", start: "2", end: "4", text: "Next" },
    ];
    const configured: LecturePart = { ...part, audioMode: "source", captions: { mode: "custom", custom } };
    expect(lectureCaptionCues(configured).map((cue) => cue.text)).toEqual(["First", "Next"]);
    expect(lectureCaptionError(configured)).toBeUndefined();
    expect(lectureCaptionBlob({ ...configured, captions: { mode: "off", custom } })).toBeUndefined();
    expect(lectureCaptionError({ ...configured, captions: { mode: "custom", custom: [custom[0], { ...custom[1], start: "1.8" }] } })).toMatch(/overlap/);
    expect(lectureCaptionError({ ...configured, captions: { mode: "custom", custom: [custom[0], { ...custom[1], end: "20" }] } })).toMatch(/within the video/);
  });
});

describe("Narrated Videos caption transcription", () => {
  it("never substitutes a muted source for narrated or mixed audio", () => {
    expect(lectureCaptionAudioSource({ ...part, audioMode: "source", output: outgoing })).toEqual({ blob: source, duration: 10, kind: "video" });
    expect(lectureCaptionAudioSource(part)).toBeUndefined();
    expect(lectureCaptionAudioSource({ ...part, audioMode: "take", take })).toEqual({ blob: take.blob, duration: 8, kind: "audio" });
    expect(lectureCaptionAudioSource({ ...part, audioMode: "take", take, mixSourceAudio: true })).toBeUndefined();
    expect(lectureCaptionAudioSource({ ...part, output: outgoing })).toEqual({ blob: outgoing, duration: 10, kind: "video" });
  });

  it("makes readable, non-overlapping editable draft timings within each audio chunk", () => {
    const phrase = "These speech cues contain enough words to cover several lines of captions for this clip.";
    const drafts = captionDraftsFromTranscript(`${phrase} ${phrase} ${phrase}`, 15, 28.8);
    expect(drafts.length).toBeGreaterThan(2);
    expect(drafts[0].start).toBe("15");
    expect(drafts.at(-1)?.end).toBe("28.8");
    expect(drafts.every((draft, index) => index === 0 || draft.start === drafts[index - 1].end)).toBe(true);
  });

  it("uses Gemini with bounded audio chunks and retains the original timeline when some audio is silent", async () => {
    const samples = new Float32Array(16 * LIVE_SAMPLE_RATE);
    samples.fill(0.2, 15 * LIVE_SAMPLE_RATE);
    const close = vi.fn(async () => {});
    const transcribe = vi.fn(async () => ({ text: "Audible final second" }));
    const extract = vi.fn();
    const result = await transcribeLectureCaptions({ blob: outgoing, duration: 16, kind: "video" }, new AbortController().signal, vi.fn(), {
      context: () => ({ state: "running", close }) as unknown as AudioContext,
      decode: async () => samples, transcribe, extract,
    });
    expect(result).toEqual([{ id: expect.any(String), start: "15", end: "16", text: "Audible final second" }]);
    expect(transcribe).toHaveBeenCalledExactlyOnceWith(expect.any(String), { provider: "gemini" }, expect.any(AbortSignal));
    expect(extract).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("transcribes the original recording for decks even with a separate take and captions off", async () => {
    const samples = new Float32Array(61 * LIVE_SAMPLE_RATE);
    samples.fill(0.2, 60 * LIVE_SAMPLE_RATE);
    const decode = vi.fn(async () => samples);
    const transcribe = vi.fn(async () => ({ text: "Original spoken words." }));
    const signal = new AbortController().signal;
    const result = await transcribeLectureRecordingSpeech({ ...part, duration: 61, audioMode: "take", take, output: outgoing, captions: { mode: "off" } }, signal, vi.fn(), {
      context: () => ({ state: "running", close: vi.fn(async () => {}) }) as unknown as AudioContext,
      decode, extract: vi.fn(), transcribe,
    });
    expect(decode).toHaveBeenCalledExactlyOnceWith(expect.anything(), source);
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ text: "[60–61 s] Original spoken words.", truncated: false });
  });
});
