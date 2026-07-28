/**
 * Deterministic + LLM-backed sequencing of a deck's loop-group concepts.
 *
 * The template-driven deck generator (generate.ts) resolves each loop group's
 * items (seeds, optionally expanded by breadth enumeration) and then hands
 * them straight to expandTemplate, which emits one contiguous slide block per
 * item IN ARRAY ORDER. Nothing ever ordered that array, so decks ended up
 * with foundational material after material that depends on it, "Advanced"
 * sections scattered among introductory ones, and the same subject (e.g.
 * regular expressions / pattern matching) split into two separate sections.
 *
 * This module is the fix: mergeNearDuplicates collapses near-duplicate items
 * that name the same subject, and sequenceConcepts/sequenceConceptsDeterministic
 * order the survivors so foundations come first, advanced material comes
 * last, and related topics stay adjacent. Pure, server-safe; no React.
 */

import { callLlm, type LlmProvider } from "@/lib/llm";

export interface SequencedConcepts {
  /** The final, ordered, deduped loop items. */
  items: string[];
  /** Groups of input items that were merged into one surviving item, for reporting. */
  merged: string[][];
  /** True when the output order differs from the (deduped) input order. */
  reordered: boolean;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

// Longest-first so "basics of" is tried before "basic", etc.
const LEADING_QUALIFIERS = [
  "introduction to",
  "intro to",
  "overview of",
  "basics of",
  "working with",
  "understanding",
  "advanced",
  "basic",
  "using",
].sort((a, b) => b.length - a.length);

const TRAILING_QUALIFIERS = ["fundamentals", "basics", "overview"].sort(
  (a, b) => b.length - a.length
);

/**
 * A small, explicit table of subject synonyms. Two items whose normalized
 * forms each contain a phrase from the SAME group are treated as naming the
 * same subject family, even when neither string contains the other.
 */
const SYNONYM_GROUPS: string[][] = [
  ["regular expressions", "regex", "pattern matching"],
  ["dictionary", "dict", "hash map", "key value"],
  ["list", "array", "sequence"],
  ["efficiency", "performance", "complexity", "big o"],
  ["data redundancy", "single source of truth", "normalization"],
];

/** Lowercase, strip qualifiers/punctuation, collapse whitespace. Module-private. */
function normalizeConceptLabel(raw: string): string {
  let s = raw
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let changed = true;
  while (changed) {
    changed = false;

    for (const q of LEADING_QUALIFIERS) {
      if (s === q) {
        s = "";
        changed = true;
        break;
      }
      const prefix = `${q} `;
      if (s.startsWith(prefix)) {
        s = s.slice(prefix.length).trim();
        changed = true;
        break;
      }
    }
    if (changed) continue;

    for (const q of TRAILING_QUALIFIERS) {
      if (s === q) {
        s = "";
        changed = true;
        break;
      }
      const suffix = ` ${q}`;
      if (s.endsWith(suffix)) {
        s = s.slice(0, s.length - suffix.length).trim();
        changed = true;
        break;
      }
    }
  }

  return s.replace(/\s+/g, " ").trim();
}

/** Whole-word/whole-phrase containment: `haystack` contains `needle` at word boundaries. */
function containsWholeWord(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function wordsOf(s: string): string[] {
  return s.split(" ").filter(Boolean);
}

/**
 * True when every word of `needle` appears, as a whole word, in `haystack`,
 * in the same relative order (a whole-word subsequence - not necessarily
 * contiguous). A single-word needle degenerates to whole-word containment.
 */
function isWholeWordSubsequence(needle: string, haystack: string): boolean {
  const needleWords = wordsOf(needle);
  if (needleWords.length === 0) return false;
  const haystackWords = wordsOf(haystack);
  let cursor = 0;
  for (const word of needleWords) {
    let found = -1;
    for (let i = cursor; i < haystackWords.length; i++) {
      if (haystackWords[i] === word) {
        found = i;
        break;
      }
    }
    if (found === -1) return false;
    cursor = found + 1;
  }
  return true;
}

/** Count of whole-word tokens `item`'s residual topic shares with the (already normalized) subject. */
function tokenOverlapScore(item: string, normalizedSubject: string): number {
  if (!normalizedSubject) return 0;
  const residual = normalizeConceptLabel(item);
  if (!residual) return 0;
  const residualWords = new Set(wordsOf(residual));
  const subjectWords = new Set(wordsOf(normalizedSubject));
  let score = 0;
  for (const w of residualWords) {
    if (subjectWords.has(w)) score++;
  }
  return score;
}

function synonymGroupIndexesFor(normalized: string): number[] {
  const idxs: number[] = [];
  SYNONYM_GROUPS.forEach((group, i) => {
    if (group.some((phrase) => containsWholeWord(normalized, phrase))) {
      idxs.push(i);
    }
  });
  return idxs;
}

/** Two labels merge on exact-normalized equality, whole-word containment, or a shared synonym group. */
function shouldMergeLabels(normA: string, normB: string): boolean {
  if (normA === "" || normB === "") return false; // degenerate fragments never auto-merge
  if (normA === normB) return true;
  if (containsWholeWord(normA, normB) || containsWholeWord(normB, normA)) return true;
  const groupsA = synonymGroupIndexesFor(normA);
  if (groupsA.length === 0) return false;
  const groupsB = synonymGroupIndexesFor(normB);
  return groupsA.some((g) => groupsB.includes(g));
}

// ---------------------------------------------------------------------------
// D2: mergeNearDuplicates
// ---------------------------------------------------------------------------

function isAdvancedRaw(item: string): boolean {
  return /\badvanced\b/i.test(item);
}

/**
 * Rank vector, lower sorts first (earlier-encountered wins remaining ties -
 * see the strict `<` in pickSurvivor's scan):
 *   - no subject:   [isFragment, isAdvanced, rawLength]                    (byte-identical to pre-F4 behavior)
 *   - with subject: [isFragment, -subjectTokenOverlap, isAdvanced, position, rawLength]
 * The subject-aware vector implements F4's priority order: (1) prefer the
 * label whose residual topic shares more whole-word tokens with the deck
 * subject, (2) prefer a non-"Advanced" label, (3) prefer the label that
 * appeared earlier in the input, (4) shortest string as a final tie-break.
 */
function survivorRank(item: string, position: number, normalizedSubject: string): number[] {
  const isFragment = normalizeConceptLabel(item) === "" ? 1 : 0;
  const advanced = isAdvancedRaw(item) ? 1 : 0;
  if (!normalizedSubject) {
    return [isFragment, advanced, item.length];
  }
  const overlap = tokenOverlapScore(item, normalizedSubject);
  return [isFragment, -overlap, advanced, position, item.length];
}

function compareRank(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** Pick the label that reads best for a student from a group of merged items (input order preserved). */
function pickSurvivor(groupItems: string[], normalizedSubject: string): string {
  let best = groupItems[0];
  let bestRank = survivorRank(best, 0, normalizedSubject);
  for (let i = 1; i < groupItems.length; i++) {
    const rank = survivorRank(groupItems[i], i, normalizedSubject);
    if (compareRank(rank, bestRank) < 0) {
      best = groupItems[i];
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Collapse items that name the same subject (see shouldMergeLabels) into one
 * surviving label each. Deterministic, stable (equal-ranked survivors keep
 * input relative order), and idempotent: because every pair in the input is
 * compared (not just adjacent pairs), any two labels left in the output are
 * provably non-mergeable with each other, so a second pass changes nothing.
 *
 * `subject` is optional and additive: when omitted, survivor selection is
 * byte-identical to before (shortest non-"Advanced" non-fragment label
 * wins). When supplied, it re-prioritizes survivor selection per F4 - see
 * survivorRank.
 */
export function mergeNearDuplicates(
  items: string[],
  subject?: string
): { items: string[]; merged: string[][] } {
  const normalizedSubject = subject ? normalizeConceptLabel(subject) : "";
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // Smaller index wins as root, so a group's root is always its earliest member.
    if (ra < rb) parent[rb] = ra;
    else parent[ra] = rb;
  }

  const normalized = items.map(normalizeConceptLabel);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (shouldMergeLabels(normalized[i], normalized[j])) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const bucket = groups.get(root);
    if (bucket) bucket.push(i);
    else groups.set(root, [i]);
  }

  // Root indices double as first-appearance order (union always keeps the smaller index as root).
  const rootsInOrder = [...groups.keys()].sort((a, b) => a - b);

  const outItems: string[] = [];
  const merged: string[][] = [];

  for (const root of rootsInOrder) {
    const idxs = groups.get(root)!; // already ascending: built by an ascending i loop
    const groupItems = idxs.map((idx) => items[idx]);
    outItems.push(pickSurvivor(groupItems, normalizedSubject));
    if (groupItems.length > 1) {
      merged.push(groupItems);
    }
  }

  return { items: outItems, merged };
}

// ---------------------------------------------------------------------------
// D3: sequenceConceptsDeterministic
// ---------------------------------------------------------------------------

const FOUNDATIONAL_RE = /\b(overview|introduction to|fundamentals|basics|what is)\b/i;
const ADVANCED_RE = /\b(advanced|optimizing|efficiency|performance|complexity|edge cases?)\b/i;

/**
 * Subject-unaware bucket, kept verbatim so the no-subject path stays
 * byte-identical to pre-F2 behavior: 0 = foundational (by label prefix/suffix),
 * 1 = neutral, 2 = advanced/optimization. Foundational wins ties with "advanced".
 */
function legacyBucketFor(item: string): number {
  if (FOUNDATIONAL_RE.test(item)) return 0;
  return ADVANCED_RE.test(item) ? 2 : 1;
}

/**
 * A SUBJECT-LEVEL foundation names the deck subject itself - its residual
 * topic (the item stripped of qualifier words, same as normalizeConceptLabel
 * produces for merging) is empty, equals the normalized subject, or is a
 * whole-word subsequence of it. This is what should outrank everything else:
 * "Data Structures Overview" in a "Algorithms and Data Structures" deck.
 *
 * By contrast a TOPIC-LEVEL introduction matches the FOUNDATIONAL_RE prefix/
 * suffix heuristic but names an unrelated sub-topic - "Introduction to
 * Indexing" in a "SQL for Data Analysis" deck - and must get no boost at all.
 */
function isSubjectLevelFoundation(item: string, normalizedSubject: string): boolean {
  if (!normalizedSubject) return false;
  const residual = normalizeConceptLabel(item);
  if (residual === "") return true;
  if (residual === normalizedSubject) return true;
  return isWholeWordSubsequence(residual, normalizedSubject);
}

/**
 * Subject-aware bucket: 0 = subject-level foundation, 1 = ordinary (a
 * topic-level introduction included - it gets no boost), 2 = advanced/
 * optimization. Advanced always sorts last, even for subject-related material.
 */
function bucketForSubject(item: string, normalizedSubject: string): number {
  if (ADVANCED_RE.test(item)) return 2;
  return isSubjectLevelFoundation(item, normalizedSubject) ? 0 : 1;
}

/** The subject-family key used to keep related items contiguous within a bucket. */
function familyKeyFor(item: string): string {
  const normalized = normalizeConceptLabel(item);
  const groups = synonymGroupIndexesFor(normalized);
  if (groups.length > 0) return `syn:${groups[0]}`;
  return normalized || item.toLowerCase().trim();
}

/**
 * Deterministic ordering heuristic (no LLM, no randomness, no clock):
 *   a. foundations first - globally, before every non-foundational item and every advanced item.
 *      With a subject supplied, "foundational" means SUBJECT-LEVEL (see
 *      isSubjectLevelFoundation) rather than just prefix-shaped - a
 *      topic-level introduction to an unrelated sub-topic gets no boost.
 *   b. advanced last - globally, after every non-advanced item.
 *   c. related together - items sharing a subject family stay contiguous within their bucket,
 *      and (with a subject supplied) a family containing a subject-level foundation is pulled
 *      forward as a whole rather than split across buckets - see the family-pull step below.
 *   d. stable otherwise - ties keep input relative order.
 *
 * `subject` is optional and additive: omitted, this reproduces today's
 * (subject-unaware) output exactly.
 */
export function sequenceConceptsDeterministic(items: string[], subject?: string): SequencedConcepts {
  const normalizedSubject = subject ? normalizeConceptLabel(subject) : "";
  const { items: mergedItems, merged } = mergeNearDuplicates(items, subject);

  const buckets = normalizedSubject
    ? mergedItems.map((item) => bucketForSubject(item, normalizedSubject))
    : mergedItems.map(legacyBucketFor);

  const families = mergedItems.map(familyKeyFor);

  // F3: a family that contains a subject-level foundation is pulled forward
  // as a whole (its most-foundational member's bucket wins for every
  // non-advanced member) rather than orphaning the rest of the family behind
  // it. Advanced items are pinned - they always sort last regardless of what
  // bucket the rest of their family lands in. Only engaged when a subject is
  // supplied, so the no-subject path is untouched.
  let effectiveBuckets = buckets;
  if (normalizedSubject) {
    const familyMinBucket = new Map<string, number>();
    families.forEach((fam, idx) => {
      const b = buckets[idx];
      const cur = familyMinBucket.get(fam);
      if (cur === undefined || b < cur) familyMinBucket.set(fam, b);
    });
    effectiveBuckets = mergedItems.map((item, idx) => {
      if (ADVANCED_RE.test(item)) return buckets[idx];
      return Math.min(buckets[idx], familyMinBucket.get(families[idx])!);
    });
  }

  const familyFirstIndex = new Map<string, number>();
  families.forEach((fam, idx) => {
    if (!familyFirstIndex.has(fam)) familyFirstIndex.set(fam, idx);
  });

  const order = mergedItems.map((_, idx) => idx);
  order.sort((a, b) => {
    if (effectiveBuckets[a] !== effectiveBuckets[b]) return effectiveBuckets[a] - effectiveBuckets[b];
    const fa = familyFirstIndex.get(families[a])!;
    const fb = familyFirstIndex.get(families[b])!;
    if (fa !== fb) return fa - fb;
    return a - b; // stable: original relative order
  });

  const sequencedItems = order.map((idx) => mergedItems[idx]);
  const reordered = order.some((idx, pos) => idx !== pos);

  return { items: sequencedItems, merged, reordered };
}

// ---------------------------------------------------------------------------
// D4: sequenceConcepts (LLM-backed entry point)
// ---------------------------------------------------------------------------

function buildSequencePrompt(subject: string, items: string[]): string {
  const list = items.map((item, i) => `${i + 1}. ${item}`).join("\n");
  return `You are an expert curriculum designer sequencing topics for a single lecture on "${subject}".

Order the topics below so the lecture flows logically for students:
- Teach any prerequisite topic before the topics that depend on it.
- Keep closely related topics adjacent to one another rather than scattering them.
- Move from foundational/overview material, through core material, to advanced or optimization material last.
- Do NOT add, remove, rename, merge, or split any topic. Return every topic exactly once, using its EXACT original text.

TOPICS:
${list}

Return ONLY valid JSON in this exact shape, naming every topic above exactly once:
{"order": ["<topic>", "<topic>", ...]}`;
}

/** Extract the first JSON object from text, handling an optional ```json fence. Module-private. */
function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

function parseOrderResponse(text: string): string[] | null {
  const jsonText = extractJsonObject(text);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as { order?: unknown };
    if (!Array.isArray(parsed.order)) return null;
    if (!parsed.order.every((item): item is string => typeof item === "string")) return null;
    return parsed.order;
  } catch {
    return null;
  }
}

function normalizeForCompare(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Hard permutation check. Returns the candidate order remapped onto the
 * EXACT original reference strings (never the model's own casing/wording),
 * or null if the candidate is not a same-multiset permutation of reference.
 * A model that renames, drops, adds, or duplicates an item is rejected here.
 */
function validateAndRemapPermutation(candidate: string[], reference: string[]): string[] | null {
  if (candidate.length !== reference.length) return null;

  const refByKey = new Map<string, string>();
  for (const item of reference) {
    const key = normalizeForCompare(item);
    if (refByKey.has(key)) return null; // ambiguous reference; be conservative
    refByKey.set(key, item);
  }

  const used = new Set<string>();
  const remapped: string[] = [];
  for (const raw of candidate) {
    if (typeof raw !== "string") return null;
    const key = normalizeForCompare(raw);
    const original = refByKey.get(key);
    if (!original || used.has(key)) return null;
    used.add(key);
    remapped.push(original);
  }

  return used.size === reference.length ? remapped : null;
}

/**
 * LLM-backed sequencing entry point used in production.
 * - provider "embedded": deterministic ordering, no LLM call.
 * - otherwise: merge near-duplicates, then ask the model to order the survivors.
 *   The response is validated as a hard permutation of the merged items; any
 *   mismatch (missing/extra/renamed item) or parse failure falls back to the
 *   deterministic order. Never throws.
 */
export async function sequenceConcepts(
  subject: string,
  items: string[],
  provider: LlmProvider
): Promise<SequencedConcepts> {
  if (provider === "embedded") {
    return sequenceConceptsDeterministic(items, subject);
  }

  try {
    const { items: mergedItems, merged } = mergeNearDuplicates(items, subject);

    if (mergedItems.length <= 1) {
      return { items: mergedItems, merged, reordered: false };
    }

    const prompt = buildSequencePrompt(subject, mergedItems);
    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: "application/json" },
      },
      provider
    );

    if (!result.ok) {
      return sequenceConceptsDeterministic(items, subject);
    }

    const candidate = parseOrderResponse(result.text);
    if (!candidate) {
      return sequenceConceptsDeterministic(items, subject);
    }

    const remapped = validateAndRemapPermutation(candidate, mergedItems);
    if (!remapped) {
      return sequenceConceptsDeterministic(items, subject);
    }

    const reordered = remapped.some((item, idx) => item !== mergedItems[idx]);
    return { items: remapped, merged, reordered };
  } catch {
    return sequenceConceptsDeterministic(items, subject);
  }
}
