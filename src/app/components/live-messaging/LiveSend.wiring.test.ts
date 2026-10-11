import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// LIVE-LMS-STUDENT-MESSAGING W4 reachability and boundary pins
// (docs/live-lms-student-messaging-ops.md P3, P5, P10, P11, P12, P18, P19b, P32).
// No component is rendered by any test in this repo, so these READ source: they
// prove the send is reachable from the modal ONLY through the confirm, that the
// action file names only the typed per-student sender, and that the send path
// cannot be reached from an unattended runner.

const ROOT = process.cwd();
const COMPONENT_DIR = path.join(ROOT, "src", "app", "components", "live-messaging");
const LIB_DIR = path.join(ROOT, "src", "lib", "live-messaging");
const ACTIONS_DIR = path.join(ROOT, "src", "app", "actions");
const SEND_ACTION = path.join(ACTIONS_DIR, "live-messaging-send.ts");

function parse(file: string, text = fs.readFileSync(file, "utf8")): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}

function listFiles(dir: string, include: RegExp, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, include, out);
    else if (include.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** The walled set: the live-messaging action files and everything under lib/live-messaging. */
function walledSet(): string[] {
  const actions = fs
    .readdirSync(ACTIONS_DIR)
    .filter((n) => /^live-messaging.*\.ts$/.test(n) && !/\.test\./.test(n))
    .map((n) => path.join(ACTIONS_DIR, n));
  return [...actions, ...listFiles(LIB_DIR, /\.ts$/)];
}

/** Named value-import specifiers from one module specifier. */
function namedImports(source: ts.SourceFile, specifier: string): string[] {
  const names: string[] = [];
  for (const stmt of source.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier) || stmt.moduleSpecifier.text !== specifier) continue;
    const clause = stmt.importClause;
    if (!clause) continue;
    if (clause.name) names.push("default");
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) names.push((el.propertyName ?? el.name).text);
    }
  }
  return names;
}

function importSpecifiers(source: ts.SourceFile): string[] {
  return source.statements
    .filter((s): s is ts.ImportDeclaration => ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier))
    .map((s) => (s.moduleSpecifier as ts.StringLiteral).text);
}

function identifiers(source: ts.SourceFile): Set<string> {
  const found = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) found.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("the walled set is non-vacuous", () => {
  it("finds the action file and the lib leaves", () => {
    const set = walledSet();
    expect(set.length).toBeGreaterThanOrEqual(8);
    expect(set).toContain(SEND_ACTION);
  });

  it("every file in the repo that references the sender or A6 is inside the walled set or the client driver", () => {
    const allowedOutside = new Set([
      path.join(ROOT, "src", "lib", "canvas", "inbox.ts"),
      path.join(ACTIONS_DIR, "live-messaging-send.ts"),
      path.join(COMPONENT_DIR, "useLiveSend.ts"),
    ]);
    const walled = new Set(walledSet());
    const offenders: string[] = [];
    for (const file of listFiles(path.join(ROOT, "src"), /\.tsx?$/)) {
      const text = fs.readFileSync(file, "utf8");
      if (!/sendStudentConversation|sendLiveMessageAction/.test(text)) continue;
      if (walled.has(file) || allowedOutside.has(file)) continue;
      offenders.push(path.relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });
});

describe("P3/P5: the symbol-level one-institution pin", () => {
  it("the named imports from the Canvas inbox module across the walled set equal exactly [sendStudentConversation]", () => {
    const all: string[] = [];
    for (const file of walledSet()) all.push(...namedImports(parse(file), "@/lib/canvas/inbox"));
    expect(all).toEqual(["sendStudentConversation"]);
  });

  it("the extractor discriminates: a planted import of the broadcast builder is seen", () => {
    const planted = parse(
      "planted.ts",
      'import { sendStudentConversation, createCourseConversation } from "@/lib/canvas/inbox";'
    );
    expect(namedImports(planted, "@/lib/canvas/inbox")).toEqual(["sendStudentConversation", "createCourseConversation"]);
  });

  it("no walled file uses the broadcast or legacy builders by identifier, or the canvas barrel", () => {
    for (const file of walledSet()) {
      const source = parse(file);
      const ids = identifiers(source);
      expect(ids.has("createCourseConversation"), file).toBe(false);
      expect(ids.has("createConversation"), file).toBe(false);
      expect(importSpecifiers(source), file).not.toContain("@/lib/canvas");
    }
  });

  it("the client driver and components never touch the Canvas server modules at all", () => {
    for (const file of listFiles(COMPONENT_DIR, /\.tsx?$/)) {
      const specs = importSpecifiers(parse(file));
      for (const spec of specs) expect(spec, file).not.toMatch(/^@\/lib\/canvas/);
    }
  });
});

describe("P10/P11: the action file is owner-gated, textually, and exports only guarded async functions", () => {
  const source = parse(SEND_ACTION);
  const text = fs.readFileSync(SEND_ACTION, "utf8");
  const exported = source.statements.filter(
    (s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && !!s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );

  it("exports exactly the five actions, each `export async function`", () => {
    expect(exported.map((f) => f.name?.text).sort()).toEqual(
      [
        "getLiveMessageBatchAction",
        "prepareLiveMessageBatchAction",
        "requeueRefusedLiveMessagesAction",
        "sendLiveMessageAction",
        "startLiveMessageBatchAction",
      ].sort()
    );
    for (const f of exported) {
      expect(f.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword), f.name?.text).toBe(true);
    }
    expect(text.match(/^export async function /gm)).toHaveLength(5);
  });

  it("the first statement of every action body is `await requireAppOwner();`", () => {
    for (const f of exported) {
      const first = f.body?.statements[0];
      expect(first?.getText(), f.name?.text).toBe("await requireAppOwner();");
    }
  });

  it("never uses the weaker guards", () => {
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\brequireOwner\s*\(/);
    expect(code).not.toMatch(/\brequireUser\s*\(/);
  });

  it("has no other export form (an arrow export is invisible to the guard ratchet)", () => {
    expect(text).not.toMatch(/^export (const|let|var|default|\{|type|interface)/m);
    expect(text).toMatch(/^"use server";/m);
  });
});

describe("P12: the unattended runners cannot import the send path", () => {
  it("nothing under workflows, cron, triggers or automations reaches the walled set", () => {
    const dirs = [
      path.join(ROOT, "src", "lib", "workflows"),
      path.join(ROOT, "src", "app", "api", "cron"),
      path.join(ROOT, "src", "app", "api", "triggers"),
      path.join(ROOT, "src", "app", "api", "automations"),
    ];
    let scanned = 0;
    const offenders: string[] = [];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      for (const file of listFiles(dir, /\.tsx?$/)) {
        scanned += 1;
        for (const spec of importSpecifiers(parse(file))) {
          if (/live-messaging-send|live-messaging\/send-/.test(spec)) offenders.push(`${path.relative(ROOT, file)} -> ${spec}`);
        }
      }
    }
    expect(scanned).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });
});

describe("P18: the server-side send files do not log, call out, or reach a model", () => {
  const serverFiles = [SEND_ACTION, ...["send-batch.ts", "send-ledger.ts", "send-results.ts", "send-constants.ts"].map((n) => path.join(LIB_DIR, n))];

  it("has no console call, fetch, beacon, or model/embedding import", () => {
    for (const file of serverFiles) {
      const source = parse(file);
      const code = source.getFullText().replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/\bconsole\./);
      const ids = identifiers(source);
      for (const banned of ["fetch", "XMLHttpRequest", "sendBeacon"]) expect(ids.has(banned), `${file} ${banned}`).toBe(false);
      for (const spec of importSpecifiers(source)) expect(spec, file).not.toMatch(/lib\/(llm|gemini|embedded)/);
    }
  });

  it("does not mention the browser-only diagnostic log (the server must not share its state)", () => {
    for (const file of serverFiles) {
      const text = fs.readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/session-diagnostic-log|messagingDiagnosticLog|gradingDiagnosticLog/);
    }
  });
});

describe("the send is reachable from the modal ONLY through the confirm (P19b)", () => {
  const modal = fs.readFileSync(path.join(COMPONENT_DIR, "MessagingModal.tsx"), "utf8");
  const panel = fs.readFileSync(path.join(COMPONENT_DIR, "SendPanel.tsx"), "utf8");
  const hookFile = path.join(COMPONENT_DIR, "useLiveSend.ts");
  const hook = parse(hookFile);

  it("the modal mounts the panel and the hook, and has a Send button whose click only PREPARES", () => {
    expect(modal).toMatch(/import SendPanel from "\.\/SendPanel"/);
    expect(modal).toMatch(/useLiveSend\(/);
    expect(modal).toMatch(/onClick=\{\(\) => void send\.prepare\(\)\}\s*>\s*Send\s*</);
    expect(modal).not.toMatch(/confirmAndSend|confirmRetry|startLiveMessageBatchAction|sendLiveMessageAction/);
  });

  it("startLiveMessageBatchAction is CALLED exactly once in the repo, inside confirmAndSend", () => {
    const callers: string[] = [];
    for (const file of listFiles(path.join(ROOT, "src"), /\.tsx?$/)) {
      if (file === SEND_ACTION) continue;
      const text = fs.readFileSync(file, "utf8");
      if (!text.includes("startLiveMessageBatchAction")) continue;
      callers.push(path.relative(ROOT, file));
    }
    expect(callers).toEqual([path.relative(ROOT, hookFile)]);

    const calls: ts.CallExpression[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "startLiveMessageBatchAction") calls.push(node);
      ts.forEachChild(node, visit);
    };
    visit(hook);
    expect(calls).toHaveLength(1);

    let enclosing: string | undefined;
    for (let n: ts.Node | undefined = calls[0]; n; n = n.parent) {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isArrowFunction(n.initializer)) {
        enclosing = n.name.text;
        break;
      }
    }
    expect(enclosing).toBe("confirmAndSend");
  });

  it("confirmAndSend is gated by gateOpen before it starts anything", () => {
    const text = hook.getFullText();
    const start = text.indexOf("const confirmAndSend");
    const call = text.indexOf("startLiveMessageBatchAction(", start);
    const gate = text.indexOf("!gateOpen", start);
    expect(start).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(start);
    expect(gate).toBeLessThan(call);
  });

  it("the panel renders the confirm button only in the confirm phase, count-labelled, disabled when the gate is closed", () => {
    const confirmBranch = panel.indexOf('state.phase === "confirm"');
    const retryBranch = panel.indexOf('state.phase === "retry-confirm"');
    const call = panel.indexOf("send.confirmAndSend()");
    expect(confirmBranch).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(confirmBranch);
    expect(call).toBeLessThan(retryBranch);
    expect(panel.match(/send\.confirmAndSend\(\)/g)).toHaveLength(1);
    expect(panel).toMatch(/disabled=\{!send\.gateOpen\}/);
    expect(panel).toMatch(/confirmLabel\(send\.confirmCount/);
  });

  it("the retry path re-confirms before any re-send", () => {
    expect(panel.match(/send\.confirmRetry\(\)/g)).toHaveLength(1);
    expect(panel.indexOf("send.confirmRetry()")).toBeGreaterThan(panel.indexOf('state.phase === "retry-confirm"'));
    const hookText = hook.getFullText();
    expect(hookText).toMatch(/if \(state\.phase !== "retry-confirm"/);
  });

  it("the modal cannot be dismissed or cancelled while a send is in flight", () => {
    expect(modal).toMatch(/onDismiss=\{busy \? \(\) => undefined : onClose\}/);
    expect(modal).toMatch(/onClick=\{onClose\} disabled=\{busy\}/);
  });

  it("the send is scoped to the one institution the modal was opened for", () => {
    expect(modal).toMatch(/institution: string/);
    expect(fs.readFileSync(path.join(COMPONENT_DIR, "SuccessTrackingView.tsx"), "utf8")).toMatch(
      /<MessagingModal\s+institution=\{institution\}/
    );
  });
});

describe("persisted state and module caches (P17, P32)", () => {
  it("the send UI persists nothing: no storage access and no ta- key in the hook or panel", () => {
    for (const name of ["useLiveSend.ts", "SendPanel.tsx", "messagingDiagnosticLog.ts"]) {
      const text = fs.readFileSync(path.join(COMPONENT_DIR, name), "utf8");
      expect(text, name).not.toMatch(/localStorage|sessionStorage|["']ta-/);
    }
  });

  it("no module-scope cache in the walled UI directory", () => {
    for (const file of listFiles(COMPONENT_DIR, /\.tsx?$/)) {
      expect(fs.readFileSync(file, "utf8"), file).not.toMatch(/^(let|var)\s+\w*cache/im);
    }
  });
});
