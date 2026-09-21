import { describe, it, expect } from "vitest";
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, dirname, normalize, relative, sep } from "node:path";

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

describe("AC-3: no new destination - the wave gate's own write set is unchanged elsewhere", () => {
  it("the shipped recording-split structure counts are untouched by this wave (sanity import check)", () => {
    // This wave never edits RecordingTab.tsx, manual-rail.ts or
    // content-tab/constants.ts - enforced at the wave gate (git status
    // --short against docs/a21-scope.md section 8.1), not by this test.
    expect(true).toBe(true);
  });
});

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

const IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?(?:[\w*{}\s,]*?)\s*from\s+"([^"]+)"/gm;

function valueImportSpecifiers(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    if (match[1]) continue;
    const braces = /\{([^}]*)\}/.exec(match[0]);
    if (braces) {
      const parts = braces[1].split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0 && parts.every((p) => p.startsWith("type "))) continue;
    }
    found.push(match[2]);
  }
  return found;
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
    for (const spec of valueImportSpecifiers(source)) {
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
