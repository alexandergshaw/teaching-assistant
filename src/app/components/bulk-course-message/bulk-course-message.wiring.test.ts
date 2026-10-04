// A29 W3: AST wiring and source-text guards over the course-wide message
// surface (docs/a29-w3-test-notes.md R2-R7, R9-R13). Nothing here renders a
// component: every claim is about source structure. Helpers are DUPLICATED
// into this file, never imported from another *.test.ts.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");
type Node = import("typescript").Node;
type SF = import("typescript").SourceFile;
type Block = import("typescript").Block;

const PANEL_DIR = "src/app/components/bulk-course-message";
const HOST_FILE = "src/app/components/announcements/AnnouncementsSubTab.tsx";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}
function parse(src: string, tsx = false): SF {
  return ts.createSourceFile("f", src, ts.ScriptTarget.Latest, true, tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function panelSources(): Array<{ name: string; src: string; sf: SF }> {
  return readdirSync(join(process.cwd(), PANEL_DIR))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f))
    .map((name) => {
      const src = read(`${PANEL_DIR}/${name}`);
      return { name, src, sf: parse(src, name.endsWith(".tsx")) };
    });
}
const PANEL = panelSources();
function panelFile(name: string): SF {
  const f = PANEL.find((p) => p.name === name);
  if (!f) throw new Error(`missing ${name}`);
  return f.sf;
}
const panelSf = panelFile("BulkCourseMessagePanel.tsx");
const modelSf = panelFile("bulk-message-model.ts");

function isIdent(node: Node | undefined, name: string): boolean {
  return !!node && ts.isIdentifier(node) && node.text === name;
}
function walk(root: Node, fn: (n: Node) => void): void {
  (function visit(n: Node): void {
    fn(n);
    ts.forEachChild(n, visit);
  })(root);
}
function findFunction(sf: SF, name: string): { body: Block; params: readonly import("typescript").ParameterDeclaration[] } | undefined {
  let found: { body: Block; params: readonly import("typescript").ParameterDeclaration[] } | undefined;
  walk(sf, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name && n.body) found = { body: n.body, params: n.parameters };
  });
  return found;
}
function callsTo(root: Node, name: string): import("typescript").CallExpression[] {
  const out: import("typescript").CallExpression[] = [];
  walk(root, (n) => {
    if (ts.isCallExpression(n) && isIdent(n.expression, name)) out.push(n);
  });
  return out;
}
function countIdent(root: Node, name: string): number {
  let n = 0;
  walk(root, (x) => {
    if (isIdent(x, name)) n += 1;
  });
  return n;
}
function enclosingFunction(node: Node): import("typescript").FunctionLikeDeclaration | undefined {
  let n: Node | undefined = node.parent;
  while (n && !ts.isFunctionDeclaration(n) && !ts.isArrowFunction(n) && !ts.isFunctionExpression(n)) n = n.parent;
  return n as import("typescript").FunctionLikeDeclaration | undefined;
}
function countAnyJsxByTag(root: Node, tagName: string): number {
  let n = 0;
  walk(root, (x) => {
    if (ts.isJsxSelfClosingElement(x) && x.tagName.getText() === tagName) n += 1;
    if (ts.isJsxElement(x) && x.openingElement.tagName.getText() === tagName) n += 1;
  });
  return n;
}

// ---- Fixtures-aware detectors, each exercised by a canary below ----

function actionCallInfo(sf: SF, name: string): Array<{ args: number }> {
  return callsTo(sf, name).map((c) => ({ args: c.arguments.length }));
}

/** Object literals that carry all five ConfirmedMessage field names. */
function confirmedLiterals(sf: SF): import("typescript").ObjectLiteralExpression[] {
  const need = ["courseId", "courseName", "count", "subject", "body"];
  const out: import("typescript").ObjectLiteralExpression[] = [];
  walk(sf, (n) => {
    if (!ts.isObjectLiteralExpression(n)) return;
    const names = new Set<string>();
    for (const p of n.properties) {
      if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && ts.isIdentifier(p.name)) names.add(p.name.text);
    }
    if (need.every((k) => names.has(k))) out.push(n);
  });
  return out;
}

/** Value-imported action identifiers (specifier under /actions/ or the barrel). */
function actionValueImports(sf: SF): string[] {
  const out: string[] = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    if (!(spec.includes("/actions/") || spec.endsWith("/actions"))) continue;
    const clause = st.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (clause.name) out.push(clause.name.text);
    const nb = clause.namedBindings;
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) if (!el.isTypeOnly) out.push(el.name.text);
  }
  return out;
}

function valueImportSpecifiers(sf: SF): string[] {
  const out: string[] = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (st.importClause?.isTypeOnly) continue;
    out.push(st.moduleSpecifier.text);
  }
  return out;
}

const FORBIDDEN_WORDS = /\b(delivered|received|emailed|sent)\b/i;

/** Every string-bearing node: string literal, no-substitution template,
 * template head/middle/tail, JSX text. Comments are not AST nodes, so a word in
 * a comment is invisible by construction. */
function stringNodes(root: Node): string[] {
  const out: string[] = [];
  walk(root, (n) => {
    if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n) ||
      ts.isJsxText(n)
    ) {
      out.push(n.text);
    }
  });
  return out;
}
function forbiddenHits(root: Node): string[] {
  return stringNodes(root).filter((t) => FORBIDDEN_WORDS.test(t));
}

// ---- R10 / AC-W3-1: reach and mount ----

function walkSrc(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      walkSrc(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
}

describe("AC-W3-1: the control reaches the actions with the right arguments, and is mounted", () => {
  it("exactly one send call with 3 arguments and one preview call with 1", () => {
    expect(actionCallInfo(panelSf, "sendBulkCourseMessageAction")).toEqual([{ args: 3 }]);
    expect(actionCallInfo(panelSf, "previewBulkCourseMessageAction")).toEqual([{ args: 1 }]);
  });
  it("both action identifiers import from the bulk-course-message action module", () => {
    let ok = false;
    for (const st of panelSf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      if (!st.moduleSpecifier.text.endsWith("/actions/bulk-course-message")) continue;
      const nb = st.importClause?.namedBindings;
      if (!nb || !ts.isNamedImports(nb)) continue;
      const names = nb.elements.map((e) => e.name.text);
      ok = names.includes("sendBulkCourseMessageAction") && names.includes("previewBulkCourseMessageAction");
    }
    expect(ok).toBe(true);
  });
  it("exactly one non-test file outside the panel directory mounts the panel, and it is the host", () => {
    const files: string[] = [];
    walkSrc(join(process.cwd(), "src"), files);
    const mounts = files
      .filter((f) => !f.replace(/\\/g, "/").includes(`/${PANEL_DIR}/`))
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        if (!src.includes("BulkCourseMessagePanel")) return false;
        return countAnyJsxByTag(parse(src, f.endsWith(".tsx")), "BulkCourseMessagePanel") > 0;
      })
      .map((f) => f.replace(/\\/g, "/").split("/src/")[1]);
    expect(mounts).toEqual([HOST_FILE.replace("src/", "")]);
  });
  it("canary: a second send call reports 2; a fixture with no mount reports 0", () => {
    const two = parse(`async function a(){ await sendBulkCourseMessageAction(1,2,3); await sendBulkCourseMessageAction(1,2,3); }`);
    expect(actionCallInfo(two, "sendBulkCourseMessageAction")).toHaveLength(2);
    const wrongArity = parse(`async function a(){ await sendBulkCourseMessageAction(1,2); }`);
    expect(actionCallInfo(wrongArity, "sendBulkCourseMessageAction")).toEqual([{ args: 2 }]);
    expect(countAnyJsxByTag(parse(`const x = <div />;`, true), "BulkCourseMessagePanel")).toBe(0);
    expect(countAnyJsxByTag(parse(`const x = <BulkCourseMessagePanel></BulkCourseMessagePanel>;`, true), "BulkCourseMessagePanel")).toBe(1);
  });
});

// ---- R2 / AC-W3-2 ----

describe("AC-W3-2: a send is constructible only via confirmFromPreview (AST-enforced, not type-enforced)", () => {
  it("exactly one ConfirmedMessage-shaped object literal across the panel directory, inside confirmFromPreview", () => {
    const all = PANEL.flatMap((p) => confirmedLiterals(p.sf));
    expect(all).toHaveLength(1);
    expect(enclosingFunction(all[0])?.name?.getText()).toBe("confirmFromPreview");
  });
  it("the function enclosing the send call takes a parameter annotated ConfirmedMessage", () => {
    const [call] = callsTo(panelSf, "sendBulkCourseMessageAction");
    const fn = enclosingFunction(call);
    expect(fn).toBeTruthy();
    expect(fn!.parameters).toHaveLength(1);
    expect(fn!.parameters[0].type?.getText()).toBe("ConfirmedMessage");
  });
  it("canary: a second literal is counted; a loose parameter type is detected", () => {
    const f = parse(`function confirmFromPreview(){ return { courseId, courseName, count, subject, body }; }
      function resend(){ return { courseId: a, courseName: b, count: 1, subject: s, body: t }; }`);
    expect(confirmedLiterals(f)).toHaveLength(2);
    const loose = parse(`async function run(m: { courseId: string }) { await sendBulkCourseMessageAction(m.courseId, 1, 2); }`);
    const fn = enclosingFunction(callsTo(loose, "sendBulkCourseMessageAction")[0]);
    expect(fn!.parameters[0].type?.getText()).not.toBe("ConfirmedMessage");
  });
});

// ---- R3 / AC-W3-3 ----

describe("AC-W3-3: the server actions the panel directory imports are an allowlist", () => {
  it("the value-imported action identifiers are exactly the four", () => {
    const names = PANEL.flatMap((p) => actionValueImports(p.sf)).sort();
    expect(names).toEqual(
      ["draftAnnouncementAction", "listCourseHubAction", "previewBulkCourseMessageAction", "sendBulkCourseMessageAction"].sort()
    );
  });
  it("no value import from @/lib/canvas*, @/lib/canvas-modules or @/lib/supabase*", () => {
    const bad = PANEL.flatMap((p) => valueImportSpecifiers(p.sf)).filter(
      (s) => s.startsWith("@/lib/canvas") || s.startsWith("@/lib/supabase")
    );
    expect(bad).toEqual([]);
  });
  it("canary: a fifth action import and a canvas value import are caught", () => {
    const f = parse(`import { listCourseRoster } from "@/app/actions/roster"; import { x } from "@/lib/canvas/listings"; import type { T } from "@/lib/supabase/courses.types";`);
    expect(actionValueImports(f)).toEqual(["listCourseRoster"]);
    expect(valueImportSpecifiers(f).filter((s) => s.startsWith("@/lib/canvas"))).toHaveLength(1);
    expect(valueImportSpecifiers(f).filter((s) => s.startsWith("@/lib/supabase"))).toEqual([]);
  });
});

// ---- R4 / AC-W3-4 ----

describe("AC-W3-4: the send arguments come from the confirmed object, never live state", () => {
  it("the three arguments are member accesses on the single ConfirmedMessage parameter, in order", () => {
    const [call] = callsTo(panelSf, "sendBulkCourseMessageAction");
    const fn = enclosingFunction(call)!;
    const param = fn.parameters[0].name.getText();
    const props = call.arguments.map((a) =>
      ts.isPropertyAccessExpression(a) && isIdent(a.expression, param) ? a.name.text : null
    );
    expect(props).toEqual(["courseId", "subject", "body"]);
  });
  it("canary: a live-state argument is not a member access on the parameter", () => {
    const f = parse(`async function run(m: ConfirmedMessage) { await sendBulkCourseMessageAction(m.courseId, subjectState, m.body); }`);
    const call = callsTo(f, "sendBulkCourseMessageAction")[0];
    const props = call.arguments.map((a) => (ts.isPropertyAccessExpression(a) && isIdent(a.expression, "m") ? a.name.text : null));
    expect(props).not.toEqual(["courseId", "subject", "body"]);
  });
});

// ---- R5 / AC-W3-5 ----

describe("AC-W3-5: the plain-text strip runs once, at draft-accept, inside reduceCompose", () => {
  it("exactly one call of canvasInboxPlainText in the panel directory, inside reduceCompose", () => {
    const calls = PANEL.flatMap((p) => callsTo(p.sf, "canvasInboxPlainText"));
    expect(calls).toHaveLength(1);
    let e: Node | undefined = calls[0];
    let inReduce = false;
    while (e) {
      if (ts.isFunctionDeclaration(e) && e.name?.text === "reduceCompose") inReduce = true;
      e = e.parent;
    }
    expect(inReduce).toBe(true);
  });
  it("the panel and its send handler never reference canvasInboxPlainText", () => {
    expect(countIdent(panelSf, "canvasInboxPlainText")).toBe(0);
    expect(countIdent(findFunction(panelSf, "runSend")!.body, "canvasInboxPlainText")).toBe(0);
  });
  it("the drafted dispatch happens only in handleDraft, and clearing only under an accepted outcome", () => {
    const kinds: string[] = [];
    walk(panelSf, (n) => {
      if (ts.isPropertyAssignment(n) && isIdent(n.name, "kind") && ts.isStringLiteral(n.initializer)) {
        let e: Node | undefined = n;
        let fnName = "";
        while (e) {
          if (ts.isFunctionDeclaration(e) && e.name) {
            fnName = e.name.text;
            break;
          }
          e = e.parent;
        }
        kinds.push(`${n.initializer.text}@${fnName}`);
      }
    });
    expect(kinds.filter((k) => k.startsWith("drafted@"))).toEqual(["drafted@handleDraft"]);
    expect(kinds.filter((k) => k.startsWith("cleared-after-accept@"))).toEqual(["cleared-after-accept@runSend"]);
    const accepted = findFunction(panelSf, "runSend")!.body.getText();
    expect(/outcome\.status === "accepted"\)\s*compose\([^)]*cleared-after-accept/.test(accepted)).toBe(true);
  });
  it("the body field's change handler dispatches typed only", () => {
    const text = panelSf.getText();
    expect(text).toContain('field: "body"');
    expect(text.includes('kind: "drafted"')).toBe(true);
    // every onChange in the panel dispatches a typed action or sets the course id
    let nonTyped = 0;
    walk(panelSf, (n) => {
      if (ts.isJsxAttribute(n) && n.name.getText() === "onChange") {
        const t = n.getText();
        if (!t.includes('kind: "typed"') && !t.includes("setStoredCourseId")) nonTyped += 1;
      }
    });
    expect(nonTyped).toBe(0);
  });
});

// ---- R6 / AC-W3-6 ----

function lockShape(body: Block): { claimBeforeAwait: boolean; releaseInFinally: boolean } {
  let claimPos = -1;
  let firstAwaitPos = Number.MAX_SAFE_INTEGER;
  let releaseInFinally = false;
  walk(body, (n) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "tryClaim" && claimPos < 0) claimPos = n.pos;
    if (ts.isAwaitExpression(n) && n.pos < firstAwaitPos) firstAwaitPos = n.pos;
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "release") {
      let e: Node | undefined = n;
      while (e && e !== body) {
        if (ts.isBlock(e) && e.parent && ts.isTryStatement(e.parent) && e.parent.finallyBlock === e) releaseInFinally = true;
        e = e.parent;
      }
    }
  });
  return { claimBeforeAwait: claimPos >= 0 && claimPos < firstAwaitPos, releaseInFinally };
}

describe("AC-W3-6: a synchronous ref lock claimed before any await, released in a finally", () => {
  it("runSend claims before its first await and releases inside a finally", () => {
    expect(lockShape(findFunction(panelSf, "runSend")!.body)).toEqual({ claimBeforeAwait: true, releaseInFinally: true });
  });
  it("the lock lives in a useRef, not a state flag alone", () => {
    expect(panelSf.getText()).toContain("useRef(createSendLock())");
  });
  it("canary: claim after an await, and release outside a finally, are both detected", () => {
    const late = parse(`async function f(){ await g(); if (!lock.tryClaim()) return; try { await h(); } finally { lock.release(); } }`);
    expect(lockShape(findFunction(late, "f")!.body).claimBeforeAwait).toBe(false);
    const noFinally = parse(`async function f(){ if (!lock.tryClaim()) return; try { await h(); lock.release(); } catch {} }`);
    expect(lockShape(findFunction(noFinally, "f")!.body).releaseInFinally).toBe(false);
  });
});

// ---- R7 / AC-W3-7 ----

describe("AC-W3-7: the surface delegates to canLms and defines no predicate of its own", () => {
  it("no canvasUrl or institution identifier in any panel-directory source file", () => {
    for (const p of PANEL) {
      expect(countIdent(p.sf, "canvasUrl"), p.name).toBe(0);
      expect(countIdent(p.sf, "institution"), p.name).toBe(0);
    }
  });
  it("canLms is imported and referenced by the model leaf", () => {
    expect(countIdent(modelSf, "canLms")).toBeGreaterThanOrEqual(2);
  });
});

// ---- R9 / AC-W3-9 ----

describe("AC-W3-9: no delivery word in user-facing copy (AST literal scan)", () => {
  it("canary (a): JSX text <p>Sent</p> is flagged", () => {
    expect(forbiddenHits(parse(`const x = <p>Sent</p>;`, true))).toEqual(["Sent"]);
  });
  it("canary (b): a forbidden word only in a comment is NOT flagged", () => {
    expect(forbiddenHits(parse(`// the message was delivered\n/* received */\nconst x = "ok";`))).toEqual([]);
  });
  it("canary: template parts, attribute strings and plain literals are all scanned", () => {
    expect(forbiddenHits(parse("const a = `was emailed ${x} and sent`; const b = <i title=\"received\" />;", true))).toHaveLength(3);
  });
  it("scope 1: every non-test .ts/.tsx in the panel directory is clean and the scan is non-vacuous", () => {
    let nodes = 0;
    for (const p of PANEL) {
      nodes += stringNodes(p.sf).length;
      expect(forbiddenHits(p.sf), p.name).toEqual([]);
    }
    expect(nodes).toBeGreaterThan(0);
  });
  it("scope 2: the server action file is clean and non-vacuous", () => {
    const sf = parse(read("src/app/actions/bulk-course-message.ts"));
    expect(stringNodes(sf).length).toBeGreaterThan(0);
    expect(forbiddenHits(sf)).toEqual([]);
  });
  it("scope 3: the createCourseConversation body in inbox.ts is clean (its JSDoc is invisible) and non-vacuous", () => {
    const sf = parse(read("src/lib/canvas/inbox.ts"));
    const fn = findFunction(sf, "createCourseConversation");
    expect(fn).toBeTruthy();
    expect(stringNodes(fn!.body).length).toBeGreaterThan(0);
    expect(forbiddenHits(fn!.body)).toEqual([]);
  });
});

// ---- R11 / AC-W3-11 ----

describe("AC-W3-11: the panel directory persists exactly two ta- keys", () => {
  it("the ta- key pattern over the non-test source matches exactly the two keys", () => {
    const found = new Set<string>();
    for (const p of PANEL) {
      for (const m of p.src.matchAll(/(?<![a-zA-Z0-9_])ta-[a-z0-9-]*[a-z0-9]/g)) found.add(m[0]);
    }
    expect(Array.from(found).sort()).toEqual(["ta-bulk-msg-course", "ta-bulk-msg-drafts"]);
  });
  it("no module-scope cache is declared", () => {
    for (const p of PANEL) expect(/^(?:let|var)\s+\w*[cC]ache\b/m.test(p.src), p.name).toBe(false);
  });
});

// ---- R12 / AC-W3-12 ----

describe("AC-W3-12: a zero-prop panel with no host reach-through", () => {
  it("the default export takes no required parameters", () => {
    let fn: import("typescript").FunctionDeclaration | undefined;
    for (const st of panelSf.statements) {
      if (!ts.isFunctionDeclaration(st)) continue;
      const mods = ts.getModifiers(st) ?? [];
      if (mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) fn = st;
    }
    expect(fn).toBeTruthy();
    expect(fn!.parameters.filter((p) => !p.questionToken && !p.initializer)).toEqual([]);
  });
  it("no panel-directory file imports host code", () => {
    const bad = PANEL.flatMap((p) => valueImportSpecifiers(p.sf)).filter(
      (s) => s.includes("canvas-tab/") || s.includes("MessageDraftsTab") || s.includes("CanvasTab")
    );
    expect(bad).toEqual([]);
  });
  it("canary: a required parameter is detected", () => {
    const f = parse(`export default function P(props: { courseId: string }) { return null; }`, true);
    const decl = f.statements[0] as import("typescript").FunctionDeclaration;
    expect(decl.parameters.filter((p) => !p.questionToken && !p.initializer)).toHaveLength(1);
  });
});

// ---- R13 / AC-W3-13 ----

describe("AC-W3-13: model and server text reaches the DOM only as text", () => {
  it("no dangerouslySetInnerHTML, innerHTML, outerHTML or insertAdjacentHTML in the panel directory", () => {
    for (const p of PANEL) {
      for (const name of ["dangerouslySetInnerHTML", "innerHTML", "outerHTML", "insertAdjacentHTML"]) {
        expect(countIdent(p.sf, name), `${p.name} ${name}`).toBe(0);
      }
    }
  });
  it("canary: a DOM-HTML sink is counted", () => {
    expect(countIdent(parse(`const x = <div dangerouslySetInnerHTML={{ __html: r }} />;`, true), "dangerouslySetInnerHTML")).toBe(1);
  });
  it("the confirm banner uses a group role, not a dialog role", () => {
    const src = PANEL.find((p) => p.name === "BulkCourseMessagePanel.tsx")!.src;
    expect(src).toContain('role="group"');
    expect(src.includes("alertdialog")).toBe(false);
  });
});
