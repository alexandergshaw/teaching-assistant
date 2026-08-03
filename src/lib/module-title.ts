// Idempotent module-title composition.
//
// THE BUG THIS FILE FIXES: planCartridgeModules (week-numbering.ts) used to build
// a Common Cartridge module title as `Module NN: ${topic}` UNCONDITIONALLY. The
// app also reads its own generated cartridges back in as a course schedule
// source, so a previously generated title ("Module 08: Survey of Object Oriented
// Programming") could come back around as next run's `topic`. Composing
// unconditionally then produced "Module 08: Module 08: Survey of Object Oriented
// Programming", and the run after that "Module 08: Module 08: Module 08: ...",
// with the real subject sliding further right every cycle until it was
// effectively unreachable context for the model. This is an accumulating
// feedback loop, not a one-off formatting glitch.
//
// THE FIX: composeModuleTitle is IDEMPOTENT. For a FIXED week number applied
// repeatedly (the realistic shape of the bug: a module's week/position does not
// change between Course Build runs), applying it to its own output any number of
// times reproduces that same output:
//
//     composeModuleTitle(composeModuleTitle(topic, week), week) === composeModuleTitle(topic, week)
//
// and by induction the same holds for any further reapplication. This is proven
// by construction below (see stripLeadingRedundantLabel) and pinned by a test
// that applies the function to its own output 3+ times.
//
// Idempotence is stated for a fixed week because that is what the real loop
// does - a module keeps the same week/position across runs. The function makes
// no claim about feeding week-N's output back in as week-M's topic; that is a
// different operation (re-slotting a module into a new position) that this file
// does not need to handle.

import { extractModuleNumber } from "./workflows/module-value";

// Detects a module/week label sitting at the very START of a string, and
// captures nothing but the label + its trailing separator (":" / "-" / an en-
// or em-dash) plus any surrounding whitespace. Anchored with `^` on purpose:
// a topic like "Comparing Module 07 and Module 08 approaches" must NOT be
// treated as carrying a redundant label just because it mentions one in
// passing - only a LEADING label is a candidate for being "this topic is
// just restating its own module number", which is the one thing we exist to
// undo.
//
// Why not reuse extractModuleNumber's own regex for this part: that pattern
// is deliberately UNANCHORED (it searches anywhere in a Canvas module name)
// and it exposes only the parsed number, not the match text or its length -
// exactly the two things needed to know WHERE the label ends so the real
// subject after it can be sliced out intact. Bolting an anchor onto a copy of
// that pattern here, and then still calling extractModuleNumber to parse the
// number out of the matched label text, keeps the actual
// zero-padding/separator/keyword-tolerance logic in the single place that
// already owns it (module-value.ts) rather than duplicating it.
const LEADING_LABEL_PATTERN = /^(?:module|week)\s*0*\d+\s*(?:[:\-–—]\s*)?/i;

// Repeatedly peel a redundant leading label off `text` by calling `peelOnce`
// - "here is what's left after removing ONE leading label, or null when
// there is nothing (more) to remove" - until it reports nothing left to
// peel. This is the one control-flow shape this codebase needs anywhere a
// topic may have been run through a label-composing step an unknown number
// of times: stripLeadingRedundantLabel below (week-matched, module/week
// vocabulary only) and schedule-topic-quality.ts's isPlaceholderTopic
// (number-agnostic, a wider structural-label vocabulary) both peel-check-
// peel-again in exactly this shape, and only differ in what counts as "a
// label" and whether a number must match - see that file's own
// peelOneStructuralLabel for the second use. Exported so both call sites
// share this one loop instead of each hand-rolling its own copy that could
// silently drift out of sync with the other.
//
// TERMINATION: `peelOnce` is required to return either null or a STRICTLY
// SHORTER string than it was given. That is asserted here defensively
// (falling back to "nothing more to peel" if violated) rather than merely
// trusted, because an unbounded loop over arbitrary LLM- or LMS-export text
// is exactly the kind of bug that only surfaces on a real instructor's file,
// not a hand-written test fixture - see schedule-topic-quality.test.ts's own
// adversarial "Module Module Module" / no-separator / very-deep-stack cases.
// Every real `peelOnce` implementation in this codebase removes at least one
// label's worth of text (a non-empty word plus a number), so the guard
// should never actually fire - it exists purely so a future change to either
// `peelOnce` can never turn this into an infinite loop.
export function peelRepeatedly(text: string, peelOnce: (remainder: string) => string | null): string {
  let remainder = text;
  for (;;) {
    const next = peelOnce(remainder);
    if (next === null) return remainder;
    if (next.length >= remainder.length) return remainder; // defensive: see TERMINATION above - unreachable in practice.
    remainder = next;
  }
}

/**
 * Peel a leading "Module NN" / "Week NN" label off `topic`, but ONLY when its
 * number equals `week` - repeating until no further redundant leading label
 * remains (so "Module 08: Module 08: Module 08" fully collapses in one call,
 * not just one layer per call).
 *
 * A label whose number does NOT match `week` is left in place, and stripping
 * stops there entirely. That mismatch is a real signal that something is
 * wrong upstream (a topic sourced from the wrong week, a mis-slotted module),
 * and silently discarding it would hide the very evidence an instructor or
 * a future debugging session would need. So a topic of "Module 07: Recursion"
 * composed at week 8 keeps the "Module 07: Recursion" text verbatim as the
 * subject, producing "Module 08: Module 07: Recursion" - unusual-looking, but
 * honest about the disagreement instead of erasing it. That composition is
 * still idempotent: re-running it strips only the outer, week-matching
 * "Module 08:" it just added and stops again at the mismatched "Module 07:",
 * landing on the same remainder both times.
 */
function stripLeadingRedundantLabel(topic: string, week: number): string {
  return peelRepeatedly(topic.trim(), (remainder) => {
    const match = remainder.match(LEADING_LABEL_PATTERN);
    if (!match) return null;
    const labelNumber = extractModuleNumber(match[0]);
    if (labelNumber !== week) return null;
    return remainder.slice(match[0].length).trim();
  });
}

/**
 * Compose a Common Cartridge module title from a topic and a 1-based week
 * number: "Module NN" when there is no real subject text, otherwise
 * "Module NN: <subject>".
 *
 * IDEMPOTENT for a fixed week (see file header): a topic that already IS a
 * composed title for this same week has its own "Module NN" restated up
 * front stripped back out before the real "Module NN: " is added, so the
 * label never stacks.
 *
 * A topic that, once every leading week-matching label is peeled off, has
 * NOTHING left (e.g. "Module 08: Module 08" at week 8) collapses to the bare
 * "Module 08" - deliberately chosen to be IDENTICAL to how an empty topic is
 * handled ("" -> "Module 08"), rather than inventing a separate rule for
 * "label-only" topics. A topic that is nothing but a repeated copy of its own
 * position number carries zero information beyond that position, exactly
 * like an empty topic does; treating them alike keeps one code path (the
 * `remainder ? ... : bare` branch below) instead of two rules that would need
 * to be kept in sync. The alternative - inventing distinct wording for
 * "explicitly emptied by stripping" vs "was always empty" - was rejected
 * because nothing downstream (the cartridge XML, the LLM prompt that reads
 * these titles) can tell the difference, so there is nothing to preserve by
 * keeping them separate.
 */
export function composeModuleTitle(topic: string, week: number): string {
  const bare = `Module ${String(week).padStart(2, "0")}`;
  const remainder = stripLeadingRedundantLabel(topic, week);
  return remainder ? `${bare}: ${remainder}` : bare;
}
