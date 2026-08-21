// The pure prompt composer for a MODULE INTRO VIDEO script - the short piece
// an instructor records to camera and posts at the top of a course module,
// PREVIEWING what the module covers. This is a re-gear of the "Lecture
// script" generation kind (docs/module-intro-video-script-acceptance-
// criteria.md, M5-M8), not an extension of the existing lecture generator.
//
// WHY A SEPARATE LEAF, AND WHY NOT JUST INLINE THE PROMPT IN THE ACTION:
// src/app/actions/media.ts is "use server", and this project's vitest runs
// in a node environment with no jsdom - it can exercise pure functions but
// never a rendered component. A prompt string built inside a "use server"
// action is therefore unreachable from a test entirely; composing it here,
// with no I/O, no "use server", and no env access, is what makes it
// testable at all. See generateModuleIntroScriptAction (media.ts), which is
// a thin wrapper: auth, minutes check, style block, one call to this
// function, one LLM call, guard, return.
//
// WHY NOT REUSE generateLectureScriptAction's PROMPT (media.ts, "Write a
// spoken-word lecture script..."): that prompt asks the model to TEACH the
// material - a hook, worked coverage, a recap, [PAUSE] markers between
// sections. An intro video does the opposite: it introduces the module and
// explicitly refuses to teach it, names the graded work by title, and closes
// on what to open first. Reusing that prompt (or branching it with a flag)
// would blur two genuinely different documents into one function; see
// media.ts's own header comment on generateLectureScriptAction for why that
// action keeps its other callers (Recording tab, generate-lecture-script
// workflow step, draft-upcoming-lectures) untouched.
//
// [PAUSE] markers are deliberately never mentioned here, not even as "don't
// use them" - the convention does not exist for this kind of script at all,
// and a negative mention would still leave the literal substring in the
// prompt.

import { lectureScriptWordTarget } from "@/lib/lecture-script-bounds";
import { DEFAULT_MODULE_LABEL } from "@/lib/lms-generation/default-module-label";

/** Everything composeModuleIntroScriptPrompt needs to build the prompt. Kept
 * as separate fields (rather than a pre-joined "topic" string, as
 * generateLectureScriptAction takes) because the course name and the module
 * label play different grammatical roles below and the caller
 * (generateModuleIntroScriptAction) has both available separately. */
export interface ModuleIntroScriptPromptInput {
  /** May be "" - the course name is optional context, not a required field. */
  courseName: string;
  /** The module being introduced, e.g. "Week 2: Historical Cyber Attacks".
   * Expected non-empty by every caller (the server branch already falls
   * back to "the selected material" before this is ever reached), but this
   * function does not itself refuse an empty value - refusal is the
   * action's job, composition is this function's. */
  moduleLabel: string;
  /** The gathered module materials, included verbatim - never trimmed,
   * reformatted, or truncated here (materials.ts already owns truncation). */
  materialsText: string;
  /** Already validated/rounded by checkLectureScriptMinutes - this function
   * trusts it and does not re-check the range. */
  minutes: number;
  /** getWritingStyleBlock's return value: "" when there is no sample, or a
   * block that already opens with its own "\n\n" separator when there is
   * one. Appended last, unmodified, so an empty block leaves no dangling
   * separator and a real one needs no separator added here. */
  styleBlock: string;
}

// Known caller-side fallback values for moduleLabel when no real module
// context is available (src/app/actions/lms-generation.ts,
// src/app/api/lms-generation/deck/route.ts,
// lmsGenerationSelection.ts's buildModuleLabel). DEFECT B fix (adversarial
// verification, closing wave): this used to spell the fallback literal by
// hand, a second, independent copy of default-module-label.ts's
// DEFAULT_MODULE_LABEL - two spellings of the same string that could drift
// without either side noticing. Sourced from that shared constant instead, so
// a future change to the fallback text only has to happen in one place; kept
// as a Set (rather than a single string) in case a second generic label is
// ever added here without disturbing default-module-label.ts's own contract
// of naming exactly one canonical fallback.
//
// WAVE 11B DEFECT 4 fix: this used to store DEFAULT_MODULE_LABEL RAW while
// isGenericModuleLabel lower-cased only the incoming label below - matching
// today only because the constant itself happens to already be all-lowercase.
// Retitling it (e.g. to "The selected material") would silently break every
// generic-label detection with no test failing, since the Set entry and the
// lower-cased lookup key would stop being byte-identical. Normalizing here
// too makes the comparison correct regardless of the constant's casing, not
// correct by coincidence. See intro-script-prompt.test.ts's "asymmetric
// normalization" test, which mocks the constant to a capitalized value to
// prove this line - not just the lookup below - is what makes detection
// case-insensitive.
const GENERIC_MODULE_LABELS = new Set([DEFAULT_MODULE_LABEL.trim().toLowerCase()]);

/** True when moduleLabel is a placeholder rather than an actual module
 * title - i.e. the caller had no real module context to hand this function.
 * Instruction 1 below reads differently in that case: naming "the module"
 * would otherwise have the script open by saying the placeholder text out
 * loud (e.g. "This module, the selected material, covers..."). */
function isGenericModuleLabel(label: string): boolean {
  return GENERIC_MODULE_LABELS.has(label.trim().toLowerCase());
}

/**
 * Compose the prompt for a module introduction video script. Pure: no I/O,
 * no randomness, no env access. See this file's header comment for why it
 * introduces the module rather than teaching it, and why that has to be a
 * new prompt rather than a variant of generateLectureScriptAction's.
 */
export function composeModuleIntroScriptPrompt(input: ModuleIntroScriptPromptInput): string {
  const words = lectureScriptWordTarget(input.minutes);
  const courseNamePart = input.courseName.trim();
  const moduleNamePart = input.moduleLabel.trim();
  const hasSpecificModuleLabel = moduleNamePart !== "" && !isGenericModuleLabel(moduleNamePart);
  // When the module label is a placeholder, leaving it in the "Course -
  // Module" join would hand the model "Introduction to Cybersecurity - the
  // selected material" as the thing to preview - drop it from the subject
  // and fall back to whichever half is still real.
  //
  // WAVE 11B DEFECT 2 fix: when NEITHER half is real either, this used to
  // fall all the way back to `moduleNamePart` - the raw placeholder text
  // itself - landing it in the prompt as the very thing the model is told to
  // preview. That is the same hazard this file's header comment already
  // names for [PAUSE] (a literal substring reaching the prompt, whether or
  // not it is wrapped in a "don't say this" instruction), just triggered by
  // the fallback chain instead of by a negative mention. Falls back to the
  // generic, non-placeholder phrase "this module" instead, so the
  // caller-supplied placeholder text never reaches the prompt in either
  // branch, and instruction 1 below no longer has to name what was not
  // provided in order to route around it.
  const subject = courseNamePart && hasSpecificModuleLabel
    ? `${courseNamePart} - ${moduleNamePart}`
    : hasSpecificModuleLabel
      ? moduleNamePart
      : courseNamePart || "this module";

  const sections: string[] = [
    `Write a short module introduction video script for a college instructor to record to camera and post at the top of a course module, previewing ${subject} for students.`,
    "This is a MODULE INTRODUCTION, not a lecture: it INTRODUCES the module and does not teach it. Do not include worked examples or in-depth explanation of the concepts - the material below is what students are about to study, not a script to read out loud.",
    [
      // DEFECT 2 fix: the four beats below were previously mandatory and
      // unconditional, but the shortest offered length (1 minute, ~140
      // words - see the "Target length" line) cannot fit all of them at
      // full weight (2-4 outcomes, plus one clause per graded item, is
      // already ~9 sentences on its own for a 3-item module). Naming the
      // length target as the tiebreaker, and saying explicitly what to
      // compress first, means a tight budget degrades the script instead of
      // silently overrunning it.
      "Follow this structure, in order, scaling how much each beat covers to the target length below - the target length wins over covering everything in the material; compress the outcomes and graded-work beats first, and never let the script run long to fit everything in.",
      // WAVE 11B DEFECT 2 fix: this clause used to end "...instead - do not
      // say a generic placeholder phrase such as \"the selected material\"
      // out loud", putting the literal placeholder text in the prompt as a
      // negative example - exactly the "not even as 'don't use them'"
      // mistake this file's header comment already warns against for
      // [PAUSE]. Removed rather than reworded: the `subject` fallback above
      // now keeps the placeholder text out of the prompt entirely, so this
      // instruction only needs to say what TO do.
      "1. Open by naming the module and its topic in one sentence." +
        (hasSpecificModuleLabel
          ? ""
          : " No specific module title was provided below, so open by naming the general topic drawn from the material instead."),
      // WAVE 11B DEFECT 1 fix: this beat used to be an unconditional order
      // to "name two to four things students will be able to do" - but a
      // capability-phrased learning outcome is almost never stated verbatim
      // in a Canvas page or assignment, so satisfying this beat at all
      // requires the model to summarise, which reads as licence to invent
      // under the anti-invention rule below ("never invent a title, date,
      // assignment, or fact that is not present in the material"). Every
      // module reaches this beat (unlike beat 3's graded
      // work or beat 4's opening priority, which can legitimately be
      // absent), so a bare escape hatch ("skip if you can't find outcomes")
      // is not the fix - the beat needs to say what kind of departure from
      // the source text is allowed. "In your own words" licenses paraphrase
      // and summary; "the material does not support" still refuses a
      // capability, fact, or example that is not actually backed by the
      // material below - so this does not weaken the anti-invention rule, it
      // specifies what that rule already meant for a beat that inherently
      // requires summarising.
      "2. Name two to four things students will be able to do by the end of the module, in your own words summarizing what the material below actually supports - never a capability the material does not support. At the shortest lengths, name just the single most important one.",
      // DEFECT 1 fix (graded work): the previous wording ordered the model
      // to name graded work unconditionally, which contradicts the
      // anti-invention rule below for any module that has none (an
      // orientation week, a reading-only week, a review week). The
      // escape hatch is conditional language for the MODEL to apply, not
      // something this function can decide itself - determining whether
      // materialsText actually contains graded work is exactly the kind of
      // judgment call a pure string-composing function should not attempt.
      "3. If the material below names graded work (an assignment, quiz, exam, project, or similar), name it by its actual title, exactly as it appears in the material, with one clause each on what it asks students to do - at the shortest lengths, one combined clause covering all of it is enough. If the material below contains no graded work at all - for example an orientation, a reading-only week, or a review week - skip this beat entirely rather than naming or inventing one.",
      // DEFECT 1 fix (closing beat): materialsText is a flat, unordered
      // selection (see this file's ModuleIntroScriptPromptInput doc
      // comment), so "the single thing to open first" is not always
      // recoverable from the input. The escape hatch keeps the close from
      // forcing a guessed ordering.
      "4. Close by naming the single thing students should open first, if the material below makes that clear (an item marked as first, due first, or otherwise an evident starting point). If no such priority is determinable from the material, close with a brief general invitation to get started instead - never guess at an ordering the material does not state.",
    ].join("\n"),
    "Never invent a title, date, assignment, or fact that is not present in the material below - this applies even when it means skipping or shortening one of the steps above.",
    "Rules: first person, spoken directly to camera, short sentences. Return ONLY the script as plain text - no headings, no markdown, no stage directions.",
    `Target length: about ${words} words (${input.minutes} minute${input.minutes === 1 ? "" : "s"} at a natural speaking pace).`,
    `Module material:\n${input.materialsText}`,
  ];

  // The style block goes LAST, unmodified - see this input field's own doc
  // comment for why a plain concatenation is correct for both the empty and
  // non-empty case.
  return sections.join("\n\n") + input.styleBlock;
}
