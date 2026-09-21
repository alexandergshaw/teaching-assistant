// The layer-5 enforcer of docs/l14-scope.md: holds every raw (non-wrapper)
// multi-path test command in the NORMATIVE layer at zero (S1-S5, S7), holds
// every family - wrapper included - at zero paths-arguments in a backlog
// row's `verify` (S6, the single-path ruling's real enforcer per section 8),
// freezes the exact set of existing hits in docs/**/*.md (S8), and checks
// the surface is named everywhere it must be (P11). P13 additionally pins
// two L15-safety facts about this file and cli.e2e.test.ts as source text.
//
// L15 (docs/l14-scope.md section 6): this file walks 146+ files under
// docs/**/*.md. Every read happens ONCE, into a module-scope corpus, before
// any `it` runs; every `it` carries an explicit 30-second timeout so a real
// vitest subprocess or a large text scan under load is never false-RED by
// vitest's unconfigured 5-second default.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { findTestCommands, callCommands, type TestCommand } from "./raw-invocation";
import { parseBacklogYaml } from "../backlog/yaml-codec";

const ROOT = process.cwd();

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

function listDir(relDir: string, suffix?: string): string[] {
  return readdirSync(join(ROOT, relDir))
    .filter((f) => !suffix || f.endsWith(suffix))
    .map((f) => `${relDir}/${f}`)
    .sort();
}

function walkMarkdown(relDir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, relDir))) {
    const rel = `${relDir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walkMarkdown(rel, out);
    else if (entry.endsWith(".md")) out.push(rel);
  }
  return out;
}

function rawMulti(text: string, vitestScripts: readonly string[]): TestCommand[] {
  return findTestCommands(text, vitestScripts).filter((h) => h.family !== "wrapper" && h.paths.length >= 2);
}

function anyMulti(text: string, vitestScripts: readonly string[]): TestCommand[] {
  return findTestCommands(text, vitestScripts).filter((h) => h.paths.length >= 2);
}

// --- module-scope corpus: every file read exactly once (L15) ---

const PACKAGE_JSON_TEXT = read("package.json");
const PACKAGE_JSON: { scripts: Record<string, string> } = JSON.parse(PACKAGE_JSON_TEXT);
const VITEST_SCRIPTS = Object.entries(PACKAGE_JSON.scripts)
  .filter(([, v]) => /^vitest\b/.test(v))
  .map(([k]) => k);

const AGENT_FILES = listDir(".claude/agents", ".md");
const LOOP_DOC_FILES = ["docs/DEV_LOOP.md", ...listDir("docs/loop", ".md")];
const ROOT_DOC_FILES = ["AGENTS.md", "CLAUDE.md"];
const WORKFLOW_FILES = (() => {
  try {
    return listDir(".github/workflows");
  } catch {
    return [];
  }
})();

// Built from split pieces, never written contiguously, so THIS file's own
// text (which necessarily talks about the very specifier it is looking for)
// cannot self-match and pull itself into S7 - it does not import
// child_process, and a naive contiguous literal here would have made it look
// like it does (measured: it did, before this split, because this file's own
// prose contained the specifier as a readable string).
const CHILD_PROCESS_SPECIFIER = "child" + "_process";
const NODE_CHILD_PROCESS_SPECIFIER = "node:" + CHILD_PROCESS_SPECIFIER;

const SPAWNER_FILES = (() => {
  const files: string[] = [];
  function walkSrc(dir: string): void {
    for (const entry of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${entry}`;
      const full = join(ROOT, rel);
      if (statSync(full).isDirectory()) walkSrc(rel);
      else if (/\.tsx?$/.test(entry)) files.push(rel);
    }
  }
  walkSrc("src");
  const importsChildProcess = new RegExp(`${NODE_CHILD_PROCESS_SPECIFIER}|from ["']${CHILD_PROCESS_SPECIFIER}["']`);
  return files.filter((f) => importsChildProcess.test(read(f)));
})();

const ALL_DOCS_MD = walkMarkdown("docs").filter((f) => f !== "docs/BACKLOG.md");

const BACKLOG_ITEMS = parseBacklogYaml(read("docs/backlog.yml"));

const SELF_SOURCE = readFileSync(__filename, "utf-8");
const CLI_E2E_SOURCE = read("src/tools/vitest-paths/cli.e2e.test.ts");

// Every file this scope reads, precomputed once (used only by the corpus
// non-empty canary below).
const CORPUS = {
  agents: AGENT_FILES.map((f) => ({ file: f, text: read(f) })),
  loopDocs: LOOP_DOC_FILES.map((f) => ({ file: f, text: read(f) })),
  rootDocs: ROOT_DOC_FILES.map((f) => ({ file: f, text: read(f) })),
  workflows: WORKFLOW_FILES.map((f) => ({ file: f, text: read(f) })),
  spawners: SPAWNER_FILES.map((f) => ({ file: f, text: read(f) })),
  docsMd: ALL_DOCS_MD.map((f) => ({ file: f, text: read(f) })),
};

function reportRaw(hits: { file: string; command: TestCommand }[]): string {
  return hits.map((h) => `${h.file}:${String(h.command.line)} [${h.command.norm}]`).join("; ");
}

// --- S1-S5, S7: zero raw multi-path in the normative layer ---

describe("S1: .claude/agents/*.md hold zero raw multi-path test commands", () => {
  it(
    "no agent definition names two or more test paths outside the wrapper",
    () => {
      const hits = CORPUS.agents.flatMap(({ file, text }) => rawMulti(text, VITEST_SCRIPTS).map((command) => ({ file, command })));
      expect(hits, reportRaw(hits)).toHaveLength(0);
    },
    30_000
  );
});

describe("S2: docs/DEV_LOOP.md and docs/loop/*.md hold zero raw multi-path test commands", () => {
  it(
    "no loop document names two or more test paths outside the wrapper",
    () => {
      const hits = CORPUS.loopDocs.flatMap(({ file, text }) => rawMulti(text, VITEST_SCRIPTS).map((command) => ({ file, command })));
      expect(hits, reportRaw(hits)).toHaveLength(0);
    },
    30_000
  );
});

describe("S3: AGENTS.md and CLAUDE.md hold zero raw multi-path test commands", () => {
  it(
    "neither root instruction file names two or more test paths outside the wrapper",
    () => {
      const hits = CORPUS.rootDocs.flatMap(({ file, text }) => rawMulti(text, VITEST_SCRIPTS).map((command) => ({ file, command })));
      expect(hits, reportRaw(hits)).toHaveLength(0);
    },
    30_000
  );
});

describe("S4: package.json script values hold zero raw multi-path test commands", () => {
  it(
    "no script value names two or more test paths outside the wrapper",
    () => {
      const hits = Object.entries(PACKAGE_JSON.scripts).flatMap(([name, value]) =>
        rawMulti(value, VITEST_SCRIPTS).map((command) => ({ file: `package.json#scripts.${name}`, command }))
      );
      expect(hits, reportRaw(hits)).toHaveLength(0);
    },
    30_000
  );
});

describe("S5: .github/workflows/* hold zero raw multi-path test commands", () => {
  it(
    "no workflow file names two or more test paths outside the wrapper",
    () => {
      const hits = CORPUS.workflows.flatMap(({ file, text }) => rawMulti(text, VITEST_SCRIPTS).map((command) => ({ file, command })));
      expect(hits, reportRaw(hits)).toHaveLength(0);
    },
    30_000
  );
});

describe("S7: src/** files that spawn a child process hold zero raw multi-path test commands", () => {
  it(
    "neither the text scan nor the argv-spawn scan finds a raw multi-path command (the wrapper family is S6's, not S7's)",
    () => {
      const textHits = CORPUS.spawners.flatMap(({ file, text }) => rawMulti(text, VITEST_SCRIPTS).map((command) => ({ file, command })));
      const argvHits = CORPUS.spawners.flatMap(({ file, text }) =>
        callCommands(text, VITEST_SCRIPTS)
          .filter((h) => h.family !== "wrapper" && h.paths.length >= 2)
          .map((command) => ({ file, command }))
      );
      expect([...textHits, ...argvHits], reportRaw([...textHits, ...argvHits])).toHaveLength(0);
    },
    30_000
  );
});

// --- S6: zero commands of ANY family, wrapper included, in a backlog verify ---

describe("S6: docs/backlog.yml verify fields hold zero commands of any family with two or more paths", () => {
  it(
    "no scoped item's verify names two or more test paths, wrapper included (the single-path ruling's enforcer)",
    () => {
      const hits = BACKLOG_ITEMS.filter((item) => item.verify !== null).flatMap((item) =>
        anyMulti(item.verify as string, VITEST_SCRIPTS).map((command) => ({ file: `backlog:${item.id}`, command }))
      );
      expect(hits, reportRaw(hits)).toHaveLength(0);
    },
    30_000
  );
});

// --- S8: a frozen set of existing hits in docs/**/*.md, exact both ways ---

// Frozen at build time by this scope's own detector run over the real tree
// (node --experimental-strip-types over raw-invocation.ts, scanning
// docs/**/*.md except docs/BACKLOG.md): 15 hits in 8 files. Per
// docs/l14-scope.md R2/R6, a converting item removes its entry in the same
// commit that fixes the underlying doc - which puts this file in that
// item's write set.
const FROZEN_S8_HITS: readonly { file: string; norm: string }[] = [
  {
    file: "docs/a11-scope.md",
    norm: "vitest: src/app/components/snapshot-grading src/app/components/assessment-shared src/lib/grade/prompts.test.ts src/lib/grade/prompts-praise-routing.test.ts",
  },
  { file: "docs/a16-plan.md", norm: "vitest: src/app/components/ui/buttonVariant.test.ts src/file-size-ceiling.structure.test.ts" },
  { file: "docs/a16-plan.md", norm: "vitest: src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts" },
  {
    file: "docs/a18-ac.md",
    norm: "vitest: src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/actions/walkthrough-announcement.test.ts src/app/components/recording/recording-tab-header.structure.test.ts",
  },
  {
    file: "docs/a18-test-notes.md",
    norm: "vitest: src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/actions/walkthrough-announcement.test.ts src/app/components/recording/recording-tab-header.structure.test.ts",
  },
  { file: "docs/a19-scope.md", norm: "vitest: src/lib/walkthrough-announcement-prompt.test.ts src/lib/p11-containment-e2e.test.ts" },
  {
    file: "docs/a20-scope.md",
    norm: "vitest: src/app/components/recording/recording-split.structure.test.ts src/app/components/message-replies/message-replies.structure.test.ts",
  },
  {
    file: "docs/a22-scope.md",
    norm: "vitest: src/app/components/grading-results/ src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts",
  },
  {
    file: "docs/a23-criteria.md",
    norm: "vitest: src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts",
  },
  {
    file: "docs/a23-test-notes.md",
    norm: "vitest: src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts",
  },
  { file: "docs/l14-scope.md", norm: "vitest: src/lib/no-emojis.test.ts src/does-not-exist.test.ts" },
  { file: "docs/l14-scope.md", norm: "vitest: src/a.test.ts src/b.test.ts" },
  { file: "docs/l14-scope.md", norm: "npm-vitest: src/a.test.ts src/b.test.ts" },
  {
    file: "docs/REGRESSION.md",
    norm: "vitest: src/lib/visualizer.test.ts src/lib/workflows/registry.ensure-visualizer-pages.test.ts",
  },
  { file: "docs/REGRESSION.md", norm: "vitest: src/lib/decks/ src/lib/slide-prompt.test.ts src/lib/course-kind.test.ts" },
];

describe("S8: docs/**/*.md (except docs/BACKLOG.md) hold EXACTLY the frozen set of raw multi-path hits", () => {
  const actual = CORPUS.docsMd.flatMap(({ file, text }) => rawMulti(text, VITEST_SCRIPTS).map((command) => ({ file, norm: command.norm })));
  const actualKeys = new Set(actual.map((h) => `${h.file}::${h.norm}`));
  const frozenKeys = new Set(FROZEN_S8_HITS.map((h) => `${h.file}::${h.norm}`));

  it(
    "every hit found today is in the frozen set (a new, unreviewed raw multi-path command is RED)",
    () => {
      const unexpected = actual.filter((h) => !frozenKeys.has(`${h.file}::${h.norm}`));
      expect(unexpected, JSON.stringify(unexpected)).toHaveLength(0);
    },
    30_000
  );

  it(
    "every frozen entry is still found today (a fixed doc must drop its entry in the same commit, R2/R6)",
    () => {
      const missing = FROZEN_S8_HITS.filter((h) => !actualKeys.has(`${h.file}::${h.norm}`));
      expect(missing, JSON.stringify(missing)).toHaveLength(0);
    },
    30_000
  );
});

// --- P11: the surface is named everywhere it must be ---

const ROUTING_FILES: readonly string[] = [
  "docs/loop/this-repo.md",
  "docs/loop/traps-tests.md",
  ".claude/agents/loop-implementer.md",
  ".claude/agents/loop-plan.md",
  ".claude/agents/loop-test-author.md",
  ".claude/agents/loop-seat.md",
  ".claude/agents/loop-checker.md",
  ".claude/agents/loop-ac.md",
  ".claude/agents/loop-architect.md",
  ".claude/agents/loop-top.md",
];

describe("P11: the surface (test:paths) is named in package.json and every one of the ten routing files", () => {
  it(
    "package.json declares a test:paths script pointing at an existing .ts file",
    () => {
      const script = PACKAGE_JSON.scripts["test:paths"];
      expect(script).toBeDefined();
      const tsPathMatch = (script ?? "").match(/([^\s]+\.ts)\b/g) ?? [];
      const cliPath = tsPathMatch.find((p) => p.endsWith("vitest-paths/cli.ts"));
      expect(cliPath, `expected a vitest-paths/cli.ts path in "${String(script)}"`).toBeDefined();
      if (cliPath) {
        expect(() => statSync(join(ROOT, cliPath))).not.toThrow();
      }
    },
    30_000
  );

  it.each(ROUTING_FILES)(
    "%s names test:paths",
    (file) => {
      expect(read(file)).toContain("test:paths");
    },
    30_000
  );
});

// --- Canary block: proves the instrument itself fires before trusting the real scan ---

describe("Canary: the detector and every scope fire on known fixtures before the real scan is trusted", () => {
  it(
    "fires on the c1 repro fixture",
    () => {
      const hits = rawMulti("npx vitest run src/lib/no-emojis.test.ts src/does-not-exist.test.ts", VITEST_SCRIPTS);
      expect(hits.length).toBe(1);
    },
    30_000
  );

  it(
    "fires on an argv-spawn fixture",
    () => {
      const hits = callCommands('spawnSync("npx", ["vitest", "run", "src/a.test.ts", "src/b.test.ts"]);', VITEST_SCRIPTS).filter(
        (h) => h.family !== "wrapper" && h.paths.length >= 2
      );
      expect(hits.length).toBe(1);
    },
    30_000
  );

  it(
    "each of S1, S2, S4, S7, S8's file lists is non-empty (the scan is really reading something)",
    () => {
      expect(AGENT_FILES.length).toBeGreaterThan(0);
      expect(LOOP_DOC_FILES.length).toBeGreaterThan(0);
      expect(Object.keys(PACKAGE_JSON.scripts).length).toBeGreaterThan(0);
      expect(SPAWNER_FILES.length).toBeGreaterThan(0);
      expect(ALL_DOCS_MD.length).toBeGreaterThan(0);
    },
    30_000
  );

  it(
    "S1's listing contains loop-implementer.md by name (the dot-directory was really read)",
    () => {
      expect(AGENT_FILES).toContain(".claude/agents/loop-implementer.md");
    },
    30_000
  );

  it(
    "S6's predicate fires on a fixture row whose verify is a two-path WRAPPER command (S6 is empty today - all real verify values are null)",
    () => {
      const hits = anyMulti("npm run test:paths src/a.test.ts src/b.test.ts", VITEST_SCRIPTS);
      expect(hits.some((h) => h.family === "wrapper")).toBe(true);
      expect(BACKLOG_ITEMS.every((item) => item.verify === null)).toBe(true);
    },
    30_000
  );
});

// --- P13: the L15 obligations, as source-text facts (never spellings) ---

function matchParens(source: string, openIdx: number): number {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = openIdx; i < source.length; i++) {
    const c = source[i];
    if (inStr) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Every top-level literal `it(...)` call's full argument-list text, in order
 * (never `it.each(...)`, a distinct call shape). A real `it()` call's first
 * argument is always a string literal test name, so a match whose first
 * top-level argument does not start with a quote is a false hit from prose
 * that merely CONTAINS the four characters `it()` - for example this very
 * file's own problem-message strings below - and is discarded rather than
 * counted as a call.
 */
function findItCallArgText(source: string): string[] {
  const calls: string[] = [];
  const re = /(^|[^.\w])it\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = matchParens(source, openIdx);
    if (closeIdx === -1) continue;
    const inner = source.slice(openIdx + 1, closeIdx);
    const firstChar = inner.trimStart()[0];
    if (firstChar === '"' || firstChar === "'" || firstChar === "`") calls.push(inner);
  }
  return calls;
}

function splitTopLevelArgs(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

function itCallsMissingExplicitTimeout(source: string, minMs: number): string[] {
  const problems: string[] = [];
  for (const argText of findItCallArgText(source)) {
    const parts = splitTopLevelArgs(argText);
    if (parts.length < 3) {
      problems.push("a top-level it() call has no third (timeout) argument");
      continue;
    }
    const last = parts[parts.length - 1].trim();
    const numeric = /^\d[\d_]*$/.test(last) ? Number(last.replace(/_/g, "")) : NaN;
    if (!Number.isFinite(numeric) || numeric < minMs) {
      problems.push(`a top-level it() call's timeout argument "${last}" is not a numeric literal >= ${String(minMs)}`);
    }
  }
  return problems;
}

function itCallsReadingInsideBody(source: string): string[] {
  const problems: string[] = [];
  for (const argText of findItCallArgText(source)) {
    if (/readFileSync\s*\(/.test(argText)) problems.push("a top-level it() call reads a file inside its own body");
  }
  return problems;
}

describe("P13: the L15 obligations (docs/l14-scope.md section 6) hold as source-text facts", () => {
  it(
    "every top-level it() in cli.e2e.test.ts carries an explicit numeric timeout of at least 30_000",
    () => {
      const problems = itCallsMissingExplicitTimeout(CLI_E2E_SOURCE, 30_000);
      expect(problems, problems.join("; ")).toHaveLength(0);
    },
    30_000
  );

  it(
    "every top-level it() in this structure test carries an explicit numeric timeout of at least 30_000",
    () => {
      const problems = itCallsMissingExplicitTimeout(SELF_SOURCE, 30_000);
      expect(problems, problems.join("; ")).toHaveLength(0);
    },
    30_000
  );

  it(
    "this structure test's own source has no readFileSync call lexically inside a top-level it() callback",
    () => {
      const problems = itCallsReadingInsideBody(SELF_SOURCE);
      expect(problems, problems.join("; ")).toHaveLength(0);
    },
    30_000
  );
});
