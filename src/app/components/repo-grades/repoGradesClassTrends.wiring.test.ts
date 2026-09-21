// A16 wave 3 (docs/a16-wave3-scope.md revision 1, section 13.2): AST wiring
// guards over the control-path claims section 7.4 makes, plus the
// declaration/binding claims section 9 makes. Parsed with the TypeScript
// compiler's own parser, never a regex over raw text (section 6's own
// precedent, repoGradesFeedbackAndFiles.wiring.test.ts's R-5e). New file: the
// two hosting wiring files are already 810 lines and long (section 10).
//
// Helpers are DUPLICATED into this file, never imported from another
// *.test.ts (no-cross-test-file-imports).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");
type Node = import("typescript").Node;
type Stmt = import("typescript").Statement;
type Expr = import("typescript").Expression;
type SF = import("typescript").SourceFile;
type Block = import("typescript").Block;
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const BULK_HOOK_SOURCE = read("src/app/components/repo-grades/useRepoGradesBulkGrade.ts");
const ACTIONS_HOOK_SOURCE = read("src/app/components/repo-grades/useRepoGradesGradingActions.ts");
const INDEX_SOURCE = read("src/app/components/repo-grades/index.tsx");

const bulkHookFile = ts.createSourceFile("bulk.ts", BULK_HOOK_SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const actionsHookFile = ts.createSourceFile("actions.ts", ACTIONS_HOOK_SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const indexFile = ts.createSourceFile("index.tsx", INDEX_SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// ---- Generic AST helpers, reused by every A-row and its canary. ----
function isIdent(node: Node | undefined, name: string): boolean {
  return !!node && ts.isIdentifier(node) && node.text === name;
}
function isNullLiteral(node: Node | undefined): boolean {
  return !!node && node.kind === ts.SyntaxKind.NullKeyword;
}
/** `a.b.c` against path ["a","b","c"]; also matches a bare identifier. */
function isPropChain(expr: Expr, path: string[]): boolean {
  const parts: string[] = [];
  let node: Expr = expr;
  while (ts.isPropertyAccessExpression(node)) {
    parts.unshift(node.name.text);
    node = node.expression;
  }
  if (!ts.isIdentifier(node)) return false;
  parts.unshift(node.text);
  return parts.join(".") === path.join(".");
}
/** Finds the Block body of `function name(){}`, `const name = (...)=>{}`, or
 * `const name = async (...)=>{}`, by name, anywhere in `sourceFile`. */
function findFunctionBody(sourceFile: SF, name: string): Block | undefined {
  let found: Block | undefined;
  function visit(node: Node): void {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name && node.body) found = node.body;
    if (ts.isVariableDeclaration(node) && isIdent(node.name, name) && node.initializer) {
      const init = node.initializer;
      if ((ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && ts.isBlock(init.body)) found = init.body;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}
/** A Block's DIRECT statements - the control-path instrument: a match found
 * only by scanning this array, never by recursing into an if/loop/callback,
 * IS a direct statement by construction. */
function directStmts(block: Block): Stmt[] {
  return [...block.statements];
}
function countIdentRefs(root: Node, name: string): number {
  let n = 0;
  (function visit(node: Node): void {
    if (isIdent(node, name)) n += 1;
    ts.forEachChild(node, visit);
  })(root);
  return n;
}
function countCallsTo(root: Node, name: string): number {
  let n = 0;
  (function visit(node: Node): void {
    if (ts.isCallExpression(node) && isIdent(node.expression, name)) n += 1;
    ts.forEachChild(node, visit);
  })(root);
  return n;
}
function countIfStatements(root: Node): number {
  let n = 0;
  (function visit(node: Node): void {
    if (ts.isIfStatement(node)) n += 1;
    ts.forEachChild(node, visit);
  })(root);
  return n;
}
/** True when `stmt` is `<collector>.push(...<chain>)`. */
function isSpreadPush(stmt: Stmt, collector: string, chain: string[]): boolean {
  if (!ts.isExpressionStatement(stmt) || !ts.isCallExpression(stmt.expression)) return false;
  const callee = stmt.expression.expression;
  if (!ts.isPropertyAccessExpression(callee) || !isIdent(callee.expression, collector) || callee.name.text !== "push") return false;
  const [arg] = stmt.expression.arguments;
  return stmt.expression.arguments.length === 1 && ts.isSpreadElement(arg) && isPropChain(arg.expression, chain);
}
function setLastRunCohortCalls(stmts: Stmt[]): import("typescript").CallExpression[] {
  return stmts
    .filter((s): s is import("typescript").ExpressionStatement => ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) && isIdent((s.expression as import("typescript").CallExpression).expression, "setLastRunCohort"))
    .map((s) => s.expression as import("typescript").CallExpression);
}
function parseFixture(src: string, tsx = false): SF {
  return ts.createSourceFile("f", src, ts.ScriptTarget.Latest, true, tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

// ---- A-1: useRepoGradesBulkGrade.ts's gradeOneTarget push ----

describe("A-1: gradeOneTarget's collector push is direct and follows both early-return ifs", () => {
  const stmts = directStmts(findFunctionBody(bulkHookFile, "gradeOneTarget")!);
  it("a direct statement spreads result.run.results onto runResults, after >=2 direct ifs", () => {
    const idx = stmts.findIndex((s) => isSpreadPush(s, "runResults", ["result", "run", "results"]));
    expect(idx).toBeGreaterThan(-1);
    expect(stmts.slice(0, idx).filter(ts.isIfStatement).length).toBeGreaterThanOrEqual(2);
  });
  it("canary S-25: `if (first) { runResults.push(...) }` is NOT a direct statement", () => {
    const fixture = `const gradeOneTarget = async (t, r) => {
      if ("error" in result) return { rubricUsed: null };
      if ("noSubmission" in result) return { rubricUsed: null };
      if (first) { runResults.push(...result.run.results); }
      return { rubricUsed: result.rubric };
    };`;
    const s = directStmts(findFunctionBody(parseFixture(fixture), "gradeOneTarget")!);
    expect(s.some((x) => isSpreadPush(x, "runResults", ["result", "run", "results"]))).toBe(false);
  });
});

// ---- A-2: useRepoGradesBulkGrade.ts's runBulkGrade ----

describe("A-2: runBulkGrade's refusal, collector declaration, and return", () => {
  const stmts = directStmts(findFunctionBody(bulkHookFile, "runBulkGrade")!);
  it("(a) FIRST direct statement is `if (runningFolder !== null) return null;`", () => {
    const first = stmts[0];
    expect(ts.isIfStatement(first)).toBe(true);
    if (!ts.isIfStatement(first)) return;
    const cond = first.expression;
    expect(ts.isBinaryExpression(cond) && cond.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken).toBe(true);
    if (ts.isBinaryExpression(cond)) {
      expect(isIdent(cond.left, "runningFolder") && isNullLiteral(cond.right)).toBe(true);
    }
    const ret = ts.isBlock(first.thenStatement) ? first.thenStatement.statements[0] : first.thenStatement;
    expect(ts.isReturnStatement(ret) && isNullLiteral(ret.expression)).toBe(true);
  });

  // "runResults" is A-1's own collector name - not re-discovered generically,
  // so this row and A-1 name the same identifier by construction.
  function collectorDecl() {
    for (const s of stmts) {
      if (!ts.isVariableStatement(s) || !(s.declarationList.flags & ts.NodeFlags.Const)) continue;
      const [d] = s.declarationList.declarations;
      if (d && isIdent(d.name, "runResults") && d.initializer && ts.isArrayLiteralExpression(d.initializer) && d.initializer.elements.length === 0) return d;
    }
    return undefined;
  }
  it("(b) a direct `const runResults: T[] = []` declares the collector", () => {
    expect(collectorDecl()).toBeTruthy();
  });
  it("(c) runResults is never the LEFT side of an assignment anywhere in the file", () => {
    let assigned = false;
    (function visit(node: Node): void {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && isIdent(node.left, "runResults")) assigned = true;
      ts.forEachChild(node, visit);
    })(bulkHookFile);
    expect(assigned).toBe(false);
  });
  it("(d) the LAST direct statement returns runResults, preceded by an awaited Promise.all", () => {
    const last = stmts[stmts.length - 1];
    expect(ts.isReturnStatement(last) && isIdent(last.expression, "runResults")).toBe(true);
    const hasAwaitedAll = stmts.slice(0, -1).some(
      (s) => ts.isExpressionStatement(s) && ts.isAwaitExpression(s.expression) && ts.isCallExpression(s.expression.expression) && isPropChain(s.expression.expression.expression, ["Promise", "all"])
    );
    expect(hasAwaitedAll).toBe(true);
  });
  it("canary S-26: a useRef-backed collector is not a direct const array-literal declaration", () => {
    const fixture = `const runBulkGrade = async (p, r) => {
      if (runningFolder !== null) return null;
      const runResults = collectorRef.current;
      await Promise.all([]);
      return runResults;
    };`;
    const s = directStmts(findFunctionBody(parseFixture(fixture), "runBulkGrade")!);
    const hasArrayDecl = s.some((x) => ts.isVariableStatement(x) && x.declarationList.flags & ts.NodeFlags.Const && x.declarationList.declarations[0]?.initializer && ts.isArrayLiteralExpression(x.declarationList.declarations[0].initializer!));
    expect(hasArrayDecl).toBe(false);
  });
});

// ---- A-3: useRepoGradesGradingActions.ts's handleGradeColumn ----
function containsAwait(node: Node): boolean {
  let found = false;
  (function visit(n: Node): void {
    if (ts.isAwaitExpression(n)) found = true;
    ts.forEachChild(n, visit);
  })(node);
  return found;
}

describe("A-3: handleGradeColumn - one if, an attempt-time clear, an unconditional final set", () => {
  const body = findFunctionBody(actionsHookFile, "handleGradeColumn")!;
  const stmts = directStmts(body);
  it("exactly one IfStatement (the pre-existing empty-plan return), with no setLastRunCohort in its then-block", () => {
    expect(countIfStatements(body)).toBe(1);
    const ifStmt = stmts.find(ts.isIfStatement)!;
    const thenStmts = ts.isBlock(ifStmt.thenStatement) ? [...ifStmt.thenStatement.statements] : [ifStmt.thenStatement];
    expect(setLastRunCohortCalls(thenStmts)).toHaveLength(0);
  });
  it("(a) exactly one setLastRunCohort(null), after the if and before the first await-containing statement", () => {
    const ifIndex = stmts.findIndex(ts.isIfStatement);
    const firstAwaitIndex = stmts.findIndex((s) => containsAwait(s));
    const nullClears = stmts.filter(
      (s, i) => i > ifIndex && i < firstAwaitIndex && ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) && isIdent(s.expression.expression, "setLastRunCohort") && isNullLiteral(s.expression.arguments[0])
    );
    expect(nullClears).toHaveLength(1);
  });
  it("(b) exactly one other setLastRunCohort call, the handler's LAST direct statement, unconditional", () => {
    expect(setLastRunCohortCalls(stmts)).toHaveLength(2); // the attempt-time clear, plus this one
    const last = stmts[stmts.length - 1];
    expect(ts.isExpressionStatement(last) && ts.isCallExpression(last.expression) && isIdent(last.expression.expression, "setLastRunCohort")).toBe(true);
    if (ts.isExpressionStatement(last) && ts.isCallExpression(last.expression)) {
      const [arg] = last.expression.arguments;
      expect(last.expression.arguments).toHaveLength(1);
      expect(ts.isCallExpression(arg) && isIdent(arg.expression, "buildRepoRunCohort")).toBe(true);
    }
  });
  it("(c) the object literal binds folder/courseId/course by shorthand, results to the preceding awaited runBulkGrade call", () => {
    const last = stmts[stmts.length - 1] as import("typescript").ExpressionStatement;
    const outer = last.expression as import("typescript").CallExpression;
    const inner = outer.arguments[0] as import("typescript").CallExpression; // buildRepoRunCohort(...)
    const literal = inner.arguments[0] as import("typescript").ObjectLiteralExpression;
    const props = new Map<string, Expr>();
    for (const p of literal.properties) {
      if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) props.set(p.name.text, p.initializer);
      if (ts.isShorthandPropertyAssignment(p)) props.set(p.name.text, p.name);
    }
    expect(props.size).toBe(4);
    expect(isIdent(props.get("folder"), "folder") && isIdent(props.get("courseId"), "courseId") && isIdent(props.get("course"), "course")).toBe(true);

    const resultsIdent = props.get("results");
    expect(resultsIdent && ts.isIdentifier(resultsIdent)).toBe(true);
    const resultsName = (resultsIdent as import("typescript").Identifier).text;
    const declIndex = stmts.findIndex((s) => {
      if (!ts.isVariableStatement(s)) return false;
      const [d] = s.declarationList.declarations;
      if (!d || !isIdent(d.name, resultsName) || !d.initializer || !ts.isAwaitExpression(d.initializer)) return false;
      const call = d.initializer.expression;
      return ts.isCallExpression(call) && isIdent(call.expression, "runBulkGrade");
    });
    expect(declIndex).toBeGreaterThan(-1);
    expect(declIndex).toBeLessThan(stmts.length - 1);
  });
  it("canary S-24: wrapping the final set in `if (r?.length === 0)` yields a SECOND IfStatement", () => {
    const fixture = `const handleGradeColumn = async (folder) => {
      const plan = buildBulkGradePlan({});
      if (plan.targets.length === 0) { return; }
      setLastRunCohort(null);
      const runResults = await runBulkGrade(plan, resolved);
      if (runResults?.length === 0) { setLastRunCohort(buildRepoRunCohort({ results: runResults, folder, courseId, course })); }
    };`;
    expect(countIfStatements(findFunctionBody(parseFixture(fixture), "handleGradeColumn")!)).toBe(2);
  });
});

// ---- A-4: the course-switch clear ----

describe("A-4: the course-switch branch clears lastRunCohort", () => {
  it("setLastRunCohort(null) is a direct child of the `courseId !== columnPostingResetForCourse` if's then-block", () => {
    let found = false;
    (function visit(node: Node): void {
      if (ts.isIfStatement(node) && ts.isBinaryExpression(node.expression) && node.expression.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken && isIdent(node.expression.left, "courseId") && isIdent(node.expression.right, "columnPostingResetForCourse")) {
        const thenStmts = ts.isBlock(node.thenStatement) ? [...node.thenStatement.statements] : [node.thenStatement];
        found = thenStmts.some((s) => ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) && isIdent(s.expression.expression, "setLastRunCohort") && isNullLiteral(s.expression.arguments[0]));
      }
      ts.forEachChild(node, visit);
    })(actionsHookFile);
    expect(found).toBe(true);
  });
});

// ---- A-5: trendsEntry and the hook's surrounding invariants ----

describe("A-5: trendsEntry, and the hook's other invariants", () => {
  const stmts = directStmts(findFunctionBody(actionsHookFile, "useRepoGradesGradingActions")!);
  it("a direct statement: trendsEntry = repoRunTrendsEntry(lastRunCohort, courseId), both bare identifiers", () => {
    const decl = stmts.find((s) => ts.isVariableStatement(s) && isIdent(s.declarationList.declarations[0]?.name, "trendsEntry")) as import("typescript").VariableStatement | undefined;
    expect(decl).toBeTruthy();
    const init = decl!.declarationList.declarations[0].initializer;
    expect(init && ts.isCallExpression(init) && isIdent(init.expression, "repoRunTrendsEntry")).toBe(true);
    if (init && ts.isCallExpression(init)) {
      expect(init.arguments).toHaveLength(2);
      expect(isIdent(init.arguments[0], "lastRunCohort") && isIdent(init.arguments[1], "courseId")).toBe(true);
    }
  });
  it("the returned object literal includes trendsEntry; hasTrendableResults is unreferenced; setLastRunCohort has exactly 3 call sites", () => {
    const returnStmt = stmts.find(ts.isReturnStatement) as import("typescript").ReturnStatement | undefined;
    expect(returnStmt?.expression && ts.isObjectLiteralExpression(returnStmt.expression)).toBe(true);
    const props = (returnStmt!.expression as import("typescript").ObjectLiteralExpression).properties;
    expect(props.some((p) => ts.isShorthandPropertyAssignment(p) && p.name.text === "trendsEntry")).toBe(true);
    expect(countIdentRefs(actionsHookFile, "hasTrendableResults")).toBe(0);
    expect(countCallsTo(actionsHookFile, "setLastRunCohort")).toBe(3);
  });
});

// ---- A-6/A-7/A-8: index.tsx's mount, its label, and their source position ----
function skipParens(node: Node): Node {
  return ts.isParenthesizedExpression(node.parent) ? node.parent : node;
}
/** Walks from `wrapper` (the element directly enclosing the mount) up to the
 * render root, requiring EXACTLY the chain section 13.2's A-6 row names: an
 * optional parens, one `trendsEntry &&` BinaryExpression, a JsxExpression,
 * the top-level JsxFragment, and a ReturnStatement - "enumerate the whole
 * path" (ruling W3-1(b)), not "find one ancestor". Returns the gating
 * JsxExpression on success, for A-8's sibling-order check. */
function gatePathFromWrapper(wrapper: Node): import("typescript").JsxExpression | null {
  let node = skipParens(wrapper);
  const bin = node.parent;
  if (!ts.isBinaryExpression(bin) || bin.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) return null;
  if (!isIdent(bin.left, "trendsEntry") || bin.right !== node) return null;
  node = skipParens(bin);
  if (!ts.isJsxExpression(node.parent)) return null;
  const jsxExpr = node.parent;
  if (!ts.isJsxFragment(jsxExpr.parent)) return null;
  const up = skipParens(jsxExpr.parent);
  return ts.isReturnStatement(up.parent) ? jsxExpr : null;
}
function findJsxSelfClosing(root: Node, tagName: string): import("typescript").JsxSelfClosingElement[] {
  const found: import("typescript").JsxSelfClosingElement[] = [];
  (function visit(node: Node): void {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === tagName) found.push(node);
    ts.forEachChild(node, visit);
  })(root);
  return found;
}
function containsTag(node: Node, tagName: string): boolean {
  let found = false;
  (function visit(n: Node): void {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText() === tagName) found = true;
    ts.forEachChild(n, visit);
  })(node);
  return found;
}
/** The three fixture shapes section 13.2 requires as canaries for the mount
 * gate, each expected to fail. */
const A6_CANARIES: Array<[string, string]> = [
  [
    "a correct gate wrapping a negated one",
    `function C() { return (<>{trendsEntry && (<div>{!trendsEntry && <ClassTrendsPanel entry={trendsEntry} defaultExpanded />}</div>)}</>); }`,
  ],
  [
    "S-23a: left operand is not bare trendsEntry",
    `function C() { return (<>{model && trendsEntry && (<div><ClassTrendsPanel entry={trendsEntry} defaultExpanded /></div>)}</>); }`,
  ],
  [
    "S-23b: a ConditionalExpression sits on the path",
    `function C() { return (<>{flag ? (trendsEntry && (<div><ClassTrendsPanel entry={trendsEntry} defaultExpanded /></div>)) : null}</>); }`,
  ],
];

describe("A-6: index.tsx mounts exactly one ClassTrendsPanel, gated by the enumerated path", () => {
  const panels = findJsxSelfClosing(indexFile, "ClassTrendsPanel");
  it("imports the default export from ../drafted-grades/ClassTrendsPanel", () => {
    expect(/import\s+ClassTrendsPanel\s+from\s+"\.\.\/drafted-grades\/ClassTrendsPanel"/.test(INDEX_SOURCE)).toBe(true);
  });
  it("exactly one <ClassTrendsPanel>, entry={trendsEntry} (bare), defaultExpanded present with NO value (Tightening 3)", () => {
    expect(panels).toHaveLength(1);
    const [panel] = panels;
    const entryAttr = panel.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === "entry") as import("typescript").JsxAttribute | undefined;
    expect(entryAttr?.initializer && ts.isJsxExpression(entryAttr.initializer) && isIdent(entryAttr.initializer.expression, "trendsEntry")).toBe(true);
    const expandedAttr = panel.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === "defaultExpanded") as import("typescript").JsxAttribute | undefined;
    expect(expandedAttr && expandedAttr.initializer === undefined).toBe(true);
  });
  it("the enumerated ancestor path from the panel's wrapper to the render root holds (the intended shape passes)", () => {
    expect(ts.isJsxElement(panels[0].parent)).toBe(true);
    expect(gatePathFromWrapper(panels[0].parent)).not.toBeNull();
  });

  it.each(A6_CANARIES)("canary: %s -> fails", (_label, fixture) => {
    const [panel] = findJsxSelfClosing(parseFixture(fixture, true), "ClassTrendsPanel");
    const passes = ts.isJsxElement(panel.parent) && gatePathFromWrapper(panel.parent) !== null;
    expect(passes).toBe(false);
  });
});

describe("A-7: the label sits inside the panel's own wrapper, imported from the leaf, with no role/aria", () => {
  it("exactly one repoRunTrendsLabel(trendsEntry) call, inside a role/aria-free <p> that is a sibling of the panel, in the SAME wrapper", () => {
    const calls: import("typescript").CallExpression[] = [];
    (function visit(node: Node): void {
      if (ts.isCallExpression(node) && isIdent(node.expression, "repoRunTrendsLabel")) calls.push(node);
      ts.forEachChild(node, visit);
    })(indexFile);
    expect(calls).toHaveLength(1);
    expect(calls[0].arguments).toHaveLength(1);
    expect(isIdent(calls[0].arguments[0], "trendsEntry")).toBe(true);

    let node: Node = calls[0];
    expect(ts.isJsxExpression(node.parent)).toBe(true);
    node = node.parent;
    const pElement = node.parent;
    expect(ts.isJsxElement(pElement) && pElement.openingElement.tagName.getText() === "p").toBe(true);
    if (ts.isJsxElement(pElement)) {
      // .getText(), not .text: JsxAttributeName is Identifier | JsxNamespacedName,
      // and only the former has .text - getText() handles both without a cast,
      // and a namespaced name (`ns:role`) correctly never matches either literal.
      expect(pElement.openingElement.attributes.properties.some((p) => ts.isJsxAttribute(p) && (p.name.getText() === "role" || p.name.getText().startsWith("aria")))).toBe(false);
    }
    const [panel] = findJsxSelfClosing(indexFile, "ClassTrendsPanel");
    expect(pElement.parent).toBe(panel.parent);
    expect(/import\s*\{\s*repoRunTrendsLabel\s*\}\s*from\s*"\.\/classTrendsFolderEntry"/.test(INDEX_SOURCE)).toBe(true);
  });
});

describe("A-8: source position and binding", () => {
  it("the gate sits, among the top-level fragment's children, after postSummary's and before RepoGradesGrid's", () => {
    const [panel] = findJsxSelfClosing(indexFile, "ClassTrendsPanel");
    const gateExpr = gatePathFromWrapper(panel.parent)!;
    const fragment = gateExpr.parent as import("typescript").JsxFragment;
    const children = fragment.children.filter((c) => !(ts.isJsxText(c) && c.text.trim() === ""));
    const postSummaryIndex = children.findIndex((c) => ts.isJsxExpression(c) && c.expression && ts.isBinaryExpression(c.expression) && isIdent(c.expression.left, "postSummary"));
    const gridIndex = children.findIndex((c) => containsTag(c, "RepoGradesGrid"));
    const gateIndex = children.indexOf(gateExpr);
    expect(postSummaryIndex).toBeGreaterThan(-1);
    expect(gridIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeGreaterThan(postSummaryIndex);
    expect(gateIndex).toBeLessThan(gridIndex);
  });
  it("hasTrendableResults is unreferenced, and trendsEntry is bound by exactly one destructuring pattern", () => {
    expect(countIdentRefs(indexFile, "hasTrendableResults")).toBe(0);
    expect(countIdentRefs(indexFile, "trendsEntry")).toBeGreaterThan(1);
    let bindingCount = 0;
    (function visit(node: Node): void {
      if (ts.isBindingElement(node) && isIdent(node.name, "trendsEntry")) bindingCount += 1;
      ts.forEachChild(node, visit);
    })(indexFile);
    expect(bindingCount).toBe(1);
  });
});
