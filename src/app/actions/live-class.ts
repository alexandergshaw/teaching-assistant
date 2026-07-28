"use server";

// Live Class Mode - server actions layer.
//
// Four actions support a mode the instructor turns on during class:
//   A1 transcribeLiveAudioAction  - transcribe a short room-audio segment.
//   A2 answerLiveQuestionAction   - answer a detected student question live.
//   A3 buildLiveSessionContextAction - pre-gather course material ONCE, when
//      the instructor starts the session, so A1/A2 stay fast for the rest of
//      class.
//   A4 loadVisualizerIndexAction - fetch and parse the visualizer's nav index
//      ONCE, alongside A3, so A2's link resolution never hits GitHub on the
//      answer-latency path.
//
// callLlm (src/lib/llm.ts) is non-streaming and always calls Gemini
// regardless of the `provider` argument - see that file's doc comment. A1 and
// A2 both run WHILE a class is happening, so each is exactly ONE callLlm
// invocation: no retry loop, no second pass, no grounding/JSON round trip.
// Every pure helper below is a non-exported, non-async top-level function -
// perfectly legal in a "use server" file (only EXPORTS must all be async;
// see current-events.ts's extraFocusBlock for the existing precedent).
//
// A2's link resolution (stripModelUrls/resolveDocsLinks/resolveVisualizerLinks
// /dedupeLinks) DOES live in a lib module - src/lib/live-class/links.ts - now
// that src/lib/live-class/** is this action file's own to extend as of the
// bulleted-answers-with-links feature; session.ts in that same directory is
// likewise ours (see its own header comment).
//
// Pure lib modules imported below (registry-helpers.sources.ts,
// source-policy.ts, step-helpers-server.ts) are reused rather than
// reinvented; the course-hub lookup goes straight to the sibling action
// module (course-hub-core.ts) rather than through the "@/app/actions" barrel,
// matching this directory's existing cross-file convention (see e.g.
// castletop.ts importing from "./canvas-inbox"). gatherModuleMaterials itself
// still reaches "@/app/actions" internally (it is not ours to change), and so
// does step-helpers-server.ts's buildServerMaterialLoaders - both edges are
// deferred to inside async function bodies on both sides of the cycle, never
// touched at module top level, which is what makes them safe (confirmed with
// a real `next build`, not just tsc/vitest, for this exact cycle shape).
//
// buildLiveSessionContextAction's course-export/materials-zip sources are
// backed by REAL loaders (buildServerMaterialLoaders), not stubs - see that
// function's own doc comment for why this matters and how it stays in sync
// with server-runner.ts's identical need.

import { callLlm, type LlmProvider } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { listCourseHubAction } from "./course-hub-core";
import { gatherModuleMaterials } from "@/lib/workflows/registry-helpers.sources";
import { resolveSourcePolicy } from "@/lib/workflows/source-policy";
import { buildServerMaterialLoaders } from "@/lib/workflows/step-helpers-server";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import { getFileText } from "@/lib/github";
import { parseNavItems } from "@/lib/visualizer";
import {
  stripModelUrls,
  resolveDocsLinks,
  resolveVisualizerLinks,
  dedupeLinks,
  type AnswerLink,
  type VisualizerIndexEntry,
} from "@/lib/live-class/links";

// ─────────────────────────────────────────────────────────────────────────
// A1 - transcribeLiveAudioAction
// ─────────────────────────────────────────────────────────────────────────

// Server actions cap the request body at 10MB (next.config.ts). Base64
// inflates binary size by ~33% (4 chars per 3 bytes), so a 7MB binary clip
// already rides in at ~9.3MB of base64 - reject earlier, with an explicit
// reason, instead of letting an oversized request fail opaquely at the
// platform layer.
const MAX_AUDIO_BINARY_BYTES = 7 * 1024 * 1024;
const BASE64_TO_BINARY_RATIO = 0.75;
const TRANSCRIBE_MAX_OUTPUT_TOKENS = 1024; // plenty for a 15-30 second segment

function estimateBinaryBytesFromBase64(base64Length: number): number {
  return Math.floor(base64Length * BASE64_TO_BINARY_RATIO);
}

// A model response that is only filler or an explicit "no speech" style
// answer must normalize to an empty string, not ship as prose describing
// silence. This is a heuristic on top of the prompt's own instruction to
// return an empty string for silence - models do not always follow that
// instruction to the letter. The patterns are NOT anchored to the start of
// the string (a filler reply is often a full sentence, e.g. "There is no
// intelligible speech in this audio."), so the check is additionally gated
// on the response being short - a genuine 15-30 second transcript is not
// going to fit in a couple of sentences, so this never collapses a real,
// merely-topically-adjacent transcript (one that happens to discuss "speech
// recognition" at length, say).
const NO_SPEECH_MAX_LEN = 200;
const NO_SPEECH_PATTERNS: RegExp[] = [
  /\bno (intelligible |audible|discernible|distinguishable )?speech\b/i,
  /^\(?\[?silence\)?\]?\.?$/i,
  /\bcould not (detect|find|identify|discern) (any )?(intelligible )?speech\b/i,
  /\bunable to (transcribe|detect (any )?speech)\b/i,
  /\bnothing (intelligible )?(was |is )?(said|spoken)\b/i,
];

function normalizeTranscript(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.length <= NO_SPEECH_MAX_LEN) {
    for (const pattern of NO_SPEECH_PATTERNS) {
      if (pattern.test(trimmed)) return "";
    }
  }
  return trimmed;
}

function buildTranscriptionPrompt(hintTerms: string | undefined): string {
  const hint = (hintTerms ?? "").trim();
  const parts = [
    "Generate a transcript of the speech in this audio.",
    "Return ONLY the verbatim transcript - no commentary, no preamble, no explanation.",
    "Do not add speaker labels unless multiple speakers are clearly distinguishable in the audio.",
    "Do not add timestamps.",
    "If there is no intelligible speech in the audio, respond with an empty string and nothing else.",
  ];
  if (hint) {
    parts.push(`These technical terms may appear in this course - use them as spelling guidance: ${hint}.`);
  }
  return parts.join(" ");
}

/**
 * Transcribe a short (roughly 15-30 second) segment of classroom audio.
 * Latency-critical: this runs continuously while live class mode is on, so it
 * is exactly one non-search callLlm invocation sized for a short segment - no
 * retry loop, no second pass. Never throws: a failed call returns { error }.
 */
export async function transcribeLiveAudioAction(
  wavBase64: string,
  opts?: { hintTerms?: string; provider?: LlmProvider }
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();

    if (!wavBase64 || !wavBase64.trim()) {
      return { error: "No audio was captured to transcribe." };
    }

    const estimatedBytes = estimateBinaryBytesFromBase64(wavBase64.trim().length);
    if (estimatedBytes > MAX_AUDIO_BINARY_BYTES) {
      const estimatedMb = (estimatedBytes / (1024 * 1024)).toFixed(1);
      const limitMb = (MAX_AUDIO_BINARY_BYTES / (1024 * 1024)).toFixed(0);
      return {
        error: `Audio clip is too large to transcribe (~${estimatedMb}MB, limit ~${limitMb}MB per request). Send a shorter clip.`,
      };
    }

    const provider = opts?.provider ?? "gemini";
    const prompt = buildTranscriptionPrompt(opts?.hintTerms);

    const result = await callLlm(
      {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }, { inlineData: { mimeType: "audio/wav", data: wavBase64 } }],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: TRANSCRIBE_MAX_OUTPUT_TOKENS },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Transcription failed: HTTP ${result.status}` };
    }

    return { text: normalizeTranscript(result.text) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not transcribe the audio." };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// A2 - answerLiveQuestionAction
// ─────────────────────────────────────────────────────────────────────────

// These caps exist to protect latency: answerLiveQuestionAction runs WHILE a
// class is in progress, so its single callLlm call must stay fast. Sending a
// module's entire gathered materials or a whole deck's text would blow the
// latency budget, so each context field is capped independently before it
// ever reaches the prompt.
const MATERIALS_TEXT_CHAR_CAP = 6000;
const DECK_TEXT_CHAR_CAP = 4000;
const RECENT_TRANSCRIPT_CHAR_CAP = 2000;

const DEFAULT_MAX_WORDS = 120;
const MIN_MAX_WORDS = 20;
const MAX_MAX_WORDS = 300;
// ~3.4 tokens per requested word covers a spoken answer plus the
// NOT_IN_MATERIAL sentinel line and the trailing SOURCES line this prompt
// also asks for (120 words -> ~400 tokens, the sizing the spec calls out).
const WORDS_TO_TOKENS_RATIO = 3.4;
const MIN_ANSWER_MAX_OUTPUT_TOKENS = 150;
const MAX_ANSWER_MAX_OUTPUT_TOKENS = 700;

// Machine-checkable sentinel the prompt asks the model to put on its own
// first line when the supplied course material/deck does not cover the
// question, instead of asking the model to describe its own groundedness in
// prose. Stripped from the returned answer text by parseAnswerResponse.
const NOT_IN_MATERIAL_MARKER = "NOT_IN_MATERIAL";

function clampMaxWords(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_MAX_WORDS;
  return Math.max(MIN_MAX_WORDS, Math.min(MAX_MAX_WORDS, Math.round(raw)));
}

function answerMaxOutputTokens(maxWords: number): number {
  const estimated = Math.round(maxWords * WORDS_TO_TOKENS_RATIO);
  return Math.max(MIN_ANSWER_MAX_OUTPUT_TOKENS, Math.min(MAX_ANSWER_MAX_OUTPUT_TOKENS, estimated));
}

function truncateHead(text: string, cap: number): string {
  return text.length > cap ? text.slice(0, cap) : text;
}

function truncateTail(text: string, cap: number): string {
  return text.length > cap ? text.slice(text.length - cap) : text;
}

export interface LiveQuestionContext {
  courseName?: string;
  moduleName?: string;
  materialsText?: string;
  deckText?: string;
  recentTranscript?: string;
  /** The visualizer's parsed nav index, loaded ONCE per session via
   * loadVisualizerIndexAction (see useLiveSessionPersistence.ts's start(),
   * which loads it alongside the course-material pre-warm) and threaded
   * through unchanged on every question. resolveVisualizerLinks matches
   * against this locally - passing it in here is what keeps this action's
   * per-question link resolution free of any GitHub round trip. Omitted or
   * empty when the index failed to load or was never requested: visualizer
   * links are simply skipped for that session, never a network call from
   * inside this action. */
  visualizerIndex?: VisualizerIndexEntry[];
}

function buildAnswerPrompt(question: string, context: LiveQuestionContext, maxWords: number): string {
  const courseName = (context.courseName ?? "").trim();
  const moduleName = (context.moduleName ?? "").trim();
  const materialsText = truncateHead((context.materialsText ?? "").trim(), MATERIALS_TEXT_CHAR_CAP);
  const deckText = truncateHead((context.deckText ?? "").trim(), DECK_TEXT_CHAR_CAP);
  const recentTranscript = truncateTail((context.recentTranscript ?? "").trim(), RECENT_TRANSCRIPT_CHAR_CAP);

  const sections: string[] = [];
  if (courseName) sections.push(`Course: ${courseName}`);
  if (moduleName) sections.push(`Module: ${moduleName}`);
  if (materialsText) sections.push(`COURSE MATERIAL:\n${materialsText}`);
  if (deckText) sections.push(`SLIDE DECK:\n${deckText}`);
  if (recentTranscript) sections.push(`RECENT CLASS TRANSCRIPT (most recent last):\n${recentTranscript}`);

  return `You are the instructor's assistant, answering a question a student just asked out loud during a live class.

${sections.join("\n\n")}

STUDENT QUESTION: ${question.trim()}

Answer as 3 to 6 bullets, not a paragraph. Each bullet must be one complete, scannable point the instructor could glance at mid-class and speak from - a full thought, not a sentence fragment, and not a full paragraph. Start every bullet line with "- ". Use at most ${maxWords} words total, across all bullets combined.

Never write a URL, a hyperlink, or a markdown link (no "http://", no "[text](url)") anywhere in your answer. The application adds real links afterward, from the concepts you name in the CONCEPTS line below - if a bullet should point at something, NAME the concept in plain words instead (for example "list comprehension"), never a link.

Ground your answer in the course material and slide deck above wherever they are relevant. If, and only if, the material above does not cover this question, start your entire response with the exact token ${NOT_IN_MATERIAL_MARKER} on its own first line, then let your first bullet plainly state that the course material doesn't cover this, then give the best general-answer bullets you can, making clear they are not from the course material.

End your response with exactly these two final lines, in this order:
SOURCES: a comma-separated list of the slide titles or material headings you drew on, or "SOURCES: none" if you did not draw on any specific one.
CONCEPTS: a comma-separated list of at most 4 canonical concept names this answer is about (for example "for loops, list comprehension"), or "CONCEPTS: none" if none apply.`;
}

interface ParsedAnswer {
  answer: string;
  hasNotInMaterialMarker: boolean;
  sources: string[];
  concepts: string[];
}

// At most this many concept names are ever parsed from the model's CONCEPTS
// line, matching the prompt's own "at most 4" instruction - a model that
// ignores the cap and lists more is truncated rather than trusted verbatim.
const MAX_ANSWER_CONCEPTS = 4;

/**
 * Parse the model's raw response: strip the leading NOT_IN_MATERIAL sentinel
 * (if present), then the trailing "CONCEPTS: ..." line (the newest addition -
 * emitted AFTER "SOURCES:", so it is parsed off the end FIRST), then the
 * trailing "SOURCES: ..." line exactly as before. All three are parsed
 * defensively: a malformed or missing CONCEPTS/SOURCES line yields [] rather
 * than failing the call, and a missing sentinel simply means the answer was
 * grounded. Because CONCEPTS is stripped before SOURCES ever looks at the
 * text, a response that never had a CONCEPTS line (the old prompt shape,
 * still exercised by earlier tests) parses exactly as it always has.
 */
function parseAnswerResponse(raw: string): ParsedAnswer {
  let text = raw.trim();

  let hasNotInMaterialMarker = false;
  const markerMatch = text.match(new RegExp(`^${NOT_IN_MATERIAL_MARKER}\\s*\\n?`, "i"));
  if (markerMatch) {
    hasNotInMaterialMarker = true;
    text = text.slice(markerMatch[0].length).trim();
  }

  let concepts: string[] = [];
  const conceptsLines = text.split("\n");
  const lastLineForConcepts = (conceptsLines[conceptsLines.length - 1] ?? "").trim();
  const conceptsMatch = lastLineForConcepts.match(/^CONCEPTS:\s*(.*)$/i);
  if (conceptsMatch) {
    const rawConcepts = conceptsMatch[1].trim();
    if (rawConcepts && !/^none$/i.test(rawConcepts)) {
      concepts = rawConcepts
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_ANSWER_CONCEPTS);
    }
    text = conceptsLines.slice(0, -1).join("\n").trim();
  }

  let sources: string[] = [];
  const lines = text.split("\n");
  const lastLine = (lines[lines.length - 1] ?? "").trim();
  const sourcesMatch = lastLine.match(/^SOURCES:\s*(.*)$/i);
  if (sourcesMatch) {
    const rawSources = sourcesMatch[1].trim();
    if (rawSources && !/^none$/i.test(rawSources)) {
      sources = rawSources
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    text = lines.slice(0, -1).join("\n").trim();
  }

  return { answer: text, hasNotInMaterialMarker, sources, concepts };
}

/**
 * Answer a question a student asks out loud during a live class, grounded in
 * the course's pre-gathered material (see buildLiveSessionContextAction) and
 * optionally the deck/recent transcript. Latency-critical: exactly ONE
 * callLlm call, no retry loop, no second pass. Never throws.
 */
export async function answerLiveQuestionAction(
  question: string,
  context: LiveQuestionContext,
  opts?: { provider?: LlmProvider; maxWords?: number }
): Promise<{ answer: string; grounded: boolean; sources: string[]; links: AnswerLink[] } | { error: string }> {
  try {
    await requireOwner();

    if (!question.trim()) {
      return { error: "No question was provided to answer." };
    }

    const provider = opts?.provider ?? "gemini";
    const maxWords = clampMaxWords(opts?.maxWords);
    const hadContext = Boolean((context.materialsText ?? "").trim() || (context.deckText ?? "").trim());

    const prompt = buildAnswerPrompt(question, context, maxWords);

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: answerMaxOutputTokens(maxWords) },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Answering failed: HTTP ${result.status}` };
    }

    const parsed = parseAnswerResponse(result.text);

    // Links are resolved by CODE from the model's named CONCEPTS - see
    // src/lib/live-class/links.ts's header comment for why the model itself
    // is never trusted to emit a URL. resolveVisualizerLinks is handed
    // whatever index was pre-loaded once at session start (or [] if it never
    // loaded) - never a network call from inside this action, keeping this
    // still exactly ONE callLlm invocation.
    const docsLinks = resolveDocsLinks(parsed.concepts, {
      courseName: context.courseName,
      moduleName: context.moduleName,
    });
    const visualizerLinks = resolveVisualizerLinks(parsed.concepts, context.visualizerIndex ?? []);
    const links = dedupeLinks([...visualizerLinks, ...docsLinks]);

    return {
      // stripModelUrls runs regardless of whether the model followed the
      // "never write a URL" instruction - a model that ignores it can never
      // leak a fabricated link into the panel or the saved session document.
      answer: stripModelUrls(parsed.answer),
      // grounded requires BOTH that material/deck context was actually
      // supplied AND that the model did not emit the not-covered marker.
      grounded: hadContext && !parsed.hasNotInMaterialMarker,
      sources: parsed.sources,
      links,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not answer the question." };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// A3 - buildLiveSessionContextAction
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build the StepRunHelpers gatherModuleMaterials actually needs to run
 * OUTSIDE any workflow step. Verified by reading registry-helpers.sources.ts
 * (and its resolveTileCurrentWeek dependency): under the default source
 * policy ("live-lms" -> "course-export" -> "tile-meta"), the only fields ever
 * read off StepRunHelpers on this path are activeInstitution,
 * loadCourseExport, and loadCourseMaterials - every other field exists solely
 * to satisfy the StepRunHelpers type and is never invoked here.
 *
 * loadCourseExport/loadCourseMaterials matter more than the rest: a course
 * whose materials live in an uploaded course export (no live Canvas
 * connection) would otherwise degrade all the way to the tile's bare topics
 * list, and every live-class answer during that session would be only
 * weakly grounded while still reading as authoritative - the live-class
 * analogue of the current-events report citing invented sources. They are
 * NOT left null: buildServerMaterialLoaders (step-helpers-server.ts) is the
 * exact same server-side implementation server-runner.ts's
 * buildServerStepRunHelpers uses for an unattended workflow run - extracted
 * into that shared module specifically so this action and the workflow
 * runner can never drift apart. Both need only a service-role Supabase
 * client (createServiceClient(), same pattern src/lib/supabase/courses.ts
 * already uses internally - see that module's doc comment); no browser
 * session or storage helpers of our own are needed.
 *
 * Fail-forward is preserved: gatherModuleMaterials's own callers (tryExport,
 * materialsZipGatherer) already wrap every call to loadCourseExport/
 * loadCourseMaterials in try/catch and turn a throw (missing export, a
 * corrupt cartridge, a storage error) into a note rather than a failure, so
 * a course with no export - or one whose export fails to parse - still
 * degrades to whatever the next configured source yields, exactly as before.
 */
function buildLiveSessionStepRunHelpers(supabase: ReturnType<typeof createServiceClient>): StepRunHelpers {
  return {
    activeInstitution: null,
    provider: "gemini",
    author: "",
    saveBundle: null,
    saveCourseMaterialFile: null,
    saveCourseCastletopFile: null,
    saveCourseExportFile: null,
    loadCommonResources: null,
    getLibraryFile: null,
    getInstitutionFields: null,
    ...buildServerMaterialLoaders(supabase),
  };
}

const HINT_TERM_MIN_LENGTH = 4;
const HINT_TERM_MAX_COUNT = 20;
const HINT_TERM_SCAN_CHAR_CAP = 20000;

// A token is "distinctive" enough to guide transcription spelling when it
// looks like a technical term rather than ordinary prose: an ALL-CAPS
// acronym, camelCase/PascalCase, one containing a digit, or a hyphenated/
// underscored compound. Cheap and deterministic - derived from the gathered
// material with no extra LLM call.
function looksLikeTechnicalTerm(word: string): boolean {
  if (/^[A-Z0-9]{2,}$/.test(word)) return true; // acronym, e.g. "HTTP"
  if (/[a-z][A-Z]/.test(word)) return true; // camelCase/PascalCase
  if (/\d/.test(word)) return true; // contains a digit, e.g. "Python3"
  if (word.includes("-") || word.includes("_")) return true; // compound token
  return false;
}

function deriveHintTerms(materialsText: string): string {
  const text = materialsText.slice(0, HINT_TERM_SCAN_CHAR_CAP);
  const tokenPattern = /[A-Za-z][A-Za-z0-9_-]*/g;
  const counts = new Map<string, { display: string; count: number }>();

  for (const match of text.matchAll(tokenPattern)) {
    const word = match[0];
    if (word.length < HINT_TERM_MIN_LENGTH || !looksLikeTechnicalTerm(word)) continue;
    const key = word.toLowerCase();
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { display: word, count: 1 });
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, HINT_TERM_MAX_COUNT)
    .map((entry) => entry.display)
    .join(", ");
}

/**
 * Called ONCE, when the instructor starts a live session - every per-question
 * call during class (answerLiveQuestionAction) reuses this pre-warmed
 * materialsText/hintTerms instead of re-gathering course material on every
 * question. THIS IS THE SINGLE MOST IMPORTANT LATENCY DECISION IN THIS
 * FEATURE: gathering materials can mean live-LMS calls, export parsing, and
 * several seconds of work - fine to pay once at "start class", disastrous if
 * repeated for every spoken question. Never throws: errors return { error }.
 */
export async function buildLiveSessionContextAction(
  hubCourseId: string,
  moduleIdRaw: string,
  sourcesPolicyRaw?: string
): Promise<
  | { courseName: string; moduleName: string; materialsText: string; hintTerms: string; materialsSource: string }
  | { error: string }
> {
  try {
    await requireOwner();

    const id = hubCourseId.trim();
    if (!id) {
      return { error: "Choose a course tile." };
    }

    const list = await listCourseHubAction();
    if ("error" in list) {
      return { error: list.error };
    }
    const tile = list.courses.find((c) => c.id === id);
    if (!tile) {
      return { error: "That course tile could not be found." };
    }

    const policy = resolveSourcePolicy(sourcesPolicyRaw);
    const supabase = createServiceClient();
    const helpers = buildLiveSessionStepRunHelpers(supabase);
    // materialsSource names WHICH source actually supplied materialsText
    // (e.g. "Materials from the course export module ..." vs "Materials from
    // the tile's topics/description") - surfaced so a thin context is
    // diagnosable during class instead of silently reading as fully grounded.
    const { moduleName, materialsText, materialsSource } = await gatherModuleMaterials(
      tile,
      moduleIdRaw.trim(),
      helpers,
      () => {},
      policy
    );

    return {
      courseName: tile.name,
      moduleName,
      materialsText,
      hintTerms: deriveHintTerms(materialsText),
      materialsSource,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not build the live session context." };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// loadVisualizerIndexAction - the visualizer nav index, loaded ONCE per
// session
// ─────────────────────────────────────────────────────────────────────────

/**
 * Fetch and parse the visualizer's navItems.ts ONCE, at session start, so
 * answerLiveQuestionAction's per-question link resolution
 * (resolveVisualizerLinks in src/lib/live-class/links.ts) never has to hit
 * GitHub on the answer-latency path - the exact same "pay once at start,
 * reuse for the rest of class" shape as buildLiveSessionContextAction's
 * materials gathering above (see that action's own doc comment). Called
 * alongside buildLiveSessionContextAction by useLiveSessionPersistence.ts's
 * start(), and the resulting entries are threaded through LiveSessionContext
 * -> LiveQuestionContext.visualizerIndex on every subsequent question.
 *
 * Never throws, and a failure here must never block starting a class: the
 * caller is expected to fail forward to an empty index (docs links still
 * resolve normally; visualizer links are simply skipped for that session)
 * rather than treating this as fatal.
 */
export async function loadVisualizerIndexAction(): Promise<
  { entries: VisualizerIndexEntry[] } | { error: string }
> {
  try {
    await requireOwner();
    const source = await getFileText(
      "alexandergshaw",
      "programming-concept-visualizer",
      "components/pageComponents/navItems.ts"
    );
    return { entries: parseNavItems(source) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the visualizer index." };
  }
}
