/**
 * Deterministic grading for discussion board posts.
 *
 * A discussion is graded with a few COMPOSITE criteria (to fit the engine's
 * 4-criteria cap): each criterion column aggregates several mechanically-verifiable
 * sub-signals and awards partial credit. Participation, timeliness, and peer
 * engagement are genuinely verifiable; the "Quality proxies" column scores surface
 * signals (a question, a source, term coverage, post length) as a stand-in for
 * content quality, which a deterministic grader cannot actually judge.
 */

import {
  scaleResultToPoints,
  RESUBMIT_NOTICE,
  type GradingRun,
  type RubricAreaResult,
} from "@/lib/grade";
import type { DiscussionActivity, DiscussionPost } from "@/lib/canvas";
import { roundTo2, formatNumber } from "./format";

// ── Model ────────────────────────────────────────────────────────────────────

export type DiscussionSignal =
  | { kind: "initial_post" }
  | { kind: "min_replies"; count: number }
  | { kind: "min_words"; count: number }
  | { kind: "min_words_per_post"; count: number }
  | { kind: "posted_by_due" }
  | { kind: "distinct_days"; count: number }
  | { kind: "replies_to_peers"; count: number }
  | { kind: "mentions_peer" }
  | { kind: "asks_question" }
  | { kind: "includes_source" }
  | { kind: "keywords"; terms: string[] };

export interface DiscussionCriterion {
  /** Column name in the results matrix. */
  criterion: string;
  /** Total points for the column; split evenly across its signals. */
  points: number;
  signals: DiscussionSignal[];
  /** Marks the surface-proxy column so a warning explains it is not a real quality judgment. */
  proxy?: boolean;
}

export interface DiscussionRubric {
  criteria: DiscussionCriterion[];
  warnings: string[];
}

export interface DiscussionStudent {
  student: string;
  userId: number;
  activity: DiscussionActivity;
}

export interface DiscussionContext {
  dueAt: string | null;
  /** All participants, used to detect mentions of a classmate by name. */
  participants: Array<{ userId: number; name: string }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function dayKey(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

interface StudentStats {
  initialCount: number;
  replyCount: number;
  postWordCounts: number[];
  totalWords: number;
  allTextLower: string;
  distinctDays: number;
  earliestInitialAt: string | null;
  peerReplyCount: number;
}

function computeStats(student: DiscussionStudent): StudentStats {
  const { initialPosts, replies } = student.activity;
  const allPosts: DiscussionPost[] = [...initialPosts, ...replies];
  const postWordCounts = allPosts.map((p) => wordCount(p.text));
  const days = new Set<string>();
  for (const post of allPosts) {
    const key = dayKey(post.createdAt);
    if (key) days.add(key);
  }
  const initialTimes = initialPosts
    .map((p) => p.createdAt)
    .filter((t): t is string => !!t && !Number.isNaN(Date.parse(t)))
    .sort();
  const peerReplyCount = replies.filter(
    (r) => r.parentUserId !== null && r.parentUserId !== student.userId
  ).length;

  return {
    initialCount: initialPosts.length,
    replyCount: replies.length,
    postWordCounts,
    totalWords: postWordCounts.reduce((a, b) => a + b, 0),
    allTextLower: allPosts.map((p) => p.text).join("\n").toLowerCase(),
    distinctDays: days.size,
    earliestInitialAt: initialTimes[0] ?? null,
    peerReplyCount,
  };
}

function termPresent(haystackLower: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  if (/^[a-z0-9]+$/.test(t)) return new RegExp(`\\b${t}\\b`).test(haystackLower);
  return haystackLower.includes(t);
}

// ── Signal evaluation ────────────────────────────────────────────────────────

/** A signal's outcome: a 0..1 fraction of its share, and a short label for the detail line. */
function evalSignal(
  signal: DiscussionSignal,
  stats: StudentStats,
  student: DiscussionStudent,
  ctx: DiscussionContext
): { fraction: number; label: string } {
  const ratio = (have: number, need: number) => (need <= 0 ? 1 : Math.min(1, have / need));

  switch (signal.kind) {
    case "initial_post":
      return { fraction: stats.initialCount >= 1 ? 1 : 0, label: stats.initialCount >= 1 ? "initial post" : "no initial post" };
    case "min_replies":
      return { fraction: ratio(stats.replyCount, signal.count), label: `${stats.replyCount}/${signal.count} replies` };
    case "min_words":
      return { fraction: ratio(stats.totalWords, signal.count), label: `${stats.totalWords}/${signal.count} words` };
    case "min_words_per_post": {
      const posts = stats.postWordCounts.length;
      const meeting = stats.postWordCounts.filter((w) => w >= signal.count).length;
      return { fraction: posts === 0 ? 0 : meeting / posts, label: `${meeting}/${posts} posts >= ${signal.count}w` };
    }
    case "posted_by_due": {
      if (!ctx.dueAt) return { fraction: 1, label: "no due date set" };
      if (stats.initialCount === 0) return { fraction: 0, label: "no initial post" };
      if (!stats.earliestInitialAt) return { fraction: 1, label: "posted (no timestamp)" };
      const onTime = Date.parse(stats.earliestInitialAt) <= Date.parse(ctx.dueAt);
      return { fraction: onTime ? 1 : 0, label: onTime ? "on time" : "late" };
    }
    case "distinct_days":
      return { fraction: ratio(stats.distinctDays, signal.count), label: `${stats.distinctDays}/${signal.count} days active` };
    case "replies_to_peers":
      return { fraction: ratio(stats.peerReplyCount, signal.count), label: `${stats.peerReplyCount}/${signal.count} peer replies` };
    case "mentions_peer": {
      const mentioned = ctx.participants.some((p) => {
        if (p.userId === student.userId) return false;
        const first = p.name.trim().split(/\s+/)[0]?.toLowerCase();
        return !!first && first.length > 2 && termPresent(stats.allTextLower, first);
      });
      return { fraction: mentioned ? 1 : 0, label: mentioned ? "names a classmate" : "no classmate named" };
    }
    case "asks_question":
      return { fraction: stats.allTextLower.includes("?") ? 1 : 0, label: stats.allTextLower.includes("?") ? "asks a question" : "no question" };
    case "includes_source": {
      const has = /https?:\/\//.test(stats.allTextLower) || /\(\d{4}\)/.test(stats.allTextLower) || /\bdoi\b/.test(stats.allTextLower);
      return { fraction: has ? 1 : 0, label: has ? "cites a source" : "no source cited" };
    }
    case "keywords": {
      const terms = signal.terms;
      if (terms.length === 0) return { fraction: 1, label: "no required terms" };
      const present = terms.filter((t) => termPresent(stats.allTextLower, t)).length;
      return { fraction: present / terms.length, label: `covers ${present}/${terms.length} prompt terms` };
    }
    default:
      return { fraction: 0, label: "unsupported signal" };
  }
}

function scoreCriterion(
  criterion: DiscussionCriterion,
  stats: StudentStats,
  student: DiscussionStudent,
  ctx: DiscussionContext
): { area: RubricAreaResult; shortfalls: string[] } {
  if (criterion.signals.length === 0) {
    return {
      area: { area: criterion.criterion, score: `0/${formatNumber(criterion.points)}`, comment: "" },
      shortfalls: [],
    };
  }
  const per = criterion.points / criterion.signals.length;
  let earned = 0;
  const shortfalls: string[] = [];
  for (const signal of criterion.signals) {
    const { fraction, label } = evalSignal(signal, stats, student, ctx);
    earned += per * fraction;
    if (fraction < 1) shortfalls.push(label);
  }
  earned = roundTo2(earned);
  return {
    area: { area: criterion.criterion, score: `${formatNumber(earned)}/${formatNumber(criterion.points)}`, comment: "" },
    shortfalls,
  };
}

function buildOverall(stats: StudentStats, shortfalls: string[]): string {
  const posts = `${stats.initialCount} initial ${stats.initialCount === 1 ? "response" : "responses"}`;
  const replies = `${stats.replyCount} ${stats.replyCount === 1 ? "reply" : "replies"}`;
  let comment = `Posted ${posts} and ${replies} (${stats.totalWords} words total).`;
  if (shortfalls.length > 0) {
    comment += ` Points were reduced for: ${shortfalls.join(", ")}. ${RESUBMIT_NOTICE}`;
  }
  return comment;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * The default discussion rubric when no prompt is available. It grades the
 * near-universal mechanics (a post, two replies, on time) and surface proxies,
 * but does NOT invent a word count or a multi-day requirement.
 */
export function defaultDiscussionRubric(): DiscussionRubric {
  return assembleRubric({
    repliesCount: 2,
    wordsTotal: null,
    wordsPerPost: null,
    multiDayCount: null,
    terms: [],
    warnings: [
      proxyWarning(),
      "No discussion prompt was provided, so default participation thresholds (initial post, 2 replies) were used. Review before posting.",
    ],
  });
}

export function proxyWarning(): string {
  return "The 'Quality proxies' column scores surface signals (a question, a cited source, term coverage, post length) as a stand-in for content quality. It does not judge depth, insight, or correctness; review those yourself.";
}

// ── Rubric generation from the prompt ────────────────────────────────────────

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function toCount(value: string): number | null {
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  return WORD_NUMBERS[value.toLowerCase()] ?? null;
}

const PROMPT_STOP = new Set([
  "the", "and", "for", "with", "your", "you", "this", "that", "from", "into", "about",
  "what", "how", "why", "when", "whether", "discuss", "explain", "analyze", "consider",
  "describe", "reflect", "respond", "post", "reply", "classmates", "peers", "students",
  "least", "words", "reading", "module", "question", "prompt", "topic", "initial", "response",
]);

/** Content terms the prompt asks students to address (quoted, or the object of an
 *  analytic verb). Used for the optional keyword-coverage proxy. */
function extractPromptTerms(text: string): string[] {
  const terms = new Set<string>();

  const quoted = /["'“”‘’]([A-Za-z][A-Za-z0-9 \-]{2,40})["'“”‘’]/g;
  let match: RegExpExecArray | null;
  while ((match = quoted.exec(text)) !== null) {
    const term = match[1].trim().toLowerCase();
    if (term && !PROMPT_STOP.has(term)) terms.add(term);
  }

  const verbRe =
    /\b(?:discuss|analyze|analyse|explain|consider|describe|examine|evaluate|compare|address)\s+(?:the|a|an|how|why|what|whether)?\s*([A-Za-z][A-Za-z \-]{2,40})/gi;
  while ((match = verbRe.exec(text)) !== null) {
    const word = match[1].toLowerCase().split(/\s+/).find((w) => w.length > 3 && !PROMPT_STOP.has(w));
    if (word) terms.add(word);
  }

  return [...terms].slice(0, 3);
}

// Detection: each returns null when the prompt does not state the requirement,
// so the engine never grades a threshold the instructor never asked for.

function detectReplyCount(text: string): number | null {
  const patterns = [
    /\b(?:reply|replies|respond(?:ing)?|response)\b[^.\n]{0,30}?\b(?:to\s+)?(?:at least\s+)?(\d{1,2}|one|two|three|four|five|six)\b/i,
    /\b(\d{1,2}|one|two|three|four|five|six)\s+(?:replies|responses|peer responses|classmates|peers)\b/i,
    /\bat least\s+(\d{1,2}|one|two|three|four|five|six)\s+(?:replies|responses|classmates|peers|students|posts)\b/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const n = match ? toCount(match[1]) : null;
    if (n) return n;
  }
  return null;
}

function detectWordCount(text: string): number | null {
  const match =
    /\b(?:at least|minimum of|no fewer than)\s+(\d{2,5})\s*words?\b/i.exec(text) ||
    /\b(\d{2,5})\s*(?:\+|or more)?\s*words?\b/i.exec(text);
  return match ? Number(match[1]) : null;
}

function detectWordsPerPost(text: string): number | null {
  const match =
    /\b(?:each|per|every)\s+(?:post|reply|response)\b[^.\n]{0,30}?\b(\d{2,4})\s*words?\b/i.exec(text) ||
    /\b(\d{2,4})\s*words?\s+(?:per|each|for each)\s+(?:post|reply|response)\b/i.exec(text);
  return match ? Number(match[1]) : null;
}

/** A multi-day participation requirement, only when the prompt explicitly states one. */
function detectMultiDay(text: string): number | null {
  const numbered = /\b(?:on\s+)?(?:at least\s+)?(\d{1,2}|two|three|four|five)\s+(?:different|separate|distinct)?\s*days\b/i.exec(text);
  if (numbered) {
    const n = toCount(numbered[1]);
    if (n && n >= 2) return n;
  }
  const phrased =
    /\bthroughout the (?:week|module|unit)\b|\bover (?:the|several|multiple) (?:days|weeks?)\b|\bmultiple days\b|\bsustained (?:participation|engagement|discussion)\b|\bon (?:more than one|several|multiple) days\b/i.test(
      text
    );
  return phrased ? 2 : null;
}

/**
 * Assemble composite criteria, including only the columns and signals that apply.
 * Empty columns are dropped, so a discussion is never graded on a requirement the
 * prompt never stated.
 */
function assembleRubric(opts: {
  repliesCount: number | null;
  wordsTotal: number | null;
  wordsPerPost: number | null;
  multiDayCount: number | null;
  terms: string[];
  warnings: string[];
}): DiscussionRubric {
  const participation: DiscussionSignal[] = [{ kind: "initial_post" }];
  if (opts.repliesCount != null) participation.push({ kind: "min_replies", count: opts.repliesCount });
  if (opts.wordsTotal != null) participation.push({ kind: "min_words", count: opts.wordsTotal });

  const timeliness: DiscussionSignal[] = [{ kind: "posted_by_due" }];
  if (opts.multiDayCount != null) timeliness.push({ kind: "distinct_days", count: opts.multiDayCount });

  const engagement: DiscussionSignal[] = [];
  if (opts.repliesCount != null) {
    engagement.push({ kind: "replies_to_peers", count: opts.repliesCount }, { kind: "mentions_peer" });
  }

  const quality: DiscussionSignal[] = [];
  if (opts.terms.length > 0) quality.push({ kind: "keywords", terms: opts.terms });
  quality.push({ kind: "asks_question" }, { kind: "includes_source" });
  if (opts.wordsPerPost != null) quality.push({ kind: "min_words_per_post", count: opts.wordsPerPost });

  const columns: Array<{ criterion: string; signals: DiscussionSignal[]; proxy?: boolean }> = [
    { criterion: "Participation", signals: participation },
    { criterion: "Timeliness", signals: timeliness },
    { criterion: "Engagement", signals: engagement },
    { criterion: "Quality proxies", signals: quality.slice(0, 4), proxy: true },
  ];

  const criteria: DiscussionCriterion[] = columns
    .filter((c) => c.signals.length > 0)
    .map((c) => ({ criterion: c.criterion, points: 10, signals: c.signals, proxy: c.proxy }));

  return { criteria, warnings: opts.warnings };
}

/**
 * Build a discussion rubric from the prompt, grading ONLY what the prompt states:
 * reply count and word/length floors are used when given; a multi-day requirement
 * is added only when the prompt explicitly asks for one. Surface proxies (question,
 * source, term coverage) always apply and are warned as proxies.
 */
export function buildDiscussionRubric(source: string): DiscussionRubric {
  const text = (source ?? "").trim();
  if (!text) return defaultDiscussionRubric();

  const mentionsReplies = /\b(?:repl(?:y|ies)|respond(?:ing)?|responses?|classmates?|peers?|other students?)\b/i.test(text);

  return assembleRubric({
    repliesCount: mentionsReplies ? detectReplyCount(text) ?? 2 : null,
    wordsTotal: detectWordCount(text),
    wordsPerPost: detectWordsPerPost(text),
    multiDayCount: detectMultiDay(text),
    terms: extractPromptTerms(text),
    warnings: [
      proxyWarning(),
      "This discussion rubric was generated from the prompt by rule-based parsing; it grades only the requirements the prompt states (plus surface proxies). Review it before posting grades.",
    ],
  });
}

/** One requirement phrase per criterion, for the full-credit checklist. */
export function discussionChecklist(rubric: DiscussionRubric): string[] {
  return rubric.criteria.map((c) => `${c.criterion}: ${c.signals.map(signalPhrase).join(", ")}.`);
}

export function renderDiscussionRubric(rubric: DiscussionRubric): string {
  return rubric.criteria
    .map((c) => `${c.criterion} (${c.points} pts): ${c.signals.map(signalPhrase).join("; ")}`)
    .join("\n");
}

function signalPhrase(signal: DiscussionSignal): string {
  switch (signal.kind) {
    case "initial_post": return "make an initial post";
    case "min_replies": return `reply at least ${signal.count} times`;
    case "min_words": return `write at least ${signal.count} words total`;
    case "min_words_per_post": return `keep posts above ${signal.count} words`;
    case "posted_by_due": return "post before the due date";
    case "distinct_days": return `participate on at least ${signal.count} days`;
    case "replies_to_peers": return `reply to at least ${signal.count} classmates`;
    case "mentions_peer": return "engage a classmate by name";
    case "asks_question": return "ask a question";
    case "includes_source": return "cite a source or link";
    case "keywords": return `address the prompt (${signal.terms.join(", ")})`;
    default: return "participate";
  }
}

/**
 * Grade each student's discussion activity against the composite rubric, producing
 * the same GradingRun shape every grader returns (userId kept for Canvas write-back;
 * the posts are attached as a previewable "Discussion posts" text file).
 */
export function gradeDiscussion(
  students: DiscussionStudent[],
  rubric: DiscussionRubric,
  ctx: DiscussionContext,
  pointsPossible: number | null = null
): GradingRun {
  const rubricAreaNames = rubric.criteria.map((c) => c.criterion);

  const results = students.map((student) => {
    const stats = computeStats(student);
    const scored = rubric.criteria.map((criterion) => scoreCriterion(criterion, stats, student, ctx));
    const rawAreas = scored.map((s) => s.area);
    const shortfalls = scored.flatMap((s) => s.shortfalls);

    let earned = 0;
    let possible = 0;
    for (const criterion of rubric.criteria) {
      possible += criterion.points;
    }
    for (const area of rawAreas) {
      const match = area.score.match(/^(-?\d+(?:\.\d+)?)\s*\//);
      if (match) earned += Number(match[1]);
    }

    const totalScore = possible > 0 ? `${formatNumber(roundTo2(earned))}/${formatNumber(possible)}` : "";
    const scaled = scaleResultToPoints(rawAreas, totalScore, pointsPossible);

    const postsText = [...student.activity.initialPosts, ...student.activity.replies]
      .map((p) => `${p.isReply ? "Reply" : "Post"}: ${p.text}`)
      .join("\n\n---\n\n");

    return {
      student: student.student,
      userId: student.userId,
      totalScore: scaled.totalScore,
      rubricAreas: scaled.rubricAreas,
      overallComment: buildOverall(stats, shortfalls),
      feedback: "",
      mergedFileCount: stats.initialCount + stats.replyCount,
      submittedFiles: postsText
        ? [{ name: "Discussion posts", extension: "txt", previewContent: postsText, previewTruncated: false, mimeType: "text/plain" }]
        : [],
    };
  });

  return { results, rubricAreaNames, fullCreditChecklist: discussionChecklist(rubric) };
}
