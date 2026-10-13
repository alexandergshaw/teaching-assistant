import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";
import { asRubricOriginScope } from "./rubric-origin-scope";
import { resolveRubricOriginScope } from "./rubric-origin";

const root = process.cwd();
const fixturePath = path.join(root, "src/lib/grade/__origin_scope_fixture.ts");
const memoryPath = path.join(root, "src/lib/grade/rubric-memory.ts");
const chatPath = path.join(root, "src/app/components/grading-chat/chatSetupMemory.ts");
const imports = `
import {loadRubricMemory} from './rubric-memory';
import {asRubricOriginScope} from './rubric-origin-scope';
import {resolveRubricOriginScope} from './rubric-origin';
import {loadChatSetupMemory,deriveChatScope} from '@/app/components/grading-chat/chatSetupMemory';
import type {CartridgeDrop,saveCartridgeDrop} from '../cartridge-drops';
import type {Database} from '../supabase/types';
declare const drop: CartridgeDrop;
declare const row: Database['public']['Tables']['cartridge_drops']['Row'];
const origin=asRubricOriginScope('upload:a.zip');
const resolved=resolveRubricOriginScope({rubricText:'R',currentScope:'cartridge:C|A',restored:null,sniffedRubric:null,archiveName:'a.zip'});
`;
const good = imports + `
loadRubricMemory('key',''); loadRubricMemory('key','upload:a.zip');
loadRubricMemory('key','cartridge:C|A'); loadChatSetupMemory(deriveChatScope(''));
const metadata: Pick<Parameters<typeof saveCartridgeDrop>[3],'rubricOriginScope'>={rubricOriginScope:origin};
const resolvedMetadata: typeof metadata={rubricOriginScope:resolved};
void resolvedMetadata;
if(drop.rubricOriginScope!==null){const widened:string=drop.rubricOriginScope;loadRubricMemory('key',widened);loadChatSetupMemory(widened);}
if(row.rubric_origin_scope!==null){loadRubricMemory('key',row.rubric_origin_scope);loadChatSetupMemory(row.rubric_origin_scope);}
`;
const bad = imports + `
loadRubricMemory('key',origin);loadChatSetupMemory(origin);
if(resolved!==null){loadRubricMemory('key',resolved);loadChatSetupMemory(resolved);}
if(drop.rubricOriginScope!==null){loadRubricMemory('key',drop.rubricOriginScope);loadChatSetupMemory(drop.rubricOriginScope);}
`;

function compile(source: string, replacements = new Map<string, string>()) {
  const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  expect(parsed.errors).toEqual([]);
  expect(parsed.options.strict).toBe(true);
  const options = { ...parsed.options, incremental: false, noEmit: true };
  const host = ts.createCompilerHost(options);
  const normalize = (file: string) => path.resolve(file).toLowerCase();
  const content = new Map([...replacements].map(([file, text]) => [normalize(file), text]));
  content.set(normalize(fixturePath), source);
  const read = host.readFile.bind(host);
  host.readFile = (file) => content.get(normalize(file)) ?? read(file);
  const exists = host.fileExists.bind(host);
  host.fileExists = (file) => content.has(normalize(file)) || exists(file);
  host.getSourceFile = (file, languageVersion) => {
    const text = host.readFile(file);
    return text === undefined ? undefined : ts.createSourceFile(file, text, languageVersion, true);
  };
  const program = ts.createProgram([fixturePath], options, host);
  const fixture = program.getSourceFile(fixturePath)!;
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && /^(loadRubricMemory|loadChatSetupMemory)$/.test(node.expression.getText(fixture))) calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(fixture);
  return { diagnostics: ts.getPreEmitDiagnostics(program), fixture, calls };
}

function assertBoundary(replacements = new Map<string, string>()) {
  const result = compile(bad, replacements);
  expect(result.diagnostics.filter((d) => d.file?.fileName.replaceAll("\\", "/") !== fixturePath.replaceAll("\\", "/") || d.code !== 2345)).toEqual([]);
  for (const call of result.calls) {
    const argument = call.arguments[call.arguments.length - 1];
    const present = result.diagnostics.some((d) => d.start !== undefined && d.start >= argument.getStart(result.fixture) && d.start < argument.end);
    if (!present) throw new Error(`missing origin rejection at ${call.expression.getText(result.fixture)}`);
  }
  expect(result.calls).toHaveLength(6);
}

function widenParameter(file: string, name: string): string {
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  const parameter = declaration?.parameters.find((node) => node.name.getText(source) === "scope");
  if (!parameter?.type) throw new Error(`missing scope parameter in ${name}`);
  return text.slice(0, parameter.type.getStart(source)) + "string" + text.slice(parameter.type.end);
}

it("compiles actual ordinary callers and rejects direct typed origins, with isolated source mutations", () => {
  const hash = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const before = [hash(memoryPath), hash(chatPath)];
  expect(compile(good).diagnostics).toEqual([]);
  assertBoundary();
  assertBoundary(new Map([[memoryPath, fs.readFileSync(memoryPath, "utf8") + "\n// Harmless compiler-host control.\n"]]));
  expect(() => assertBoundary(new Map([[memoryPath, widenParameter(memoryPath, "loadRubricMemory")]]))).toThrow("missing origin rejection at loadRubricMemory");
  expect(() => assertBoundary(new Map([[chatPath, widenParameter(chatPath, "loadChatSetupMemory")]]))).toThrow("missing origin rejection at loadChatSetupMemory");
  assertBoundary();
  expect([hash(memoryPath), hash(chatPath)]).toEqual(before);
}, 120000);

it("preserves exact attribution strings including restored empty strings", () => {
  for (const value of ["", " ", "unknown:value", "upload:a.zip", "cartridge:C|A"]) {
    expect(asRubricOriginScope(value)).toBe(value);
    expect(resolveRubricOriginScope({ rubricText: "R", currentScope: "other", restored: { rubric: "R", scope: value }, sniffedRubric: null, archiveName: "a" })).toBe(value);
  }
  expect(resolveRubricOriginScope({ rubricText: "R", currentScope: "", restored: null, sniffedRubric: null, archiveName: "a" })).toBeNull();
});
