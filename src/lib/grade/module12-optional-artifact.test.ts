import { describe, expect, it } from "vitest";
import { classifyModule12Artifact as classify } from "./module12-optional-artifact";
const instructions = "Module 12 – Unit Testing Suite\nSubmit three separate files: test_utils.py, TestUtils.java, test_utils.cpp.";
const sources = ["assignments/module_12/TestUtils.java", "assignments/module_12/test_utils.cpp", "assignments/module_12/test_utils.py"];
const path = "assignments/module_12/";
const cls = Uint8Array.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 61]);
const elf = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, ...Array(12).fill(0)]);
const pe = new Uint8Array(68); pe[0] = 0x4d; pe[1] = 0x5a; pe[60] = 64; pe[64] = 0x50; pe[65] = 0x45;
describe("module 12 optional binary candidates", () => {
  it("recognizes only expected names, signatures and corresponding source paths", () => {
    expect(classify(path + "TestUtils.class", cls, sources, instructions)).toEqual({ sourcePath: path + "TestUtils.java", format: "java-class" });
    expect(classify(path + "test_utils", elf, sources, instructions)?.format).toBe("elf");
    expect(classify(path + "test_utils.exe", pe, sources, instructions)?.format).toBe("pe");
    expect(classify(path + "test_utils", new TextEncoder().encode("print('work')"), sources, instructions)).toBeNull();
    expect(classify(path + "unknown.exe", pe, sources, instructions)).toBeNull();
    expect(classify(path + "test_utils.exe", pe, [], instructions)).toBeNull();
    expect(classify(path + "test_utils.exe", pe, sources, "untrusted other assignment")).toBeNull();
    expect(classify(path + "test_utils.exe", pe.slice(0, 64), sources, instructions)).toBeNull();
  });
  it("recognizes only the matching Python cache as disclosed, unexamined bytecode", () => {
    const cache = path + "__pycache__/test_utils.cpython-314.pyc";
    const bytes = Uint8Array.from([0xf3, 0x0d, 13, 10, 0, 0, 0, 0, ...Array(8).fill(0)]);
    expect(classify(cache, bytes, sources, instructions)).toEqual({ sourcePath: path + "test_utils.py", format: "python-bytecode" });
    expect(classify(cache, bytes.slice(0, 15), sources, instructions)).toBeNull();
    expect(classify(cache.replace("test_utils.", "other."), bytes, sources, instructions)).toBeNull();
    expect(classify(cache, bytes, sources.filter((item) => !item.endsWith(".py")), instructions)).toBeNull();
    expect(classify(cache, Uint8Array.from([0xf3, 0x0d, 13, 10, 2, ...Array(11).fill(0)]), sources, instructions)).toBeNull();
  });
});
