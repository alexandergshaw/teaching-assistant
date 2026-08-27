// Wiring guards for this feature (two requests from the instructor):
//   1. "the grading repo page/process should also weave in an interpreter/
//      compiler step and evaluate based on that as well" - Task B: the
//      embedded deterministic engine's repo-grading branches
//      (gradeRepoAction/gradeReposAction) now call attachCodeRuns so
//      gradeEntriesEmbedded's own "Code runs" criterion can score execution,
//      gated behind an explicit, off-by-default instructor control.
//   2. "there should also be a button ... that can kick off the interpreter/
//      compiler for any specified file(s) in a student's folder" - Task A: a
//      per-cell Run control in RepoGradeCellControl.tsx, reusing
//      runSubmissionCodeAction (the SAME server action the results page's
//      own Run buttons already call).
//
// vitest in this codebase is node-env and collects only src/**/*.test.ts, so
// none of RepoGradeCellControl.tsx / RepoGradesControls.tsx / RepoGradesGrid.tsx
// / index.tsx / useRepoGradesGradingActions.ts / useRepoGradesBulkGrade.ts /
// github-repos.ts / github.ts is ever rendered or executed by a real test -
// every check below is a SOURCE-READING guard, the idiom
// repoGradesSliceA.guards.test.ts and repoGradesRubricPicker.wiring.test.ts
// already established for this folder (helpers copied, not imported, per
// those files' own precedent of each independently-owned test file carrying
// its own copy). Every guard is paired with a canary proving it can actually
// FAIL against a known-bad literal string - this project's memory records
// five defects in THIS session alone that every other gate passed, so a
// checker that always reports "clean" without checking anything is exactly
// the failure mode these canaries exist to rule out.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const REPO_GRADES = "src/app/components/repo-grades";
const cellControlSource = read(`${REPO_GRADES}/RepoGradeCellControl.tsx`);
const controlsSource = read(`${REPO_GRADES}/RepoGradesControls.tsx`);
const gridSource = read(`${REPO_GRADES}/RepoGradesGrid.tsx`);
const indexSource = read(`${REPO_GRADES}/index.tsx`);
const uiStateSource = read(`${REPO_GRADES}/repoGradesUiState.ts`);
const gradingActionsSource = read(`${REPO_GRADES}/useRepoGradesGradingActions.ts`);
const bulkGradeSource = read(`${REPO_GRADES}/useRepoGradesBulkGrade.ts`);
const githubReposSource = read("src/app/actions/github-repos.ts");
const githubSource = read("src/app/actions/github.ts");
const codeRunnerSource = read("src/lib/code-runner.ts");

/** Line comments, block comments and JSX `{/* ... *​/}` comments stripped -
 *  copied from repoGradesSliceA.guards.test.ts's own helper (this folder's
 *  established precedent), not imported, so a comment describing old or bad
 *  code can never be mistaken for that code actually being present. */
function stripJsComments(source: string): string {
  return source.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Isolates the braces-matched body of the FIRST function whose declaration
 *  starts with `startMarker` - adapted from repoGradesRubricPicker.wiring.test.ts's
 *  own helper (bound by real brace-depth matching, not proximity), with one
 *  difference: the opening-brace search starts AFTER `startMarker` ends, not
 *  at its start - required here because useRepoGradesBulkGrade.ts's
 *  gradeOneTarget declares a return type (`Promise<{ rubricUsed: string |
 *  null }>`) whose OWN object-type brace would otherwise be mistaken for the
 *  arrow function's body brace when `startMarker` does not extend past it.
 *  Harmless for every other marker used in this file, which contains no
 *  brace between its start and the real body brace either way. */
function extractFunctionBody(source: string, startMarker: string): string {
  const cleaned = stripJsComments(source);
  const idx = cleaned.indexOf(startMarker);
  if (idx === -1) return "";
  const braceStart = cleaned.indexOf("{", idx + startMarker.length);
  if (braceStart === -1) return "";
  let depth = 0;
  let i = braceStart;
  for (; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return cleaned.slice(braceStart, i + 1);
}

/** Starting at `openBraceIdx` (must point at a `{`), returns the index of the
 *  matching `}` - copied from repoGrades.wiring.test.ts's own helper. */
function findMatchingBraceEnd(text: string, openBraceIdx: number): number {
  let depth = 0;
  for (let i = openBraceIdx; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Finds every call site of `${calleeName}(` in `text` and reports, per call
 *  site, whether it is textually inside an `onClick={...}` handler - copied
 *  verbatim from repoGrades.wiring.test.ts's own helper (already proven
 *  there against the concise-arrow/block-body/proximity-over-match cases;
 *  this file's own canary below re-proves it independently, per this
 *  folder's "every file owns its guarantee" precedent). */
function callSitesGatedByClick(text: string, calleeName: string): boolean[] {
  const marker = `${calleeName}(`;
  const results: boolean[] = [];
  let searchFrom = 0;
  for (;;) {
    const idx = text.indexOf(marker, searchFrom);
    if (idx === -1) break;
    searchFrom = idx + marker.length;

    const windowStart = Math.max(0, idx - 400);
    const preceding = text.slice(windowStart, idx);
    const lastOnClickRel = preceding.lastIndexOf("onClick={");
    if (lastOnClickRel === -1) {
      results.push(false);
      continue;
    }
    const onClickBraceIdx = windowStart + lastOnClickRel + "onClick=".length;
    const closeIdx = findMatchingBraceEnd(text, onClickBraceIdx);
    results.push(closeIdx !== -1 && idx < closeIdx);
  }
  return results;
}

/** The condition text of the `if (...)` block that directly encloses the
 *  FIRST `${callName}(...)` call - copied from repoGradesRubricPicker.wiring.test.ts's
 *  own helper. */
function conditionGatingCall(source: string, callName: string): string | null {
  const cleaned = stripJsComments(source);
  const callIdx = cleaned.indexOf(`${callName}(`);
  if (callIdx === -1) return null;
  const ifIdx = cleaned.lastIndexOf("if (", callIdx);
  if (ifIdx === -1) return null;
  const condStart = ifIdx + "if (".length;
  let depth = 1;
  let i = condStart;
  for (; i < cleaned.length; i++) {
    if (cleaned[i] === "(") depth++;
    else if (cleaned[i] === ")") {
      depth--;
      if (depth === 0) break;
    }
  }
  return cleaned.slice(condStart, i).trim();
}

/** The comma-split argument list of the FIRST call to `${callName}(...)` in
 *  `source`, splitting on top-level commas only so a nested call or object
 *  literal inside one argument does not fracture the split.
 *
 *  Copied rather than imported from repoGradesRubricPicker.wiring.test.ts,
 *  which has the same helper. That is this folder's established convention
 *  for guard files (repoGradesSliceA.guards.test.ts:58-65 does the same, and
 *  says why): a guard that imported its own scanner from another guard could
 *  be silently disarmed by a change to that other file. Each guard file
 *  carries its own copy and its own canaries proving the copy works. */
function callArgs(source: string, callName: string): string[] {
  const cleaned = stripJsComments(source);
  const nameIdx = cleaned.indexOf(`${callName}(`);
  if (nameIdx === -1) return [];
  const openParen = nameIdx + callName.length;
  let depth = 0;
  const args: string[] = [];
  let current = "";
  for (let i = openParen; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      if (depth === 1) continue;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) {
        if (current.trim()) args.push(current.trim());
        return args;
      }
    }
    if (depth === 1 && ch === ",") {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  return args;
}

// ---------------------------------------------------------------------------
// Canaries - prove the copied helpers actually discriminate, independently
// of whatever repoGrades.wiring.test.ts already proved about its own copies.
// ---------------------------------------------------------------------------

describe("canaries: the copied helpers actually discriminate", () => {
  it("callSitesGatedByClick reports a call inside onClick={} as gated, and a bare render-time call as not", () => {
    const gated = `<button onClick={() => { void run(); }}>Run</button>`;
    const ungated = `useEffect(() => { void run(); }, []);`;
    expect(callSitesGatedByClick(gated, "run")).toEqual([true]);
    expect(callSitesGatedByClick(ungated, "run")).toEqual([false]);
  });

  it("extractFunctionBody isolates exactly the named function's own braces, not a sibling's", () => {
    const src = "const a = () => { one(); }; const b = () => { two(); };";
    expect(extractFunctionBody(src, "const a =")).toContain("one()");
    expect(extractFunctionBody(src, "const a =")).not.toContain("two()");
  });

  it("conditionGatingCall reads the real gating condition, and returns it verbatim for a canary fixture", () => {
    const fixture = 'if (runCode) {\n  await attachCodeRuns(entries);\n}';
    expect(conditionGatingCall(fixture, "attachCodeRuns")).toBe("runCode");
  });

  it("canary: an UNGATED attachCodeRuns call (no enclosing if) is detected as ungated (null condition)", () => {
    const buggy = "await attachCodeRuns(entries);\nconst run = gradeEntriesEmbedded(entries, builtRubric);";
    expect(conditionGatingCall(buggy, "attachCodeRuns")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task A - the per-cell Run control (request 2)
// ---------------------------------------------------------------------------

describe("RepoGradeCellControl.tsx renders a Run control reusing runSubmissionCodeAction", () => {
  it("canary: the file was actually read and contains its known Run affordances", () => {
    expect(cellControlSource.length).toBeGreaterThan(200);
    expect(cellControlSource).toContain("runSubmissionCodeAction");
    expect(cellControlSource).toContain("handleRunCode");
  });

  it("imports runSubmissionCodeAction from the shared actions barrel - never a second server action", () => {
    expect(cellControlSource).toMatch(/import\s*\{\s*runSubmissionCodeAction\s*\}\s*from\s*"@\/app\/actions"/);
  });

  it("renders the entry-point override select with an auto-detect default and one option per submitted file", () => {
    expect(cellControlSource).toContain("Auto-detected entry point");
    expect(cellControlSource).toContain("edit.submittedFiles.map((file) =>");
  });

  it("the Run button's label reflects the in-flight state (Running.../Run), matching every other action button in this file", () => {
    expect(cellControlSource).toMatch(/manualRunning \? "Running\.\.\." : "Run"/);
  });

  it("handleRunCode(...) is only ever called from inside an onClick handler - never a bare render-time or effect call", () => {
    const gated = callSitesGatedByClick(cellControlSource, "handleRunCode");
    expect(gated.length).toBeGreaterThanOrEqual(1);
    expect(gated.every(Boolean)).toBe(true);
  });

  it("the actual dangerous call (runSubmissionCodeAction) lives INSIDE handleRunCode's own body - proving the click-gate above actually covers the network call, not just a same-named wrapper", () => {
    const body = extractFunctionBody(cellControlSource, "const handleRunCode = async");
    expect(body.length).toBeGreaterThan(20);
    expect(body).toContain("runSubmissionCodeAction(");
  });

  it("the entry-point override is threaded through as runSubmissionCodeAction's second argument", () => {
    const body = extractFunctionBody(cellControlSource, "const handleRunCode = async");
    expect(body).toMatch(/runSubmissionCodeAction\(files, entryPointChoice \|\| undefined\)/);
  });

  it("this file still defines no effect at all, so there is no mount-time or state-change-triggered path that could run untrusted code automatically", () => {
    expect(cellControlSource).not.toContain("useEffect");
  });

  it("the Run control is gated on edit.submittedFiles (a cell that has been graded once), not on edit.codeExecution - reachable even when Task B's code-scoring toggle left the embedded engine's grading-time run empty", () => {
    expect(cellControlSource).toContain("{edit.submittedFiles.length > 0 && (");
  });

  it("a fresh manual run is displayed with a distinct label so it is never mistaken for what was actually scored (request 2's \"always show which file was executed\", applied to avoid a different confusion)", () => {
    expect(cellControlSource).toContain("Manual run (for review - does not change the score): ");
  });

  it("manualRun is read-only display state - it is never assigned onto `edit` or passed to onScoreChange/onFeedbackFieldChange, so a Run click can never itself change a posted score", () => {
    expect(cellControlSource).not.toMatch(/onScoreChange\(.*manualRun/);
    expect(cellControlSource).not.toMatch(/setRepoGradeCellEdit\([^)]*manualRun/);
  });

  it("RepoGradeCellControl (and therefore its Run control) is actually rendered by RepoGradesGrid.tsx, which index.tsx renders for the current course's model - the reachability chain a Run button ships dead through if broken anywhere along it", () => {
    expect(gridSource).toContain("<RepoGradeCellControl");
    expect(indexSource).toContain("<RepoGradesGrid");
  });
});

// ---------------------------------------------------------------------------
// Task B - deliberate scoring on the embedded engine (request 1)
// ---------------------------------------------------------------------------

describe("github-repos.ts's gradeRepoAction runs the embedded engine's code ONLY when runCode is true", () => {
  it("canary: the file was actually read and still defines gradeRepoAction", () => {
    expect(githubReposSource).toContain("export async function gradeRepoAction(");
  });

  it("imports attachCodeRuns from the shared code-runner module - never a re-implemented copy", () => {
    expect(githubReposSource).toMatch(/import\s*\{\s*attachCodeRuns\s*\}\s*from\s*"@\/lib\/code-runner"/);
  });

  it("attachCodeRuns is gated behind `if (runCode)`, not called unconditionally", () => {
    expect(conditionGatingCall(githubReposSource, "attachCodeRuns")).toBe("runCode");
  });

  it("gradeRepoAction declares an eighth parameter named runCode, optional (so every existing caller that omits it keeps today's behavior)", () => {
    const declIdx = githubReposSource.indexOf("export async function gradeRepoAction(");
    const paramsEnd = githubReposSource.indexOf("): Promise<", declIdx);
    const params = githubReposSource.slice(declIdx, paramsEnd);
    expect(params).toMatch(/runCode\?:\s*boolean/);
  });
});

describe("github.ts's gradeReposAction runs the embedded engine's code ONLY when runCode is true", () => {
  it("canary: the file was actually read and still defines gradeReposAction", () => {
    expect(githubSource).toContain("export async function gradeReposAction(");
  });

  it("imports attachCodeRuns from the shared code-runner module", () => {
    expect(githubSource).toMatch(/import\s*\{\s*attachCodeRuns\s*\}\s*from\s*"@\/lib\/code-runner"/);
  });

  it("attachCodeRuns is gated behind `if (runCode)`, not called unconditionally", () => {
    expect(conditionGatingCall(githubSource, "attachCodeRuns")).toBe("runCode");
  });
});

describe("code-runner.ts exports the shared attachCodeRuns/CODE_RUN_CONCURRENCY grading.ts, github-repos.ts and github.ts all now share", () => {
  it("exports attachCodeRuns as a generic worker-pool helper, not tied to StudentSubmissionEntry (avoiding a circular import back into grade/types.ts)", () => {
    expect(codeRunnerSource).toContain("export async function attachCodeRuns<T extends CodeRunnableEntry>");
  });
});

describe("repoGradesUiState.ts's runCodeScoring control defaults OFF (no existing course's embedded-engine scores may move on their own)", () => {
  it("canary: the file was actually read and declares the field", () => {
    expect(uiStateSource).toContain("runCodeScoring: boolean;");
  });

  it("defaultUiState() returns runCodeScoring: false", () => {
    const body = extractFunctionBody(uiStateSource, "function defaultUiState(): RepoGradesUiState");
    expect(body).toContain("runCodeScoring: false,");
  });

  it("the persisted key is namespaced under the standing ta- prefix", () => {
    expect(uiStateSource).toContain('const RUN_CODE_SCORING_KEY = "ta-repo-grades-run-code-scoring";');
  });
});

describe("RepoGradesControls.tsx renders the code-scoring checkbox, wired to the props it was given (never local-only state)", () => {
  it("the checkbox's checked state reads the runCodeScoring prop", () => {
    expect(controlsSource).toContain("checked={runCodeScoring}");
  });

  it("the checkbox's onChange forwards to onRunCodeScoringChange - never a local setState with nowhere to go", () => {
    expect(controlsSource).toContain("onChange={(e) => onRunCodeScoringChange(e.target.checked)}");
  });

  it("states plainly, next to the control, that this changes scores and that SpeedGrader will not show a matching rubric line", () => {
    expect(controlsSource).toContain("This changes scores, so it defaults off.");
    expect(controlsSource).toContain("SpeedGrader");
  });
});

describe("index.tsx threads runCodeScoring from uiState to the controls, the grading-actions hook, and the grid's disclosure", () => {
  it("passes uiState.runCodeScoring and its setter into RepoGradesControls", () => {
    expect(indexSource).toContain("runCodeScoring={uiState.runCodeScoring}");
    expect(indexSource).toMatch(/onRunCodeScoringChange=\{\(value\) => setUiState\(\(prev\) => \(\{ \.\.\.prev, runCodeScoring: value \}\)\)\}/);
  });

  it("passes runCodeScoring into useRepoGradesGradingActions's params", () => {
    const callIdx = indexSource.indexOf("useRepoGradesGradingActions({");
    expect(callIdx).toBeGreaterThan(-1);
    const closeIdx = indexSource.indexOf("});", callIdx);
    const callText = indexSource.slice(callIdx, closeIdx);
    expect(callText).toContain("runCodeScoring: uiState.runCodeScoring,");
  });

  it("computes the grid's codeScoringDisclosure from BOTH the embedded provider and the toggle, never the toggle alone (the LLM engine never adds a \"Code runs\" rubric criterion, so the disclosure would be false-flagged if it read the toggle only)", () => {
    expect(indexSource).toContain('codeScoringDisclosure={provider === "embedded" && uiState.runCodeScoring}');
  });
});

describe("RepoGradesGrid.tsx shows the SpeedGrader-skip disclosure next to the rubric description, the same pre-post-disclosure primitive", () => {
  it("renders the disclosure only when codeScoringDisclosure is true", () => {
    expect(gridSource).toContain("{codeScoringDisclosure && (");
  });

  it("the disclosure names both facts: it moves the total, and it will not appear as its own SpeedGrader line", () => {
    expect(gridSource).toContain("Code execution is scored into this total");
    expect(gridSource).toContain("will not appear as its own line in Canvas");
  });
});

// AMENDED 2026-08-26, same day these were written. The three assertions that
// stood here pinned a WORKAROUND rather than a fact: they required the
// per-cell call to be DUPLICATED into an `if (!runCodeScoring)` / `else`
// pair, with the seven-argument branch written first, because a sibling
// guard (repoGradesRubricPicker.wiring.test.ts) pinned an exact arity of
// seven and read only the first call site.
//
// Two call sites that can silently drift, held in a particular order to
// satisfy a text scan, is a worse defect than the one being guarded against.
// The sibling guard has been amended to pin the FACT it protects
// (useReadmeInstructions reaching the action in its seventh position, entry
// 352's defect) instead of the call's spelling, and the duplicate branch is
// gone. These assertions now pin the facts that actually matter: ONE call
// site, and runCodeScoring reaching the eighth argument.
//
// This is the project's own recorded lesson - "source-text tests
// over-specify: pin the fact and the ordering, never the spelling" - applied
// to a test that had just re-created the problem.
describe("useRepoGradesGradingActions.ts's per-cell call threads runCodeScoring as gradeRepoAction's eighth argument", () => {
  it("there is exactly ONE gradeRepoAction call site in this file, so the two paths cannot drift apart", () => {
    const cleaned = stripJsComments(gradingActionsSource);
    const first = cleaned.indexOf("gradeRepoAction(");
    expect(first).toBeGreaterThan(-1);
    expect(cleaned.indexOf("gradeRepoAction(", first + 1)).toBe(-1);
  });

  it("that call passes useReadmeInstructions seventh and runCodeScoring eighth", () => {
    const args = callArgs(gradingActionsSource, "gradeRepoAction");
    expect(args).toHaveLength(8);
    expect(args[6]).toBe("useReadmeInstructions");
    expect(args[7]).toBe("runCodeScoring");
  });

  it("canary: a call that stops at seven arguments is detected as NOT threading runCodeScoring", () => {
    const withoutFlag =
      "const result = await gradeRepoAction(row.repo, instructions, resolved.text, provider, undefined, column.folder, useReadmeInstructions);";
    const args = callArgs(withoutFlag, "gradeRepoAction");
    expect(args).toHaveLength(7);
    expect(args[7]).toBeUndefined();
  });

  it("canary: a hardcoded `true` in the eighth position is detected as NOT reading the persisted flag", () => {
    // The flag must be threaded, not pinned on. A literal `true` would run
    // code for every course regardless of the opt-in control.
    const hardcoded =
      "const result = await gradeRepoAction(row.repo, instructions, resolved.text, provider, undefined, column.folder, useReadmeInstructions, true);";
    expect(callArgs(hardcoded, "gradeRepoAction")[7]).not.toBe("runCodeScoring");
  });
});

describe("useRepoGradesBulkGrade.ts's bulk gradeRepoAction call threads runCodeScoring as an eighth argument (no pinned-argument-count guard applies to this call site)", () => {
  it("passes runCodeScoring as gradeRepoAction's eighth argument", () => {
    const body = extractFunctionBody(
      bulkGradeSource,
      "rubricArg: string): Promise<{ rubricUsed: string | null }> =>"
    );
    expect(body).toMatch(/gradeRepoAction\(\s*target\.repo,\s*instructions,\s*rubricArg,\s*provider,\s*undefined,\s*target\.folder,\s*useReadmeInstructions,\s*runCodeScoring\s*\)/);
  });
});
