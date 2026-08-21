// The fallback `moduleLabel` text src/app/actions/lms-generation.ts synthesises
// when a generation call has no real module context (no module selected, or
// an export-sourced selection with no module name) - see that file's own
// generateFromSelectionAction, where `moduleLabel` falls back to this value
// before being handed to every kind's generator, including the intro-video
// script one.
//
// Pulled out to its own pure leaf (no I/O, no "use server", so it can be
// imported by a "use server" module without paying an async/await tax - see
// course-not-linked.ts's own header comment for the identical rationale)
// rather than left as an inline literal in lms-generation.ts: that literal
// then had to be duplicated, BY HAND, inside
// src/lib/lms-generation/intro-script-prompt.ts's own GENERIC_MODULE_LABELS
// set so the script prompt composer could recognise it as a placeholder
// rather than announcing it out loud (isGenericModuleLabel). Two independent
// spellings of the same string is exactly the hazard this constant exists to
// shrink: lms-generation.ts now has exactly ONE place that spells it.
//
// DEFECT B fix (adversarial verification, closing wave): the duplication this
// comment used to describe as still-open is now closed for
// intro-script-prompt.ts - its GENERIC_MODULE_LABELS set imports and sources
// this constant directly rather than spelling its own copy of the literal.
//
// WAVE 11B DEFECT 3 fix: the claim above was itself overstated - at the time
// it was written, THREE more call sites still hand-spelled the literal
// independently: lmsGenerationSelection.ts's buildModuleLabel (both its
// no-items return and its "single live module with no resolvable name"
// return) and deck/route.ts's own moduleLabel fallback. buildModuleLabel in
// particular PRODUCES moduleLabel values that later feed
// isGenericModuleLabel, so a drift there breaks placeholder detection in the
// direction that matters most - a real module wrongly read as generic, or
// vice versa. All three now import this constant instead of spelling their
// own copy, so this really is - now - the one canonical place that spells
// the fallback text.
export const DEFAULT_MODULE_LABEL = "the selected material";
