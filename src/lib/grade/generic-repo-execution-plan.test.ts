import { describe, expect, it } from "vitest";
import { planGenericRepoExecution } from "./generic-repo-execution-plan";
const f = (path: string, text: string) => ({ path, bytes: new TextEncoder().encode(text) });
describe("generic execution planning", () => {
  it("plans each unambiguous language with its original scoped path", () => {
    const result = planGenericRepoExecution([f("lab/main.py", `if __name__ == "__main__": pass`), f("lab/main.cpp", "int main() {}"), f("lab/main.js", "console.log(1)")]);
    expect(result.runs).toEqual([{language:"python",entryPoint:"lab/main.py",selection:"heuristic"},{language:"c++",entryPoint:"lab/main.cpp",selection:"heuristic"},{language:"javascript",entryPoint:"lab/main.js",selection:"heuristic"}]);
    expect(result.held).toEqual([]);
  });
  it("holds ambiguity and never guesses a Java package entry", () => {
    expect(planGenericRepoExecution([f("a.py", `if __name__ == '__main__': pass`),f("b.py", `if __name__ == '__main__': pass`),f("T.java", "package x;\npublic static void main(String[] args){}")]).held).toEqual([{language:"python",reason:"ambiguous"},{language:"java",reason:"no-entry-point"}]);
  });
  it("resolves a packaged Java entry only when its source path matches", () => {
    const source = "package com.example;\npublic class Main { public static void main(String[] args) {} }";
    expect(planGenericRepoExecution([f("lab/src/com/example/Main.java", source)]).runs).toEqual([
      { language: "java", entryPoint: "lab/src/com/example/Main.java", selection: "heuristic" },
    ]);
    expect(planGenericRepoExecution([f("lab/src/other/Main.java", source)]).held).toEqual([
      { language: "java", reason: "no-entry-point" },
    ]);
  });
  it("holds sole library and empty files without assuming tests ran", () => {
    for (const item of [f("lab/library.py", "def calculate(): return 1"), f("lab/library.js", "module.exports = {}"), f("lab/empty.py", "")]) {
      expect(planGenericRepoExecution([item]).runs).toEqual([]);
      expect(planGenericRepoExecution([item]).held).toHaveLength(1);
    }
  });
  it.each(["mjs", "cjs"])("plans a conventional .%s executable with Node", extension => {
    expect(planGenericRepoExecution([f(`lab/main.${extension}`, "console.log('ready')")])).toEqual({
      runs: [{ language: "javascript", entryPoint: `lab/main.${extension}`, selection: "heuristic" }], held: [],
    });
  });
  it("holds conflicting Node module entry points and never assumes a module library ran", () => {
    expect(planGenericRepoExecution([f("lab/main.mjs", "console.log(1)"), f("lab/index.cjs", "console.log(2)")]).held)
      .toEqual([{ language: "javascript", reason: "ambiguous" }]);
    expect(planGenericRepoExecution([f("lab/main.cjs", "module.exports = {}")]).held)
      .toEqual([{ language: "javascript", reason: "no-entry-point" }]);
  });
  it("does not select empty or exported JavaScript modules by conventional filename", () => {
    for (const name of ["main.js", "index.js"]) {
      for (const content of ["", "module.exports = {}", "exports.value = 1"]) {
        expect(planGenericRepoExecution([f(`lab/${name}`, content)])).toEqual({
          runs: [], held: [{ language: "javascript", reason: "no-entry-point" }],
        });
      }
    }
  });
  it("rejects traversal, collisions and invalid source bytes", () => {
    expect(() => planGenericRepoExecution([f("../main.py", "x")])).toThrow();
    expect(() => planGenericRepoExecution([f("a.py", "x"),f("A.py", "x")])).toThrow();
    expect(() => planGenericRepoExecution([{path:"x.py",bytes:new Uint8Array([0xff])}])).toThrow();
  });
});
