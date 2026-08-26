// TDD for Slice A (docs/repo-grades-ux-overhaul-acceptance-criteria.md,
// section 7). WRITTEN BEFORE THE IMPLEMENTATION. These currently FAIL against
// the tree at 47340df. The implementer makes them pass without changing what
// they assert; if one is wrong, report it rather than editing it.
//
// WHY THESE ARE SOURCE AND STYLESHEET GUARDS RATHER THAN RENDER TESTS.
// vitest here is node-env and collects only src/**/*.test.ts, so no component
// is ever rendered and no CSS is ever applied. Slice A is mostly presentation,
// so the honest options are a text guard or nothing. A text guard is the
// weaker instrument and is used deliberately, with its limits stated per
// assertion.
//
// EVERY CHECKER BELOW IS CANARY-BACKED. This file's own governing rule -
// repoGrades.wiring.test.ts:17-23 - is that a structural assertion without a
// canary is worthless: a checker that silently stops matching passes forever.
// So each checker is a pure function over source text, proved against a
// synthetic KNOWN-BAD and KNOWN-GOOD sample first, and only then pointed at
// the real file. If a checker is ever loosened into vacuity, its canary pair
// goes red before the real assertion does.
//
// These guards do NOT prove the view looks right, that focus is visible on
// screen, or that a screen reader announces anything. They prove the code no
// longer has the specific defects Slice A exists to remove.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const REPO_GRADES = "src/app/components/repo-grades";
const indexSource = read(`${REPO_GRADES}/index.tsx`);
const bindingControlSource = read(`${REPO_GRADES}/RepoBindingControl.tsx`);
const gridCss = read(`${REPO_GRADES}/repo-grades.module.css`);
const pageCss = read("src/app/page.module.css");

// ---------------------------------------------------------------------------
// U0c - the view must not render its own nested `.tabContainer`.
//
// page.tsx:238 already wraps every tab panel in `.tabContainer`, and
// page.tsx:385-387 wraps this view in <TabShell>, which supplies `.card`
// (gap: 28px; padding: 36px). index.tsx then renders a THIRD container, whose
// `gap: 0` is what removes every vertical gap between the header, controls,
// banners, link panel, grid and log.
// ---------------------------------------------------------------------------

/** True when the source renders the shared tabContainer class itself. */
function rendersOwnTabContainer(source: string): boolean {
  return /className=\{[^}]*\btabContainer\b/.test(source);
}

describe("U0c: the view does not nest its own tab container", () => {
  it("canary: the checker sees a nested container when one is present", () => {
    expect(rendersOwnTabContainer('<div className={styles.tabContainer}>')).toBe(true);
    expect(rendersOwnTabContainer('<div className={`${styles.tabContainer} ${x}`}>')).toBe(true);
  });

  it("canary: the checker does not fire on an unrelated container or a mention in prose", () => {
    expect(rendersOwnTabContainer('<div className={styles.card}>')).toBe(false);
    expect(rendersOwnTabContainer("// the outer tabContainer already supplies this")).toBe(false);
  });

  it("index.tsx renders no tabContainer of its own", () => {
    expect(rendersOwnTabContainer(indexSource)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// U5.20 - the view's results must reach a VISIBLE surface.
//
// `postSummary` is the single sink for every outcome this view reports - bulk
// grade summaries, "nothing to grade", "nothing is postable", post results,
// retry results, truncation warnings, and every panel's onAnnounce. Today it
// is rendered in exactly one place, inside a node carrying the srOnly class
// (clip-path: inset(50%), 1x1px), so a sighted instructor who clicks "Grade
// all" on an already-graded column sees nothing happen at all.
// ---------------------------------------------------------------------------

/** Every JSX expression container that renders postSummary, with ~400
 *  characters of preceding context - enough to carry the opening tag it sits
 *  inside. */
function postSummaryRenderSites(source: string): string[] {
  const sites: string[] = [];
  const re = /\{\s*postSummary\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    sites.push(source.slice(Math.max(0, match.index - 400), match.index));
  }
  return sites;
}

/** True when at least one render site is NOT inside a screen-reader-only node. */
function hasVisiblePostSummaryRender(source: string): boolean {
  return postSummaryRenderSites(source).some((context) => !/\bsrOnly\b/.test(context));
}

describe("U5.20: run results reach a visible surface, not only a clipped one", () => {
  it("canary: an sr-only-only render does not count as visible", () => {
    const srOnlyOnly = '<div role="status" aria-live="polite" className={gridStyles.srOnly}>{postSummary}</div>';
    expect(postSummaryRenderSites(srOnlyOnly)).toHaveLength(1);
    expect(hasVisiblePostSummaryRender(srOnlyOnly)).toBe(false);
  });

  it("canary: a visible render counts", () => {
    const visible = '<p className={gridStyles.statusSurface}>{postSummary}</p>';
    expect(hasVisiblePostSummaryRender(visible)).toBe(true);
  });

  it("canary: the checker notices a render that exists at all", () => {
    expect(postSummaryRenderSites("const postSummary = '';")).toHaveLength(0);
  });

  it("index.tsx renders postSummary somewhere a sighted user can read it", () => {
    expect(postSummaryRenderSites(indexSource).length).toBeGreaterThan(0);
    expect(hasVisiblePostSummaryRender(indexSource)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// U11.46 - controls in this view must have a visible focus indicator.
//
// repo-grades.module.css currently contains zero :focus, :focus-visible or
// outline rules across its whole length, while the rest of the app replaces
// the UA default (page.module.css's .textInput:focus). The app already has a
// token for this - --focus-ring-color - so this is about using it, not about
// inventing a value.
// ---------------------------------------------------------------------------

function focusRuleCount(css: string): number {
  return (css.match(/:focus(-visible)?\b/g) ?? []).length;
}

function usesFocusRingToken(css: string): boolean {
  return /var\(--focus-ring-color\)/.test(css);
}

describe("U11.46: the view's own stylesheet defines focus indicators", () => {
  it("canary: the checkers see a real focus rule and its token", () => {
    const sample = ".x:focus-visible { outline: 2px solid var(--focus-ring-color); outline-offset: 2px; }";
    expect(focusRuleCount(sample)).toBe(1);
    expect(usesFocusRingToken(sample)).toBe(true);
  });

  it("canary: the checkers do not fire on a stylesheet with no focus handling", () => {
    expect(focusRuleCount(".x { color: red; }")).toBe(0);
    expect(usesFocusRingToken(".x { outline: 2px solid blue; }")).toBe(false);
  });

  it("repo-grades.module.css defines at least one focus rule", () => {
    expect(focusRuleCount(gridCss)).toBeGreaterThan(0);
  });

  it("that focus rule uses the app's focus-ring token rather than a new colour", () => {
    expect(usesFocusRingToken(gridCss)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// U6.27 - a disabled action must look disabled.
//
// Every action in this view uses .linkButton, which sets an author `color`
// and has only a :hover rule. Because the colour is author-specified, the UA's
// GrayText default never applies, so a disabled "Post 0 grade(s)" and a
// disabled "Grade all" mid-run render pixel-identical to their enabled selves.
// That makes U5.22 - "disabled while it runs, and the disabled state says
// why" - unimplementable on this primitive.
// ---------------------------------------------------------------------------

function hasLinkButtonDisabledRule(css: string): boolean {
  return /\.linkButton[^{]*:disabled/.test(css);
}

describe("U6.27: the link-button primitive has a visible disabled state", () => {
  it("canary: the checker sees a disabled rule when present", () => {
    expect(hasLinkButtonDisabledRule(".linkButton:disabled { opacity: 0.55; cursor: default; }")).toBe(true);
    expect(hasLinkButtonDisabledRule(".linkButton:disabled,\n.other:disabled { opacity: .55 }")).toBe(true);
  });

  it("canary: a hover-only rule does not satisfy it", () => {
    expect(hasLinkButtonDisabledRule(".linkButton:hover { text-decoration: underline; }")).toBe(false);
  });

  it("a .linkButton:disabled rule exists in one of the two stylesheets that define it", () => {
    expect(hasLinkButtonDisabledRule(pageCss) || hasLinkButtonDisabledRule(gridCss)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// U9.36 - "Confirm binding" must not offer a candidate that would degrade the
// row.
//
// The behavioural rule is pinned by repoGradesBindingConfirm.test.ts, which is
// where the real coverage lives. This guard only pins that the component
// actually CONSULTS that module - the reachability half. A pure predicate that
// nothing calls is exactly the failure mode this project has been bitten by
// before: correct code, shipped dead.
// ---------------------------------------------------------------------------

function importsBindingConfirmGuard(source: string): boolean {
  return /from\s+"\.\/repoGradesBindingConfirm"/.test(source);
}

describe("U9.36: the confirm control consults the confirmable-candidate guard", () => {
  it("canary: the checker sees the import when present, and not otherwise", () => {
    expect(importsBindingConfirmGuard('import { isConfirmableCandidate } from "./repoGradesBindingConfirm";')).toBe(true);
    expect(importsBindingConfirmGuard('import { foo } from "./repoGradesRows";')).toBe(false);
  });

  it("RepoBindingControl.tsx imports the guard", () => {
    expect(importsBindingConfirmGuard(bindingControlSource)).toBe(true);
  });

  it("index.tsx imports the guard, so the batch confirm path is covered too (U9.37)", () => {
    expect(importsBindingConfirmGuard(indexSource)).toBe(true);
  });
});
