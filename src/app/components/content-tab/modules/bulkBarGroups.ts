// The bulk bar's group model, as DATA - docs/bulk-bar-reorganization-
// acceptance-criteria.md, section 3b/D1 (the FINAL contract; it corrects
// several arithmetic errors earlier in that same document under section
// 3b/D2 - see the comments below for where this file follows D2 over the
// earlier text).
//
// STRUCTURAL SPLIT (no behaviour change): the 13 group literals, the shared
// unpersisted-reason constants and the Generate-kind-button builder live in
// ./bulkBarGroupCatalog.ts, extracted to keep THIS file under the repo's
// 1000-line ceiling - same discipline lmsGenerationKindHelpers.ts's own
// header describes for useLmsGeneration.ts: "each piece re-exported so
// every existing import keeps compiling unchanged". `BULK_BAR_GROUPS` is
// imported from the catalog just below and re-exported from this file (see
// the "-- Re-export --" block after the imports), so BulkBarGroup.tsx,
// useBulkBarGroups.ts, every Section.tsx and bulkBarGroups.test.ts keep
// importing everything - the types below, `TIER_RANK`, the four functions,
// and `BULK_BAR_GROUPS` itself - from "./bulkBarGroups" with no change of
// their own. Every doc comment that moved to the catalog file moved
// verbatim with the code it explains; see that file's own header for the
// two paragraphs (the GenerationKindId import discipline, and the
// 65-control reconciliation) that belong with the catalog rather than here.
//
// Deliberately a PURE module otherwise, no React import, no MUI import, no
// .tsx import of any kind - same discipline as ./bulkBarGroupCatalog.ts,
// ./contentSourceGating.ts (read that file's own header first) and
// src/lib/course-tasks-catalog.ts.
//
// WHY THIS EXISTS: AC1 says group by CONSEQUENCE, not by frequency or by
// which Canvas object a control happens to write. AC2 says the fifteen
// `.bulkLabel` spans need to become real `role="group"` containers. Doing
// both by hand, inline in six section components, is exactly how a group's
// declared "this collapses" drifts from what got added to it later - which
// is the single failure AC1 exists to prevent. So the shape of the bar is
// DATA here, and every consuming component (BulkBarGroup.tsx, the six
// Section.tsx files, ModulesView.tsx) reads this file rather than deciding
// tier or collapsibility itself.
//
// THE CENTRAL RULE, stated once so every function below can lean on it:
// a group's own consequence tier is NEVER a field declared on the group. It
// is DERIVED, as the max tier over that group's currently VISIBLE controls
// (`groupTier`). A declared tier is a lie waiting to happen - add one
// fan-out control to a group someone declared "read-only" eighteen months
// ago, forget to bump the declaration, and the bar now offers a false sense
// of safety. Deriving it means the model cannot drift from what it contains.
//
// TIER VOCABULARY - FOUR, per section 3b/D1 exactly ("read-only" |
// "reversible-write" | "fan-out-write" | "destructive"), not three. An
// earlier draft of this file collapsed "reversible-write" into "read-only"
// because the ten Generate-row kind buttons and the two AI-drafting buttons
// never touch Canvas - but "never touches Canvas" is not the same claim as
// "read-only". Generating calls a model, spends quota, and writes a new
// `generated_artifacts` version; drafting a bulk-add description/file does
// the same on a smaller scale. Both are real writes, just SCOPED (one
// artifact/draft, not the whole current selection) and REVERSIBLE (a new
// version, not an overwrite of anything, and nothing downstream commits
// until a later, separately-tiered step does - "Add", "Post", etc.).
// Folding that into "read-only" would let a group like Generate be treated,
// by both the audit and any consuming component, exactly like Download or
// Ask AI, which touch NOTHING beyond the instructor's own device - a real
// distinction AC1 relies on, quietly erased. `mayCollapse` treats
// "reversible-write" the same as "read-only" for COLLAPSE purposes (both
// may collapse; AC1's separation is about fan-out/destructive, not about
// every write whatsoever), but `auditGroupModel`'s I3 does NOT: a group
// that reaches "reversible-write" is not exempt from proving it isn't lying
// about being safe to hide by default, and I3 now checks exactly that.
//
// The remaining two tiers are unchanged from the original design: every
// selection-wide write here can fan out to one object or many (there is no
// control structurally incapable of that), so "fan-out-write" covers every
// unconfirmed write that commits on its first click, and "destructive" is
// reserved for the four writes that already carry a two-click confirm-arm
// in their owning hook (item delete, module delete, visualizer link,
// visualizer create - confirmArming.ts's isConfirmArmed/selectionSignature
// idiom). D2 corrects the earlier draft's arithmetic: there are 21 total
// write controls in the bar (a Canvas-mutating button, not a composing
// field), of which 4 already carry a confirm-arm (destructive) and 17 do
// not (fan-out-write) - NOT the "three worst" the acceptance criteria's own
// AC1 named as an illustration. Every one of the 17 is at full
// fan-out-write weight, not just the three it happened to name.

import { BULK_BAR_GROUPS } from "./bulkBarGroupCatalog";

// -- Re-export (implementation moved to the sibling module imported above -
// see that file's own header comment for its cohesion rationale, and its
// doc comments for the full design rationale of every group, preserved
// verbatim from where they used to live in this file) --
export { BULK_BAR_GROUPS };

// ---------------------------------------------------------------------------
// groupById - THE ONE LOOKUP (Finding 13, step-10 review)
//
// Six near-identical local `findGroup` helpers existed across the six
// section files before this function - four zero-arg with a hardcoded id,
// two parameterised by id - and they were NOT identical: three different
// error message strings, and (worse) `BulkModulesSection.tsx` called its
// copy at MODULE SCOPE (`const MODULES_GROUP = findGroup("modules")`), so a
// missing catalog id there throws during module evaluation and takes down
// the whole ModulesView import chain - a materially different failure mode
// than the "throws at render, in dev" every other copy's own comment
// promised, and four of those comments claimed to mirror a sibling that in
// fact had a different arity. `groupById` replaces all six: one lookup, one
// error message, and - because it is an ordinary function - failure timing
// is whatever the CALLER chooses by when it calls this, never implicitly at
// import time. A section that calls `groupById("x")` inside its own
// component function throws at render, in dev, exactly as five of the six
// original comments promised; nothing about this function forces the
// module-scope failure mode BulkModulesSection.tsx's own copy had.
export function groupById(id: BulkBarGroupId): BulkBarGroupDef {
  const group = BULK_BAR_GROUPS.find((g) => g.id === id);
  if (!group) throw new Error(`bulkBarGroups: catalog is missing group "${id}"`);
  return group;
}

// ---------------------------------------------------------------------------
// Core vocabulary

/**
 * Four tiers, ordered by consequence, not by how often a control is used
 * (AC1's whole point). "reversible-write" is a real write (calls a model,
 * spends quota, or persists a new version/draft) that is nonetheless SCOPED
 * to one artifact and REVERSIBLE (a new version, never an overwrite) -
 * distinct from "read-only" (touches nothing beyond this device) even
 * though both may collapse. "fan-out-write" covers every unconfirmed write
 * that commits on its first click and applies to the WHOLE current
 * selection - Publish/Unpublish included, per D2's correction (an Unpublish
 * on a mixed selection does not restore what a prior Publish flattened, so
 * it is not the benign baseline AC1's first draft treated it as).
 * "destructive" is reserved for the four writes that already carry a
 * two-click confirm-arm in their owning hook (item delete, module delete,
 * visualizer link, visualizer create) - see confirmArming.ts for that
 * arming idiom.
 */
export type ConsequenceTier = "read-only" | "reversible-write" | "fan-out-write" | "destructive";

/** Total ordering over ConsequenceTier, used by `groupTier`'s max-over-
 * members reduction and nowhere else - never branch on the raw number
 * outside this file, compare the named tier strings instead. */
export const TIER_RANK: Record<ConsequenceTier, number> = {
  "read-only": 0,
  "reversible-write": 1,
  "fan-out-write": 2,
  destructive: 3,
};

/** The MUI primitive a control renders as. Not exhaustive of every MUI
 * component in the bar (a plain status/hint span is not a control - it
 * takes no interaction and is therefore not part of this model at all, see
 * the note at the bottom of this file on what was deliberately left out). */
export type BulkBarControlKind = "button" | "select" | "textField" | "checkbox";

/**
 * The thirteen top-level groups this bar organizes into. Twelve map
 * one-to-one onto a `.bulkLabel` heading in the six section files today
 * (AC2); the thirteenth, "head", is the bar's own count-and-Clear line
 * (`ModulesView.tsx`'s `bulkBarHead`, NOT a `.bulkLabel` span - see
 * `headGroup`'s own doc comment in ./bulkBarGroupCatalog.ts for why it is
 * still modeled: it is a real part of the bar's layout and AC0's own count
 * includes its one control, "Clear", in the 65).
 *
 * "addToEach" merges what is six separate conditionally-rendered `bulkRow`s
 * in `BulkModulesSection.tsx` today (the base row, File, Details, Body,
 * Questions, AI) into ONE group with nested `moduleAdd*` members - see that
 * group's own controls list in ./bulkBarGroupCatalog.ts for why: they are
 * one coherent flow ("compose, then Add"), never usable independently of
 * each other, and splitting them into up to six separate `<details>`
 * elements would just be six lots of chrome around fields that only ever
 * mean something together.
 */
export type BulkBarGroupId =
  | "head"
  | "items"
  | "content"
  | "dueDates"
  | "grading"
  | "submissionType"
  | "move"
  | "modules"
  | "addToEach"
  | "generate"
  | "download"
  | "askAi"
  | "visualizerCoverage";

/**
 * The facts a visibility/tier decision needs. Plain data only - no
 * functions, no class instances - so a caller (or a test) can construct one
 * with an object literal and nothing else. Deliberately a flat bag rather
 * than nested per-section shapes: several fields feed controls in more than
 * one group (`itemCount` gates five different groups), and a flat shape
 * means every `visible` predicate below reads as one clause, not a path
 * into a stranger's nested object.
 */
export interface BulkBarFacts {
  /** `selection.selectedModules.size` (ModulesView.tsx). */
  moduleCount: number;
  /** `selection.selected.size` (ModulesView.tsx) - the ITEM selection,
   * independent of moduleCount (a module-only selection has itemCount 0). */
  itemCount: number;
  /** `bulkItemActions.selectedAssignmentCount()` - drives the Submission
   * type group's hint, and is carried here for a future control that needs
   * the count rather than just "is it zero". */
  selectedAssignmentCount: number;
  /** BulkItemsSection's single-item branch: "gradable" when the one
   * selected item is an Assignment/Quiz/Discussion with a contentId
   * (offers "Edit in detail"), "page" when it is a Page with a pageUrl
   * (offers "Edit page"), "none" otherwise - including whenever itemCount
   * is not exactly 1. Both real branches were collapsed into one fact
   * because a bulk bar row only ever needs to know WHICH near-dead affordance
   * to offer, never both at once (see AC11 and this file's nearDead entry). */
  singleItemEditKind: "gradable" | "page" | "none";
  /** BulkModulesSection's `bulkAddType` state - a plain string rather than a
   * union, matching the hook's own type, so this file never needs updating
   * merely because a new addable content type is introduced there. */
  bulkAddType: string;
  /** Whether `bulkAddFileContent` is non-blank right now - drives "Discard
   * AI file"'s presence, which is genuinely conditionally RENDERED in the
   * JSX today (not merely disabled), so it is a `visible` fact rather than
   * something left to a consuming component's own disabled logic. */
  bulkAddFileContentPresent: boolean;
  /** `bulkAddQuestions.length` - drives "Clear"'s presence in the Questions
   * row (also genuinely conditionally rendered, not merely disabled). */
  bulkAddQuestionsCount: number;
  /** `bulkItemsQuestions.length` - carried for parity with the above and for
   * a future near-dead audit of "Add to selected quizzes"; does NOT gate
   * that button's presence today (it is always rendered, only its disabled
   * state depends on this count - see `itemsAddToSelectedQuizzes`'s own
   * comment in ./bulkBarGroupCatalog.ts). */
  bulkItemsQuestionsCount: number;
  /** `rubrics.length` - zero drives the "No rubrics" disabled-select shape
   * AC11 names as near-dead for both rubric selects in the bar. */
  rubricsCount: number;
  /** Generate row: whether "decks" is among the offered kinds right now. */
  offersDeck: boolean;
  /** Generate row: whether "scripts" is among the offered kinds right now. */
  offersScript: boolean;
  /** Generate row: whether "introDiscussion" is among the offered kinds
   * right now (gates the checkpoints checkbox). */
  offersIntroDiscussion: boolean;
  /** `lmsGeneration.kinds.length` - zero hides the entire Generate group
   * (`GenerateFromSelectionSection.tsx`'s own `if (kinds.length === 0)
   * return null`). Per that file's own header comment, this is >0 whenever
   * ANYTHING is selected, module-only included - offerableGenerationKinds
   * does not vary per kind, which is exactly what D6's regrouping-risk test
   * below exists to pin. */
  generationKindsCount: number;
  /** `lmsGeneration.hasDiagLog` - gates the one-off diagnostic download
   * button; deliberately excluded from the "65" baseline scenario (see this
   * file's header) since a diagnostic log only exists after a prior failed
   * generation. */
  hasDiagLog: boolean;
  /** `visualizerCoverage.coverage !== null` - a scan has returned. */
  coverageScanned: boolean;
  /** `visualizerCoverage.coverage?.covered.length ?? 0`. */
  coveredCount: number;
  /** The count `conceptsForCreate(coverage)` would return - i.e. gaps that
   * actually match a creatable visualizer topic, per that hook's own NIT 15
   * routing (a scan whose every gap is "not creatable" must never offer
   * "Create 0 pages"). */
  creatableGapsCount: number;
}

/** Per-group runtime state `groupOpen` needs, supplied by the group's OWN
 * hook (useBulkItemActions.ts / useBulkModuleActions.ts / the generation,
 * download, ask-AI and visualizer-coverage hooks) rather than derived here -
 * this file has no access to a hook and should not gain one. Three signals,
 * matching D1's named force-open triggers exactly: `busy` (an operation for
 * this group is in flight), `armed` (a confirm-arm from confirmArming.ts is
 * live for a control in this group), `hasUnavailableReason` (some control in
 * this group currently has a non-null `*UnavailableReason` string it needs
 * to show). Any of the three forces the group open regardless of persistence
 * or default - see `groupOpen`'s own comment for why the order matters. */
export interface BulkBarGroupRuntime {
  busy: boolean;
  armed: boolean;
  hasUnavailableReason: boolean;
}

/** One interactive control. `tier` is the one piece of DECLARED data this
 * file trusts completely - `groupTier` below reduces over these, it never
 * reads a tier from anywhere else. `visible` decides DOM presence, never
 * disabled-vs-enabled: a control that is always rendered but sometimes
 * disabled (e.g. "Add to selected quizzes", always present, merely disabled
 * at zero composed questions) has `visible` return true unconditionally -
 * see that control's own entry below for the reasoning this distinction
 * matters for the 65-count reconciliation. */
export interface BulkBarControlDef {
  /** Unique across the WHOLE model, not just within a group - `auditGroupModel`'s
   * I2 enforces this so two controls can never collide if their groups are
   * ever merged or a control moves between groups. */
  id: string;
  kind: BulkBarControlKind;
  /** Short, human-facing name - not necessarily the exact button/field label
   * text (pin the fact, never the spelling, per docs/DEV_LOOP.md section 9). */
  label: string;
  tier: ConsequenceTier;
  visible: (facts: BulkBarFacts) => boolean;
  /** The `ta-`-prefixed localStorage key BASE this control persists under
   * (without the `-${courseUrl}` suffix the owning hook appends - see
   * lmsGenerationKindHelpers.ts's scriptMinutesKey/deckTemplateKey and
   * lmsGenerationDiscussion.ts's discussionCheckpointsKey for the exact
   * per-course interpolation this file does not perform), or `null` when
   * this control deliberately does not persist. `null` REQUIRES a non-empty
   * `unpersistedReason` (I6) - the `useVisualizerCoverage.ts:447` precedent
   * this file follows throughout: an absence of persistence is a decision,
   * not an oversight, and the decision is written down next to the control
   * it applies to. */
  persistKey: string | null;
  /** Required, and required non-empty, when `persistKey` is null (I6). */
  unpersistedReason?: string;
  /** AC11: a candidate for removal, reported rather than silently deleted.
   * Present only on the controls this chunk's reuse-and-removal survey
   * actually found near-dead - most controls have neither field. */
  nearDead?: { why: string; recommendation: string };
}

/** One top-level group. `visible` is this group's OWN gate - whether it
 * renders at ALL, independent of collapse (a group can be visible and
 * force-open, visible and collapsed, or not visible at all). `disclosure`
 * says whether this group is EVER rendered as a real `<details>` -
 * "head" is not (it is the bar's static count-and-Clear line, never
 * wrapped in a disclosure, per this file's header comment); every other
 * group is, though `mayCollapse` may still resolve false for it under any
 * given facts. `consequenceTag` is the always-visible short phrase AC1
 * asks for on every group whose tier can ever reach fan-out-write or
 * destructive (I5) - `null` on a group that can never reach that tier. */
export interface BulkBarGroupDef {
  id: BulkBarGroupId;
  label: string;
  disclosure: boolean;
  /** Only consulted when `mayCollapse` is true for the current facts;
   * ignored (the group is simply always open) otherwise. AC3: a group
   * that can ever reach fan-out-write/destructive must declare `true`
   * here even though it is moot, so the declaration itself can never
   * silently read as "this group defaults closed" (I3). */
  defaultOpen: boolean;
  consequenceTag: string | null;
  visible: (facts: BulkBarFacts) => boolean;
  controls: BulkBarControlDef[];
}

// ---------------------------------------------------------------------------
// The four pure functions

function flattenControls(group: BulkBarGroupDef): BulkBarControlDef[] {
  return group.controls;
}

/**
 * The group's consequence tier, DERIVED as the max tier over its currently
 * VISIBLE controls under `facts` - never a declared field (see this file's
 * header). A group with no visible controls at all (should not happen for
 * any group whose own `visible` is true, but is not assumed) is read-only.
 */
export function groupTier(group: BulkBarGroupDef, facts: BulkBarFacts): ConsequenceTier {
  let best: ConsequenceTier = "read-only";
  for (const control of flattenControls(group)) {
    if (!control.visible(facts)) continue;
    if (TIER_RANK[control.tier] > TIER_RANK[best]) best = control.tier;
  }
  return best;
}

/**
 * Whether this group is STRUCTURALLY eligible to render as a collapsed
 * `<details>` right now. False for any group whose `disclosure` is false
 * (the head line is never a disclosure at all, regardless of tier), and
 * false whenever `groupTier` reaches fan-out-write or destructive under
 * these facts - AC1's separation of destructive/fan-out work from anything
 * collapsible, mechanised. "reversible-write" collapses on the SAME footing
 * as "read-only" here (AC1's collapse boundary is about fan-out/destructive
 * work, not about every write whatsoever) - the Generate group is still one
 * of the four groups that may collapse even though its kind buttons are
 * "reversible-write", not "read-only". What that tier distinction protects
 * instead is `auditGroupModel`'s I3 below: a group need not be LITERALLY
 * read-only to collapse, but it does need to be more than read-only to be
 * exempt from I3's "prove you are safe to hide by default" check.
 *
 * This is why the visualizer coverage group's own answer changes at
 * runtime: before a scan, its visible controls are all read-only tier and
 * this returns true; once Link/Create become visible, `groupTier` returns
 * destructive and this returns false - the case D1 names explicitly as
 * proof that tier must be a function of facts.
 */
export function mayCollapse(group: BulkBarGroupDef, facts: BulkBarFacts): boolean {
  if (!group.disclosure) return false;
  return TIER_RANK[groupTier(group, facts)] <= TIER_RANK["reversible-write"];
}

/**
 * Whether the group's `<details>` should render open. Order, per D1,
 * matters and is fixed: a group that cannot collapse at all is always open;
 * otherwise a force-open runtime trigger (busy / armed / an unavailable
 * reason live in this group) wins over whatever was persisted, which wins
 * over the group's own declared default. `persisted` is `undefined` when
 * nothing has been saved yet for this group (first visit, or a value this
 * chunk's tolerant resolver rejected) - only then does `defaultOpen` apply.
 */
export function groupOpen(
  group: BulkBarGroupDef,
  facts: BulkBarFacts,
  runtime: BulkBarGroupRuntime,
  persisted: boolean | undefined,
): boolean {
  if (!mayCollapse(group, facts)) return true;
  if (runtime.busy || runtime.armed || runtime.hasUnavailableReason) return true;
  if (persisted !== undefined) return persisted;
  return group.defaultOpen;
}

/**
 * `groupTier` computed while ignoring `visible` - used only by the audit
 * below, to ask "could this group EVER reach this tier under some facts",
 * which is a different question from "does it right now". A group's
 * `consequenceTag` and `defaultOpen` declarations are evaluated against
 * this potential, not against any one fact snapshot - a group is not
 * allowed to declare "defaults closed" merely because the fan-out control
 * inside it happens to be hidden for the facts someone tested with.
 */
function maxPossibleTier(group: BulkBarGroupDef): ConsequenceTier {
  let best: ConsequenceTier = "read-only";
  for (const control of flattenControls(group)) {
    if (TIER_RANK[control.tier] > TIER_RANK[best]) best = control.tier;
  }
  return best;
}

/**
 * A "just barely visible, nothing extra toggled on" facts object - every
 * group's own `visible` is true under it (including `generationKindsCount:
 * 1`, so the Generate group's kind buttons are counted), and every
 * `bulkAddType`-gated `addToEach` sub-control that depends on a SPECIFIC
 * type (Assignment/Quiz/File/...) is false, since `bulkAddType` here is the
 * one value ("SubHeader") none of those branches match. Used only by I3
 * below, to ask a narrower question than `maxPossibleTier`'s "could this
 * group EVER reach this tier under SOME facts": "is this group MORE THAN
 * read-only the MOMENT it becomes visible at all, with nothing else true
 * yet". That distinction is exactly what separates the groups that are
 * unconditionally reversible-write/fan-out/destructive (the ten Generate
 * kind buttons and "Generate with AI" are visible the instant their group
 * is; so are Publish/Unpublish/Delete/Add/Remove/...) from
 * `visualizerCoverage`, which is read-only THE MOMENT it becomes visible and
 * only escalates to destructive once a scan has actually run - AC3
 * explicitly permits that one to default closed, and `groupOpen`'s own
 * force-open rule (busy/armed/hasUnavailableReason) is what keeps it from
 * staying closed once it does escalate. Reusing `maxPossibleTier` for I3
 * would incorrectly demand `defaultOpen: true` on `visualizerCoverage` for a
 * tier it only reaches conditionally - see this file's test suite for the
 * regression this exact confusion produced, and for the SIBLING regression
 * (Generate silently allowed to default closed) that motivated moving I3's
 * threshold from "fan-out-write or above" down to "anything above
 * read-only", so a "reversible-write" group is no longer exempt either.
 */
const MINIMAL_AUDIT_FACTS: BulkBarFacts = {
  moduleCount: 1,
  itemCount: 1,
  selectedAssignmentCount: 0,
  singleItemEditKind: "none",
  bulkAddType: "SubHeader",
  bulkAddFileContentPresent: false,
  bulkAddQuestionsCount: 0,
  bulkItemsQuestionsCount: 0,
  rubricsCount: 0,
  offersDeck: false,
  offersScript: false,
  offersIntroDiscussion: false,
  generationKindsCount: 1,
  hasDiagLog: false,
  coverageScanned: false,
  coveredCount: 0,
  creatableGapsCount: 0,
};

/**
 * Structural self-check over `BULK_BAR_GROUPS` - takes no arguments, checks
 * the one catalog this file exports, and returns `[]` when it is sound.
 * Every violation is a human-readable string naming the offending group/
 * control id, so a failing test's output is legible without opening this
 * file. Enforces eight invariants:
 *
 * I1 - group ids are unique.
 * I2 - control ids are unique across the WHOLE model (not just per group).
 * I3 - `defaultOpen: false` is allowed ONLY where the group's tier is
 *      "read-only" under `MINIMAL_AUDIT_FACTS` - i.e. the group is not
 *      LITERALLY read-only the moment it becomes visible, before any
 *      escalation. Anything at "reversible-write" or above at that point
 *      must declare `defaultOpen: true`. This is AC3's "groups containing
 *      unconfirmed writes may not default closed", mechanised at the
 *      declaration itself, and DELIBERATELY covers "reversible-write" too -
 *      an earlier draft of this file classified the ten Generate kind
 *      buttons as "read-only" and set the Generate group's `defaultOpen`
 *      to `true` by hand; I3 at the time only policed fan-out-write/
 *      destructive, so nothing would have caught a later change flipping
 *      that flag to `false`. Deliberately narrower than "could ever reach"
 *      (see `MINIMAL_AUDIT_FACTS`'s own comment): a group whose tier only
 *      escalates conditionally (`visualizerCoverage`) is still allowed to
 *      default closed, because it starts read-only and `groupOpen`'s
 *      force-open rule is what reopens it once it escalates.
 * I4 - every control's `tier` is one of the four known ConsequenceTier
 *      values (defensive against a typo surviving TypeScript via `as`).
 * I5 - a group that can EVER reach fan-out-write/destructive under SOME
 *      facts (`maxPossibleTier`, ignoring visibility) has a non-empty
 *      `consequenceTag` - deliberately the BROADER of the two checks, so a
 *      group like `visualizerCoverage` still carries a warning about what it
 *      escalates to, even though I3 lets it default closed.
 * I6 - `persistKey === null` requires a non-empty `unpersistedReason`.
 * I7 - a `nearDead` entry, if present, has non-empty `why` and
 *      `recommendation` strings.
 * I8 - a non-null `persistKey` starts with `ta-` (the repo-wide persistence
 *      prefix) and is not reused by any other control (two controls must
 *      never silently share one storage key).
 */
export function auditGroupModel(): string[] {
  const violations: string[] = [];
  const seenGroupIds = new Set<string>();
  const seenControlIds = new Set<string>();
  const seenPersistKeys = new Set<string>();
  const knownTiers = new Set<string>(Object.keys(TIER_RANK));

  for (const group of BULK_BAR_GROUPS) {
    // I1
    if (seenGroupIds.has(group.id)) {
      violations.push(`I1: duplicate group id "${group.id}"`);
    }
    seenGroupIds.add(group.id);

    // I3's basis is deliberately "anything above read-only", not "fan-out-write
    // or above" - a "reversible-write" group (Generate) is not exempt either.
    const unconditionallyAboveReadOnly = groupTier(group, MINIMAL_AUDIT_FACTS) !== "read-only";
    const everReachesHighTier = TIER_RANK[maxPossibleTier(group)] >= TIER_RANK["fan-out-write"];

    // I3
    if (unconditionallyAboveReadOnly && !group.defaultOpen) {
      violations.push(`I3: group "${group.id}" is more than read-only as soon as it is visible but declares defaultOpen: false`);
    }

    // I5
    if (everReachesHighTier && (!group.consequenceTag || group.consequenceTag.trim() === "")) {
      violations.push(`I5: group "${group.id}" can reach fan-out-write/destructive but has no consequenceTag`);
    }

    for (const control of flattenControls(group)) {
      // I2
      if (seenControlIds.has(control.id)) {
        violations.push(`I2: duplicate control id "${control.id}"`);
      }
      seenControlIds.add(control.id);

      // I4
      if (!knownTiers.has(control.tier)) {
        violations.push(`I4: control "${control.id}" has an unknown tier "${control.tier}"`);
      }

      // I6
      if (control.persistKey === null) {
        if (!control.unpersistedReason || control.unpersistedReason.trim() === "") {
          violations.push(`I6: control "${control.id}" has persistKey: null but no unpersistedReason`);
        }
      }

      // I7
      if (control.nearDead) {
        if (!control.nearDead.why || control.nearDead.why.trim() === "") {
          violations.push(`I7: control "${control.id}" has a nearDead entry with an empty "why"`);
        }
        if (!control.nearDead.recommendation || control.nearDead.recommendation.trim() === "") {
          violations.push(`I7: control "${control.id}" has a nearDead entry with an empty "recommendation"`);
        }
      }

      // I8
      if (control.persistKey !== null) {
        if (!control.persistKey.startsWith("ta-")) {
          violations.push(`I8: control "${control.id}" has persistKey "${control.persistKey}" not prefixed "ta-"`);
        }
        if (seenPersistKeys.has(control.persistKey)) {
          violations.push(`I8: persistKey "${control.persistKey}" is reused by more than one control`);
        }
        seenPersistKeys.add(control.persistKey);
      }
    }
  }

  return violations;
}
