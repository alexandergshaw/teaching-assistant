import { lectureCaptionBlob, lectureCaptionCues, lectureCaptionMode } from "./lecture-captions";
import { partName, type LecturePart } from "./lectureProject";

type ArtifactKind = "original" | "narration" | "transcript" | "captions" | "narrated" | "captioned-original" | "captioned-narrated" | "slides";

export type LectureDownload = {
  id: string;
  kind: ArtifactKind;
  label: string;
  fileName: string;
  blob: Blob;
};

function lectureDownloadStem(part: LecturePart, index: number): string {
  const title = partName(part, index).replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ").replace(/^[ .]+|[ .]+$/g, "").slice(0, 100).trim();
  const number = String(index + 1).padStart(2, "0");
  return title ? `part-${number}-${title}` : `part-${number}`;
}

function takeExtension(name: string, mime: string): string {
  const extension = /\.([a-z\d]{1,8})$/i.exec(name)?.[1].toLowerCase();
  if (extension) return extension;
  const subType = mime.toLowerCase().split(";")[0].split("/")[1];
  if (subType === "mpeg") return "mp3";
  if (subType === "mp4") return mime.startsWith("audio/") ? "m4a" : "mp4";
  return subType && /^(aac|flac|ogg|opus|wav|webm)$/.test(subType) ? subType : "";
}

function videoExtension(blob: Blob): string {
  return blob.type.startsWith("video/mp4") ? "mp4" : "webm";
}

export function lectureDownloads(part: LecturePart, index: number): LectureDownload[] {
  const files: LectureDownload[] = [];
  const stem = lectureDownloadStem(part, index);
  const add = (kind: ArtifactKind, label: string, fileName: string, blob?: Blob) => {
    if (blob?.size) files.push({ id: `${part.id}:${kind}`, kind, label, fileName, blob });
  };
  add("original", "Original recording (untouched)", part.source.name || `${stem}-original`, part.source);
  if (part.audioMode === "cues") add("narration", "Generated narration audio (WAV)", `${stem}-narration.wav`, part.narrationWav);
  if (part.audioMode === "take" && part.take) {
    const extension = takeExtension(part.take.name, part.take.blob.type);
    add("narration", "Imported narration take", `${stem}-narration-take${extension ? `.${extension}` : ""}`, part.take.blob);
  }
  const cues = lectureCaptionCues(part);
  const script = [...part.cues].sort((a, b) => Number(a.start) - Number(b.start));
  const transcriptUsesCaptions = lectureCaptionMode(part) === "custom" && cues.length > 0;
  const transcript = (transcriptUsesCaptions ? cues : script).map((cue) => cue.text.trim()).filter(Boolean).join("\n\n");
  if (transcript) {
    const label = transcriptUsesCaptions ? "Transcript from captions (TXT)" : "Transcript from cue script (TXT)";
    add("transcript", label, `${stem}-transcript.txt`, new Blob([`${transcript}\n`], { type: "text/plain;charset=utf-8" }));
  }
  add("captions", "Closed caption track (VTT)", `${stem}-captions.vtt`, lectureCaptionBlob(part));
  if (part.audioMode !== "source" && part.output) {
    const label = part.mixSourceAudio ? "Video with narration and original audio" : "Video with narration";
    add("narrated", label, `${stem}-narrated.${videoExtension(part.output)}`, part.output);
  }
  if (cues.length && part.captionedOriginal) {
    add("captioned-original", "Original-audio video with burned-in captions", `${stem}-original-captioned.${videoExtension(part.captionedOriginal)}`, part.captionedOriginal);
  }
  if (cues.length && part.audioMode !== "source" && part.output?.size && part.captionedNarrated) {
    add("captioned-narrated", "Narrated video with burned-in captions", `${stem}-narrated-captioned.${videoExtension(part.captionedNarrated)}`, part.captionedNarrated);
  }
  add("slides", "Editable slide deck (PPTX)", `${stem}-slides.pptx`, part.slideDeck?.blob);
  return files;
}

export function selectedLectureDownloads(files: LectureDownload[], selected: ReadonlySet<string>): LectureDownload[] {
  return files.filter((file) => selected.has(file.id));
}

export function setLectureDownloadSelection(selected: ReadonlySet<string>, ids: string[], checked: boolean): Set<string> {
  const next = new Set(selected);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function requestLectureDownloads(files: LectureDownload[], anchors: ReadonlyMap<string, Pick<HTMLAnchorElement, "click">>): number {
  let requested = 0;
  for (const file of files) {
    const anchor = anchors.get(file.id);
    if (!anchor) continue;
    anchor.click();
    requested++;
  }
  return requested;
}
