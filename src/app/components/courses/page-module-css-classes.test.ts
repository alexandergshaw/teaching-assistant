import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Guard against the Castletop popover defect: CastletopCell.tsx referenced four
// CSS Module classes (courseResourceList, courseResourceListItem,
// courseResourceListItemName, courseResourceListItemActions) that were never
// defined in page.module.css. CSS Modules silently resolve an unknown key to
// `undefined`, so the elements rendered with no className at all - no visible
// error, no styling. This test reads a CSS Module file as text, extracts
// every class it defines, then reads every component that imports it and
// extracts every `<localName>.<className>` reference, asserting each
// referenced class actually exists in the stylesheet.
//
// Covers two stylesheets: src/app/page.module.css (local binding usually
// "styles") and src/app/components/courses/CoursesTable.module.css (local
// binding usually "tableStyles"). Several files - CourseRow.tsx, RosterCell
// .tsx, EditableCell.tsx, StudentRepoRoster.tsx and other cell components -
// import BOTH in the same file, so a reference can only be checked correctly
// if it is matched against the stylesheet its OWN import statement actually
// points at, not against whichever stylesheet happens to be checked first or
// against the union of both. The local binding name alone is not a reliable
// key either: WeeklyChecklistOverviewModal.tsx also binds a css module to the
// name "tableStyles", but that import points at
// WeeklyChecklistOverviewModal.module.css, a third file this test does not
// guard - so a naive "the identifier is called tableStyles, therefore check
// it against CoursesTable.module.css" rule would silently validate
// WeeklyChecklistOverviewModal.tsx's references against the wrong stylesheet.
// Every import is therefore resolved to an absolute path and matched against
// the stylesheets below by path, not by binding name.

// 2026-09-01, the aesthetics pass: this guard now covers EVERY *.module.css
// in the repo, not the four listed below.
//
// The four were hand-picked as they were bitten. That is the wrong shape for
// a guard whose whole subject is a silent failure: during this pass a
// generalized scan found 310 component-to-stylesheet import pairs across the
// tree, of which these four covered a fraction - and the defect fired again
// this same session (`CoursesTable.tsx` referencing `tableStyles.rowMd`,
// caught only because CoursesTable.module.css happened to be one of the four).
// Discovery below walks src/ for every module stylesheet, so a stylesheet
// added tomorrow is guarded the day it appears rather than the day it breaks.
//
// The four remain named as REQUIRED_STYLESHEETS: discovery returning an empty
// or truncated list is exactly the "scanner that matched nothing" failure
// docs/DEV_LOOP.md catalogues, and asserting these are present is what makes
// that visible instead of green.
interface StylesheetTarget {
  cssPath: string;
  label: string;
}

const REQUIRED_STYLESHEETS: StylesheetTarget[] = [
  {
    cssPath: path.resolve(process.cwd(), "src/app/page.module.css"),
    label: "src/app/page.module.css",
  },
  {
    cssPath: path.resolve(process.cwd(), "src/app/components/courses/CoursesTable.module.css"),
    label: "src/app/components/courses/CoursesTable.module.css",
  },
  {
    // Set D's DiscussionRepliesPanel reuses this table skin (per
    // docs/discussion-reply-capture-acceptance-criteria.md section 6), so its
    // references are checked against the real stylesheet the same way the
    // other two are.
    cssPath: path.resolve(process.cwd(), "src/app/components/workflows/AutomationsTable.module.css"),
    label: "src/app/components/workflows/AutomationsTable.module.css",
  },
  {
    // The Discussion replies panel's OWN stylesheet, which was unguarded until
    // now: a CSS Module resolves an unknown key to `undefined` silently, so a
    // typo renders the element unstyled with no error anywhere - the exact
    // defect this whole test exists for. It is guarded here before the layout
    // work adds roughly ten more classes to that file.
    cssPath: path.resolve(process.cwd(), "src/app/components/recording/DiscussionRepliesPanel.module.css"),
    label: "src/app/components/recording/DiscussionRepliesPanel.module.css",
  },
];

const COMPONENTS_ROOT = path.resolve(process.cwd(), "src");

/** Every *.module.css under src/, as a guarded target. */
function discoverStylesheets(rootDir: string): StylesheetTarget[] {
  const found: StylesheetTarget[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // Skipping dot-directories also skips .claude/worktrees, whose stale
      // copies of this tree would otherwise be guarded as if they were live.
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

function extractDefinedClasses(cssText: string): Set<string> {
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const defined = new Set<string>();
  // Walk every "<selector text>{" block. This also naturally descends into
  // @media/@supports blocks, since the regex just looks for the next run of
  // non-brace text before the next "{", regardless of nesting depth.
  const selectorBlockRe = /([^{}]+)\{/g;
  let match: RegExpExecArray | null;
  while ((match = selectorBlockRe.exec(withoutComments)) !== null) {
    const selectorText = match[1];
    const classTokens = selectorText.match(/\.[a-zA-Z_][\w-]*/g);
    if (classTokens) {
      for (const token of classTokens) defined.add(token.slice(1));
    }
  }
  return defined;
}

interface StylesheetImport {
  localName: string;
  stylesheet: StylesheetTarget;
}

// Parses every `import <localName> from "<specifier>"` in a file that targets
// a *.module.css file, resolves the specifier relative to the importing
// file's own directory (robust regardless of how deep the importer lives),
// and keeps only the ones whose resolved absolute path matches one of
// STYLESHEETS. This is the piece that must key off the actual import target,
// not the local binding name - see the block comment above.
function findStylesheetImports(filePath: string, fileContent: string): StylesheetImport[] {
  const importRe = /import\s+(\w+)\s+from\s+["']([^"']+\.module\.css)["']/g;
  const found: StylesheetImport[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(fileContent)) !== null) {
    const [, localName, specifier] = match;
    const resolved = path.resolve(path.dirname(filePath), specifier);
    const stylesheet = STYLESHEETS.find(
      (sheet) => sheet.cssPath.toLowerCase() === resolved.toLowerCase()
    );
    if (stylesheet) found.push({ localName, stylesheet });
  }
  return found;
}

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
        // Cheap prefilter (any *.module.css import at all); the precise
        // per-import path resolution happens in findStylesheetImports.
        if (/\.module\.css["']/.test(content)) {
          results.push(full);
        }
      }
    }
  };
  walk(rootDir);
  return results;
}

/**
 * Removes comments from component source so a reference written INSIDE one is
 * not counted as a live reference.
 *
 * Found the moment this guard was generalized beyond its original four
 * stylesheets (2026-09-01): it reported two failures, and both were prose.
 * `InSessionBanner.tsx:280` explains a landmark decision with
 * "TopBar.tsx already renders its OWN <nav className={styles.actions}>", and
 * `TasksTab.tsx:683` cites "WorkflowsPanel's existing inner-tab treatment
 * (styles.lessonInnerTab)" while the code itself correctly uses
 * `pageStyles.lessonInnerTab`. Neither is a defect. A guard that goes red on
 * an accurate comment teaches people to delete comments, or worse, to add a
 * dead CSS class to silence it.
 *
 * Line comments are stripped only when `//` opens the line (after whitespace).
 * That is deliberately conservative: a trailing `// styles.foo` after real
 * code is still counted, but stripping every `//` would also eat the `//` in a
 * "https://" inside a string or JSX text and could hide a real reference on
 * the same line. No trailing-comment case exists in the tree today; if one
 * appears, widen this with a canary rather than by loosening the regex.
 */
function stripSourceComments(fileContent: string): string {
  return fileContent.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

// Extracts every `<localName>.<className>` reference for one specific local
// binding. Guarded with a negative lookbehind so a binding named "styles"
// cannot be matched inside a longer identifier like "tableStyles" or
// "myStyles" - only an exact, standalone identifier followed by "." counts.
function extractReferences(rawFileContent: string, localName: string): string[] {
  const fileContent = stripSourceComments(rawFileContent);
  const refRe = new RegExp(`(?<![\\w$])${localName}\\.([a-zA-Z_$][\\w$]*)`, "g");
  const classNames: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = refRe.exec(fileContent)) !== null) {
    classNames.push(match[1]);
  }
  return classNames;
}

describe("CSS Module class usage guard (every *.module.css under src/)", () => {
  const definedClassesByStylesheet = new Map<string, Set<string>>();
  for (const sheet of STYLESHEETS) {
    definedClassesByStylesheet.set(sheet.cssPath, extractDefinedClasses(fs.readFileSync(sheet.cssPath, "utf-8")));
  }

  const sheetByLabel = (label: string): StylesheetTarget => {
    const found = STYLESHEETS.find((s) => s.label === label);
    if (!found) throw new Error(`discovery did not find ${label}`);
    return found;
  };

  it("canary: discovery finds every module stylesheet, including the four this guard originally hard-coded (an empty or truncated list would report clean without checking anything)", () => {
    // A generalized scan of the tree on 2026-09-01 found 20-plus module
    // stylesheets and 310 import pairs. A lower bound well under that catches
    // discovery silently returning almost nothing, without going red every
    // time a stylesheet is legitimately added or removed.
    expect(STYLESHEETS.length).toBeGreaterThan(10);
    for (const required of REQUIRED_STYLESHEETS) {
      expect(STYLESHEETS.map((s) => s.label)).toContain(required.label);
    }
    // Every discovered sheet must actually have been read and parsed - a path
    // that resolves to nothing would otherwise sit in the list contributing
    // an empty class set, which makes every reference to it a false failure.
    for (const sheet of STYLESHEETS) {
      expect(definedClassesByStylesheet.has(sheet.cssPath)).toBe(true);
    }
  });

  it("canary: extraction actually finds classes defined in page.module.css (a broken regex must not silently report clean)", () => {
    // These are known-good, currently-defined classes (verified via direct
    // grep against page.module.css). If this fails, the extraction regex
    // itself is broken, not the stylesheet.
    const defined = definedClassesByStylesheet.get(sheetByLabel("src/app/page.module.css").cssPath)!;
    expect(defined.size).toBeGreaterThan(50);
    expect(defined.has("courseResourceValue")).toBe(true);
    expect(defined.has("linkButton")).toBe(true);
    expect(defined.has("courseResourceHead")).toBe(true);
    expect(defined.has("courseResourceLabel")).toBe(true);
    // Sanity: a class that has never existed in the stylesheet must not
    // spuriously appear (guards the regex against over-matching too).
    expect(defined.has("courseResourceList")).toBe(false);
  });

  it("canary: extraction actually finds classes defined in CoursesTable.module.css (a broken regex must not silently report clean)", () => {
    // Verified via direct read of CoursesTable.module.css.
    const defined = definedClassesByStylesheet.get(
      sheetByLabel("src/app/components/courses/CoursesTable.module.css").cssPath
    )!;
    expect(defined.size).toBeGreaterThan(10);
    expect(defined.has("scroller")).toBe(true);
    expect(defined.has("actionBar")).toBe(true);
    expect(defined.has("cellMenu")).toBe(true);
    expect(defined.has("stickyName")).toBe(true);
    // Sanity: page.module.css classes must not leak in as if CoursesTable
    // .module.css defined them too.
    expect(defined.has("courseResourceValue")).toBe(false);
  });

  it("canary: reference extraction finds both styles.<name> and tableStyles.<name> usages in a file that imports both, each keyed to its own stylesheet", () => {
    const editableCellPath = path.resolve(process.cwd(), "src/app/components/courses/EditableCell.tsx");
    const content = fs.readFileSync(editableCellPath, "utf-8");
    const imports = findStylesheetImports(editableCellPath, content);
    expect(imports.length).toBe(2);

    const styleImport = imports.find((i) => i.stylesheet.label === "src/app/page.module.css");
    const tableImport = imports.find(
      (i) => i.stylesheet.label === "src/app/components/courses/CoursesTable.module.css"
    );
    expect(styleImport?.localName).toBe("styles");
    expect(tableImport?.localName).toBe("tableStyles");

    const styleRefs = extractReferences(content, styleImport!.localName);
    const tableRefs = extractReferences(content, tableImport!.localName);
    expect(styleRefs.length).toBeGreaterThan(0);
    expect(tableRefs.length).toBeGreaterThan(0);
  });

  it("canary: a file that binds 'tableStyles' to a DIFFERENT stylesheet is matched against THAT stylesheet, not against CoursesTable.module.css (binding names are not globally unique)", () => {
    const modalPath = path.resolve(process.cwd(), "src/app/components/courses/WeeklyChecklistOverviewModal.tsx");
    const content = fs.readFileSync(modalPath, "utf-8");
    const imports = findStylesheetImports(modalPath, content);
    // This file binds `styles` to page.module.css and `tableStyles` to
    // WeeklyChecklistOverviewModal.module.css. Before discovery was
    // generalized only the first resolved, and this canary asserted the
    // second was IGNORED. Now both are guarded, and the property that
    // actually matters is that `tableStyles` here keys to this file's own
    // stylesheet rather than to CoursesTable.module.css, which binds the
    // same name elsewhere. Matching by resolved path is what makes that
    // true; matching by binding name would silently validate these
    // references against the wrong sheet.
    expect(imports.length).toBe(2);
    const styleImport = imports.find((i) => i.localName === "styles");
    const tableImport = imports.find((i) => i.localName === "tableStyles");
    expect(styleImport?.stylesheet.label).toBe("src/app/page.module.css");
    expect(tableImport?.stylesheet.label).toBe(
      "src/app/components/courses/WeeklyChecklistOverviewModal.module.css"
    );
  });

  it("canary: a class reference written inside a comment is not counted, but real code on the surrounding lines still is", () => {
    const source = [
      "// TopBar.tsx already renders its OWN <nav className={styles.inAComment}>",
      "  // (styles.alsoInAComment) explaining a decision",
      "/* styles.inABlockComment */",
      "const a = styles.realOne;",
      "return <div className={styles.realTwo} />; ",
    ].join("\n");
    const refs = extractReferences(source, "styles");
    expect(refs).toContain("realOne");
    expect(refs).toContain("realTwo");
    expect(refs).not.toContain("inAComment");
    expect(refs).not.toContain("alsoInAComment");
    expect(refs).not.toContain("inABlockComment");
  });

  it("canary (present-but-wrong): stripping comments must not swallow the code that follows a block comment on the same line", () => {
    const refs = extractReferences("/* note */ const a = styles.survivor;", "styles");
    expect(refs).toEqual(["survivor"]);
  });

  it("every <localName>.<className> reference in every component importing any *.module.css resolves to a class actually defined in the stylesheet ITS import statement points at", () => {
    const files = findFilesImportingAnyStylesheet(COMPONENTS_ROOT);
    expect(files.length).toBeGreaterThan(50);

    const failures: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const imports = findStylesheetImports(file, content);
      if (imports.length === 0) continue;
      const relPath = path.relative(process.cwd(), file);

      for (const imp of imports) {
        const definedClasses = definedClassesByStylesheet.get(imp.stylesheet.cssPath)!;
        const classNames = extractReferences(content, imp.localName);
        for (const className of classNames) {
          if (!definedClasses.has(className)) {
            failures.push(
              `${relPath}: ${imp.localName}.${className} - no ".${className}" class is defined in ${imp.stylesheet.label}`
            );
          }
        }
      }
    }

    expect(failures, `Found ${failures.length} reference(s) to undefined CSS Module class(es):\n${failures.join("\n")}`).toEqual([]);
  });
});
