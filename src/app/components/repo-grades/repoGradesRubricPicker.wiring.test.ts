// Wiring guards for the rubric picker's grading-path wiring
// (docs/repo-grades-rubric-picker-acceptance-criteria.md). Deliberately a
// NEW file, not an addition to repoGrades.wiring.test.ts (already 894 lines
// - contract budget for that file is zero new lines here).
//
// vitest in this codebase is node-env and collects only src/**/*.test.ts, so
// nothing in useRepoGradesGradingActions.ts, useRepoGradesBulkGrade.ts or
// index.tsx is ever rendered or executed by a real test - every check below
// is a SOURCE-READING guard, the idiom repoGradesSliceA.guards.test.ts:58-65
// already established for this folder (helpers copied and adapted from that
// file, not reimported, matching its own precedent of copying rather than
// sharing across independently-owned test files). Every guard is paired with
// a canary proving it can actually FAIL against a known-bad literal string -
// a memory note in this project records that a hand-rolled scan reporting
// "clean" without checking anything has shipped here before, and revision 1
// of repoGradesSliceA.guards.test.ts shipped five checkers a peer audit later
// proved were satisfied by wrong implementations.
//
// What these prove: the three facts the implementation brief called out as
// the most likely ways this feature ships half-wired with every OTHER gate
// green -
//   1. both grading-path entry points call the ONE shared resolver and
//      neither reads a page-level rubric string any more (AC item 16),
//   2. the bulk prologue gate tests the RESOLVED per-column rubric, not the
//      page-level string (AC item 72 - the single most likely remaining
//      defect named by the adversarial pass),
//   3. the per-cell gradeRepoAction call passes all seven positional
//      arguments, the seventh being useReadmeInstructions (AC item 57/71 - a
//      pre-existing defect, fixed in the same edit that threads the rubric
//      through),
//   4. index.tsx passes RepoGradesGrid a rubric description STRING it got
//      from the picker hook, never fetching or resolving one itself
//      (AC item 44),
//   5. useRepoGradesRubricSource.ts (a sibling agent's file, read here only
//      as text - never edited) has no useEffect that calls setState
//      synchronously,
//   6. the prologue gate and the log's "Rubric used" gate - the SAME
//      expression on the SAME variable in the pre-feature baseline
//      (docs/REGRESSION.md entry 352) - were BOTH moved off that shared
//      page-level string, not just one of the two (AC item 76).
//
// What these do NOT prove: that a picked rubric actually changes a real
// grade, that the UI renders correctly, or that useRepoGradesRubricSource.ts
// itself resolves correctly - that hook's own behaviour is that sibling
// agent's unit tests to write, not this file's.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const REPO_GRADES = "src/app/components/repo-grades";
const gradingActionsSource = read(`${REPO_GRADES}/useRepoGradesGradingActions.ts`);
const bulkGradeSource = read(`${REPO_GRADES}/useRepoGradesBulkGrade.ts`);
const indexSource = read(`${REPO_GRADES}/index.tsx`);

// useRepoGradesRubricSource.ts is sibling agent X's file, written concurrently
// with this one - it may not exist yet at any given moment this suite runs.
// Read defensively so a not-yet-landed sibling file fails only the ONE guard
// that needs it (item 5 below), not this entire suite.
let rubricSourceHookText: string | null = null;
try {
  rubricSourceHookText = read(`${REPO_GRADES}/useRepoGradesRubricSource.ts`);
} catch {
  rubricSourceHookText = null;
}

/** Line comments, block comments and JSX `{/* ... *​/}` comments stripped, so
 *  a comment DESCRIBING old or bad code cannot be mistaken for that code
 *  actually being present - borrowed verbatim from
 *  repoGradesSliceA.guards.test.ts:73-78. */
function stripJsComments(source: string): string {
  return source.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Isolates the braces-matched body of the FIRST function whose declaration
 *  starts with `startMarker` (e.g. "const handleGradeCell = async"). Bounded
 *  by real brace-depth matching, not a character count or a line count - the
 *  same "bound by structure, not proximity" rule repoGradesSliceA.guards.test.ts's
 *  own header comment records this project already learned the hard way. */
function extractFunctionBody(source: string, startMarker: string): string {
  const cleaned = stripJsComments(source);
  const idx = cleaned.indexOf(startMarker);
  if (idx === -1) return "";
  const braceStart = cleaned.indexOf("{", idx);
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

/** The index of the first CALL to `callName` in `cleaned` - i.e. the first
 *  `${callName}(` that is not part of that function's own declaration.
 *  establishSharedRubric is both declared (`export async function
 *  establishSharedRubric(`) and called (`await establishSharedRubric(`) in
 *  useRepoGradesBulkGrade.ts, and a naive `indexOf` finds the DECLARATION
 *  first - which sits after several other unrelated `if (` blocks earlier in
 *  the file, so conditionGatingCall would silently pin the wrong `if`
 *  entirely. Skipping past the declaration (when one exists) is what makes
 *  this safe for both a declared-and-called name and a plain call. */
function callSiteIndex(cleaned: string, callName: string): number {
  const declIdx = cleaned.indexOf(`function ${callName}(`);
  const searchFrom = declIdx === -1 ? 0 : declIdx + `function ${callName}(`.length;
  return cleaned.indexOf(`${callName}(`, searchFrom);
}

/** The raw, comma-split argument list of the first CALL to `${callName}(...)`
 *  in `source` (never its own declaration - see callSiteIndex above),
 *  splitting on top-level commas only - a nested call or object literal
 *  inside one argument does not fracture the split. */
function callArgs(source: string, callName: string): string[] {
  const cleaned = stripJsComments(source);
  const nameIdx = callSiteIndex(cleaned, callName);
  if (nameIdx === -1) return [];
  const openParen = nameIdx + callName.length;
  let depth = 0;
  let i = openParen;
  for (; i < cleaned.length; i++) {
    if (cleaned[i] === "(") depth++;
    else if (cleaned[i] === ")") {
      depth--;
      if (depth === 0) break;
    }
  }
  const inner = cleaned.slice(openParen + 1, i);
  const args: string[] = [];
  let argDepth = 0;
  let current = "";
  for (const ch of inner) {
    if (ch === "(" || ch === "{" || ch === "[") argDepth++;
    if (ch === ")" || ch === "}" || ch === "]") argDepth--;
    if (ch === "," && argDepth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") args.push(current.trim());
  return args;
}

/** The condition text of the `if (...)` block that directly encloses the
 *  first `${callName}(...)` call - good enough here because both
 *  establishSharedRubric call sites this file ever checks have exactly one
 *  call site, guarded by exactly one enclosing `if`. */
function conditionGatingCall(source: string, callName: string): string | null {
  const cleaned = stripJsComments(source);
  const callIdx = callSiteIndex(cleaned, callName);
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

// ---------------------------------------------------------------------------
// Guard 1 (AC item 16) - both grading-path entry points call the ONE shared
// resolver, and neither file still declares the removed page-level
// `rubric: string` param.
// ---------------------------------------------------------------------------

describe("AC item 16: both grading-path entry points call the shared resolver, never a page-level rubric string", () => {
  it("canary: extractFunctionBody isolates exactly the named function's own braces, not a sibling's", () => {
    const src = "const a = () => { one(); }; const b = () => { two(); };";
    expect(extractFunctionBody(src, "const a =")).toContain("one()");
    expect(extractFunctionBody(src, "const a =")).not.toContain("two()");
  });

  it("canary: a function reading a bare `rubric` variable is detected as NOT calling the resolver", () => {
    const buggy = "const handleGradeCell = async (row, column) => { const result = gradeRepoAction(row.repo, instructions, rubric, provider); };";
    expect(extractFunctionBody(buggy, "const handleGradeCell = async")).not.toMatch(/resolveRubricForColumn\(/);
  });

  it("handleGradeCell calls resolveRubricForColumn(column.assignmentId)", () => {
    const body = extractFunctionBody(gradingActionsSource, "const handleGradeCell = async");
    expect(body).toMatch(/resolveRubricForColumn\(column\.assignmentId\)/);
  });

  it('handleGradeColumn resolves the column\'s rubric before starting the bulk run (AC item 50)', () => {
    const body = extractFunctionBody(gradingActionsSource, "const handleGradeColumn = async");
    expect(body).toMatch(/resolveRubricForColumn\(column\.assignmentId\)/);
    expect(body).toMatch(/runBulkGrade\(plan, resolved\)/);
  });

  it("useRepoGradesGradingActions.ts no longer declares the removed page-level `rubric: string` param", () => {
    expect(stripJsComments(gradingActionsSource)).not.toMatch(/\brubric:\s*string;/);
  });

  it("useRepoGradesBulkGrade.ts no longer declares the removed page-level `rubric: string` param either", () => {
    expect(stripJsComments(bulkGradeSource)).not.toMatch(/\brubric:\s*string;/);
  });
});

// ---------------------------------------------------------------------------
// Guard 2 (AC item 50) - the bulk path can actually REACH a column's
// assignmentId, via a `columns` array searched by folder - the exact
// reachability seam the brief named as the most likely way this feature
// ships working for a single cell and silently dead for "Grade all".
// ---------------------------------------------------------------------------

describe("AC item 50: the bulk path can reach a column's assignmentId (the reachability seam)", () => {
  it("canary: a handleGradeColumn with no columns lookup is detected as unable to reach assignmentId", () => {
    const buggy = "const handleGradeColumn = (folder) => { void runBulkGrade(plan); };";
    expect(buggy).not.toMatch(/columns\.find\(\(c\) => c\.folder === folder\)/);
  });

  it("useRepoGradesGradingActions.ts's params accept a `columns` array", () => {
    expect(stripJsComments(gradingActionsSource)).toMatch(/columns:\s*readonly RepoGradeColumn\[\];/);
  });

  it("handleGradeColumn looks up the column by folder from that array", () => {
    const body = extractFunctionBody(gradingActionsSource, "const handleGradeColumn = async");
    expect(body).toMatch(/columns\.find\(\(c\) => c\.folder === folder\)/);
  });

  it("index.tsx passes the FULL, mapping-applied column list, not the folder-scoped displayed one", () => {
    expect(indexSource).toMatch(/columns:\s*columnsWithMapping,/);
  });
});

// ---------------------------------------------------------------------------
// Guard 3 (AC item 72) - the single most likely remaining defect per the
// adversarial pass: the bulk prologue gate must test the RESOLVED rubric for
// the column being graded, never the page-level string.
// ---------------------------------------------------------------------------

describe('AC item 72: the bulk prologue gate tests the RESOLVED rubric, never a page-level string', () => {
  it("canary: the checker reads the pre-feature buggy condition correctly", () => {
    const buggy =
      'if (rubric.trim() === "" && targets.length > 0) {\n' +
      "  const prologue = await establishSharedRubric(targets, rubric, (t) => gradeOneTarget(t, rubric), onAttempted);\n" +
      "}";
    expect(conditionGatingCall(buggy, "establishSharedRubric")).toBe('rubric.trim() === "" && targets.length > 0');
  });

  it("the real prologue gate tests resolved.text, exactly (not a bare page-level `rubric`)", () => {
    expect(conditionGatingCall(bulkGradeSource, "establishSharedRubric")).toBe(
      'resolved.text.trim() === "" && targets.length > 0'
    );
  });

  it("establishSharedRubric's own signature is untouched (useRepoGradesBulkGrade.test.ts must keep passing unedited)", () => {
    expect(stripJsComments(bulkGradeSource)).toMatch(
      /export async function establishSharedRubric\(\s*targets: readonly BulkGradeTarget\[\],\s*rubric: string,/
    );
  });
});

// ---------------------------------------------------------------------------
// Guard 4 (AC item 57/71) - the per-cell gradeRepoAction call passes all
// SEVEN positional arguments, the seventh being useReadmeInstructions - a
// pre-existing defect (docs/REGRESSION.md entry 352), fixed in the same
// edit that threads the resolved rubric through.
// ---------------------------------------------------------------------------

describe("AC item 57/71: the per-cell gradeRepoAction call passes all seven positional arguments", () => {
  it("canary: a six-argument call (the pre-existing baselined defect) is measured as six, not seven", () => {
    const buggy = "const result = await gradeRepoAction(row.repo, instructions, rubric, provider, undefined, column.folder);";
    expect(callArgs(buggy, "gradeRepoAction")).toHaveLength(6);
  });

  it("canary: a seven-argument call, including one nested-call argument, is measured correctly", () => {
    const fixed =
      "const result = await gradeRepoAction(row.repo, instructions, resolved.text, provider, undefined, column.folder, useReadmeInstructions);";
    const args = callArgs(fixed, "gradeRepoAction");
    expect(args).toHaveLength(7);
    expect(args[6]).toBe("useReadmeInstructions");
  });

  it("useRepoGradesGradingActions.ts's per-cell call passes useReadmeInstructions as its SEVENTH argument", () => {
    const args = callArgs(gradingActionsSource, "gradeRepoAction");
    expect(args.length).toBeGreaterThanOrEqual(7);
    expect(args[6]).toBe("useReadmeInstructions");
  });

  it("the third argument (the rubric) is the RESOLVED rubric's text, never a bare page-level `rubric` variable", () => {
    const args = callArgs(gradingActionsSource, "gradeRepoAction");
    expect(args[2]).toBe("resolved.text");
  });

  // AMENDED 2026-08-26. This assertion used to read
  // `expect(...).toHaveLength(7)` under the heading "no eighth positional
  // argument was added", pinning an exact ARITY. That over-specified: it
  // pinned the SPELLING of the call rather than the FACT the guard exists to
  // protect, which is that `useReadmeInstructions` still reaches the action
  // in its seventh position (docs/REGRESSION.md entry 352's defect).
  //
  // When `gradeRepoAction` later gained a genuinely optional eighth
  // parameter (`runCode`, the opt-in execution-scoring flag), the exact-arity
  // assertion forced the implementation into a contortion: the call was
  // duplicated into `if (!runCodeScoring) { <7-arg call> } else { <8-arg
  // call> }` with a comment warning that the seven-argument branch "must stay
  // first" because this guard reads only the FIRST call site. That is two
  // call sites that can silently drift, written that way solely to keep a
  // text scan green - the exact failure mode this project has recorded
  // before ("source-text tests over-specify: pin the fact and the ordering,
  // never the spelling").
  //
  // The guard now pins the fact. An eighth argument is permitted; the
  // seventh being `useReadmeInstructions` is not. The canaries below still
  // prove a six-argument call is caught, which is the defect that mattered.
  it("permits a genuinely optional eighth argument, while still pinning the seventh", () => {
    const withRunCode =
      "const result = await gradeRepoAction(row.repo, instructions, resolved.text, provider, undefined, column.folder, useReadmeInstructions, runCodeScoring);";
    const args = callArgs(withRunCode, "gradeRepoAction");
    expect(args).toHaveLength(8);
    expect(args[6]).toBe("useReadmeInstructions");
  });

  it("canary: an eighth argument does NOT rescue a call that dropped useReadmeInstructions", () => {
    // Proves the relaxed length check did not weaken the guard: a call that
    // still omits the seventh argument fails, even though it has eight
    // positions filled by something.
    const stillBroken =
      "const result = await gradeRepoAction(row.repo, instructions, resolved.text, provider, undefined, column.folder, runCodeScoring);";
    const args = callArgs(stillBroken, "gradeRepoAction");
    expect(args[6]).not.toBe("useReadmeInstructions");
  });
});

// ---------------------------------------------------------------------------
// Guard 5 (AC item 44) - index.tsx passes RepoGradesGrid a rubric
// description STRING it got from the picker hook; it must never resolve or
// fetch one itself.
// ---------------------------------------------------------------------------

describe("AC item 44: index.tsx wires the picker hook's describeColumn straight into the grid", () => {
  it("canary: a grid render with no describeColumnRubric prop does not satisfy the check", () => {
    const missing = "<RepoGradesGrid columns={columns} rows={rows} />";
    expect(missing).not.toMatch(/describeColumnRubric=\{rubricSource\.describeColumn\}/);
  });

  it("index.tsx calls useRepoGradesRubricSource once, assigning its result to `rubricSource`", () => {
    expect(indexSource).toMatch(/const rubricSource = useRepoGradesRubricSource\(\{/);
  });

  it("index.tsx passes rubricSource.describeColumn straight through as RepoGradesGrid's describeColumnRubric prop", () => {
    expect(indexSource).toMatch(/describeColumnRubric=\{rubricSource\.describeColumn\}/);
  });
});

// ---------------------------------------------------------------------------
// Guard 6 (AC item 76) - the prologue gate and the log's "Rubric used" gate
// were the SAME expression on the SAME variable in the pre-feature baseline
// (docs/REGRESSION.md entry 352). Item 72 changes one, item 64 changes the
// other; this guard fails if EITHER is left testing the page-level string.
// ---------------------------------------------------------------------------

describe("AC item 76: the prologue gate and the log's rubric gate were BOTH updated, not just one", () => {
  it("canary: the pre-feature baseline had both gates as the identical page-level expression", () => {
    const buggyBoth =
      'const rubricNote = rubric.trim() === "" ? `Rubric used: ${result.rubric}` : "";\n' +
      'if (rubric.trim() === "" && targets.length > 0) {\n' +
      "  await establishSharedRubric(targets, rubric, attempt, onAttempted);\n" +
      "}";
    expect(stripJsComments(buggyBoth)).toMatch(/\brubric\.trim\(\) === ""/g);
    // Both occurrences present in the buggy baseline - the guard below
    // requires ZERO occurrences once the feature has actually landed.
    expect((stripJsComments(buggyBoth).match(/\brubric\.trim\(\) === ""/g) ?? []).length).toBe(2);
  });

  it("useRepoGradesBulkGrade.ts contains no occurrence at all of the old shared page-level gate expression", () => {
    // A single, decisive pin: after the feature lands, the literal
    // `rubric.trim() === ""` (the page-level field's own blank check) cannot
    // appear anywhere in this file - not in the prologue gate (item 72,
    // fixed to `resolved.text.trim() === ""`) and not in the log's rubric
    // gate (item 64, fixed to `describeResolvedRubricForLog(...)`, which
    // performs no page-level blank check at all). Either one left un-updated
    // would still leave this string somewhere in the file.
    expect(stripJsComments(bulkGradeSource)).not.toMatch(/\brubric\.trim\(\) === ""/);
  });

  it("the bulk hook's log-detail line calls describeResolvedRubricForLog, replacing the old blank-string ternary", () => {
    expect(bulkGradeSource).toMatch(/const rubricNote = describeResolvedRubricForLog\(resolved, result\.rubric\);/);
  });

  it("the per-cell hook's log-detail line does the same (AC item 64, the per-cell counterpart)", () => {
    expect(gradingActionsSource).toMatch(/const rubricNote = describeResolvedRubricForLog\(resolved, result\.rubric\);/);
    expect(stripJsComments(gradingActionsSource)).not.toMatch(/\brubric\.trim\(\) === ""/);
  });
});

// ---------------------------------------------------------------------------
// Guard 7 (AC item 45's own prerequisite, restated as U set-state-in-effect
// hygiene) - useRepoGradesRubricSource.ts (sibling agent X's file, read here
// only as text) must have no useEffect that calls setState synchronously.
// Read defensively above: a not-yet-landed sibling file skips only this one
// guard, not the whole suite.
// ---------------------------------------------------------------------------

/** Every `useEffect(() => { ... }` callback body in `source`, brace-matched. */
function extractUseEffectCallbackBodies(source: string): string[] {
  const cleaned = stripJsComments(source);
  const bodies: string[] = [];
  const re = /useEffect\(\s*\(\s*\)\s*=>\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cleaned)) !== null) {
    const braceStart = match.index + match[0].length - 1;
    let depth = 0;
    let i = braceStart;
    for (; i < cleaned.length; i++) {
      if (cleaned[i] === "{") depth++;
      else if (cleaned[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    bodies.push(cleaned.slice(braceStart + 1, i));
  }
  return bodies;
}

/** The portion of an effect body that runs SYNCHRONOUSLY, before entering
 *  any `async` function literal - this project's approved idiom (AGENTS
 *  memory: set-state-in-effect-idiom.md) is an inline async IIFE with a
 *  `cancelled` guard, setState only ever reached after an await. A
 *  `set...(` call reached before the first `async` is unconditionally hit
 *  the instant the effect runs. */
function synchronousPrefix(effectBody: string): string {
  const asyncIdx = effectBody.search(/\basync\b/);
  return asyncIdx === -1 ? effectBody : effectBody.slice(0, asyncIdx);
}

function hasSynchronousSetStateInEffect(source: string): boolean {
  return extractUseEffectCallbackBodies(source).some((body) => /\bset[A-Z]\w*\s*\(/.test(synchronousPrefix(body)));
}

describe("useRepoGradesRubricSource.ts has no useEffect that calls setState synchronously", () => {
  it("canary: a synchronous setState with no preceding await is detected", () => {
    const buggy = "useEffect(() => { setValue(1); }, []);";
    expect(hasSynchronousSetStateInEffect(buggy)).toBe(true);
  });

  it("canary: the approved async-IIFE-plus-cancelled-flag idiom is NOT flagged", () => {
    const good =
      "useEffect(() => { let cancelled = false; (async () => { const x = await fetchThing(); " +
      "if (cancelled) return; setValue(x); })(); return () => { cancelled = true; }; }, []);";
    expect(hasSynchronousSetStateInEffect(good)).toBe(false);
  });

  it("useRepoGradesRubricSource.ts has no synchronous setState inside a useEffect", () => {
    if (rubricSourceHookText === null) {
      // Sibling agent X's file has not landed yet at the moment this suite
      // ran - see this file's top-of-module defensive read. This guard
      // begins enforcing automatically once that file exists; it is not
      // silently skipped forever.
      return;
    }
    expect(hasSynchronousSetStateInEffect(rubricSourceHookText)).toBe(false);
  });
});
