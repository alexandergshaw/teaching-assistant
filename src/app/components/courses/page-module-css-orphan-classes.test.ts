import { describe, it, expect, vi } from "vitest";

import fs from "fs";
import path from "path";
// A42: stripSourceComments (component .tsx/.jsx source, NOT the CSS-text
// stripping in extractDefinedClasses below, which is a separate, out-of-
// scope mechanism per A42's residual register) was a regex pair blind to a
// `/*` opened inside a string literal (e.g. accept="image/*") whose matching
// `*/` lies outside any string, later in the file - it deletes everything in
// between, including real `styles.<class>` references. Converted to import
// the string-aware tokenizer already proven for this exact defect (RULING
// 79, src/tools/strip-comments-agreement.structure.test.ts R1). This file
// never defined a probe-tracked `stripComments` (it is named
// stripSourceComments, invisible to that probe's name-based walk - A42
// scope section 1.1/R2), so no EXCLUSIONS move is needed here.
import { stripComments as tokenizerStripComments } from "@/app/components/ui/modalAdoptionSourceScan";

// L15: this file walks a real directory tree / reads many real files.
// vitest's 5000ms default testTimeout treats that as slow-but-fine when
// run alone, and as a false timeout under concurrent `npm test` load from
// sibling agents (measured: the slowest single top-level it() here runs
// well under 1s alone). Raised to the repo's existing slow-test
// convention of 30_000, already used by canvas-client-boundary.
// transitive.test.ts and runtime-import-graph.test.ts - this changes
// nothing about what any test asserts.
vi.setConfig({ testTimeout: 30_000 });

// Companion guard to page-module-css-classes.test.ts, which only checks one
// direction: every `styles.x` reference resolves to a real CSS class. That
// leaves the opposite direction unguarded - a class can lose its LAST
// reference and sit in the stylesheet looking maintained forever. That is
// not hypothetical: `.selectionAiButton` lost its `className` in commit
// 6c3729e and a live control rendered unstyled at the bottom of <body> while
// its rule sat in page.module.css looking current. Nothing caught it.
//
// A strict "no orphans" assertion cannot land here: a real scan of this tree
// today finds a three-figure number of classes with zero references (see the
// pinned literal below - measured directly by this file, not assumed). So
// this is a RATCHET, not a ban: it pins today's orphan count and only fails
// when the count RISES. It is free to fall - and when it does, the pinned
// literal must be lowered in the same change, which the failure message says
// explicitly so the fix is never "raise the number back up."
//
// Deliberately does NOT import helpers from page-module-css-classes.test.ts:
// importing another *.test.ts file re-runs its describe/it blocks inside
// this file's run, double-counting and double-reporting them. The small
// amount of parsing logic shared between the two files (comment stripping,
// selector-block class extraction, import resolution) is duplicated here on
// purpose - see docs/DEV_LOOP.md's note on cross-test-file imports.

const COMPONENTS_ROOT = path.resolve(process.cwd(), "src");
const DOCS_ORPHANS_PATH = path.resolve(process.cwd(), "docs/css-orphans.md");

// ---------------------------------------------------------------------------
// Stylesheet discovery (same walk as the sibling guard: every *.module.css
// under src/, skipping node_modules and dot-directories so the stale
// .claude/worktrees copy of this tree is never guarded as if it were live).
// ---------------------------------------------------------------------------
interface StylesheetTarget {
  cssPath: string;
  label: string;
}

function discoverStylesheets(rootDir: string): StylesheetTarget[] {
  const found: StylesheetTarget[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".module.css")) {
        found.push({ cssPath: full, label: path.relative(process.cwd(), full).split(path.sep).join("/") });
      }
    }
  };
  walk(rootDir);
  return found.sort((a, b) => a.label.localeCompare(b.label));
}

const STYLESHEETS: StylesheetTarget[] = discoverStylesheets(COMPONENTS_ROOT);

/** Strips CSS comments, then walks every "<selector text>{" block, pulling
 *  every ".className" token out of the selector text. Naturally descends
 *  into @media/@supports blocks since it only looks for the next run of
 *  non-brace text before the next "{", regardless of nesting depth. */
function extractDefinedClasses(cssText: string): Set<string> {
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const defined = new Set<string>();
  const selectorBlockRe = /([^{}]+)\{/g;
  let match: RegExpExecArray | null;
  while ((match = selectorBlockRe.exec(withoutComments)) !== null) {
    const classTokens = match[1].match(/\.[a-zA-Z_][\w-]*/g);
    if (classTokens) {
      for (const token of classTokens) defined.add(token.slice(1));
    }
  }
  return defined;
}

/**
 * A class named only inside `:global(...)` (e.g. `.cellMenu
 * :global(.MuiButtonBase-root):focus-visible`) escapes CSS Modules' scoping
 * on purpose, to target a class a third-party library (MUI) puts in the DOM
 * directly. It is not a CSS Modules export at all, so it structurally CANNOT
 * ever be reached via `styles.foo` - flagging it as an ordinary orphan
 * candidate would be actively wrong advice (delete it and the rule it
 * targets, e.g. a focus-visible ring, silently stops applying). Returns the
 * set of classes in `cssText` that appear ONLY inside `:global(...)` and
 * never as a bare local selector anywhere else in the same file.
 */
function extractGlobalOnlyClasses(cssText: string): Set<string> {
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const globalTokens = new Set<string>();
  const globalWrapperRe = /:global\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = globalWrapperRe.exec(withoutComments)) !== null) {
    const classTokens = match[1].match(/\.[a-zA-Z_][\w-]*/g);
    if (classTokens) {
      for (const token of classTokens) globalTokens.add(token.slice(1));
    }
  }
  if (globalTokens.size === 0) return globalTokens;
  const withoutGlobalWrappers = withoutComments.replace(globalWrapperRe, "");
  const localTokens = extractDefinedClasses(withoutGlobalWrappers);
  const globalOnly = new Set<string>();
  for (const token of globalTokens) {
    if (!localTokens.has(token)) globalOnly.add(token);
  }
  return globalOnly;
}

// ---------------------------------------------------------------------------
// Component discovery: every non-test .ts/.tsx/.js/.jsx importing at least
// one *.module.css file.
// ---------------------------------------------------------------------------
function findFilesImportingAnyStylesheet(rootDir: string): string[] {
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) {
        const content = fs.readFileSync(full, "utf-8");
        if (/\.module\.css["']/.test(content)) {
          results.push(full);
        }
      }
    }
  };
  walk(rootDir);
  return results;
}

interface StylesheetImport {
  localName: string;
  stylesheet: StylesheetTarget;
}

// Resolves each `import <localName> from "<specifier>.module.css"` to an
// absolute path and keeps only the ones that match a discovered stylesheet -
// keyed by resolved path, not by local binding name (a binding name like
// "tableStyles" is reused across files pointing at different stylesheets).
function findStylesheetImports(filePath: string, fileContent: string): StylesheetImport[] {
  const importRe = /import\s+(\w+)\s+from\s+["']([^"']+\.module\.css)["']/g;
  const found: StylesheetImport[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(fileContent)) !== null) {
    const [, localName, specifier] = match;
    const resolved = path.resolve(path.dirname(filePath), specifier);
    const stylesheet = STYLESHEETS.find((sheet) => sheet.cssPath.toLowerCase() === resolved.toLowerCase());
    if (stylesheet) found.push({ localName, stylesheet });
  }
  return found;
}

// Strips comments from component source. A42: delegates to the shared
// string-aware tokenizer (modalAdoptionSourceScan.ts) so a block-comment
// opener inside a string literal (e.g. a MIME wildcard attribute) is never
// treated as a comment opener - the old regex pair here was blind to that
// and deleted everything up to the next unrelated comment closer, including
// real styles.foo references. The tokenizer also strips a TRAILING line
// comment (not just a whole-line one), a broader but still-correct axis
// change measured benign for this tree (A42 test notes R4's semantic note:
// no trailing line-comment-after-code case exists in src/app today).
function stripSourceComments(fileContent: string): string {
  return tokenizerStripComments(fileContent);
}

interface ReferenceScanResult {
  /** Every class name reached via `localName.foo` or `localName["foo"]` /
   *  `localName['foo']` - i.e. every reference this static scan CAN resolve
   *  to a literal class name. */
  classNames: string[];
  /** Count of `localName[<something that is not a string literal>]` sites -
   *  computed/dynamic bracket access this scan cannot resolve to a literal
   *  name (e.g. `styles[variant]`, `` styles[`prefix-${x}`] ``). Any class
   *  reached ONLY this way looks orphaned to this scanner even though it is
   *  live - see the false-positive accounting in the "at least one" canary
   *  and in docs/css-orphans.md. */
  dynamicAccessSites: number;
}

function extractReferences(rawFileContent: string, localName: string): ReferenceScanResult {
  const fileContent = stripSourceComments(rawFileContent);
  const classNames: string[] = [];

  const dotRe = new RegExp(`(?<![\\w$])${localName}\\.([a-zA-Z_$][\\w$]*)`, "g");
  let match: RegExpExecArray | null;
  while ((match = dotRe.exec(fileContent)) !== null) classNames.push(match[1]);

  const bracketLiteralRe = new RegExp(`(?<![\\w$])${localName}\\[\\s*["']([a-zA-Z_$][\\w$-]*)["']\\s*\\]`, "g");
  while ((match = bracketLiteralRe.exec(fileContent)) !== null) classNames.push(match[1]);

  const bracketAnyRe = new RegExp(`(?<![\\w$])${localName}\\[`, "g");
  const bracketLiteralCount = (fileContent.match(bracketLiteralRe) ?? []).length;
  const totalBracketCount = (fileContent.match(bracketAnyRe) ?? []).length;
  const dynamicAccessSites = totalBracketCount - bracketLiteralCount;

  return { classNames, dynamicAccessSites };
}

// ---------------------------------------------------------------------------
// Build the picture: per stylesheet, which defined classes are referenced by
// AT LEAST ONE file whose import statement resolves to that stylesheet.
// ---------------------------------------------------------------------------
interface StylesheetOrphanReport {
  sheet: StylesheetTarget;
  definedCount: number;
  orphans: string[];
  /** Subset of `orphans` that are global-selector-only classes (see
   *  extractGlobalOnlyClasses) - structurally never reachable via JS, so
   *  these are not real dead-code candidates despite showing up as
   *  "unreferenced" by this scan's mechanical definition. */
  globalSelectorOrphans: string[];
}

const definedClassesByStylesheet = new Map<string, Set<string>>();
const globalOnlyClassesByStylesheet = new Map<string, Set<string>>();
for (const sheet of STYLESHEETS) {
  const cssText = fs.readFileSync(sheet.cssPath, "utf-8");
  definedClassesByStylesheet.set(sheet.cssPath, extractDefinedClasses(cssText));
  globalOnlyClassesByStylesheet.set(sheet.cssPath, extractGlobalOnlyClasses(cssText));
}

const IMPORTING_FILES = findFilesImportingAnyStylesheet(COMPONENTS_ROOT);

const referencedClassesByStylesheet = new Map<string, Set<string>>();
for (const sheet of STYLESHEETS) referencedClassesByStylesheet.set(sheet.cssPath, new Set());

let totalReferenceCount = 0;
let totalDynamicAccessSites = 0;
const dynamicAccessLocations: string[] = [];

for (const file of IMPORTING_FILES) {
  const content = fs.readFileSync(file, "utf-8");
  const imports = findStylesheetImports(file, content);
  if (imports.length === 0) continue;
  const relPath = path.relative(process.cwd(), file).split(path.sep).join("/");

  for (const imp of imports) {
    const { classNames, dynamicAccessSites } = extractReferences(content, imp.localName);
    const bucket = referencedClassesByStylesheet.get(imp.stylesheet.cssPath)!;
    for (const name of classNames) bucket.add(name);
    totalReferenceCount += classNames.length;
    if (dynamicAccessSites > 0) {
      totalDynamicAccessSites += dynamicAccessSites;
      dynamicAccessLocations.push(`${relPath}: ${imp.localName}[...] computed access x${dynamicAccessSites}`);
    }
  }
}

const orphanReports: StylesheetOrphanReport[] = STYLESHEETS.map((sheet) => {
  const defined = definedClassesByStylesheet.get(sheet.cssPath)!;
  const referenced = referencedClassesByStylesheet.get(sheet.cssPath)!;
  const globalOnly = globalOnlyClassesByStylesheet.get(sheet.cssPath)!;
  const orphans = [...defined].filter((c) => !referenced.has(c)).sort((a, b) => a.localeCompare(b));
  const globalSelectorOrphans = orphans.filter((c) => globalOnly.has(c));
  return { sheet, definedCount: defined.size, orphans, globalSelectorOrphans };
});

const totalGlobalSelectorOrphanCount = orphanReports.reduce((sum, r) => sum + r.globalSelectorOrphans.length, 0);

const totalDefinedCount = orphanReports.reduce((sum, r) => sum + r.definedCount, 0);
const totalOrphanCount = orphanReports.reduce((sum, r) => sum + r.orphans.length, 0);

// ---------------------------------------------------------------------------
// PINNED RATCHET. Measured directly against this tree by running this file -
// see the report at the bottom of this comment block for how it was
// produced. Only ever move this DOWN, in the same change that removes or
// wires up the classes that dropped the count, and only after confirming via
// docs/css-orphans.md (and eyes on the actual component) that removal is
// safe - dynamic/computed class access (styles[variant], template-literal
// keys) is invisible to this scanner, so an orphan here is a CANDIDATE, not
// a verdict.
// ---------------------------------------------------------------------------
// Lowered 137 -> 120 on 2026-09-06 by the multi-user account surface work.
// Nothing was deleted to achieve this: the count fell because the new
// /account index page and the owner-aware navigation entry began USING
// classes in security.module.css and TopBar.module.css that had been defined
// but unreferenced. That is the direction this ratchet exists to capture, so
// the pin follows it down in the same change, as the failure message demands.
//
// Lowered 120 -> 118 on A42 (MIME-wildcard block-comment stripper fix,
// src/tools/strip-comments-agreement.structure.test.ts R1/R4). Nothing was
// deleted here either: stripSourceComments switched from a regex pair blind
// to a `/*` opened inside a string literal (accept="image/*") to the
// string-aware tokenizer, which stops deleting the real code between that
// `/*` and the next unrelated `*/` in SpeedPanel.tsx. Two references to
// src/app/page.module.css classes (courseRepoRow, page) that were silently
// swallowed by the old stripper are now correctly counted as referenced,
// recovering exactly those two from the orphan list - measured via the
// EXPECTED_RECOVERED oracle below, which is the carve-out that distinguishes
// this INTENDED recovery from an unintended loss.
const PINNED_ORPHAN_CEILING = 118;

// A42 R4: the frozen, measured delta this conversion is expected to produce -
// distinguishes an intended reference recovery (this) from an unintended
// loss (a real reference the tokenizer newly fails to see, which would show
// up as a NEW orphan, never as a recovered one). Measured 2026-09-29 by
// running this file's own computation under the pre-A42 buggy
// stripSourceComments and under the tokenizer: the only stylesheet whose
// orphan set changed is src/app/page.module.css, and the only two classes
// removed from it were courseRepoRow and page - no sheet gained a member.
const EXPECTED_RECOVERED: Readonly<Record<string, readonly string[]>> = {
  "src/app/page.module.css": ["courseRepoRow", "page"],
};

// A42 R4: the pre-A42 buggy stripSourceComments, reproduced here ONLY to
// recompute "what the orphan sets looked like before this fix" for the
// carve-out oracle below - never reused as this file's real stripper.
function preA42BuggyStripSourceComments(fileContent: string): string {
  return fileContent.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

function extractClassNamesWith(stripper: (s: string) => string, rawFileContent: string, localName: string): string[] {
  const fileContent = stripper(rawFileContent);
  const classNames: string[] = [];
  const dotRe = new RegExp(`(?<![\\w$])${localName}\\.([a-zA-Z_$][\\w$]*)`, "g");
  let match: RegExpExecArray | null;
  while ((match = dotRe.exec(fileContent)) !== null) classNames.push(match[1]);
  const bracketLiteralRe = new RegExp(`(?<![\\w$])${localName}\\[\\s*["']([a-zA-Z_$][\\w$-]*)["']\\s*\\]`, "g");
  while ((match = bracketLiteralRe.exec(fileContent)) !== null) classNames.push(match[1]);
  return classNames;
}

/** Recomputes, per stylesheet, the set of referenced classes under a given
 *  stripper - used to build the OLD (pre-A42) orphan picture for comparison
 *  against the CURRENT (post-A42) orphanReports above, without recomputing
 *  the current picture from the same function (which would be a tautology -
 *  refactor-disarms-tests, docs/loop/traps-tests.md). */
function referencedClassesUnder(stripper: (s: string) => string): Map<string, Set<string>> {
  const referenced = new Map<string, Set<string>>();
  for (const sheet of STYLESHEETS) referenced.set(sheet.cssPath, new Set());
  for (const file of IMPORTING_FILES) {
    const content = fs.readFileSync(file, "utf-8");
    const imports = findStylesheetImports(file, content);
    for (const imp of imports) {
      const bucket = referenced.get(imp.stylesheet.cssPath)!;
      for (const name of extractClassNamesWith(stripper, content, imp.localName)) bucket.add(name);
    }
  }
  return referenced;
}

function orphansUnder(referenced: Map<string, Set<string>>): Map<string, Set<string>> {
  const orphans = new Map<string, Set<string>>();
  for (const sheet of STYLESHEETS) {
    const defined = definedClassesByStylesheet.get(sheet.cssPath)!;
    const refs = referenced.get(sheet.cssPath)!;
    orphans.set(sheet.cssPath, new Set([...defined].filter((c) => !refs.has(c))));
  }
  return orphans;
}

function formatOrphanReport(): string {
  const lines: string[] = [];
  for (const r of orphanReports) {
    if (r.orphans.length === 0) continue;
    lines.push(`  ${r.sheet.label} (${r.orphans.length} orphan(s) of ${r.definedCount} defined):`);
    for (const name of r.orphans) lines.push(`    .${name}`);
  }
  return lines.join("\n");
}

describe("CSS Module orphan-class ratchet (every *.module.css under src/)", () => {
  it("canary: discovery finds a substantial number of stylesheets and importing files (an empty or truncated scan would report zero orphans without checking anything)", () => {
    expect(STYLESHEETS.length).toBeGreaterThan(10);
    expect(IMPORTING_FILES.length).toBeGreaterThan(50);
  });

  it("canary: extraction actually finds defined classes across the tree (a broken selector regex must not silently report zero classes, which would make every class trivially 'orphaned' or - worse - report zero because the defined set is also empty)", () => {
    expect(totalDefinedCount).toBeGreaterThan(500);
  });

  it("canary: extraction actually finds live references across the tree - THE single most important assertion in this file. A broken reference regex reports zero references, which makes every defined class look orphaned OR (if the orphan side breaks too) reports zero orphans and passes forever. Both failure modes are caught by pinning a real lower bound here.", () => {
    expect(totalReferenceCount).toBeGreaterThan(1000);
  });

  it("canary: a known-live class is not reported as orphaned (sanity check on the reference side)", () => {
    const pageSheet = orphanReports.find((r) => r.sheet.label === "src/app/page.module.css");
    expect(pageSheet).toBeDefined();
    expect(pageSheet!.orphans).not.toContain("linkButton");
  });

  it("canary: a class defined only inside :global(...) is flagged as a global-selector orphan, not silently missed by the detector (CoursesTable.module.css and DiscussionRepliesPanel.module.css both target MUI's real .MuiButtonBase-root via :global() on purpose - see the doc comment on extractGlobalOnlyClasses)", () => {
    expect(totalGlobalSelectorOrphanCount).toBeGreaterThanOrEqual(2);
    const coursesTableSheet = orphanReports.find((r) => r.sheet.label === "src/app/components/courses/CoursesTable.module.css");
    expect(coursesTableSheet?.globalSelectorOrphans).toContain("MuiButtonBase-root");
  });

  it("canary: a class that is not defined anywhere is never reported as an orphan of a stylesheet it does not belong to (sanity check on the defined side)", () => {
    const pageSheet = orphanReports.find((r) => r.sheet.label === "src/app/page.module.css");
    expect(pageSheet).toBeDefined();
    expect(pageSheet!.orphans).not.toContain("thisClassNameHasNeverExistedAnywhere");
  });

  it(`orphan count stays at or below the pinned ratchet of ${PINNED_ORPHAN_CEILING} (measured ${totalOrphanCount} of ${totalDefinedCount} defined classes across ${STYLESHEETS.length} stylesheets)`, () => {
    const message =
      totalOrphanCount > PINNED_ORPHAN_CEILING
        ? `Orphan count ROSE from the pinned ceiling of ${PINNED_ORPHAN_CEILING} to ${totalOrphanCount}. ` +
          `This ratchet only tightens - either restore the missing className reference(s) below, or (if the ` +
          `class is genuinely dead) delete it from its stylesheet and lower PINNED_ORPHAN_CEILING in the same ` +
          `change. Do NOT raise PINNED_ORPHAN_CEILING to make this pass; that defeats the point of a ratchet.\n` +
          formatOrphanReport()
        : totalOrphanCount < PINNED_ORPHAN_CEILING
          ? `Orphan count FELL from the pinned ceiling of ${PINNED_ORPHAN_CEILING} to ${totalOrphanCount} - ` +
            `lower PINNED_ORPHAN_CEILING to ${totalOrphanCount} in this same change so the ratchet actually tightens.`
          : "";
    expect(totalOrphanCount, message).toBeLessThanOrEqual(PINNED_ORPHAN_CEILING);
    // A regression in the other direction - the pinned literal drifting stale
    // above the true count without anyone noticing - is exactly as much of a
    // silent failure as a rise. Fail loudly on drift too, with the same
    // "lower it" message, rather than only warning.
    expect(totalOrphanCount, message).toBe(PINNED_ORPHAN_CEILING);
  });

  it("A42 R4: the orphan delta from the stripSourceComments fix is EXACTLY the expected recovery - no sheet gains a newly-orphaned member, and no more than the expected set is recovered", () => {
    const oldOrphans = orphansUnder(referencedClassesUnder(preA42BuggyStripSourceComments));
    const newOrphans = orphansUnder(referencedClassesUnder(tokenizerStripComments));

    for (const sheet of STYLESHEETS) {
      const before = oldOrphans.get(sheet.cssPath)!;
      const after = newOrphans.get(sheet.cssPath)!;
      const gained = [...after].filter((c) => !before.has(c));
      expect(gained, `${sheet.label} gained a newly-orphaned class after the stripper fix - an unintended loss`).toEqual([]);

      const recovered = [...before].filter((c) => !after.has(c)).sort();
      const expected = [...(EXPECTED_RECOVERED[sheet.label] ?? [])].sort();
      expect(recovered, `${sheet.label} recovered a different set than expected`).toEqual(expected);
    }

    const totalRecoveredCount = Object.values(EXPECTED_RECOVERED).reduce((sum, names) => sum + names.length, 0);
    expect(totalOrphanCount).toBe(PINNED_ORPHAN_CEILING);
    expect(PINNED_ORPHAN_CEILING).toBe(120 - totalRecoveredCount);
  });

  it("writes the categorised orphan candidate list to docs/css-orphans.md, with an honest caveat about dynamic access", () => {
    const generatedAt = new Date().toISOString().slice(0, 10);
    const lines: string[] = [];
    lines.push("# CSS Module orphan-class candidates");
    lines.push("");
    lines.push(
      `Generated by src/app/components/courses/page-module-css-orphan-classes.test.ts on ${generatedAt}. ` +
        "Re-running the test regenerates this file, so it always reflects the current tree."
    );
    lines.push("");
    lines.push(
      "These are CANDIDATES identified by a static text scan (every `.class` defined in a `*.module.css` file " +
        "with zero `localName.class` or `localName[\"class\"]` reference in any file that imports that same " +
        "stylesheet), not a verdict. No test in this repo renders a component, so nothing here proves a class " +
        "is safe to delete - each one needs eyes (and ideally a look at the live page) before removal."
    );
    lines.push("");
    lines.push(
      `**Dynamic access caveat:** this scan cannot resolve computed class access - \`styles[variant]\`, ` +
        "template-literal keys, or any `classnames`/`clsx`-style helper receiving a variable - to a literal " +
        `class name. As of this run the tree has ${totalDynamicAccessSites} such computed bracket-access site(s):`
    );
    lines.push("");
    if (dynamicAccessLocations.length === 0) {
      lines.push("- none found in this run.");
    } else {
      for (const loc of dynamicAccessLocations) lines.push(`- ${loc}`);
    }
    lines.push("");
    lines.push(
      totalDynamicAccessSites === 0
        ? "Since no dynamic access sites exist right now, none of the classes below are false positives for " +
            "that reason specifically - but the caveat still applies to any future dynamic access added after " +
            "this file was generated."
        : `${totalDynamicAccessSites} computed access site(s) exist. Every one was checked by hand at authoring ` +
            "time: each resolves to a small closed set of literal variant names (e.g. ghBadgeSuccess / " +
            "ghBadgeWarning / ghBadgeDanger / ghBadgeNeutral) that are ALSO referenced with plain dot-notation " +
            "elsewhere in files importing the same stylesheet, so today they contribute zero false positives to " +
            "the list below. That will not automatically stay true - re-check by hand whenever this number " +
            "changes, rather than trusting the list blindly."
    );
    lines.push("");
    lines.push(
      `**Global-selector caveat:** ${totalGlobalSelectorOrphanCount} of the orphan(s) below are classes referenced ` +
        "only inside a `:global(...)` wrapper (e.g. `.cellMenu :global(.MuiButtonBase-root):focus-visible`), used " +
        "to target a class a third-party library (MUI) puts directly in the DOM. These are NOT CSS Modules " +
        "exports - they structurally cannot be reached via `styles.foo` and are not dead code; they are marked " +
        "`(global selector, not a JS-reachable export)` below instead of being ordinary deletion candidates."
    );
    lines.push("");
    lines.push(`Total: ${totalOrphanCount} orphan candidate(s) of ${totalDefinedCount} defined classes across ${STYLESHEETS.length} stylesheets (of which ${totalGlobalSelectorOrphanCount} are the global-selector case above, not real dead-code candidates).`);
    lines.push("");

    for (const r of orphanReports) {
      if (r.orphans.length === 0) continue;
      lines.push(`## ${r.sheet.label}`);
      lines.push("");
      lines.push(`${r.orphans.length} orphan candidate(s) of ${r.definedCount} defined classes.`);
      lines.push("");
      for (const name of r.orphans) {
        const note = r.globalSelectorOrphans.includes(name) ? " (global selector, not a JS-reachable export - see caveat above)" : "";
        lines.push(`- \`.${name}\`${note}`);
      }
      lines.push("");
    }

    const content = lines.join("\n");
    fs.mkdirSync(path.dirname(DOCS_ORPHANS_PATH), { recursive: true });
    fs.writeFileSync(DOCS_ORPHANS_PATH, content, "utf-8");

    expect(fs.existsSync(DOCS_ORPHANS_PATH)).toBe(true);
  });
});
