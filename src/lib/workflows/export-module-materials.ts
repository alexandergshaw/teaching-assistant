// Course-export assignment-weighting helpers: given one cartridge module's
// items (parsed from an LMS export - see cartridge-import.ts), decide which
// item is the module's graded "anchor" assignment and render the module's
// materials text with that anchor pulled to the front and unmistakably
// labeled. Split out of registry-helpers.sources.ts (which had grown past
// the project's 1000-line cap - see AGENTS.md) because this is one coherent
// unit: selectAssignmentAnchor/echoesModuleLabel/isBetterAnchor rank a
// module's assignment-kind items, and formatExportModuleMaterials is their
// only caller. They were module-private inside registry-helpers.sources.ts
// before this split; they are exported here so they are directly testable,
// which they were not before.
//
// Dependency direction: registry-helpers.sources.ts's gatherModuleMaterials
// (via its inner tryExport closure) imports formatExportModuleMaterials FROM
// this module - this module never imports anything from
// registry-helpers.sources.ts, so there is no cycle.

import type { CartridgeModule, CartridgeModuleItem } from "@/lib/cartridge-import";
import { hasLeadingOptionalMarker, partitionCourseItemsByKind } from "@/lib/course-item-classifier";

// Tolerant module-number match: the same idiom registry-helpers.sources.ts's
// findModuleByName uses ("Module NN" vs "Week N" style names), DUPLICATED
// here rather than imported from there, because registry-helpers.sources.ts
// imports formatExportModuleMaterials FROM this module - importing the
// pattern back the other way would form a cycle. Same idiom this codebase
// already uses for blobToBase64Local in registry-helpers.sources.ts
// (duplicated there from registry-helpers.ts's blobToBase64 for the
// identical reason). Keep both copies identical if this pattern ever needs
// to change.
const MODULE_NUMBER_PATTERN = /(?:module|week)\s*0*(\d+)/i;

// Part 2 of the "(Optional) Module 08 Status Update" fix (see
// course-item-classifier.ts's header comment for Part 1, the classification
// half): even after Part 1 stops a permissive assign*-family TYPE from
// promoting non-graded housekeeping into kinds.assignment, a module can
// still legitimately hold more than one genuine assignment-kind item (extra
// credit alongside the main assignment, a reading check plus a project,
// ...). formatExportModuleMaterials (below) needs exactly ONE of them
// labeled the unambiguous "GRADED ASSIGNMENT" anchor - two items both
// claiming that label reproduces the bug report's own ambiguity ("with two
// candidates, that anchor is ambiguous and can name the wrong one") in a
// new form, even with every item correctly classified.
//
// The rule, applied in this priority order, first difference wins:
//   1. Prefer a NON-optional item. hasLeadingOptionalMarker (exported from
//      course-item-classifier.ts, not re-implemented here - see that
//      function's own doc comment) is the SAME "(Optional)"-prefix signal
//      Part 1 uses to demote a type-shadowed item to administrative. An item
//      can still reach kinds.assignment while carrying that marker - Part
//      1's demotion only fires once TYPE_ASSIGNMENT_PATTERN has matched the
//      item's type; a generic/typeless export item that reads
//      "(Optional) Extra Credit Assignment" reaches "assignment" via the
//      ordinary title-fallback chain instead (TITLE_ASSIGNMENT_PATTERN's
//      "assignment" word), unaffected by Part 1. Whichever path got it into
//      kinds.assignment, an instructor-labeled-optional item should never
//      outrank an item nobody flagged optional as the thing "what students
//      are evaluated on" points to.
//   2. Among items that tie on optional-ness, prefer the item whose title
//      ECHOES THE MODULE'S OWN LABEL - see echoesModuleLabel below. This is
//      the fix for a real regression-gate finding: in the instructor's
//      actual export, Module 05 ("Module 05 - Big Data and File I/O") holds
//      THREE assignment-kind items - "Code Walk 1 of 2" (a supplementary
//      practice exercise, body 1191 chars), "GitHub Sign Up" (a one-time
//      account-setup checkpoint, body 267 chars), and "Module 05 Assignment"
//      (the module's own graded work, body 1122 chars) - and the OLD rule 2
//      (rank by body length alone) anchored "Code Walk 1 of 2" purely
//      because its resolved body happened to be 69 characters longer, even
//      though it is not what Module 05 is actually about. Body length is a
//      proxy for "how much substance does this item carry", not for "is this
//      THE module's assignment" - a supplementary exercise can easily
//      out-write the module's own assignment blurb. An item whose title
//      carries the SAME module number as the module's own name (e.g.
//      "Module 05 Assignment" in a module named "Module 05 - Big Data and
//      File I/O") is the module's own designated work and wins ahead of any
//      other assignment-kind item, regardless of body length.
//   3. Among items that ALSO tie on the module-label-echo signal (including
//      the common case where NEITHER item echoes it - a module whose own
//      name carries no number, or two items that both happen to), prefer the
//      LONGEST body. The item carrying the most actual instructional
//      substance is the one a lecture-deck generator most needs surfaced; a
//      title-only assignment stub (no body resolved) should never outrank
//      one with real directions to build a deck section from. `.length` on
//      `undefined` is guarded to 0 via `?? 0` on optional chaining rather
//      than a truthiness check, so an empty-string body (falsy but present)
//      and a genuinely absent body both compare as 0 - neither should
//      out-rank a real body.
//   4. Final tiebreak: first-in-module order (the array's own order, which
//      partitionCourseItemsByKind preserves as a stable partition) - keeps
//      the pick reproducible for two items that are identical on every
//      signal above, with no further data to break the tie on.
//
// Rejected alternative: keep ranking by body length alone and special-case
// "Code Walk" titles (skip them, or rank them lower). Rejected for the same
// reason this whole file avoids literal-title matching elsewhere - it would
// fix this one export's exact wording and reopen on the next course whose
// supplementary-exercise items happen to be named something else. The
// module-number-echo signal is generic: it works for any "Module NN"/"Week
// N" naming scheme, keys off the SAME tolerant module-number idiom
// registry-helpers.sources.ts's findModuleByName already uses to match a
// module by name, and never references "Code Walk", "GitHub Sign Up", or
// any other literal title.
//
// Rejected alternative: give the module-label-echo signal priority OVER the
// non-optional preference (rule 1). Rejected because an instructor's
// explicit "(Optional)" marker is a stronger, more direct signal than a
// title merely sharing the module's number - a hypothetical
// "(Optional) Module 05 Extra Credit" would echo the module's label too, but
// the instructor has already said it carries no grading weight, so
// non-optional-ness must keep first refusal exactly as it did before this
// fix, with the new signal inserted immediately after it, not before.
//
// Total and side-effect-free: returns null only when `items` is empty
// (an empty kinds.assignment - the common case for a module with no graded
// work), and a single linear pass so it can never throw regardless of how
// many items tie.
export function selectAssignmentAnchor(
  items: readonly CartridgeModuleItem[],
  moduleName: string
): CartridgeModuleItem | null {
  if (items.length === 0) return null;
  let best = items[0];
  for (let i = 1; i < items.length; i++) {
    if (isBetterAnchor(items[i], best, moduleName)) best = items[i];
  }
  return best;
}

// True when `itemTitle` carries the SAME module number as `moduleName` -
// reusing this file's own MODULE_NUMBER_PATTERN (duplicated from
// registry-helpers.sources.ts's findModuleByName - see that constant's own
// comment above for why) rather than inventing a second, differently-behaved
// pattern here. Returns false (never throws, never treats "no number on
// either side" as a match) whenever the module's own name carries no
// extractable number - a module named "Start Here" or "Instructor
// Resources" simply has no label for any item to echo, so this signal
// quietly steps aside and rule 3 (body length) decides instead, exactly as
// it did before this fix existed.
export function echoesModuleLabel(itemTitle: string, moduleName: string): boolean {
  const moduleMatch = moduleName.match(MODULE_NUMBER_PATTERN);
  if (!moduleMatch) return false;
  const itemMatch = itemTitle.match(MODULE_NUMBER_PATTERN);
  return itemMatch ? itemMatch[1] === moduleMatch[1] : false;
}

export function isBetterAnchor(candidate: CartridgeModuleItem, current: CartridgeModuleItem, moduleName: string): boolean {
  const candidateOptional = hasLeadingOptionalMarker(candidate.title);
  const currentOptional = hasLeadingOptionalMarker(current.title);
  if (candidateOptional !== currentOptional) return !candidateOptional;

  const candidateEchoes = echoesModuleLabel(candidate.title, moduleName);
  const currentEchoes = echoesModuleLabel(current.title, moduleName);
  if (candidateEchoes !== currentEchoes) return candidateEchoes;

  const candidateBodyLength = candidate.body?.length ?? 0;
  const currentBodyLength = current.body?.length ?? 0;
  if (candidateBodyLength !== currentBodyLength) return candidateBodyLength > currentBodyLength;

  // Tied on every signal - keep `current` (the earlier, first-in-module
  // item), so this function only ever reports a STRICT improvement.
  return false;
}

// Part 3 of the INFO 1020 Week 8 fix: format one course-export module's items
// weighted by CourseItemKind instead of as a flat title list. This is the
// exact bug the instructor reported - a Week 8 deck whose sections were
// "Survey of Object-Oriented Programming", "Module 08 Objectives and Tasks",
// "Module 08 Learning Materials", "Core Object-Oriented Principles", "Module
// 08 Discussion Forum" (3 of 5 built from LMS housekeeping pages) while the
// actual graded assignment - modify starter code from mod10.zip, follow the
// textbook's Try It Out steps 10.38-10.45, submit to GitHub - never appeared
// anywhere, because the pre-fix code below (`chunks.push(`${item.type}:
// ${item.title}\n`)`) gave a generator nothing but titles to work from and no
// way to tell an assignment from a discussion forum.
//
// The fix: the module's graded assignment(s) are pulled to the front and
// labeled unmistakably as the thing students are evaluated on, with its
// resolved body text (see MAX_CARTRIDGE_ITEM_BODY_CHARS in
// cartridge-import.ts); administrative-shell items (discussion boards,
// status updates, ...) are named for course-structure context but never
// given their own "type: title" line - a downstream lecture-deck generator
// that treats a titled line as a candidate section would otherwise turn
// "Module 08 Discussion Forum" into an actual lecture section, which is
// exactly what happened. Quiz/test items keep today's plain "type: title"
// line - unchanged shape, since registry-helpers.sources.test.ts asserts on
// this exact substring (`toContain("Page: Notes")` etc) for Page/File items,
// which this classifier routes to "instructional".
//
// Instructional items ALSO keep that same "type: title" line first (so every
// pre-existing `toContain("Page: Notes")`-style assertion still matches
// unchanged), but now additionally carry their own resolved body text right
// after it, when one was resolved - the fix for a regression-gate finding
// paired with course-item-classifier.ts's own "Getting Started" fix: a real
// WikiPage with 1398 characters of orientation content was being classified
// "administrative" (see that file's header comment), which fed it through
// the parenthetical-only branch below and discarded its body outright even
// though its TITLE was still visible. Reclassifying it "instructional" alone
// would not have been enough - the pre-existing instructional loop never
// emitted ANY item's body, so the same 1398 characters would have kept
// vanishing silently even once correctly bucketed. Every instructional item
// gets this treatment (not just WikiPage-typed ones, and not gated on any
// title) because the classifier is what already decided this item carries
// real subject-matter content; MAX_CARTRIDGE_ITEM_BODY_CHARS (3000, see
// cartridge-import.ts) already bounds any single item's contribution, and
// MATERIALS_CAP (registry-helpers.sources.ts) bounds the whole module's, so
// no separate per-item budget (unlike assignmentBudget below) is needed
// here.
//
// `assignmentBudget` bounds how many items' worth of assignment BODY text
// (not just titles) get included when this runs across every module in a
// course-level digest (11 modules in the reported run) - this is the SAME
// DESCRIPTION_FETCH_LIMIT constant and the same "further ... omitted (N
// more)" note wording gatherLiveModuleItems already uses for its own
// per-module assignment/discussion description cap, rather than a freshly
// invented number, so the two paths' token-cost behavior stays predictable
// together. The budget object is threaded through by the caller (tryExport)
// so it is shared across every module in a single gather, not reset per
// module.
export function formatExportModuleMaterials(
  m: CartridgeModule,
  assignmentBudget: { remaining: number }
): { text: string; omittedAssignmentBodies: number } {
  const kinds = partitionCourseItemsByKind(m.items);
  const chunks: string[] = [];
  let omittedAssignmentBodies = 0;
  chunks.push(`# ${m.name}\n`);

  // Exactly one item (or none) is the anchor; every other assignment-kind
  // item still appears - just as a plain "type: title" line, the same shape
  // quiz items already get below, so it is visible for context without
  // competing for the "GRADED ASSIGNMENT" label.
  const anchor = selectAssignmentAnchor(kinds.assignment, m.name);

  for (const item of kinds.assignment) {
    if (item !== anchor) {
      chunks.push(`${item.type || "Assignment"}: ${item.title}\n`);
      continue;
    }
    chunks.push(`GRADED ASSIGNMENT (what students are evaluated on): ${item.title}\n`);
    if (item.body) {
      if (assignmentBudget.remaining > 0) {
        chunks.push(`${item.body}\n`);
        assignmentBudget.remaining--;
      } else {
        omittedAssignmentBodies++;
      }
    }
    chunks.push("\n");
  }

  for (const item of kinds.quiz) {
    chunks.push(`${item.type || "Quiz"}: ${item.title}\n`);
  }

  for (const item of kinds.instructional) {
    chunks.push(`${item.type}: ${item.title}\n`);
    // See this function's own comment above ("Instructional items ALSO keep
    // that same 'type: title' line...") - a resolved body rides along right
    // after the title line instead of being discarded.
    if (item.body) chunks.push(`${item.body}\n`);
  }

  // Administrative-shell items are named so the module's structure is still
  // visible for context, but deliberately as one compact parenthetical line
  // rather than each getting its own "type: title" line - see this
  // function's own comment above for why that distinction is the actual fix.
  if (kinds.administrative.length > 0) {
    chunks.push(
      `(course housekeeping items, not lecture content: ${kinds.administrative.map((i) => i.title).join(", ")})\n`
    );
  }

  return { text: chunks.join(""), omittedAssignmentBodies };
}
