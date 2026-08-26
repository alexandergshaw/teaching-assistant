// TDD for Slice A (docs/repo-grades-ux-overhaul-acceptance-criteria.md,
// section 7). WRITTEN BEFORE THE IMPLEMENTATION. The implementer makes these
// pass without changing what they assert; if one is wrong, report it rather
// than editing it.
//
// REVISION 2. Revision 1 of this file was rejected by a peer audit that
// produced a PASSING WRONG IMPLEMENTATION for every one of its five checkers
// - four of them one-liners - and found one assertion that would have failed
// a CORRECT fix. What changed:
//
//   - the import check is replaced by this folder's existing
//     `usesSharedFunction` idiom (import AND call site), because a type-only
//     import, a commented-out import and `export *` all satisfied a bare
//     module-specifier match. A pure guard nothing calls is the exact
//     "correct code, shipped dead" failure this block exists to prevent.
//   - CSS is comment-stripped first. A single line reading
//     `/* TODO: add :focus-visible with var(--focus-ring-color) */` satisfied
//     BOTH focus assertions. This repo already learned that lesson with a
//     canary, in src/app/focusRing.wiring.test.ts:346-359.
//   - the `.linkButton:disabled` assertion targets page.module.css ONLY. CSS
//     Modules hash per file and every `.linkButton` in this view comes from
//     `pageStyles`, so a rule added to repo-grades.module.css compiles to a
//     class no element carries. Revision 1's `||` explicitly blessed that
//     dead edit.
//   - the 400-character proximity window is GONE. It decided its verdict by
//     how much unrelated text sat between two nodes, and it FAILED a correct
//     fix that kept the sr-only region and added a visible one beside it.
//     This repo has burned a cycle on a fixed-character window before -
//     repoGrades.wiring.test.ts:541-548 - and the recorded fix is to bound by
//     a real structural boundary, not a character count. U5.20 is now pinned
//     as a FACT about the rendered element instead.
//
// WHAT THESE STILL DO NOT PROVE. vitest here is node-env and collects only
// src/**/*.test.ts, so nothing renders and no CSS is applied. These prove the
// specific defects Slice A removes are gone from the source. They do not
// prove the view looks right, that a focus ring is visible on screen, or that
// a screen reader announces anything. Those are owner checks on the deployed
// site.
//
// KNOWN GAP, stated rather than hidden: U5.21 ("the outcome is summarized -
// graded, failed, skipped, with counts") has no test here. Its testable core
// would be extracting the eight inline template literals in
// useRepoGradesGradingActions.ts into a pure module. That extraction is real
// and worth doing, but it is scope beyond Slice A, so U5.21's message CONTENT
// is unguarded and only its destination is.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const REPO_GRADES = "src/app/components/repo-grades";
const indexSource = read(`${REPO_GRADES}/index.tsx`);
const bindingControlSource = read(`${REPO_GRADES}/RepoBindingControl.tsx`);
const gridCss = read(`${REPO_GRADES}/repo-grades.module.css`);
const pageCss = read("src/app/page.module.css");

/** Borrowed verbatim from repoGrades.wiring.test.ts:478-481 rather than
 *  reinvented: requires the named import AND at least one call site, and
 *  accepts either quote style. Revision 1 of this file used a bare
 *  module-specifier match, which a dead type-only import satisfied. */
function usesSharedFunction(text: string, symbolName: string, fromModule: string): boolean {
  const importPattern = new RegExp(`import\\s*\\{[^}]*\\b${symbolName}\\b[^}]*\\}\\s*from\\s*["']${fromModule}["']`);
  return importPattern.test(text) && text.includes(`${symbolName}(`);
}

/** Same idea as focusRing.wiring.test.ts's own helper: a comment's text is
 *  indistinguishable from real CSS to a regex. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Line comments, block comments and JSX `{/* ... *​/}` comments, so a note
 *  explaining a deletion cannot be mistaken for the deleted code. index.tsx
 *  is a file where every removal gets a paragraph. */
function stripJsComments(source: string): string {
  return source.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Every JSX opening tag in the source, as `<tag ...attrs>` strings. Bounded
 *  by the tag itself - a real structural boundary - never by a character
 *  count. */
function openingTags(source: string): string[] {
  return source.match(/<[A-Za-z][^<>]*>/g) ?? [];
}

// ---------------------------------------------------------------------------
// U5.20 - the view's results must reach a VISIBLE surface.
//
// `postSummary` is the single sink for every outcome this view reports. Today
// it renders only inside a node carrying `srOnly` (clip-path: inset(50%),
// 1x1px), so a sighted instructor who clicks "Grade all" on an already-graded
// column sees nothing happen.
//
// Section 5 settled HOW to fix it: put `role="status"` on the VISIBLE node.
// Do not keep an invisible live region and mark the visible copy aria-hidden
// - that is an inversion which leaves a sighted screen-reader user able to
// see the summary but unable to navigate to it.
//
// Pinned as a fact about the element, not as proximity to a word: somewhere
// in this view there is a role="status" element that is not screen-reader-
// only. The variable name, the file it lives in and the class name are all
// the implementer's to choose.
// ---------------------------------------------------------------------------

/** The opening tag that directly encloses each `{postSummary}` render, found
 *  by scanning back to that element's own `<` and forward to its `>`. Bounded
 *  by the element - a real structural boundary - never by a character count.
 *  A `{postSummary}` appearing inside a prop (no `>` before it) is not a
 *  direct render and is excluded. */
function postSummaryEnclosingTags(source: string): string[] {
  const cleaned = stripJsComments(source);
  const tags: string[] = [];
  const re = /\{\s*postSummary\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cleaned)) !== null) {
    const open = cleaned.lastIndexOf("<", match.index);
    if (open === -1) continue;
    const close = cleaned.indexOf(">", open);
    if (close === -1 || close > match.index) continue; // a prop pass, not a child render
    tags.push(cleaned.slice(open, close + 1));
  }
  return tags;
}

/** Renders of postSummary inside a visible status region. This is the fact
 *  U5.20 and section 5 actually require - not merely that SOME visible
 *  role="status" exists somewhere (index.tsx:602's conditional banner already
 *  is one, so that weaker check passes today with no work done). */
function visibleStatusRegionCount(source: string): number {
  return postSummaryEnclosingTags(source).filter(
    (tag) => /role=["']status["']/.test(tag) && !/\bsrOnly\b/.test(tag)
  ).length;
}

function srOnlyStatusRegionCount(source: string): number {
  return postSummaryEnclosingTags(source).filter(
    (tag) => /role=["']status["']/.test(tag) && /\bsrOnly\b/.test(tag)
  ).length;
}

describe("U5.20: run results reach a visible status region", () => {
  it("canary: a status region that is screen-reader-only does not count as visible", () => {
    const srOnly = '<div role="status" aria-live="polite" className={gridStyles.srOnly}>{postSummary}</div>';
    expect(srOnlyStatusRegionCount(srOnly)).toBe(1);
    expect(visibleStatusRegionCount(srOnly)).toBe(0);
  });

  it("canary: a visible status region rendering postSummary counts, in either quote style", () => {
    expect(visibleStatusRegionCount('<p role="status" className={s.bar}>{postSummary}</p>')).toBe(1);
    expect(visibleStatusRegionCount("<p role='status' className={s.bar}>{postSummary}</p>")).toBe(1);
  });

  it("canary (present-but-wrong): a plain visible node with no status role does not count", () => {
    expect(visibleStatusRegionCount('<p className={s.bar}>{postSummary}</p>')).toBe(0);
  });

  it("canary (present-but-wrong): a visible status region that does NOT render postSummary does not count", () => {
    // index.tsx:602 is exactly this today - a visible role="status" banner
    // about bindings. A guard that merely counted visible status regions
    // would pass with no work done at all.
    expect(visibleStatusRegionCount('<p className={g.banner} role="status">Some other message</p>')).toBe(0);
  });

  it("canary (present-but-wrong): a commented-out region does not count", () => {
    expect(visibleStatusRegionCount('{/* <p role="status" className={s.bar}>{postSummary}</p> */}')).toBe(0);
  });

  it("canary (present-but-wrong): passing postSummary as a prop is not a direct render", () => {
    expect(postSummaryEnclosingTags('<StatusSurface message={postSummary} />')).toHaveLength(0);
  });

  it("index.tsx renders postSummary inside a status region a sighted user can read", () => {
    expect(visibleStatusRegionCount(indexSource)).toBeGreaterThan(0);
  });

  it("postSummary is still rendered somewhere - the fix adds a surface, it does not delete the state", () => {
    expect(/\{\s*postSummary\s*\}/.test(indexSource)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// U0c / U6.26a - the view must not draw its own container frame.
//
// page.tsx:238 already wraps every tab panel in `.tabContainer`, and
// page.tsx:385-387 wraps this view in <TabShell>, which supplies `.card`
// (gap: 28px; padding: 36px). index.tsx renders a THIRD container whose
// `gap: 0` is what removes every vertical gap between the header, controls,
// banners, link panel, grid and log.
//
// Two assertions, because pinning the class name alone is dodgeable by
// renaming the wrapper and copying the frame into repo-grades.module.css.
// The second pins the FACT: this view's own stylesheet must not define a
// card frame of its own.
// ---------------------------------------------------------------------------

function rendersOwnTabContainer(source: string): boolean {
  return /className=\{[^}]*\btabContainer\b/.test(stripJsComments(source));
}

/** A rule block that redraws the shared card frame - the 24px radius paired
 *  with an elevation shadow - which is what makes a nested container read as
 *  a second card. */
function definesCardFrame(css: string): boolean {
  const blocks = stripCssComments(css).split("}");
  return blocks.some((block) => /border-radius:\s*24px/.test(block) && /box-shadow:\s*var\(--shadow-lg\)/.test(block));
}

describe("U0c: the view does not draw a nested container frame", () => {
  it("canary: the checker sees a nested container when one is rendered", () => {
    expect(rendersOwnTabContainer('<div className={styles.tabContainer}>')).toBe(true);
    expect(rendersOwnTabContainer('<div className={`${styles.tabContainer} ${x}`}>')).toBe(true);
  });

  it("canary (present-but-wrong): a note explaining the removal must not read as the removal being undone", () => {
    expect(rendersOwnTabContainer('{/* was <div className={styles.tabContainer}> */}')).toBe(false);
    expect(rendersOwnTabContainer('// removed: className={styles.tabContainer}')).toBe(false);
  });

  it("canary: the frame checker discriminates a renamed copy of the card frame", () => {
    expect(definesCardFrame(".viewRoot { border-radius: 24px; box-shadow: var(--shadow-lg); gap: 0; }")).toBe(true);
    expect(definesCardFrame(".gridWrap { border-radius: 10px; }")).toBe(false);
    expect(definesCardFrame("/* .viewRoot { border-radius: 24px; box-shadow: var(--shadow-lg); } */")).toBe(false);
  });

  it("index.tsx renders no tabContainer of its own", () => {
    expect(rendersOwnTabContainer(indexSource)).toBe(false);
  });

  it("repo-grades.module.css does not define a replacement card frame", () => {
    expect(definesCardFrame(gridCss)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// U11.46 - controls in this view must have a visible focus indicator.
//
// repo-grades.module.css currently contains zero :focus, :focus-visible or
// outline rules, while the rest of the app replaces the UA default. The token
// already exists (--focus-ring-color), so this is about using it.
//
// The token must appear INSIDE a focus rule that actually draws something.
// Revision 1 asserted "a focus rule exists" and "the token appears somewhere"
// as two independent facts over the whole file, which an empty rule body plus
// an unrelated use of the token satisfied.
// ---------------------------------------------------------------------------

/** Rule blocks whose selector carries :focus/:focus-visible, paired with the
 *  declarations in that same block. */
function focusRuleBodies(css: string): string[] {
  const bodies: string[] = [];
  const re = /([^{}]*:focus(?:-visible)?[^{}]*)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  const cleaned = stripCssComments(css);
  while ((match = re.exec(cleaned)) !== null) bodies.push(match[2]);
  return bodies;
}

function hasTokenisedFocusIndicator(css: string): boolean {
  return focusRuleBodies(css).some(
    (body) => /var\(--focus-ring-color\)/.test(body) && /(outline|box-shadow)\s*:/.test(body)
  );
}

describe("U11.46: the view's stylesheet draws a focus indicator from the app's token", () => {
  it("canary: a real tokenised focus rule passes", () => {
    const good = ".x:focus-visible { outline: 2px solid var(--focus-ring-color); outline-offset: 2px; }";
    expect(hasTokenisedFocusIndicator(good)).toBe(true);
  });

  it("canary (present-but-wrong): a commented-out rule does not pass", () => {
    expect(hasTokenisedFocusIndicator("/* .x:focus-visible { outline: 2px solid var(--focus-ring-color); } */")).toBe(false);
  });

  it("canary (present-but-wrong): an empty focus rule body does not pass", () => {
    expect(hasTokenisedFocusIndicator(".x:focus-visible { }")).toBe(false);
  });

  it("canary (present-but-wrong): the token used outside a focus rule does not pass", () => {
    expect(hasTokenisedFocusIndicator(".x { border-color: var(--focus-ring-color); } .y:focus { }")).toBe(false);
  });

  it("canary (present-but-wrong): a focus rule that draws nothing from the token does not pass", () => {
    expect(hasTokenisedFocusIndicator(".x:focus-visible { outline: 2px solid blue; }")).toBe(false);
  });

  it("repo-grades.module.css draws a focus indicator using the app's token", () => {
    expect(hasTokenisedFocusIndicator(gridCss)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// U6.27 - a disabled action must look disabled.
//
// Every action in this view uses `.linkButton`, which sets an author `color`
// and has only a :hover rule. Because the colour is author-specified, the UA's
// GrayText default never applies, so a disabled action renders identical to an
// enabled one - which makes U5.22 ("disabled while it runs, and the disabled
// state says why") unimplementable on this primitive.
//
// The rule must live in page.module.css. Every `.linkButton` in this view
// comes from `pageStyles` (RepoBindingControl.tsx:19 and its siblings), and
// CSS Modules hash per file, so the same rule added to repo-grades.module.css
// would compile to a class no element in the app carries.
// ---------------------------------------------------------------------------

function linkButtonDisabledBodies(css: string): string[] {
  const bodies: string[] = [];
  const re = /([^{}]*\.linkButton[^{}]*(?::disabled|\[disabled\])[^{}]*)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  const cleaned = stripCssComments(css);
  while ((match = re.exec(cleaned)) !== null) bodies.push(match[2]);
  return bodies;
}

function hasLinkButtonDisabledRule(css: string): boolean {
  return linkButtonDisabledBodies(css).some((body) => body.trim().length > 0);
}

describe("U6.27: the link-button primitive has a visible disabled state", () => {
  it("canary: a real disabled rule passes, in either selector spelling", () => {
    expect(hasLinkButtonDisabledRule(".linkButton:disabled { opacity: 0.55; cursor: default; }")).toBe(true);
    expect(hasLinkButtonDisabledRule(".linkButton[disabled] { opacity: 0.55; }")).toBe(true);
  });

  it("canary (present-but-wrong): an empty body does not pass", () => {
    expect(hasLinkButtonDisabledRule(".linkButton:disabled { }")).toBe(false);
  });

  it("canary (present-but-wrong): a commented-out rule does not pass", () => {
    expect(hasLinkButtonDisabledRule("/* .linkButton:disabled { opacity: .5 } */")).toBe(false);
  });

  it("canary (present-but-wrong): a hover-only rule does not pass", () => {
    expect(hasLinkButtonDisabledRule(".linkButton:hover { text-decoration: underline; }")).toBe(false);
  });

  it("page.module.css defines it - the stylesheet the components actually import", () => {
    expect(hasLinkButtonDisabledRule(pageCss)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// U9.36 / U9.37 - the confirm paths must consult the confirmable-candidate
// guard, and must actually CALL it.
//
// The behavioural rule lives in repoGradesBindingConfirm.test.ts. These pin
// the reachability half, which is the half this project has shipped dead
// before. `usesSharedFunction` requires an import AND a call site, so a
// type-only import or a commented-out one does not satisfy it.
// ---------------------------------------------------------------------------

const CONFIRM_MODULE = "\\./repoGradesBindingConfirm";

describe("U9.36/U9.37: both confirm paths call the guard, not merely import it", () => {
  it("canary: import plus call passes; import alone does not", () => {
    const called = 'import { isConfirmableCandidate } from "./repoGradesBindingConfirm";\nif (isConfirmableCandidate(c)) {}';
    const deadImport = 'import { isConfirmableCandidate } from "./repoGradesBindingConfirm";';
    expect(usesSharedFunction(called, "isConfirmableCandidate", CONFIRM_MODULE)).toBe(true);
    expect(usesSharedFunction(deadImport, "isConfirmableCandidate", CONFIRM_MODULE)).toBe(false);
  });

  it("canary (present-but-wrong): a local reimplementation without the import does not pass", () => {
    const local = "function isConfirmableCandidate(c) { return true; }\nisConfirmableCandidate(c);";
    expect(usesSharedFunction(local, "isConfirmableCandidate", CONFIRM_MODULE)).toBe(false);
  });

  it("the per-row confirm control calls isConfirmableCandidate (U9.36)", () => {
    expect(usesSharedFunction(bindingControlSource, "isConfirmableCandidate", CONFIRM_MODULE)).toBe(true);
  });

  it("the batch confirm path calls partitionConfirmableBindings (U9.37)", () => {
    expect(usesSharedFunction(indexSource, "partitionConfirmableBindings", CONFIRM_MODULE)).toBe(true);
  });
});
