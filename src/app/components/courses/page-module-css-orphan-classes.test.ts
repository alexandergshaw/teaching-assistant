import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

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

/** Strips comments from component source, same conservative rule as the
 *  sibling guard: block comments anywhere, line comments only when `//`
 *  opens the line (after whitespace) so an accurate inline prose comment
 *  that happens to mention `styles.foo` (there are real examples of this in
 *  this tree - InSessionBanner.tsx, TasksTab.tsx) is not treated as a live
 *  reference, while a trailing `// styles.foo` after real code on the same
 *  line still counts real code that precedes it. */
function stripSourceComments(fileContent: string): string {
  return fileContent.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
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
const PINNED_ORPHAN_CEILING = 137;

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
