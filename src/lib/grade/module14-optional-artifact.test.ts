import { describe, expect, it } from "vitest";
import { isModule14BuildOutput, isModule14SourceOnlyAssignment, MODULE14_FOLDER, module14JavaDeclarations } from "./module14-optional-artifact";

const sourceFile = (value: string) => new TextEncoder().encode(value);

function classFile(name: string, source: string) {
  const text = (value: string) => [1, 0, value.length, ...Buffer.from(value)];
  return Uint8Array.from([
    0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 61, 0, 7,
    ...text(name), 7, 0, 1, ...text("java/lang/Object"), 7, 0, 3,
    ...text("SourceFile"), ...text(source),
    0, 0x20, 0, 2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 1,
    0, 5, 0, 0, 0, 2, 0, 6,
  ]);
}

function windowsExecutable() {
  const bytes = new Uint8Array(384), view = new DataView(bytes.buffer);
  bytes.set([0x4d, 0x5a]);
  view.setUint32(60, 64, true);
  view.setUint32(64, 0x4550, true);
  view.setUint16(68, 0x8664, true);
  view.setUint16(70, 1, true);
  view.setUint16(84, 240, true);
  view.setUint16(86, 2, true);
  view.setUint16(88, 0x20b, true);
  return bytes;
}

describe("static Module 14 optional artifact recognition", () => {
  const declarations = module14JavaDeclarations(sourceFile(`
    public class Patterns {}
    interface Observer {}
    class ConfigManager {}
    // class CommentOnly
    /* class CommentBlock {} */
    class Demo { String note = "class StringOnly"; }
  `));

  it("accepts the matching classfile for a declaration in verified Patterns.java", () => {
    const file = `${MODULE14_FOLDER}/Observer.class`;
    expect(isModule14BuildOutput(file, classFile("Observer", "Patterns.java"), declarations)).toBe(true);
    expect(isModule14BuildOutput(file, classFile("Observer", "Other.java"), declarations)).toBe(false);
    expect(isModule14BuildOutput(file, classFile("ConfigManager", "Patterns.java"), declarations)).toBe(false);
    expect(isModule14BuildOutput(file, classFile("Observer", "Patterns.java").slice(0, -1), declarations)).toBe(false);
    for (const name of ["CommentOnly", "CommentBlock", "StringOnly", "Independent"]) {
      expect(isModule14BuildOutput(`${MODULE14_FOLDER}/${name}.class`, classFile(name, "Patterns.java"), declarations)).toBe(false);
    }
  });

  it("accepts only the expected PE executable in the assignment root", () => {
    const file = `${MODULE14_FOLDER}/patterns.exe`;
    expect(isModule14BuildOutput(file, windowsExecutable(), declarations)).toBe(true);
    expect(isModule14BuildOutput(file, new Uint8Array([0x4d, 0x5a]), declarations)).toBe(false);
    expect(isModule14BuildOutput(`${MODULE14_FOLDER}/other.exe`, windowsExecutable(), declarations)).toBe(false);
    expect(isModule14BuildOutput(`${MODULE14_FOLDER}/nested/patterns.exe`, windowsExecutable(), declarations)).toBe(false);
  });

  it("holds an unrelated rubric even if the instructor's template matches", () => {
    expect(isModule14SourceOnlyAssignment("intro-to-computer-science-fall-2026", MODULE14_FOLDER,
      "alexandergshaw/python-java-c", "cf6bb5db28416053694ca6f3d39018dc4c683525", "Assess the compiled files.")).toBe(false);
  });
});
