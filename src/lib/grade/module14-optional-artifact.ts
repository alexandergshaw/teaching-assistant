import { createHash } from "node:crypto";

export const MODULE14_FOLDER = "assignments/module_14";
export const MODULE14_SOURCES = ["Patterns.java", "patterns.cpp", "patterns.py"] as const;
const MODULE14_RUBRICS = new Map<string, readonly string[]>([
  ["38c1014ee1093dde59677835f9fd2f26866b9b4cec530ac2480ec6db3185d579",
    ["Singleton Implementation", "Observer Pattern Logic", "Strategy Pattern Design", "Multi-language Implementation"]],
  ["5a39d249f62501bbbefcd9d4d6f457dfb2f3ab2ad8bc55474cb725a9af9fe4a8",
    ["Singleton Pattern Implementation", "Observer Pattern Implementation", "Strategy Pattern Implementation", "Code Structure and Demonstration"]],
  ["da259a765867e7080c1fbcddf53aae1ffc43b18c2e0565ed6dabadbd6719ff9a",
    ["Singleton Implementation", "Observer Implementation", "Strategy Implementation", "Language Compliance and Output"]],
]);

export function module14ReviewRubricAreas(rubric: string): readonly string[] | undefined {
  return MODULE14_RUBRICS.get(createHash("sha256").update(rubric).digest("hex"));
}

export function isModule14SourceOnlyAssignment(owner: string, folder: string | undefined, templateRepo: string,
  templateBlobSha: string, rubric: string): boolean {
  return owner.toLowerCase() === "intro-to-computer-science-fall-2026" && folder === MODULE14_FOLDER
    && templateRepo.toLowerCase() === "alexandergshaw/python-java-c"
    && templateBlobSha === "cf6bb5db28416053694ca6f3d39018dc4c683525"
    && module14ReviewRubricAreas(rubric) !== undefined;
}

export function module14BuildOutput(path: string): string | undefined {
  if (!path.startsWith(`${MODULE14_FOLDER}/`)) return;
  const file = path.slice(MODULE14_FOLDER.length + 1);
  if (file === "patterns.exe" || /^[A-Za-z_][A-Za-z0-9_]*\.class$/.test(file)) return file;
}

/** Read identity and SourceFile from the verified classfile, without loading the class. */
function isClassFromPatterns(bytes: Uint8Array, expected: string): boolean {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    const u8 = () => view.getUint8(offset++);
    const u16 = () => { const value = view.getUint16(offset); offset += 2; return value; };
    const u32 = () => { const value = view.getUint32(offset); offset += 4; return value; };
    const skip = (length: number) => {
      offset += length;
      if (offset > bytes.length) throw new Error("Incomplete classfile");
    };
    if (u32() !== 0xcafebabe) return false;
    skip(4);
    const count = u16();
    if (count < 2 || count > 8192) return false;
    const utf8 = new Map<number, string>();
    const classes = new Map<number, number>();
    const decode = new TextDecoder("utf-8", { fatal: true });
    for (let index = 1; index < count; index++) {
      const tag = u8();
      if (tag === 1) {
        const size = u16();
        const start = offset;
        skip(size);
        // Modified UTF-8 outside the ASCII values this policy checks is irrelevant.
        const value = bytes.subarray(start, offset);
        if (value.every((byte) => byte < 128)) utf8.set(index, decode.decode(value));
      } else if (tag === 7) {
        classes.set(index, u16());
      } else if ([3, 4, 9, 10, 11, 12, 17, 18].includes(tag)) skip(4);
      else if (tag === 5 || tag === 6) { skip(8); index++; }
      else if ([8, 16, 19, 20].includes(tag)) skip(2);
      else if (tag === 15) skip(3);
      else return false;
    }
    skip(2);
    if (utf8.get(classes.get(u16()) ?? 0) !== expected) return false;
    skip(2);
    skip(u16() * 2);
    const skipAttributes = () => {
      const count = u16();
      for (let index = 0; index < count; index++) { skip(2); skip(u32()); }
    };
    for (let category = 0; category < 2; category++) {
      const members = u16();
      for (let index = 0; index < members; index++) { skip(6); skipAttributes(); }
    }
    const attributes = u16();
    let foundSource = false;
    for (let index = 0; index < attributes; index++) {
      const name = utf8.get(u16());
      const length = u32();
      if (name === "SourceFile") {
        if (foundSource || length !== 2 || utf8.get(u16()) !== "Patterns.java") return false;
        foundSource = true;
      } else skip(length);
    }
    return foundSource && offset === bytes.length;
  } catch {
    return false;
  }
}

/** Detect declared package-free classes without treating comments or literals as declarations. */
export function module14JavaDeclarations(bytes: Uint8Array): ReadonlySet<string> {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const tokens = source.replace(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"""[\s\S]*?"""|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, " ");
  return new Set(Array.from(tokens.matchAll(/\b(?:class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g), (match) => match[1]));
}

function isWindowsExecutable(bytes: Uint8Array): boolean {
  if (bytes.length < 90 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pe = view.getUint32(60, true);
  if (pe < 64 || pe + 26 > bytes.length || view.getUint32(pe, true) !== 0x4550) return false;
  const machine = view.getUint16(pe + 4, true);
  const sections = view.getUint16(pe + 6, true);
  const optionalSize = view.getUint16(pe + 20, true);
  const flags = view.getUint16(pe + 22, true);
  const magic = view.getUint16(pe + 24, true);
  return sections > 0 && optionalSize >= 96 && pe + 24 + optionalSize + sections * 40 <= bytes.length
    && (flags & 0x0002) !== 0 && (flags & 0x2000) === 0
    && ((machine === 0x8664 && magic === 0x20b) || (machine === 0x14c && magic === 0x10b));
}

/** Structural identity is evidence of format only, never of code correctness or equivalence. */
export function isModule14BuildOutput(path: string, bytes: Uint8Array, declarations: ReadonlySet<string>): boolean {
  const name = module14BuildOutput(path);
  if (!name) return false;
  if (name === "patterns.exe") return isWindowsExecutable(bytes);
  const className = name.slice(0, -".class".length);
  return declarations.has(className) && isClassFromPatterns(bytes, className);
}
