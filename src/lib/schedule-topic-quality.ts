// Pure detectors for a schedule week that carries no real subject matter -
// extracted after a real Course Build run (course "INFO 1020 - Computer
// Science Principles", schedule source tile-export) produced a 45-slide
// lecture deck about an entirely invented subject. That run's own log:
//
//   - source: tile-export
//   - sourceMaterial: (empty)
//   - week 8 topic: "Module 08: Module 08"
//   - week 8 summary: "Covers: INFO 1020 - Significance of the Material -
//     Module 08.docx, INFO 1020 - Lecture Slides - Week 8.pptx, Week 8
//     Announcement - Module 08.docx, Week 08 Deliverable"
//
// Two distinct signals, both detected here. Neither one is sufficient alone
// - see steps.course-schedule-from-source.ts's own finalize() for how they
// combine (a placeholder topic is only refused when NEITHER the shared
// sourceMaterial field NOR the week's own summary supplies real content -
// "placeholder topic WITH material" must still proceed, since the material
// carries the subject even when the module's own name does not).
//
// Both functions are deliberately pure (no I/O, no LLM call, no randomness)
// so the real-vs-placeholder boundary - the entire point of this module - is
// exhaustively unit-testable without mocking anything. See
// schedule-topic-quality.test.ts.
//
// DEPTH: a topic can carry the duplicate-label shape stacked more than once
// - "Module 08: Module 08: Module 08" and deeper - because the accumulating
// feedback loop this module's own header quotes (tile-export -> cartridge ->
// next run's schedule source) adds ONE MORE "Module NN: " layer per Course
// Build run, not a fixed number. A real instructor's course tile has already
// been observed at three stacked levels. isPlaceholderSegment below therefore
// PEELS repeatedly rather than checking a single layer - see
// peelOneStructuralLabel and its use via module-title.ts's peelRepeatedly.

import { peelRepeatedly } from "./module-title";

// The LMS/cartridge/course-structure vocabulary a bare structural label can
// use ("Module 08", "Week 3", "Unit 5", "Chapter 4", "Lesson 2", "Section
// 1") - courseStructureToSchedule (course-structure-schedule.ts) and every
// LMS export this app reads name modules with exactly these words, so this
// list is deliberately the same vocabulary, not a superset invented here.
const STRUCTURAL_LABEL_WORDS = ["module", "week", "unit", "chapter", "lesson", "section"];

// A BARE structural label and NOTHING else - e.g. "Module 08", "week 3",
// "Unit05", "Chapter  4". "\s*0*" tolerates both a space and leading zeros
// (or neither) between the word and the number, so "Module08", "Module 08",
// and "Module  008" all match the same way. Anchored on both ends: a label
// word followed by ANY other text ("Module 08 Assignments") is NOT a bare
// label - it has said something beyond "here is a number," even if that
// something is itself thin, and this module's whole job is to stay on the
// safe side of that line rather than guess.
const BARE_LABEL_RE = new RegExp(`^(?:${STRUCTURAL_LABEL_WORDS.join("|")})\\s*0*\\d+$`, "i");

// Course furniture, not a teaching week - the same vocabulary
// isFrontMatterModuleText (source-alignment.ts) already uses for this exact
// purpose. Duplicated here (rather than imported) because that function
// matches on SUBSTRING containment across multiple joined texts (built for
// filtering a list of module names), while this module needs an EXACT
// segment match (a topic segment that is ONLY "Start Here" carries no
// subject; a real topic that merely happens to mention "resources" in
// passing must not be flagged) - a different enough contract that sharing
// one implementation would force one caller's rule onto the other.
const FRONT_MATTER_RE =
  /^(start\s+here|welcome|orientation|getting\s+started|syllabus|course\s+information|course\s+info|resources|readme|announcements)$/i;

// Collapse internal whitespace after trimming, so "  Module   08  " and
// "Module 08" compare identically - the real run's own fixtures include
// exactly this kind of inconsistent LMS-export spacing.
function normalizeSegment(segment: string): string {
  return segment.trim().replace(/\s+/g, " ");
}

// Splits "Label: Rest" or "Label - Rest" on whichever separator appears
// first (a colon, or a hyphen preceded by whitespace and followed by
// whitespace-or-end, so a hyphenated WORD like "Object-Oriented" is never
// mistaken for a separator, but a trailing "Module 08 -" with nothing after
// the dash still splits instead of being read as one un-splittable blob).
// Returns null when neither separator is present.
function splitLabelAndRest(segment: string): { left: string; right: string } | null {
  const colonIdx = segment.indexOf(":");
  const dashMatch = segment.match(/\s-(?=\s|$)/);
  const dashIdx = dashMatch ? segment.indexOf(dashMatch[0]) : -1;

  if (colonIdx !== -1 && (dashIdx === -1 || colonIdx < dashIdx)) {
    return {
      left: normalizeSegment(segment.slice(0, colonIdx)),
      right: normalizeSegment(segment.slice(colonIdx + 1)),
    };
  }
  if (dashIdx !== -1) {
    return {
      left: normalizeSegment(segment.slice(0, dashIdx)),
      right: normalizeSegment(segment.slice(dashIdx + dashMatch![0].length)),
    };
  }
  return null;
}

// Peel exactly ONE leading structural label off `text` - the single-layer
// step that peelRepeatedly (module-title.ts) drives to a fixed point below.
// Returns:
//   - "" when `text` IS a bare label and nothing else ("Module 08") - the
//     label is the whole string, so peeling it leaves nothing;
//   - the text after the label + its separator, when `text` is
//     "Label: rest" or "Label - rest" and the label is bare
//     ("Module 08: Module 08" -> "Module 08", "Module 08: Inheritance and
//     Polymorphism" -> "Inheritance and Polymorphism");
//   - null when `text` does not START with a bare structural label at all -
//     nothing (more) to peel, so peelRepeatedly stops here.
//
// Deliberately NUMBER-AGNOSTIC: unlike module-title.ts's own
// stripLeadingRedundantLabel (which only peels a label whose number equals
// the target week, and preserves a mismatch as a debugging signal), this
// function peels ANY bare structural label regardless of what number it
// names, and there is no week available to compare against here in the
// first place - isPlaceholderTopic is asking "does this topic carry ANY
// subject matter", not "does this label belong to this week". This is not a
// new departure: the single-layer version of this check already treated
// "Module 08: Module 09" (mismatched numbers) as a placeholder before this
// peeling was made depth-independent, since it only ever tested whether
// EACH side of the separator was a bare label, never whether their numbers
// agreed. Peeling repeatedly preserves that same policy at any depth instead
// of changing it.
function peelOneStructuralLabel(text: string): string | null {
  if (BARE_LABEL_RE.test(text)) return "";
  const split = splitLabelAndRest(text);
  if (!split) return null;
  if (!BARE_LABEL_RE.test(split.left)) return null; // left of the separator isn't a bare label - not our shape, stop rather than guess.
  return split.right;
}

// One joined-module segment (courseStructureToSchedule joins co-bucketed
// modules with "; " - see buildWeek there - so a topic can be several of
// these end to end, e.g. "Start Here; Module 01: Module 01"). A segment
// carries no subject matter when it is:
//   - blank,
//   - pure course furniture ("Start Here", "Welcome", ...), or
//   - a bare structural label with nothing after it ("Module 08"), or a
//     structural label followed by ANOTHER bare structural label or more
//     furniture ("Module 08: Module 08", "Module 08: Week 08",
//     "Module 08: Start Here") - restating or cross-referencing the label is
//     not naming a subject, AT ANY DEPTH: "Module 08: Module 08: Module 08"
//     and deeper all peel down the same way, one label per layer, because
//     the accumulating tile-export feedback loop this module's header
//     describes can stack arbitrarily many layers, not just one.
// The moment the label is followed by anything ELSE ("Inheritance and
// Polymorphism", "Recursion", "Normalization"), that text IS the subject,
// however short - peeling stops there (peelOneStructuralLabel returns null,
// since that text doesn't itself start with a bare label) and it is called
// real, however many redundant labels were peeled off before reaching it.
function isPlaceholderSegment(rawSegment: string): boolean {
  const seg = normalizeSegment(rawSegment);
  if (!seg) return true;
  if (FRONT_MATTER_RE.test(seg)) return true;

  // Peel every redundant leading label, however many are stacked, then judge
  // whatever is left. peelOneStructuralLabel only ever returns null once its
  // input is no longer a bare label followed by a separator - which means by
  // construction the fixed point `remainder` below can itself never be a
  // bare label (if it were, peelOneStructuralLabel would have peeled it to
  // "" and the loop would have continued), so there is no need to re-test
  // BARE_LABEL_RE against it here.
  const remainder = peelRepeatedly(seg, peelOneStructuralLabel);
  if (!remainder) return true; // peeling consumed everything - nothing but stacked structural labels, at any depth.
  return FRONT_MATTER_RE.test(remainder); // real subject survived peeling (false) vs. pure furniture exposed underneath the label(s), e.g. "Module 08: Start Here" (true).
}

/**
 * Whether a schedule week's topic carries no real subject matter - a bare or
 * duplicated structural label ("Module 08", "Module 08: Module 08"), pure
 * course furniture ("Start Here"), a joined combination of only those
 * ("Start Here; Module 01: Module 01"), or blank/whitespace.
 *
 * Deliberately conservative: a topic is a placeholder only when EVERY
 * "; "-joined segment is one of the shapes above. A single real segment
 * ("Module 08: Inheritance and Polymorphism", or a joined
 * "Module 08: Module 08; Module 09: Recursion") means the topic as a whole
 * carries a subject, even if one of its joined modules is badly named - a
 * detector that flags a genuinely-titled week is worse than none (see this
 * module's own header comment), so every ambiguous case here resolves to
 * "real."
 */
export function isPlaceholderTopic(topic: string): boolean {
  const trimmed = (topic ?? "").trim();
  if (!trimmed) return true;
  const segments = trimmed
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) return true;
  return segments.every(isPlaceholderSegment);
}

// courseStructureToSchedule's own "no items survived trimming" fallback
// (course-structure-schedule.ts's buildWeek) - literally zero content, not a
// manifest shape (no "Covers:" prefix, nothing to enumerate), so it needs
// its own check rather than falling out of isFileManifestSummary below.
const NO_ITEMS_FALLBACK_RE = /^no items listed for this module\.?$/i;

// The exact prefix buildWeek (course-structure-schedule.ts) emits for every
// non-empty item list - "Covers: <item>, <item>, ...". Matched literally
// (not just "any summary with commas") because THIS is the shape the real
// run's own log shows, and a genuinely descriptive summary that happens to
// use commas ("Recursion, iteration, and Big-O notation") must not collide
// with it just for containing punctuation.
const COVERS_PREFIX_RE = /^covers:\s*/i;

// A file extension this app actually produces or a course export actually
// ships (docx/pptx/pdf/xlsx/etc, plus the legacy .doc/.ppt/.xls forms and
// .zip/.csv/.txt/.md) - an item bearing one of these is a FILE NAME, not a
// description of course content.
const FILE_EXTENSION_RE = /\.(pptx|ppt|docx|doc|pdf|xlsx|xls|csv|zip|txt|md)$/i;

// "Week 08 Deliverable" - the synthetic deliverable-name shape this app's
// own module-item lists carry when a module has a graded submission but the
// export/cartridge gave it no more descriptive title.
const DELIVERABLE_RE = /\bdeliverable\b/i;

// "Week 8 Announcement - Module 08.docx" - an administrative posting, not
// content to teach from.
const ANNOUNCEMENT_RE = /\bannouncement\b/i;

// The artifact-role labels THIS course-build pipeline itself generates for a
// week - buildWorkflowFileName's own "artifact" values, assembleLectureFiles
// (registry-helpers.ts): "Lecture Slides", "Lecture Materials", "Assignment
// Instructions", "Module Objectives", "Class Opener". An item naming one of
// these is not describing the week's subject - it is citing a file this SAME
// run is about to produce (or, on a later run of the same course-build
// pipeline, already produced) - the exact shape that made a real deck's own
// agenda slide read "1. Week 8 course announcement / 2. Module 08 lecture
// slides" instead of naming any actual subject.
const SELF_GENERATED_ARTIFACT_RE =
  /\b(lecture slides|lecture materials|assignment instructions|module objectives|class opener)\b/i;

function extractCoversItems(summary: string): string[] {
  const trimmed = (summary ?? "").trim();
  if (!COVERS_PREFIX_RE.test(trimmed)) return [];
  const itemsText = trimmed.replace(COVERS_PREFIX_RE, "");
  return itemsText
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// One "Covers:" item is administrative furniture (a file name, a
// deliverable placeholder, an announcement, or one of this run's own
// artifact labels) rather than a description of content.
function isAdministrativeItem(item: string): boolean {
  return (
    FILE_EXTENSION_RE.test(item) ||
    DELIVERABLE_RE.test(item) ||
    ANNOUNCEMENT_RE.test(item) ||
    SELF_GENERATED_ARTIFACT_RE.test(item)
  );
}

/**
 * Whether a schedule week's summary is a file/deliverable manifest rather
 * than a description of content - the "Covers: <comma-separated file names
 * and deliverable names>" shape (courseStructureToSchedule's own buildWeek),
 * where every listed item is administrative furniture (a file name, a
 * "Week N Deliverable" placeholder, an announcement, or one of this course-
 * build pipeline's own generated-artifact labels) rather than a subject.
 *
 * Also true for courseStructureToSchedule's "no items survived trimming"
 * fallback text ("No items listed for this module.") - zero content, just
 * phrased as a sentence instead of a manifest.
 *
 * Conservative in the same direction as isPlaceholderTopic: a summary with
 * even ONE non-administrative item ("Covers: Reading Chapter 3, Week 08
 * Deliverable") is real content that happens to be listed alongside
 * administrative furniture, not a pure manifest - it returns false, so the
 * week is treated as grounded.
 */
export function isFileManifestSummary(summary: string): boolean {
  const trimmed = (summary ?? "").trim();
  if (!trimmed) return false; // blank is handled by the caller's own "no material" check, not this one.
  if (NO_ITEMS_FALLBACK_RE.test(trimmed)) return true;
  const items = extractCoversItems(trimmed);
  if (items.length === 0) return false;
  return items.every(isAdministrativeItem);
}

/**
 * Whether a schedule week's summary specifically names a file this SAME
 * course-build pipeline generates (a "Lecture Slides"/"Assignment
 * Instructions"/etc artifact, or a .pptx/.docx/.pdf/etc file) - the sharper,
 * self-referential case inside isFileManifestSummary's broader "manifest,
 * not content" check. Called out as its own detector because it is the
 * literal mechanism behind the real defect: week 8's summary named
 * "INFO 1020 - Lecture Slides - Week 8.pptx" - the very deck the run was
 * about to produce - so the generated deck's own agenda slide ended up
 * citing itself as its own source material.
 *
 * Unlike isFileManifestSummary, this does not require EVERY item to be
 * administrative - one self-referencing item is enough to call out
 * specifically, even inside an otherwise-mixed list.
 */
export function summaryNamesGeneratedFile(summary: string): boolean {
  const items = extractCoversItems(summary);
  return items.some((item) => SELF_GENERATED_ARTIFACT_RE.test(item) || FILE_EXTENSION_RE.test(item));
}

/**
 * Whether ONE arbitrary string names a file, or one of this course-build
 * pipeline's own generated artifacts, rather than naming a subject.
 *
 * The same test summaryNamesGeneratedFile applies to a "Covers:" item, but
 * lifted off that specific summary shape so it can be applied to any single
 * phrase. Its caller is the lecture concept planner
 * (planWeekConcepts, src/lib/lecture-concepts.ts): entry 196 AC3 stopped a
 * week SUMMARY from citing the very deck the run was about to produce, but
 * the contamination survived one layer down, in the CONCEPT list derived
 * from that topic - a real deck shipped a section named "Core Concepts of
 * Lecture Slides" and bridged into it. A concept is a subject the lecture
 * teaches; "Lecture Slides" is the container it is taught in, and no deck
 * should ever name a section after itself.
 */
export function namesGeneratedArtifact(text: string): boolean {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return false;
  return SELF_GENERATED_ARTIFACT_RE.test(trimmed) || FILE_EXTENSION_RE.test(trimmed);
}
