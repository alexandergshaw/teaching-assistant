import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Guard against the Castletop popover defect: CastletopCell.tsx referenced four
// CSS Module classes (courseResourceList, courseResourceListItem,
// courseResourceListItemName, courseResourceListItemActions) that were never
// defined in page.module.css. CSS Modules silently resolve an unknown key to
// `undefined`, so the elements rendered with no className at all - no visible
// error, no styling. This test reads page.module.css as text, extracts every
// class it defines, then reads every component that imports that stylesheet
// and extracts every `<localName>.<className>` reference, asserting each
// referenced class actually exists in the stylesheet.

const CSS_PATH = path.resolve(process.cwd(), "src/app/page.module.css");
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

function findFilesImportingPageModuleCss(rootDir: string): string[] {
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) {
        const content = fs.readFileSync(full, "utf-8");
        if (/from\s+["'][^"']*page\.module\.css["']/.test(content)) {
          results.push(full);
        }
      }
    }
  };
  walk(rootDir);
  return results;
}

function extractStylesReferences(fileContent: string): { localName: string; classNames: string[] } | null {
  const importMatch = fileContent.match(/import\s+(\w+)\s+from\s+["'][^"']*page\.module\.css["']/);
  if (!importMatch) return null;
  const localName = importMatch[1];
  const refRe = new RegExp(`${localName}\\.([a-zA-Z_$][\\w$]*)`, "g");
  const classNames: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = refRe.exec(fileContent)) !== null) {
    classNames.push(match[1]);
  }
  return { localName, classNames };
}

describe("page.module.css class usage guard", () => {
  const cssText = fs.readFileSync(CSS_PATH, "utf-8");
  const definedClasses = extractDefinedClasses(cssText);

  it("canary: extraction actually finds classes defined in page.module.css (a broken regex must not silently report clean)", () => {
    // These are known-good, currently-defined classes (verified via direct
    // grep against page.module.css). If this fails, the extraction regex
    // itself is broken, not the stylesheet.
    expect(definedClasses.size).toBeGreaterThan(50);
    expect(definedClasses.has("courseResourceValue")).toBe(true);
    expect(definedClasses.has("linkButton")).toBe(true);
    expect(definedClasses.has("courseResourceHead")).toBe(true);
    expect(definedClasses.has("courseResourceLabel")).toBe(true);
    // Sanity: a class that has never existed in the stylesheet must not
    // spuriously appear (guards the regex against over-matching too).
    expect(definedClasses.has("courseResourceList")).toBe(false);
  });

  it("canary: reference extraction actually finds styles.<name> usages in a known file (a broken regex must not silently report clean)", () => {
    const castletopPath = path.resolve(process.cwd(), "src/app/components/courses/CastletopCell.tsx");
    const content = fs.readFileSync(castletopPath, "utf-8");
    const refs = extractStylesReferences(content);
    expect(refs).not.toBeNull();
    expect(refs!.localName).toBe("styles");
    expect(refs!.classNames.length).toBeGreaterThan(0);
    expect(refs!.classNames).toContain("courseResourceValue");
  });

  it("every styles.<className> reference in every component importing page.module.css resolves to a class actually defined there", () => {
    const files = findFilesImportingPageModuleCss(COMPONENTS_ROOT);
    expect(files.length).toBeGreaterThan(50);

    const failures: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const refs = extractStylesReferences(content);
      if (!refs) continue;
      const relPath = path.relative(process.cwd(), file);
      for (const className of refs.classNames) {
        if (!definedClasses.has(className)) {
          failures.push(`${relPath}: styles.${className} - no ".${className}" class is defined in src/app/page.module.css`);
        }
      }
    }

    expect(failures, `Found ${failures.length} reference(s) to undefined CSS Module class(es):\n${failures.join("\n")}`).toEqual([]);
  });
});
