import { generateVideoNarrationAction, synthesizeNarrationAction } from "@/app/actions";
import { extractVideoFrames } from "@/lib/narrate-video";
import { audioFromBase64, withBlobUrl } from "./lectureMedia";
import { materialContext, partName, type LectureCue, type LecturePart, type LectureProject } from "./lectureProject";

export async function draftPartCues(part: LecturePart, index: number, project: LectureProject, signal: AbortSignal): Promise<LectureCue[]> {
  signal.throwIfAborted();
  const goal = project.goal?.trim().slice(0, 4000);
  const focus = part.focus.trim().slice(0, 5000);
  const guidance = project.guidance.trim().slice(0, 5000);
  const timestampNotes = [focus, goal, guidance].filter(Boolean).join("\n");
  const { frames, durationSec } = await withBlobUrl(part.source, (url) => extractVideoFrames(url, 18, { timestampNotes, signal }));
  signal.throwIfAborted();
  const materials = materialContext(project);
  const context = [
    project.title.trim() && `Project title: ${project.title.trim().slice(0, 300)}`,
    `Video ${index + 1} of ${project.parts.length}: ${partName(part, index).slice(0, 300)}`,
    project.parts.length > 1 && `Project sequence:\n${project.parts.map((item, i) => `${i + 1}. ${partName(item, i).slice(0, 180)}`).join("\n").slice(0, 5000)}`,
    goal && `Narration goal and audience: ${goal}`,
    focus && `Focus and timestamp notes for this video: ${focus}`,
    guidance && `Speaking guidance: ${guidance}`,
    project.sample.trim() && `Writing sample for style and cadence:\n${project.sample.trim().slice(0, 10000)}`,
    materials && `Reference material for factual context:\n${materials.slice(0, 24000)}`,
    "Draft narration only for the current video. Use the sequence for orientation and keep details about other videos out of this script.",
  ].filter(Boolean).join("\n\n");
  const result = await generateVideoNarrationAction(frames, durationSec, context, "gemini", "general");
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
