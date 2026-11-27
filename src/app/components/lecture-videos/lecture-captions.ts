import { activeCaptionAt, captionBlockBaselineY, captionLayout, wrapCaptionLines } from "@/lib/caption-burn";
import { buildVttContent, type EditableCaption } from "../caption-studio/utils/captions";
import type { LecturePart } from "./lectureProject";

export type LectureCaptionDraft = { id: string; start: string; end: string; text: string };
export type LectureCaptionSettings = { mode: "off" | "narration" | "custom"; custom?: LectureCaptionDraft[] };

export const MAX_CAPTION_FILE_BYTES = 256 * 1024;
export const MAX_CAPTION_CUES = 500;
export const MAX_CAPTION_TEXT = 500;

export function lectureCaptionMode(part: LecturePart): LectureCaptionSettings["mode"] {
  const mode = part.captions?.mode ?? (part.audioMode === "cues" ? "narration" : "off");
  return mode === "narration" && part.audioMode !== "cues" ? "off" : mode;
}

function timeInSeconds(value: string): number | undefined {
  const time = /^(?:(\d{2,4}):)?([0-5]\d):([0-5]\d)[.,](\d{3})$/.exec(value);
  if (!time) return undefined;
  return Number(time[1] ?? 0) * 3600 + Number(time[2]) * 60 + Number(time[3]) + Number(time[4]) / 1000;
}

function plainSubtitleText(value: string): string {
  return value.trim().replace(/<\/?(?:[biu]|c(?:\.[^>\s]+)?|v(?:\s+[^>]+)?|lang(?:\s+[^>]+)?|ruby|rt)>/gi, "")
    .replace(/&(amp|lt|gt|nbsp|lrm|rlm);/g, (entity) => ({
      "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&lrm;": "\u200e", "&rlm;": "\u200f",
    })[entity] ?? entity).trim();
}

/** Parse SRT or WebVTT and keep editable plaintext, with no cue markup execution. */
export function parseLectureCaptionFile(contents: string, fileName: string): LectureCaptionDraft[] {
  const isVtt = /\.vtt$/i.test(fileName);
  if (!isVtt && !/\.srt$/i.test(fileName)) throw new Error("Choose a WebVTT or SRT caption file.");
  const source = contents.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  const blocks = source.split(/\n(?:[\t ]*\n)+/);
  if (isVtt && !/^WEBVTT(?:[\t ]|\n|$)/.test(blocks.shift() ?? "")) throw new Error("The WebVTT file is missing its WEBVTT header.");
  const drafts: LectureCaptionDraft[] = [];
  for (const block of blocks) {
    if (isVtt && /^(?:NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$))/.test(block)) continue;
    const lines = block.split("\n");
    const timingIndex = lines[0].includes("-->") ? 0 : 1;
    const timing = /^\s*(\S+)\s+-->\s+(\S+)(?:[\t ].*)?$/.exec(lines[timingIndex] ?? "");
    const start = timing && timeInSeconds(timing[1]);
    const end = timing && timeInSeconds(timing[2]);
    const text = plainSubtitleText(lines.slice(timingIndex + 1).join("\n"));
    if (typeof start !== "number" || typeof end !== "number" || end <= start || !text) {
      throw new Error(`Caption ${drafts.length + 1} has an invalid time range or missing text.`);
    }
    if (text.length > MAX_CAPTION_TEXT || drafts.length >= MAX_CAPTION_CUES) throw new Error("The caption file has too many cues or a cue with too much text.");
    drafts.push({ id: crypto.randomUUID(), start: String(start), end: String(end), text });
  }
  if (!drafts.length) throw new Error("The caption file did not contain any cues.");
  return drafts;
}

export function lectureCaptionError(part: LecturePart): string | undefined {
  if (lectureCaptionMode(part) !== "custom") return;
  const custom = part.captions?.custom ?? [];
  const ranges: Array<{ start: number; end: number; index: number }> = [];
  for (let index = 0; index < custom.length; index++) {
    const draft = custom[index];
    const start = Number(draft.start), end = Number(draft.end);
    if (!draft.start.trim() || !draft.end.trim() || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > part.duration || Math.round(end * 1000) <= Math.round(start * 1000)) {
      return `Caption ${index + 1} needs a valid start and end within the video.`;
    }
    if (!draft.text.trim() || draft.text.length > MAX_CAPTION_TEXT) return `Caption ${index + 1} needs between 1 and ${MAX_CAPTION_TEXT} characters.`;
    ranges.push({ start, end, index });
  }
  ranges.sort((a, b) => a.start - b.start);
  const overlap = ranges.findIndex((range, index) => index > 0 && range.start < ranges[index - 1].end);
  if (overlap >= 0) return `Captions ${ranges[overlap - 1].index + 1} and ${ranges[overlap].index + 1} overlap.`;
}

export function lectureCaptionCues(part: LecturePart): EditableCaption[] {
  const mode = lectureCaptionMode(part);
  if (mode === "off" || lectureCaptionError(part)) return [];
  if (mode === "custom") {
    return (part.captions?.custom ?? []).map((cue) => ({ start: Number(cue.start), end: Number(cue.end), text: cue.text.trim() }))
      .sort((a, b) => a.start - b.start);
  }
  return part.cues.flatMap((cue) => {
    if (!cue.audio || !cue.text.trim()) return [];
    const start = Number(cue.start);
    const end = Math.min(start + cue.audio.duration, part.duration);
    return cue.start.trim() && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && Math.round(end * 1000) > Math.round(start * 1000)
      ? [{ start, end, text: cue.text.trim() }] : [];
  }).sort((a, b) => a.start - b.start);
}

export function lectureCaptionBlob(part: LecturePart): Blob | undefined {
  const cues = lectureCaptionCues(part);
  if (!cues.length) return;
  const escaped = cues.map((cue) => ({
    ...cue,
    start: Math.round(cue.start * 1000) / 1000 + 1e-9,
    end: Math.round(cue.end * 1000) / 1000 + 1e-9,
    text: cue.text.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character] ?? character)
      .replace(/\r?\n+/g, " "),
  }));
  return new Blob([buildVttContent(escaped)], { type: "text/vtt" });
}

export function drawLectureCaption(ctx: CanvasRenderingContext2D, cues: EditableCaption[], timeSec: number): void {
  const caption = activeCaptionAt(cues, timeSec);
  if (!caption) return;
  const { width, height } = ctx.canvas;
  const layout = captionLayout(width, height);
  ctx.save();
  ctx.font = `600 ${layout.fontPx}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrapCaptionLines(caption.text, layout.maxTextWidth, (text) => ctx.measureText(text).width);
  const baseline = captionBlockBaselineY(height, layout, lines.length, caption.position);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const y = baseline - (lines.length - index - 0.5) * layout.lineHeight;
    const boxWidth = Math.min(layout.maxTextWidth, ctx.measureText(line).width) + 2 * layout.padX;
    ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
    ctx.fillRect((width - boxWidth) / 2, y - layout.lineHeight / 2, boxWidth, layout.lineHeight);
    ctx.fillStyle = "white";
    ctx.fillText(line, width / 2, y, layout.maxTextWidth);
  }
  ctx.restore();
}
