import { generateVideoNarrationAction, synthesizeNarrationAction } from "@/app/actions";
import { extractVideoFrames } from "@/lib/narrate-video";
import { audioFromBase64, withBlobUrl } from "./lectureMedia";
import { materialContext, partName, type LectureCue, type LecturePart, type LectureProject } from "./lectureProject";

export async function draftPartCues(part: LecturePart, index: number, project: LectureProject, signal: AbortSignal): Promise<LectureCue[]> {
  signal.throwIfAborted();
  const { frames, durationSec } = await withBlobUrl(part.source, (url) => extractVideoFrames(url, 18));
  signal.throwIfAborted();
  const materials = materialContext(project);
  const context = [
    `Lecture: ${project.title || "Untitled lecture"}`,
    `Video ${index + 1} of ${project.parts.length}: ${partName(part, index)}`,
    `Lecture sequence:\n${project.parts.map((item, i) => `${i + 1}. ${partName(item, i)}`).join("\n")}`,
    part.focus && `Focus for this video: ${part.focus}`,
    project.guidance.trim() && `Instructor's speaking guidance: ${project.guidance.trim().slice(0, 5000)}`,
    project.sample.trim() && `Sample of the instructor's speaking style:\n${project.sample.trim().slice(0, 10000)}`,
    materials && `Shared lecture materials for factual context:\n${materials.slice(0, 24000)}`,
    "Draft only this video's voice-over. Match each cue to what is visible, use a natural speaking pace, and leave room for pauses. Match the sample's cadence and style.",
  ].filter(Boolean).join("\n\n");
  const result = await generateVideoNarrationAction(frames, durationSec, context, "gemini");
  signal.throwIfAborted();
  if ("error" in result) throw new Error(result.error);
  return result.segments.map(({ start, end, text }) => ({
    id: crypto.randomUUID(), start: String(Math.round(start * 1000) / 1000), end: String(Math.round(end * 1000) / 1000), text,
  }));
}

export async function synthesizeCue(cue: LectureCue, voiceId: string | undefined, signal: AbortSignal) {
  signal.throwIfAborted();
  const response = await synthesizeNarrationAction(cue.text.trim(), voiceId);
  signal.throwIfAborted();
  if ("error" in response) throw new Error(response.error);
  const audio = await audioFromBase64(response.base64, response.mimeType);
  signal.throwIfAborted();
  return audio;
}
