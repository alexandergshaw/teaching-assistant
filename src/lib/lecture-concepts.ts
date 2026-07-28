/**
 * Planning phase for schedule-driven lecture decks.
 *
 * generateSlidesFromTopic (src/app/actions/course-planning-grounding.ts) used
 * to go straight from a week's one-line topic to a single "cover this at
 * maximum breadth" prompt, with nothing telling the model HOW MANY concepts
 * the week actually holds. A model that meets every literal requirement with
 * one concept (a concept slide, then Example/Walkthrough/Practice/Answer,
 * then the closing sections) has technically satisfied the old prompt and
 * stops - which is exactly what produced a 16-slide, one-concept "Project
 * Integration and Initiation" week.
 *
 * This module makes breadth a decision instead of an accident: derive the
 * week's ordered concept list FIRST (planWeekConcepts), sized to the lecture
 * length (conceptCountForMinutes), then hand the model an explicit numbered
 * list and demand a full teaching cycle for every entry
 * (buildConceptCycleInstruction).
 *
 * Pure where possible, server-safe; no React. planWeekConcepts is async only
 * because it reuses the deck engine's own LLM-backed breadth/sequencing
 * helpers (src/lib/decks/generate.ts, src/lib/decks/sequence.ts) - it is
 * itself no `"use server"` action, so it stays importable and testable from
 * a plain module.
 */

import { enumerateBreadthFull } from "@/lib/decks/generate";
import { sequenceConcepts } from "@/lib/decks/sequence";
import type { LlmProvider } from "@/lib/llm";
import type { CourseKind } from "@/lib/course-kind";

// ---------------------------------------------------------------------------
// conceptCountForMinutes
// ---------------------------------------------------------------------------

/** Used when `minutes` is missing, blank, or not a positive number. */
export const DEFAULT_LECTURE_MINUTES = 50;

/** Minutes are clamped into this range before the concept count is derived. */
export const MIN_LECTURE_MINUTES_FOR_CONCEPTS = 20;
export const MAX_LECTURE_MINUTES_FOR_CONCEPTS = 150;

/** Roughly how long a full concept cycle (concept + Example/Walkthrough/Practice/Answer) takes to teach. */
export const MINUTES_PER_CONCEPT = 10;

/** Named bounds the derived concept count is clamped into, regardless of lecture length. */
export const MIN_CONCEPTS_PER_LECTURE = 2;
export const MAX_CONCEPTS_PER_LECTURE = 7;

/**
 * How many distinct concepts a lecture of this length should teach, each
 * with its own full cycle. Pure and deterministic: no I/O, no Date, no
 * randomness - same input always yields the same output.
 *
 * A 50-minute session (this app's default) lands at 5, inside the
 * documented 4-6 range. Short sessions clamp down to
 * MIN_CONCEPTS_PER_LECTURE; long ones clamp up to MAX_CONCEPTS_PER_LECTURE
 * so the token budget stays bounded (see the maxOutputTokens comment in
 * course-planning-grounding.ts for the worst-case sizing this bound was
 * chosen against).
 */
export function conceptCountForMinutes(minutes: number): number {
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_LECTURE_MINUTES;
  const clampedMinutes = Math.min(
    MAX_LECTURE_MINUTES_FOR_CONCEPTS,
    Math.max(MIN_LECTURE_MINUTES_FOR_CONCEPTS, safeMinutes)
  );
  const raw = Math.round(clampedMinutes / MINUTES_PER_CONCEPT);
  return Math.min(MAX_CONCEPTS_PER_LECTURE, Math.max(MIN_CONCEPTS_PER_LECTURE, raw));
}

// ---------------------------------------------------------------------------
// splitCompoundTopic
// ---------------------------------------------------------------------------

/**
 * Split a topic line on its own conjunctions/punctuation - "Project
 * Integration and Initiation" -> ["Project Integration", "Initiation"].
 * Returns the trimmed topic as a single-item array when no separator is
 * found; NEVER invents a split the title doesn't already contain.
 *
 * This is the deterministic fallback used by planWeekConcepts when breadth
 * enumeration comes back unexpanded (see there for why that matters for a
 * bare one-line week topic specifically).
 */
export function splitCompoundTopic(topic: string): string[] {
  const parts = topic
    .split(/\s*(?:,|;|\/|&|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1) return parts;
  const trimmed = topic.trim();
  return trimmed ? [trimmed] : [];
}

// ---------------------------------------------------------------------------
// planWeekConcepts
// ---------------------------------------------------------------------------

export interface WeekConceptPlan {
  /** Final ordered, deduplicated concept list this week's deck should teach. */
  concepts: string[];
  /** The concept count this lecture length calls for (conceptCountForMinutes(minutes)) - a ceiling, not a padding target. */
  targetCount: number;
  /** Groups of candidate concepts that were merged as near-duplicates, for reporting (mirrors SequencedConcepts.merged). */
  merged: string[][];
}

/**
 * Derive the week's ordered concept list BEFORE any slide is generated.
 *
 * 1. Enumerate: reuse the deck engine's own enumerateBreadthFull, with the
 *    week's topic (plus a slice of the summary) as the SUBJECT and no seeds,
 *    to expand the one-line topic into a fuller subtopic list (up to 8
 *    candidates) driven entirely by the model's enumeration - not the raw
 *    topic line itself, which is a deck label, not a concept. This is the
 *    same helper generateDeckFromTemplate uses for a breadth="full" loop
 *    group; here there is no pre-existing loop group, only the topic line.
 * 2. Degrade: enumerateBreadthFull's own fallback (LLM transport failure,
 *    an unparseable response, or the "embedded" provider) returns the seed
 *    list verbatim - which is empty here, since no seeds are passed. An
 *    empty result is the signal that expansion never really happened, and
 *    returning it unexpanded would reproduce exactly the one-concept bug
 *    this module exists to fix. When that happens, splitCompoundTopic gives
 *    the topic line one chance to yield more than one concept from its own
 *    structure (a title like "X and Y" names two concepts whether or not
 *    the model ever ran). A real enumeration that legitimately finds only
 *    ONE subtopic (length 1, not 0) is trusted as-is - only a truly empty
 *    result counts as "expansion didn't happen".
 * 3. Sequence: reuse sequenceConcepts (merges near-duplicates, orders
 *    foundations before advanced material) so the plan is never just a
 *    dedup, it is also pedagogically ordered.
 * 4. Cap: truncate to conceptCountForMinutes(minutes) AFTER merging/
 *    ordering, so a longer candidate list keeps its most foundational
 *    entries rather than losing them to an early arbitrary slice. Never
 *    pads a short, genuine list back up to the target - a narrow topic
 *    that only supports one real concept stays at one.
 *
 * Never throws: every LLM-backed step it calls already degrades to a
 * deterministic fallback internally.
 */
export async function planWeekConcepts(
  topic: string,
  summary: string,
  minutes: number,
  provider: LlmProvider
): Promise<WeekConceptPlan> {
  const targetCount = conceptCountForMinutes(minutes);
  const trimmedTopic = topic.trim();
  if (!trimmedTopic) {
    return { concepts: [], targetCount, merged: [] };
  }

  const trimmedSummary = summary.trim();
  const enumerationSubject = trimmedSummary
    ? `${trimmedTopic} - ${trimmedSummary.slice(0, 300)}`
    : trimmedTopic;

  let candidates = await enumerateBreadthFull(enumerationSubject, [], provider);

  if (candidates.length === 0) {
    candidates = splitCompoundTopic(trimmedTopic);
  }

  const sequenced = await sequenceConcepts(trimmedTopic, candidates, provider);
  const concepts = sequenced.items.slice(0, targetCount);

  return { concepts, targetCount, merged: sequenced.merged };
}

// ---------------------------------------------------------------------------
// buildConceptCycleInstruction
// ---------------------------------------------------------------------------

/**
 * Render the planned concept list into an explicit, numbered teaching
 * demand for the deck-generation prompt: exactly these concepts, in this
 * order, each with its own full cycle. This is what stops the model from
 * satisfying the pedagogical contract with only the first concept it
 * thinks of - it no longer decides how many concepts the week has, the
 * plan does.
 *
 * COURSE-KIND AWARE: the coding and applied cycles are different shapes
 * (five slides - concept, Example, Walkthrough, Practice, Answer - vs. the
 * applied six-slide cycle - Principle, In Practice, Artifact, Judgment
 * Call, Your Turn, Model Response - see src/lib/slide-prompt.ts), so this
 * instruction names the right cycle for the course it is generating
 * instead of speaking generically. slideStructureRequirements(courseKind),
 * appended separately in the full prompt, still carries the authoritative
 * per-slide detail; this section only has to get the model to commit to
 * the right NUMBER of cycles up front.
 *
 * Returns "" when there is nothing to plan (see planWeekConcepts's empty-
 * topic case), so callers can unconditionally splice this into a prompt.
 */
export function buildConceptCycleInstruction(concepts: string[], kind: CourseKind): string {
  if (concepts.length === 0) return "";
  const list = concepts.map((concept, index) => `${index + 1}. ${concept}`).join("\n");
  const cycleDescription =
    kind === "applied"
      ? "its own complete six-slide teaching cycle (Principle / In Practice / Artifact / Judgment Call / Your Turn / Model Response, as described in the requirements below)"
      : "its own complete teaching cycle (a concept slide, then the Example / Walkthrough / Practice / Answer sequence described in the requirements below)";
  return `
CONCEPT PLAN: this lecture must teach ALL ${concepts.length} of the following concepts, in this exact order - do not stop after only the first one:
${list}

For EVERY concept listed above, without exception, produce ${cycleDescription}. A concept is not covered until its own full cycle appears in the deck. Do not merge two listed concepts into a single cycle, do not skip any of them, and do not substitute a different topic for one that is listed.
`;
}
