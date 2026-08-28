// AC4/AC5/AC6/AC7/AC8 SOURCE-TEXT GUARD
// (docs/objectives-post-target-from-selection-acceptance-criteria.md, X1).
//
// Follows useLmsGeneration.test.ts:828-932's own idiom (that file is 932
// lines - 68 from this repo's 1000-line ceiling - and off-limits to this
// wave; see the wave brief). vitest here is node-env and renders no
// component (vitest.config.ts: environment: "node"), so WHERE inside the
// hook the post-target seed is written, and whether a forbidden useEffect
// exists, cannot be proven by rendering `generate`/`refine`/`saveEdit`/
// `selectVersion`/`closePreview` are closures inside the hook, not exported.
// This reads useLmsGeneration.ts's source as TEXT and pins the STRUCTURE -
// which function's body a call sits inside, and in what order relative to
// named anchors - never the exact wording of a comment or a line number.
// "Pin the fact and the ordering, never the spelling" (this repo's own
// lesson, source-text tests over-specify): every boundary below is a
// `const <name> = ` anchor already load-bearing in the hook's own control
// flow, not a paraphrase of a comment that could be reworded without
// changing behaviour.
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const HOOK_PATH = join(process.cwd(), "src/app/components/content-tab/modules/useLmsGeneration.ts");

/** Source with comments stripped - the same helper idiom
 * generatedPreviewModal.wiring.test.ts already uses, for the same reason:
 * every assertion below is about CODE, and a call name written with a paren
 * inside a comment ("see defaultPostModuleChoiceFrom(...) above") would
 * otherwise either inflate a count or falsely trip a `.not.toContain`.
 * Pin the fact, never the prose that happens to sit next to it. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const hookSource = stripComments(readFileSync(HOOK_PATH, "utf8"));

const FINISH_GENERATE_SUCCESS_START = "const finishGenerateSuccess = async (";
const GENERATE_START = "const generate = (kindId: GenerationKindId) => {";
const CLOSE_PREVIEW_START = "const closePreview = () => {";
const SELECT_VERSION_START = "const selectVersion = (version: number) => {";
const REFINE_START = "const refine = () => {";
// Anchored on the DECLARATION, not on the parameter list. This marker used to
// spell out `(text: string) => {` in full, which made it break the moment
// `saveEdit` grew its second parameter (the edited announcement subject) -
// and because sliceBetween throws on a missing anchor, that took the whole
// file down with it rather than failing one assertion. Pinning the parameter
// spelling was exactly the over-specification this file's own header warns
// against two paragraphs above ("Pin the fact, never the prose that happens
// to sit next to it"); the fact being anchored is that `saveEdit` is declared
// here and that `post` follows it, neither of which depends on its arity.
const SAVE_EDIT_START = "const saveEdit = (";
const POST_START = "const post = () => {";

/**
 * The source text from `startMarker` up to (not including) the next
 * `endMarker` - a structural slice bounded by two `const <name> = ` anchors
 * that are already load-bearing in the hook's own top-to-bottom control
 * flow, not by line numbers or comment wording. Throws loudly if either
 * anchor is missing (a marker renamed or moved out from under this guard),
 * rather than silently returning "" - which would make every
 * `.not.toContain` assertion built on it vacuously pass.
 */
function sliceBetween(startMarker: string, endMarker: string): string {
  const start = hookSource.indexOf(startMarker);
  if (start === -1) throw new Error(`start marker not found - moved or renamed: ${startMarker}`);
  const end = hookSource.indexOf(endMarker, start);
  if (end === -1) throw new Error(`end marker not found after start - moved or renamed: ${endMarker}`);
  return hookSource.slice(start, end);
}

/**
 * Every effect call's own dependency array, as raw text (e.g.
 * `"[courseUrl, scriptMinutes]"`), found by depth-matching parentheses from
 * each call's `(` to ITS OWN matching closing `)` - so a multi-line effect
 * body containing further nested calls (an async IIFE, a
 * `localStorage.setItem(...)`) does not truncate the scan early.
 *
 * The call itself is matched by REGEX, not by the literal `"useEffect("`:
 * `useLayoutEffect(` and `useEffect (` (with a space) are both real ways to
 * write AC8.7's forbidden effect, and a literal marker would walk straight
 * past either - the guard would pass while the feature shipped dead. Pin the
 * fact (an effect exists, keyed on this value), never one spelling of it.
 *
 * The dependency array is asserted to be the final argument passed (a
 * trailing `[...]` immediately before that closing `)`), which is true of
 * every effect call in this file today, current or sabotaged (AC8.7's
 * forbidden effect included) - see the two "no useEffect" tests below for
 * what happens if that assumption is ever violated instead.
 */
const EFFECT_CALL_PATTERN = /\buse(?:Layout)?Effect\s*\(/g;

function effectDependencyArrays(source: string): string[] {
  const results: string[] = [];
  const pattern = new RegExp(EFFECT_CALL_PATTERN.source, "g");
  for (;;) {
    const match = pattern.exec(source);
    if (!match) break;
    const at = match.index;
    const openParenIndex = at + match[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = openParenIndex; i < source.length; i += 1) {
      if (source[i] === "(") depth += 1;
      else if (source[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) throw new Error(`unterminated ${match[0]} call starting at index ${at}`);
    const argsText = source.slice(openParenIndex + 1, end);
    const depsMatch = argsText.match(/\[[^[\]]*\]\s*$/);
    if (!depsMatch) {
      throw new Error(
        `${match[0]} call at index ${at} has no trailing dependency array - this guard's ` +
          "assumption that the deps array is always the final argument no longer holds"
      );
    }
    results.push(depsMatch[0]);
    pattern.lastIndex = end + 1;
  }
  return results;
}

describe("AC4: defaultPostModuleChoiceFrom is computed once, inside generate()'s body", () => {
  it("appears in the hook's source exactly once", () => {
    const occurrences = hookSource.split("defaultPostModuleChoiceFrom(").length - 1;
    expect(occurrences).toBe(1);
  });

  it("sits between the generate and closePreview anchors, not in finishGenerateSuccess or elsewhere", () => {
    const generateBody = sliceBetween(GENERATE_START, CLOSE_PREVIEW_START);
    expect(generateBody).toContain("defaultPostModuleChoiceFrom(");
  });
});

describe("AC4/AC6/AC7: the seed write lives in finishGenerateSuccess's body, and nowhere else", () => {
  const finishGenerateSuccessBody = sliceBetween(FINISH_GENERATE_SUCCESS_START, GENERATE_START);
  const closePreviewBody = sliceBetween(CLOSE_PREVIEW_START, SELECT_VERSION_START);
  const selectVersionBody = sliceBetween(SELECT_VERSION_START, REFINE_START);
  const refineBody = sliceBetween(REFINE_START, SAVE_EDIT_START);
  const saveEditBody = sliceBetween(SAVE_EDIT_START, POST_START);

  it("setPostTargetFromSelection( and setPostModuleChoice( both appear inside finishGenerateSuccess's body", () => {
    expect(finishGenerateSuccessBody).toContain("setPostTargetFromSelection(");
    expect(finishGenerateSuccessBody).toContain("setPostModuleChoice(");
  });

  it("AC5: neither call appears inside closePreview's body", () => {
    expect(closePreviewBody).not.toContain("setPostTargetFromSelection(");
    expect(closePreviewBody).not.toContain("setPostModuleChoice(");
  });

  it("AC5: neither call appears inside selectVersion's body", () => {
    expect(selectVersionBody).not.toContain("setPostTargetFromSelection(");
    expect(selectVersionBody).not.toContain("setPostModuleChoice(");
  });

  it("AC5: neither call appears inside refine's body", () => {
    expect(refineBody).not.toContain("setPostTargetFromSelection(");
    expect(refineBody).not.toContain("setPostModuleChoice(");
  });

  it("AC5: neither call appears inside saveEdit's body", () => {
    expect(saveEditBody).not.toContain("setPostTargetFromSelection(");
    expect(saveEditBody).not.toContain("setPostModuleChoice(");
  });

  it('AC7: setPostNewModuleName("") co-occurs with the seed write inside finishGenerateSuccess\'s body', () => {
    expect(finishGenerateSuccessBody).toContain('setPostNewModuleName("")');
  });
});

// The pairwise slices above are bounded by consecutive `const <name> = `
// anchors and stop at POST_START, so between them they cover only the run of
// closures from finishGenerateSuccess to saveEdit. A seed write added INSIDE
// `post()`, inside `download`, or at the hook's top level would fall in the
// blind spot past that last boundary and satisfy every assertion above. A
// whole-file census closes it: there are exactly two legitimate writers of
// each raw setter, and both are named below.
describe("AC5/AC8.5: the raw setters are written in exactly two places, hook-wide", () => {
  const countOf = (needle: string) => hookSource.split(needle).length - 1;

  it("setPostTargetFromSelection( is called exactly twice", () => {
    // 1. finishGenerateSuccess's own seed write (AC4/AC6).
    // 2. choosePostModule, which clears the flag on the select's own onChange
    //    (AC8.6). A third call anywhere - `post()`, `download`, the hook's top
    //    level - is a provenance write outside both, which is what AC5 and
    //    AC8.5 between them forbid.
    expect(countOf("setPostTargetFromSelection(")).toBe(2);
  });

  it("setPostModuleChoice( - the RAW setter, not the choosePostModule wrapper - is called exactly twice", () => {
    // Same two writers. The wrapper is handed out under the existing
    // `setPostModuleChoice` KEY (AC8.6), which carries no paren and so is not
    // counted here; every occurrence counted is a real write to the state.
    expect(countOf("setPostModuleChoice(")).toBe(2);
  });

  it("both writers sit inside finishGenerateSuccess and choosePostModule, and nowhere between", () => {
    // Locates the two, so the counts above cannot be satisfied by two calls
    // in some third place. choosePostModule is a top-level const in the hook,
    // like every other anchor this file uses.
    const chooseStart = hookSource.indexOf("const choosePostModule = (");
    expect(chooseStart, "choosePostModule anchor not found - moved or renamed").toBeGreaterThan(-1);
    const seedStart = hookSource.indexOf(FINISH_GENERATE_SUCCESS_START);
    const firstWrite = hookSource.indexOf("setPostTargetFromSelection(");
    const secondWrite = hookSource.indexOf("setPostTargetFromSelection(", firstWrite + 1);
    expect(firstWrite).toBeGreaterThan(seedStart);
    expect(firstWrite).toBeLessThan(hookSource.indexOf(GENERATE_START));
    expect(secondWrite).toBeGreaterThan(chooseStart);
  });
});

describe("AC8.7: no useEffect is keyed on postModuleChoice", () => {
  it("the hook has at least one useEffect (sanity check that the extraction itself works)", () => {
    expect(effectDependencyArrays(hookSource).length).toBeGreaterThan(0);
  });

  it("no useEffect's dependency array names postModuleChoice", () => {
    const deps = effectDependencyArrays(hookSource);
    for (const dep of deps) {
      expect(dep).not.toMatch(/\bpostModuleChoice\b/);
    }
  });
});
