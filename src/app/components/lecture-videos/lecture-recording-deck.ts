import { generateSlidesAction } from "@/app/actions/media";
import { extractVideoFrames } from "@/lib/narrate-video";
import { VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS } from "../walkthrough-announcement/walkthrough-video-limits";
import { transcribeLectureRecordingSpeech } from "./lecture-caption-transcription";
import { withBlobUrl } from "./lectureMedia";
import { materialContext, partName, type LecturePart, type LectureProject, type LectureSlideDeck } from "./lectureProject";
import { openLectureDeckBrand } from "./lecture-deck-branding";

const MAX_DECK_FRAMES = 18;
const DECK_READ_TIMEOUT_MS = 240_000;
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const browserDeck = {
  frames: (part: LecturePart, signal: AbortSignal) => withBlobUrl(part.source, async (url) => {
    const { frames } = await extractVideoFrames(url, MAX_DECK_FRAMES, { timestampNotes: part.focus.slice(0, 4000), signal });
    return frames;
  }),
  speech: transcribeLectureRecordingSpeech,
  slides: generateSlidesAction,
  brand: openLectureDeckBrand,
  async pptx(slides: { presentationTitle: string; slides: { title: string; bullets: string[] }[] }) {
    const { buildSlidesPptx } = await import("@/lib/pptx");
    return buildSlidesPptx(slides);
  },
};

export function lectureSlideDeckBlocker(part: LecturePart): string | undefined {
  if (!part.source.size || !Number.isFinite(part.duration) || part.duration <= 0) return "Add a readable recording first.";
  if (part.source.size > VIDEO_MAX_BYTES || part.duration > VIDEO_MAX_SECONDS) {
    return "Slide decks can be generated from recordings up to 20 minutes and 250 MB.";
  }
}

export async function buildLectureRecordingDeck(
  part: LecturePart, index: number, project: LectureProject, signal: AbortSignal,
  progress: (value: string) => void, runtime: Omit<typeof browserDeck, "brand"> & Partial<Pick<typeof browserDeck, "brand">> = browserDeck,
  account?: string,
): Promise<LectureSlideDeck> {
  const blocker = lectureSlideDeckBlocker(part);
  if (blocker) throw new Error(blocker);
  signal.throwIfAborted();
  const template = project.slideDeckBranding;
  if (template && !account) throw new Error("Sign in to use the selected institution template.");
  if (template) progress("Checking the institution’s PowerPoint template…");
  const brand = template && account ? await (runtime.brand ?? openLectureDeckBrand)(account, template, signal) : undefined;
  signal.throwIfAborted();
  const readSignal = AbortSignal.any([signal, AbortSignal.timeout(DECK_READ_TIMEOUT_MS)]);
  progress("Reading the original recording…");
  const [visual, audio] = await Promise.allSettled([
    runtime.frames(part, readSignal), runtime.speech(part, readSignal, progress),
  ]);
  signal.throwIfAborted();

  const frames = visual.status === "fulfilled" ? visual.value : [];
  const speech = audio.status === "fulfilled" ? audio.value.text.trim() : "";
  if (!frames.length && !speech) {
    throw new Error("No readable frames or spoken content were available. Choose a recording with visible material or audible speech.");
  }
  const warnings: string[] = [];
  if (!frames.length) warnings.push("The deck used spoken content because the original video frames could not be read.");
  if (audio.status === "rejected") warnings.push("The recording’s audio could not be transcribed. The deck used visible material.");
  else if (!speech) warnings.push("No speech was detected. The deck used visible material.");
  else if (audio.value.truncated) warnings.push("The spoken transcript reached the source text limit. Review the deck for omitted topics.");

  const materials = materialContext(project).slice(0, 16000).trim();
  const context = [
    `Recording: ${partName(part, index).slice(0, 300)}`,
    project.title.trim() && `Project title: ${project.title.trim().slice(0, 300)}`,
    project.goal?.trim() && `Audience and goal: ${project.goal.trim().slice(0, 2000)}`,
    part.focus.trim() && `Recording focus and notes: ${part.focus.trim().slice(0, 4000)}`,
    materials && `Supporting project material:\n${materials}`,
    speech && `Original spoken transcript:\n${speech}`,
  ].filter(Boolean).join("\n\n");

  progress("Drafting editable slides…");
  const draft = await runtime.slides(context, "gemini", { frames, ...(brand && { brandFit: brand.fit }) });
  signal.throwIfAborted();
  if ("error" in draft) throw new Error(draft.error);

  progress("Preparing the PowerPoint file…");
  if (brand && template) {
    const blob = await brand.fill(draft.slides);
    signal.throwIfAborted();
    return { blob, title: draft.presentationTitle, warnings, branding: template };
  }
  const bytes = await runtime.pptx(draft);
  signal.throwIfAborted();
  if (!bytes.byteLength) throw new Error("The PowerPoint file could not be created.");
  return { blob: new Blob([bytes], { type: PPTX }), title: draft.presentationTitle, warnings };
}
