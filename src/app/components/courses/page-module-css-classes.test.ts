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

interface StylesheetTarget {
  cssPath: string;
  label: string;
}

const STYLESHEETS: StylesheetTarget[] = [
  {
    cssPath: path.resolve(process.cwd(), "src/app/page.module.css"),
    label: "src/app/page.module.css",
  },
  {
    cssPath: path.resolve(process.cwd(), "src/app/components/courses/CoursesTable.module.css"),
    label: "src/app/components/courses/CoursesTable.module.css",
  },
];

const COMPONENTS_ROOT = path.resolve(process.cwd(), "src");

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

// Extracts every `<localName>.<className>` reference for one specific local
// binding. Guarded with a negative lookbehind so a binding named "styles"
// cannot be matched inside a longer identifier like "tableStyles" or
// "myStyles" - only an exact, standalone identifier followed by "." counts.
function extractReferences(fileContent: string, localName: string): string[] {
  const refRe = new RegExp(`(?<![\\w$])${localName}\\.([a-zA-Z_$][\\w$]*)`, "g");
  const classNames: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = refRe.exec(fileContent)) !== null) {
    classNames.push(match[1]);
  }
  return classNames;
}

describe("CSS Module class usage guard (page.module.css and CoursesTable.module.css)", () => {
  const definedClassesByStylesheet = new Map<string, Set<string>>();
  for (const sheet of STYLESHEETS) {
    definedClassesByStylesheet.set(sheet.cssPath, extractDefinedClasses(fs.readFileSync(sheet.cssPath, "utf-8")));
  }

  it("canary: extraction actually finds classes defined in page.module.css (a broken regex must not silently report clean)", () => {
    // These are known-good, currently-defined classes (verified via direct
    // grep against page.module.css). If this fails, the extraction regex
    // itself is broken, not the stylesheet.
    const defined = definedClassesByStylesheet.get(STYLESHEETS[0].cssPath)!;
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
    const defined = definedClassesByStylesheet.get(STYLESHEETS[1].cssPath)!;
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

  it("canary: a file that binds 'tableStyles' to a DIFFERENT stylesheet is not matched against CoursesTable.module.css (binding names are not globally unique)", () => {
    const modalPath = path.resolve(process.cwd(), "src/app/components/courses/WeeklyChecklistOverviewModal.tsx");
    const content = fs.readFileSync(modalPath, "utf-8");
    const imports = findStylesheetImports(modalPath, content);
    // This file imports styles from page.module.css (a guarded stylesheet)
    // and tableStyles from WeeklyChecklistOverviewModal.module.css (NOT a
    // guarded stylesheet). Only the page.module.css import should resolve.
    expect(imports.length).toBe(1);
    expect(imports[0].localName).toBe("styles");
    expect(imports[0].stylesheet.label).toBe("src/app/page.module.css");
  });

  it("every <localName>.<className> reference in every component importing page.module.css or CoursesTable.module.css resolves to a class actually defined in the stylesheet ITS import statement points at", () => {
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
