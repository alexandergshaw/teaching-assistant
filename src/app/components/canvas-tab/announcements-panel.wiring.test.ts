import { describe, it, expect } from "vitest";
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, dirname, normalize, relative, sep } from "node:path";
import { createRequire } from "node:module";
import { scanRuntimeEdges } from "@/lib/module-graph/runtime-import-graph";

// Real AST parsing for MEANING checks (FIX 2, FIX 3) - never a regex over
// raw text, which can only prove a substring is PRESENT somewhere in the
// file, not what role it plays (e.g. which side of a `===` it's on, or
// whether a call is inside a specific function's body).
const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");

const FILE = join(process.cwd(), "src/app/components/canvas-tab/announcements-panel.tsx");

function stripComments(source: string): string {
  return source
    .replace(/\/\*[^]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("AC-1: the capability is reachable from the Announcements panel", () => {
  const stripped = stripComments(readFileSync(FILE, "utf8"));

  it("(a) the file contains a call to draftPromptAnnouncementAction(", () => {
    expect(stripped).toContain("draftPromptAnnouncementAction(");
  });

  it("(b) contains calls to getMostRecentAnnouncementExemplarAction( and resolveHubCourseIdForCanvasUrl(", () => {
    expect(stripped).toContain("getMostRecentAnnouncementExemplarAction(");
    expect(stripped).toContain("resolveHubCourseIdForCanvasUrl(");
  });

  it("(c) contains calls to buildPromptDraftRequest( and applyPromptDraftResult(", () => {
    expect(stripped).toContain("buildPromptDraftRequest(");
    expect(stripped).toContain("applyPromptDraftResult(");
  });
});

describe("AC-11 wiring: posterFor is called, and both posting paths are called", () => {
  const stripped = stripComments(readFileSync(FILE, "utf8"));

  it("calls posterFor( and both postPromptAnnouncementAction( / createAnnouncementAction(", () => {
    expect(stripped).toContain("posterFor(");
    expect(stripped).toContain("postPromptAnnouncementAction(");
    expect(stripped).toContain("createAnnouncementAction(");
  });
});

// ── FIX 2 (docs/a21-instrument-notes.md disposal): PRESENCE VERSUS MEANING.
// AC-11's block above only proves the three names appear SOMEWHERE in the
// file - it says nothing about which poster is selected under which
// condition, or that lastResolved is actually threaded from the draft
// result. Two mutants pass under presence alone: P1 (`===` flipped to
// `!==` on the poster ternary - plain drafts post as markdown and templated
// drafts post as plaintext, so `##` headings appear literally) and P3
// (deleting `setLastResolved(next.lastResolved)` - every post becomes
// plaintext because lastResolved is never updated after a draft). Both are
// pinned here by parsing the real AST (never a regex, which cannot tell one
// occurrence of a name from its role in an expression). ────────────────────

describe("AC-11 MEANING: which poster is selected under which condition, and lastResolved is set from the draft result", () => {
  const source = readFileSync(FILE, "utf8");
  const sourceFile = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  it("P1: the poster ternary tests posterFor(lastResolved) === \"markdown\" (never !==)", () => {
    type Found = { operator: string; literal: string | null };
    let found: Found | null = null;
    function visit(node: import("typescript").Node): void {
      if (
        ts.isBinaryExpression(node) &&
        ts.isCallExpression(node.left) &&
        ts.isIdentifier(node.left.expression) &&
        node.left.expression.text === "posterFor"
      ) {
        found = {
          operator: node.operatorToken.getText(sourceFile),
          literal: ts.isStringLiteral(node.right) ? node.right.text : null,
        };
      }
      ts.forEachChild(node, visit);
    }
    ts.forEachChild(sourceFile, visit);
    expect(found, "no posterFor(...) comparison found in the file").not.toBeNull();
    expect((found as unknown as Found).operator).toBe("===");
    expect((found as unknown as Found).literal).toBe("markdown");
  });

  it("P3: handleDraft's own body calls setLastResolved(next.lastResolved)", () => {
    let handleDraftInitializer: import("typescript").Node | null = null;
    function findHandleDraft(node: import("typescript").Node): void {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "handleDraft" &&
        node.initializer
      ) {
        handleDraftInitializer = node.initializer;
      }
      ts.forEachChild(node, findHandleDraft);
    }
    ts.forEachChild(sourceFile, findHandleDraft);
    expect(handleDraftInitializer, "no `const handleDraft = ...` found").not.toBeNull();

    let sawCall = false;
    function scanForCall(node: import("typescript").Node): void {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "setLastResolved" &&
        node.arguments.length === 1
      ) {
        const arg = node.arguments[0];
        if (
          ts.isPropertyAccessExpression(arg) &&
          ts.isIdentifier(arg.expression) &&
          arg.expression.text === "next" &&
          arg.name.text === "lastResolved"
        ) {
          sawCall = true;
        }
      }
      ts.forEachChild(node, scanForCall);
    }
    scanForCall(handleDraftInitializer as unknown as import("typescript").Node);
    expect(sawCall).toBe(true);
  });
});

// ── FIX 3 (docs/a21-instrument-notes.md disposal): the persistence guard
// that was dropped. The restore of the typed prompt must run in a useState
// INITIALIZER, never a mount effect - the backlog row explicitly forbids
// the mount effect, because a mount effect declared AFTER the write effect
// stores "" on mount, wiping the typed prompt on every reload (mutant P4).
// The shipped panel is correct at :68 (`useState<string>(() =>
// readStoredPrompt(browserLocalStorage))`); this pins it so it stays that
// way. ───────────────────────────────────────────────────────────────────

describe("Persisted prompt restore is a useState initializer, never a mount effect (P4)", () => {
  const source = readFileSync(FILE, "utf8");
  const sourceFile = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  it("draftPrompt/setDraftPromptState's useState call takes a lazy initializer that calls readStoredPrompt", () => {
    let ok = false;
    function visit(node: import("typescript").Node): void {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isArrayBindingPattern(node.name) &&
        node.name.elements.length === 2 &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === "useState"
      ) {
        const [first, second] = node.name.elements;
        const namesMatch =
          ts.isBindingElement(first) &&
          ts.isIdentifier(first.name) &&
          first.name.text === "draftPrompt" &&
          ts.isBindingElement(second) &&
          ts.isIdentifier(second.name) &&
          second.name.text === "setDraftPromptState";
        if (namesMatch) {
          const arg = node.initializer.arguments[0];
          ok = Boolean(
            arg &&
              (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) &&
              /readStoredPrompt\s*\(/.test(arg.getText(sourceFile))
          );
        }
      }
      ts.forEachChild(node, visit);
    }
    ts.forEachChild(sourceFile, visit);
    expect(ok, "expected useState(() => readStoredPrompt(...)) for [draftPrompt, setDraftPromptState]").toBe(true);
  });

  it("no useEffect callback in this file calls setDraftPromptState( - restore happens ONLY via the initializer above, never a mount effect", () => {
    let violation = false;
    function visit(node: import("typescript").Node): void {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "useEffect"
      ) {
        const callback = node.arguments[0];
        if (callback && /setDraftPromptState\s*\(/.test(callback.getText(sourceFile))) {
          violation = true;
        }
      }
      ts.forEachChild(node, visit);
    }
    ts.forEachChild(sourceFile, visit);
    expect(violation).toBe(false);
  });
});

describe("AC-14(f): the panel wires the persisted-prompt leaf, and the key literal appears exactly once", () => {
  const stripped = stripComments(readFileSync(FILE, "utf8"));

  it("calls readStoredPrompt( and writeStoredPrompt(", () => {
    expect(stripped).toContain("readStoredPrompt(");
    expect(stripped).toContain("writeStoredPrompt(");
  });

  it("does not re-inline the STORAGE_KEY_PROMPT literal in this file", () => {
    expect(stripped).not.toContain("ta-canvas-ann-prompt");
  });
});

// FIX 5 (docs/a21-instrument-notes.md disposal): the "AC-3" block that used
// to live here was `expect(true).toBe(true)` and could never fail. AC-3's
// actual claim - that this wave never edits RecordingTab.tsx, manual-rail.ts
// or content-tab/constants.ts - is enforced at the wave gate by `git status
// --short` against the assignment's file list, which is not something a
// vitest assertion inside this repo's own tree can observe (the gate runs
// outside the test process, after the wave is written). No in-repo
// instrument can make that claim real, so the block is deleted rather than
// kept as a placebo.

// ── AC-2: the Announcements surface acquires no capture capability.
// CONSTRUCTION - forbidden set DERIVED FROM THE TREE AT TEST TIME. Walker
// shape DUPLICATED from classTrendsDraft.not-postable.test.ts, never
// imported. ──────────────────────────────────────────────────────────────

const SRC = join(process.cwd(), "src");

function toPosix(p: string): string {
  return relative(process.cwd(), p).split(sep).join("/");
}

function readOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function resolveSpecifier(spec: string, importer: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(importer), spec));
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not this one
    }
  }
  return null;
}

// FIX 4 (docs/a21-instrument-notes.md disposal): this walker used to extract
// import specifiers with a hand-rolled regex matching only
// `from "..."` (double-quoted, static import/export). That regex is BLIND to
// `await import(...)`, a bare `import "spec";` side-effect import, and a
// single-quoted specifier - see the "FIX4" describe block below, which
// proves all three were invisible to it. Reused instead: A23's
// `scanRuntimeEdges` (src/lib/module-graph/runtime-import-graph.ts), which
// extracts edges by parsing with the TypeScript compiler's own parser
// (`ts.createSourceFile`) rather than inferring import intent from a line's
// spelling - the same class fix A23 already made repo-wide.
function valueImportSpecifiers(source: string, fileName: string): string[] {
  return scanRuntimeEdges(source, fileName).edges.map((edge) => edge.specifier);
}

// Comments are stripped before matching, the same discipline this repo uses
// elsewhere (`.split(/\r?\n/)` plus an unanchored `//.*$`, block comments via
// `[^]`, never the dotAll `/s` flag - that flag passes vitest and fails tsc
// with TS1501). Without this, a file that merely DOCUMENTS the capture
// pipeline in prose - e.g. walkthrough-script-prompt.ts's own header, "PAGE
// IDENTITY DOES NOT EXIST IN THE CAPTURE PIPELINE. getDisplayMedia ..." -
// registers as a capability the moment anything imports it, which is a false
// positive this test's own real check (below) measured directly.
function stripCommentsForScan(source: string): string {
  const noBlockComments = source.replace(/\/\*[^]*?\*\//g, "");
  return noBlockComments
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function deriveCaptureForbiddenFiles(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (["node_modules", ".git", ".next"].includes(entry)) continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry) && !entry.includes(".test.")) {
        const text = stripCommentsForScan(readOrEmpty(full));
        if (/getUserMedia|getDisplayMedia|new MediaRecorder/.test(text)) out.add(full);
      }
    }
  };
  walk(SRC);
  return out;
}

function walkForForbiddenFiles(rootPaths: string[], forbidden: Set<string>): string[] {
  const violations: string[] = [];
  const visited = new Set<string>();

  const visit = (path: string, stack: Set<string>) => {
    if (visited.has(path)) return;
    if (stack.has(path)) return;
    visited.add(path);
    stack.add(path);
    const source = readOrEmpty(path);
    for (const spec of valueImportSpecifiers(source, path)) {
      const dep = resolveSpecifier(spec, path);
      if (!dep) continue;
      if (forbidden.has(dep)) {
        violations.push(`${toPosix(path)} -> ${toPosix(dep)}`);
        continue;
      }
      visit(dep, stack);
    }
    stack.delete(path);
  };

  for (const root of rootPaths) visit(root, new Set());
  return violations;
}

describe("FIX4: the import walker sees forms the old regex-based extractor missed", () => {
  const OLD_IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?(?:[\w*{}\s,]*?)\s*from\s+"([^"]+)"/gm;
  function oldValueImportSpecifiers(source: string): string[] {
    const found: string[] = [];
    for (const match of source.matchAll(OLD_IMPORT_RE)) {
      if (match[1]) continue;
      found.push(match[2]);
    }
    return found;
  }

  const CASES: { name: string; source: string; specifier: string }[] = [
    {
      name: "await import(...) - a dynamic import",
      source: 'async function f() { const m = await import("@/lib/canvas/announcements"); return m; }',
      specifier: "@/lib/canvas/announcements",
    },
    {
      name: 'bare import "spec"; - a side-effect import with no clause',
      source: 'import "@/lib/canvas/announcements";',
      specifier: "@/lib/canvas/announcements",
    },
    {
      name: "single-quoted specifier on an otherwise ordinary static import",
      source: "import { createAnnouncementFromMarkdown } from '@/lib/canvas/announcements';",
      specifier: "@/lib/canvas/announcements",
    },
  ];

  for (const { name, source, specifier } of CASES) {
    it(`${name}: invisible to the old regex, visible to scanRuntimeEdges`, () => {
      expect(oldValueImportSpecifiers(source)).not.toContain(specifier);
      expect(valueImportSpecifiers(source, "synthetic.ts")).toContain(specifier);
    });
  }
});

describe("AC-2: the Announcements surface acquires no capture capability", () => {
  const forbidden = deriveCaptureForbiddenFiles();

  it("(i) the derived forbidden set is non-empty and contains a known capture module", () => {
    expect(forbidden.size).toBeGreaterThan(0);
    expect(forbidden.has(join(SRC, "app/components/recording/useDiscussionCapture.ts"))).toBe(true);
  });

  it("(ii) positive control: WalkthroughAnnouncementPanel.tsx reports at least one violation", () => {
    const violations = walkForForbiddenFiles(
      [join(SRC, "app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx")],
      forbidden
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("(iii) the real check: zero violations rooted at announcements-panel.tsx", () => {
    const violations = walkForForbiddenFiles([FILE], forbidden);
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
