"use server";

// Sibling of llm-tools.ts (split out to keep that file under 1000 lines): the
// current-events research pipeline for a lecture deck. Re-exported from
// actions.ts alongside llm-tools.ts's exports, so the one existing caller
// (steps.knowledge.ts) keeps importing researchCurrentEventsAction from
// "@/app/actions". Pure helpers (clamps, parsers, the report builder) live in
// src/lib/workflows/current-events-report.ts instead of here, because a
// Server Actions file ("use server") may only export async functions.
//
// Wall-clock budget (the step is headless-safe - an unattended run executes
// inside the cron route's 60s serverless function budget):
//   - Topic extraction: one non-search call (~2-5s typical latency).
//   - Per-topic research: one grounded call PER TOPIC, but every topic fires
//     via Promise.allSettled, so wall-clock cost is one grounded call's
//     latency (~10-20s), not maxTopics calls' latency - the fan-out is
//     parallel, not sequential. Only topics whose first attempt fails or
//     returns no items pay a second (retried) call, and those retries also
//     run concurrently with each other.
//   - Synthesis: one more non-search call (~3-6s), run only after the
//     per-topic wave settles.
//   - Worst case (some topics need their one retry): extraction + 2x a
//     grounded call's latency + synthesis, comfortably inside 60s for the
//     default maxTopics=6/itemsPerTopic=5. maxOutputTokens per call is capped
//     (see the constants below) so a slow/verbose model response cannot blow
//     the budget on its own.
import { callLlm, type LlmProvider, type Source } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { jsonObjectSlice } from "./shared";
import {
  clampMaxTopics,
  clampItemsPerTopic,
  parseTopicList,
  parseTopicItems,
  dedupeSourcesByUrl,
  buildCurrentEventsReport,
  type ParsedTopic,
  type ParsedTopicItem,
  type TopicSection,
} from "@/lib/workflows/current-events-report";

const TOPIC_EXTRACTION_MAX_TOKENS = 2048;
const PER_TOPIC_MAX_TOKENS = 3072;
const SYNTHESIS_MAX_TOKENS = 2048;
// Matches the token budget of the single whole-deck call this pipeline
// replaces - used only in degraded mode, so it never runs alongside the
// per-topic wave.
const WHOLE_DECK_MAX_TOKENS = 8192;
const DECK_TEXT_CHAR_CAP = 12000;

// ── Model calls ───────────────────────────────────────────────────────────

function extraFocusBlock(extraFocus: string): string {
  return extraFocus ? `\n\nADDITIONAL FOCUS (fold into your search where relevant):\n${extraFocus}` : "";
}

async function extractTopics(deckText: string, maxTopics: number, provider: LlmProvider): Promise<ParsedTopic[]> {
  try {
    const prompt = `You are an expert educator analyzing a lecture slide deck to plan current-events research.

SLIDE DECK:
${deckText.slice(0, DECK_TEXT_CHAR_CAP)}

Identify up to ${maxTopics} major topics covered in this deck. For each topic, list the key entities, technologies, or concepts a researcher should search for.

Return ONLY valid JSON in this exact shape:
{"topics":[{"topic":"<topic name>","entities":"<comma-separated key entities/technologies/concepts>"}]}

No markdown fences, no commentary.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: TOPIC_EXTRACTION_MAX_TOKENS },
      },
      provider
    );

    if (!result.ok || !result.text.trim()) return [];
    return parseTopicList(result.text, maxTopics);
  } catch {
    return [];
  }
}

async function researchTopicOnce(
  topic: ParsedTopic,
  window: string,
  itemsPerTopic: number,
  extraFocus: string,
  provider: LlmProvider
): Promise<{ items: ParsedTopicItem[]; sources: Source[] }> {
  const prompt = `You are an expert educator researching current events for a lecture topic.

TOPIC: ${topic.topic}
KEY ENTITIES/CONCEPTS: ${topic.entities || "(none specified)"}
RECENCY WINDOW: ${window}${extraFocusBlock(extraFocus)}

Search the web and report up to ${itemsPerTopic} dated items about this topic from ${window}, spanning multiple angles where possible: news/developments, research and publications, industry/practitioner practice, incidents and case studies, and policy/regulation. For each item give what happened, its date, why it matters for teaching this topic, and a source URL. Only include an item outside the recency window if you mark it "background": true.

Return ONLY valid JSON in this exact shape:
{"items":[{"headline":"...","date":"...","angle":"news|research|industry|incident|policy","whyItMatters":"...","url":"...","background":false}]}

No markdown fences, no commentary. If nothing recent was found, return {"items":[]}.`;

  const result = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: PER_TOPIC_MAX_TOKENS },
      webSearch: true,
    },
    provider
  );

  if (!result.ok) {
    throw new Error(`HTTP ${result.status}`);
  }

  const items = parseTopicItems(result.text).slice(0, itemsPerTopic);
  return { items, sources: result.sources ?? [] };
}

/**
 * Research one topic, with one retry on a transient failure (a thrown
 * transport error) or an empty result. After the retry, an empty/failed
 * result is still returned/thrown to the caller - per-topic failures never
 * throw past the caller's Promise.allSettled boundary uncaught here, but
 * they DO surface as either a rejection or an empty items array so the
 * caller can record a note.
 */
async function researchTopicWithRetry(
  topic: ParsedTopic,
  window: string,
  itemsPerTopic: number,
  extraFocus: string,
  provider: LlmProvider
): Promise<{ items: ParsedTopicItem[]; sources: Source[] }> {
  try {
    const first = await researchTopicOnce(topic, window, itemsPerTopic, extraFocus, provider);
    if (first.items.length > 0) return first;
    return await researchTopicOnce(topic, window, itemsPerTopic, extraFocus, provider);
  } catch {
    return await researchTopicOnce(topic, window, itemsPerTopic, extraFocus, provider);
  }
}

/**
 * Degraded mode: today's single whole-deck grounded search, reshaped into
 * the same TopicSection/items shape the normal pipeline produces. Used when
 * topic extraction finds nothing, or when every extracted topic's research
 * fails. Returns null (never throws) on any failure, so the caller can
 * report a total failure with an informative message.
 */
async function runWholeDeckSearch(
  deckText: string,
  window: string,
  itemsPerTopic: number,
  maxTopics: number,
  extraFocus: string,
  provider: LlmProvider
): Promise<{ section: TopicSection; sources: Source[] } | null> {
  try {
    const targetItems = Math.min(itemsPerTopic * maxTopics, 30);
    const prompt = `You are an expert educator researching current events relevant to a lecture deck.

SLIDE DECK:
${deckText.slice(0, DECK_TEXT_CHAR_CAP)}

RECENCY WINDOW: ${window}${extraFocusBlock(extraFocus)}

Identify the deck's major topics yourself, then search the web and report up to ${targetItems} dated items across those topics from ${window}, spanning multiple angles where possible: news/developments, research and publications, industry/practitioner practice, incidents and case studies, and policy/regulation. For each item give what happened, its date, which deck topic it relates to, why it matters, and a source URL. Only include an item outside the recency window if you mark it "background": true.

Return ONLY valid JSON in this exact shape:
{"items":[{"headline":"...","date":"...","angle":"news|research|industry|incident|policy","whyItMatters":"...","url":"...","background":false}]}

No markdown fences, no commentary.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: WHOLE_DECK_MAX_TOKENS },
        webSearch: true,
      },
      provider
    );

    if (!result.ok) return null;
    const items = parseTopicItems(result.text);
    if (items.length === 0) return null;

    return {
      section: { topic: "Whole deck (degraded mode - topics not separated)", items },
      sources: result.sources ?? [],
    };
  } catch {
    return null;
  }
}

interface SynthesisResult {
  themes: string[];
  whatChanged: string;
  discussionPrompts: string[];
}

/**
 * Cross-cutting synthesis over the per-topic sections. Returns null (never
 * throws) on any failure - the caller turns that into a NOTE and ships the
 * per-topic sections without themes/what-changed/discussion prompts.
 */
async function runSynthesis(sections: TopicSection[], window: string, provider: LlmProvider): Promise<SynthesisResult | null> {
  try {
    const digest = sections
      .map(
        (s) =>
          `TOPIC: ${s.topic}\n${s.items
            .map((i) => `- [${i.date || "undated"}] ${i.headline}: ${i.whyItMatters}`)
            .join("\n")}`
      )
      .join("\n\n");

    if (!digest.trim()) return null;

    const prompt = `You are an expert educator synthesizing current-events research gathered per topic for a lecture deck.

RECENCY WINDOW: ${window}

PER-TOPIC RESEARCH:
${digest.slice(0, 10000)}

Identify cross-cutting themes across these topics, summarize what has changed since a deck on these topics would typically have been written, and suggest discussion prompts an instructor could use in class.

Return ONLY valid JSON in this exact shape:
{"themes":["..."],"whatChanged":"...","discussionPrompts":["..."]}

No markdown fences, no commentary.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: SYNTHESIS_MAX_TOKENS },
      },
      provider
    );

    if (!result.ok || !result.text.trim()) return null;

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) return null;

    const parsed = JSON.parse(jsonText) as {
      themes?: unknown[];
      whatChanged?: unknown;
      discussionPrompts?: unknown[];
    };

    return {
      themes: Array.isArray(parsed.themes) ? parsed.themes.map((t) => String(t).trim()).filter(Boolean) : [],
      whatChanged: typeof parsed.whatChanged === "string" ? parsed.whatChanged.trim() : "",
      discussionPrompts: Array.isArray(parsed.discussionPrompts)
        ? parsed.discussionPrompts.map((p) => String(p).trim()).filter(Boolean)
        : [],
    };
  } catch {
    return null;
  }
}

// ── Public action ─────────────────────────────────────────────────────────

export interface ResearchCurrentEventsOptions {
  maxTopics?: number;
  itemsPerTopic?: number;
  extraFocus?: string;
}

export interface ResearchCurrentEventsResult {
  report: string;
  sourceCount: number;
  topicsCovered: number;
}

/**
 * Research current events surrounding a deck's topics and generate a plain-
 * text report: topic extraction, then one grounded call per topic (in
 * parallel, each spanning multiple angles), then a cross-cutting synthesis
 * pass. `options` is additive and optional so the pipeline is a drop-in
 * replacement for the single-call version - every existing caller is
 * unaffected. Never throws: any failure short of total failure (no topics
 * AND the whole-deck fallback also failing) still returns a report, with
 * per-topic failures and caveats recorded in the report's NOTES section.
 */
export async function researchCurrentEventsAction(
  deckText: string,
  recentWindow: string,
  provider: LlmProvider = "gemini",
  options: ResearchCurrentEventsOptions = {}
): Promise<ResearchCurrentEventsResult | { error: string }> {
  try {
    await requireOwner();

    if (!deckText.trim()) {
      return { error: "Provide a slide deck to analyze." };
    }

    const window = recentWindow.trim() || "the past 30 days";
    const maxTopics = clampMaxTopics(options.maxTopics);
    const itemsPerTopic = clampItemsPerTopic(options.itemsPerTopic);
    const extraFocus = (options.extraFocus ?? "").trim();

    const notes: string[] = [];
    const sourcesAcc: Source[] = [];
    let sections: TopicSection[] = [];
    let degraded = false;
    let themes: string[] = [];
    let whatChanged = "";
    let discussionPrompts: string[] = [];

    const topics = await extractTopics(deckText, maxTopics, provider);

    if (topics.length > 0) {
      const settled = await Promise.allSettled(
        topics.map((t) => researchTopicWithRetry(t, window, itemsPerTopic, extraFocus, provider))
      );

      settled.forEach((outcome, i) => {
        const topicName = topics[i].topic;
        if (outcome.status === "fulfilled" && outcome.value.items.length > 0) {
          sections.push({ topic: topicName, items: outcome.value.items });
          sourcesAcc.push(...outcome.value.sources);
        } else {
          const reason =
            outcome.status === "rejected"
              ? outcome.reason instanceof Error
                ? outcome.reason.message
                : String(outcome.reason)
              : "no items were returned, even after one retry";
          notes.push(`Topic "${topicName}" failed: ${reason}`);
        }
      });
    } else {
      notes.push("Topic extraction found no distinct topics.");
    }

    if (sections.length === 0) {
      degraded = true;
      notes.push("Falling back to a single whole-deck search - this report is degraded (topics were not researched individually).");
      const fallback = await runWholeDeckSearch(deckText, window, itemsPerTopic, maxTopics, extraFocus, provider);
      if (!fallback) {
        return {
          error:
            topics.length === 0
              ? "Could not research current events: topic extraction failed and the whole-deck fallback search also failed."
              : `Could not research current events: all ${topics.length} topic(s) failed and the whole-deck fallback search also failed.`,
        };
      }
      sections = [fallback.section];
      sourcesAcc.push(...fallback.sources);
    } else {
      try {
        const synthesis = await runSynthesis(sections, window, provider);
        if (synthesis) {
          themes = synthesis.themes;
          whatChanged = synthesis.whatChanged;
          discussionPrompts = synthesis.discussionPrompts;
        } else {
          notes.push("Synthesis pass returned no usable output - per-topic sections ship without cross-cutting themes.");
        }
      } catch (err) {
        notes.push(`Synthesis pass failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const dedupedSources = dedupeSourcesByUrl(sourcesAcc);

    const report = buildCurrentEventsReport({
      window,
      itemsPerTopic,
      sections,
      themes,
      whatChanged,
      discussionPrompts,
      sources: dedupedSources,
      notes,
      degraded,
    });

    return {
      report,
      sourceCount: dedupedSources.length,
      topicsCovered: sections.length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not research current events." };
  }
}
