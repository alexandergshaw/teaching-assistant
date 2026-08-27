import { describe, it, expect } from "vitest";
import {
  basenameOf,
  capOutput,
  chooseEntryPoint,
  describeCodeRunSkip,
  languageForExtension,
  selectCodeRunFiles,
  type CodeRunCandidate,
} from "./code-run-selection";

describe("basenameOf", () => {
  it("strips a repo-relative path down to the last segment", () => {
    expect(basenameOf("week1/src/main.py")).toBe("main.py");
  });

  it("handles backslash-delimited paths", () => {
    expect(basenameOf("week1\\src\\main.py")).toBe("main.py");
  });

  it("returns an already-bare filename unchanged (the Canvas/zip case)", () => {
    expect(basenameOf("main.py")).toBe("main.py");
  });
});

describe("languageForExtension", () => {
  it("still recognizes the languages code-runner.ts depends on", () => {
    expect(languageForExtension("py")).toBe("python");
    expect(languageForExtension(".CPP")).toBe("c++");
    expect(languageForExtension("xyz")).toBeNull();
  });
});

describe("selectCodeRunFiles - basename mapping and collisions (Item 1)", () => {
  it("flattens full repo paths down to basenames", () => {
    const result = selectCodeRunFiles([
      { name: "week1/src/main.py", extension: "py", previewContent: "print(1)" },
    ]);
    expect(result.runFiles).toEqual([{ name: "main.py", content: "print(1)" }]);
    expect(result.entryPoint).toBe("main.py");
  });

  it("resolves a basename collision by keeping the first occurrence and reporting the rest", () => {
    const candidates: CodeRunCandidate[] = [
      { name: "week1/helpers.py", extension: "py", previewContent: "def a(): return 1" },
      { name: "week2/helpers.py", extension: "py", previewContent: "def a(): return 2" },
    ];
    const result = selectCodeRunFiles(candidates);

    // Only one "helpers.py" can exist in the flat sandbox file list - the
    // first one given (week1's) wins.
    expect(result.runFiles).toEqual([{ name: "helpers.py", content: "def a(): return 1" }]);
    expect(result.skipped).toEqual([
      { name: "week2/helpers.py", reason: "collision", basename: "helpers.py", keptInstead: "week1/helpers.py" },
    ]);
  });

  it("never silently merges or renames a colliding file - it is dropped and named in `skipped`", () => {
    const result = selectCodeRunFiles([
      { name: "a/main.py", extension: "py", previewContent: "print('a')" },
      { name: "b/main.py", extension: "py", previewContent: "print('b')" },
      { name: "c/main.py", extension: "py", previewContent: "print('c')" },
    ]);
    expect(result.runFiles).toHaveLength(1);
    expect(result.runFiles[0]).toEqual({ name: "main.py", content: "print('a')" });
    expect(result.skipped.map((s) => s.name)).toEqual(["b/main.py", "c/main.py"]);
    expect(result.skipped.every((s) => s.reason === "collision")).toBe(true);
  });

  it("does not let a same-basename file from a different folder collide with an unrelated file", () => {
    const result = selectCodeRunFiles([
      { name: "week1/main.py", extension: "py", previewContent: "print(1)" },
      { name: "week1/helpers.py", extension: "py", previewContent: "def f(): pass" },
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.runFiles.map((f) => f.name).sort()).toEqual(["helpers.py", "main.py"]);
  });
});

describe("selectCodeRunFiles - truncated files (Also handle)", () => {
  it("excludes a truncated preview with no full-content fallback, and reports why", () => {
    const result = selectCodeRunFiles([
      { name: "week1/main.py", extension: "py", previewContent: "print(1", previewTruncated: true },
    ]);
    expect(result.runFiles).toEqual([]);
    expect(result.entryPoint).toBeNull();
    expect(result.skipped).toEqual([{ name: "week1/main.py", reason: "truncated" }]);
  });

  it("still runs a file flagged previewTruncated when rawBase64 (the full, untruncated bytes) is present", () => {
    const fullContent = "print('the whole file')";
    const result = selectCodeRunFiles([
      {
        name: "week1/main.py",
        extension: "py",
        previewContent: "print('the whole fi", // a cut slice
        previewTruncated: true,
        rawBase64: Buffer.from(fullContent, "utf8").toString("base64"),
      },
    ]);
    expect(result.runFiles).toEqual([{ name: "main.py", content: fullContent }]);
    expect(result.skipped).toEqual([]);
  });

  it("a truncated file never wins a basename collision even against a later file", () => {
    const result = selectCodeRunFiles([
      { name: "week1/main.py", extension: "py", previewContent: "print(1", previewTruncated: true },
      { name: "week2/main.py", extension: "py", previewContent: "print(2)" },
    ]);
    // The truncated one is dropped before basenames are even compared, so the
    // second (whole) file claims "main.py" outright - not a "collision".
    expect(result.runFiles).toEqual([{ name: "main.py", content: "print(2)" }]);
    expect(result.skipped).toEqual([{ name: "week1/main.py", reason: "truncated" }]);
  });
});

describe("chooseEntryPoint (Item 2)", () => {
  it("picks main.py over helpers.py even when helpers sorts first (the github.digest.ts pathRank defect)", () => {
    // github.digest.ts's read order sorts alphabetically within a tier, so
    // "helpers.py" comes before "main.py" in the digest - and files[0] used
    // to mean "helpers.py always wins". This must not happen anymore.
    const entry = chooseEntryPoint([
      { name: "helpers.py", content: "def helper(): pass", language: "python" },
      { name: "main.py", content: "def helper_two(): pass", language: "python" },
    ]);
    expect(entry).toBe("main.py");
  });

  it("prefers a Python main guard when no filename matches a convention", () => {
    const entry = chooseEntryPoint([
      { name: "helpers.py", content: "def helper(): pass", language: "python" },
      { name: "run.py", content: "if __name__ == '__main__':\n    print(1)", language: "python" },
    ]);
    expect(entry).toBe("run.py");
  });

  it("prefers a Java public static void main over a plain class file", () => {
    const entry = chooseEntryPoint([
      { name: "Helper.java", content: "public class Helper { int x; }", language: "java" },
      { name: "Solution.java", content: "public class Solution { public static void main(String[] a) {} }", language: "java" },
    ]);
    expect(entry).toBe("Solution.java");
  });

  it("prefers a C/C++ int main over a header/support file", () => {
    const entry = chooseEntryPoint([
      { name: "helper.cpp", content: "int helper() { return 1; }", language: "c++" },
      { name: "program.cpp", content: "int main() { return 0; }", language: "c++" },
    ]);
    expect(entry).toBe("program.cpp");
  });

  it("falls back to the given order when nothing matches a convention or a main guard", () => {
    const entry = chooseEntryPoint([
      { name: "a.py", content: "x = 1", language: "python" },
      { name: "b.py", content: "y = 2", language: "python" },
    ]);
    expect(entry).toBe("a.py");
  });

  it("returns null for an empty file list", () => {
    expect(chooseEntryPoint([])).toBeNull();
  });

  it("index.* and app.* are recognized conventional entry names", () => {
    expect(
      chooseEntryPoint([
        { name: "helpers.js", content: "", language: "javascript" },
        { name: "index.js", content: "", language: "javascript" },
      ])
    ).toBe("index.js");
    expect(
      chooseEntryPoint([
        { name: "helpers.py", content: "", language: "python" },
        { name: "app.py", content: "", language: "python" },
      ])
    ).toBe("app.py");
  });
});

describe("selectCodeRunFiles - entry point is reported and moved first", () => {
  it("reorders the dominant language's files so the chosen entry point is runFiles[0]", () => {
    const result = selectCodeRunFiles([
      { name: "week1/helpers.py", extension: "py", previewContent: "def helper(): pass" },
      { name: "week1/main.py", extension: "py", previewContent: "print('go')" },
    ]);
    expect(result.entryPoint).toBe("main.py");
    expect(result.runFiles[0]).toEqual({ name: "main.py", content: "print('go')" });
    expect(result.runFiles[1]).toEqual({ name: "helpers.py", content: "def helper(): pass" });
  });

  it("puts data files after the dominant language's files regardless of entry point choice", () => {
    const result = selectCodeRunFiles([
      { name: "story.txt", extension: "txt", previewContent: "once upon a time" },
      { name: "main.py", extension: "py", previewContent: "print(open('story.txt').read())" },
    ]);
    expect(result.runFiles.map((f) => f.name)).toEqual(["main.py", "story.txt"]);
  });
});

describe("selectCodeRunFiles - dominant language and no-runnable-code cases", () => {
  it("picks the language with the most files, breaking ties by total content length", () => {
    const result = selectCodeRunFiles([
      { name: "A.java", extension: "java", previewContent: "public class A {}" },
      { name: "B.java", extension: "java", previewContent: "public class B {}" },
      { name: "main.py", extension: "py", previewContent: "print(1)" },
    ]);
    expect(result.language).toBe("java");
    expect(result.runFiles.map((f) => f.name).sort()).toEqual(["A.java", "B.java"]);
  });

  it("returns an empty selection (language '', no runFiles, null entry point) when nothing is a recognized language", () => {
    const result = selectCodeRunFiles([
      { name: "readme.txt", extension: "txt", previewContent: "Hello world" },
    ]);
    expect(result.language).toBe("");
    expect(result.runFiles).toEqual([]);
    expect(result.entryPoint).toBeNull();
  });

  it("drops empty or whitespace-only files without reporting them as skipped", () => {
    const result = selectCodeRunFiles([
      { name: "main.py", extension: "py", previewContent: "print(1)" },
      { name: "empty.py", extension: "py", previewContent: "" },
      { name: "whitespace.py", extension: "py", previewContent: "   \n\t" },
    ]);
    expect(result.runFiles).toEqual([{ name: "main.py", content: "print(1)" }]);
    expect(result.skipped).toEqual([]);
  });
});

describe("describeCodeRunSkip", () => {
  it("names the excluded file for a truncated skip", () => {
    expect(describeCodeRunSkip({ name: "week1/main.py", reason: "truncated" })).toContain("week1/main.py");
  });

  it("names both files for a collision skip", () => {
    const text = describeCodeRunSkip({
      name: "week2/helpers.py",
      reason: "collision",
      basename: "helpers.py",
      keptInstead: "week1/helpers.py",
    });
    expect(text).toContain("week2/helpers.py");
    expect(text).toContain("week1/helpers.py");
  });
});

describe("selectCodeRunFiles - instructor-chosen entry point (docs for this feature, request 2)", () => {
  it("switches the dominant language to the requested file's own language and runs its siblings, when the request names a non-dominant file", () => {
    const result = selectCodeRunFiles(
      [
        { name: "A.java", extension: "java", previewContent: "public class A {}" },
        { name: "B.java", extension: "java", previewContent: "public class B {}" },
        { name: "main.py", extension: "py", previewContent: "print('hi')" },
      ],
      "main.py"
    );
    // Without an override this would run Java (2 files beat 1) - see the
    // "picks the language with the most files" test above for the unchanged
    // automatic behavior this override must NOT affect.
    expect(result.language).toBe("python");
    expect(result.entryPoint).toBe("main.py");
    expect(result.runFiles).toEqual([{ name: "main.py", content: "print('hi')" }]);
    expect(result.requestedEntryPointError).toBeUndefined();
  });

  it("accepts a full repo path (matched via basenameOf) exactly like the automatic path already does for basenames", () => {
    const result = selectCodeRunFiles(
      [{ name: "week1/src/main.py", extension: "py", previewContent: "print(1)" }],
      "week1/src/main.py"
    );
    expect(result.entryPoint).toBe("main.py");
    expect(result.requestedEntryPointError).toBeUndefined();
  });

  it("rejects a header file with a reason naming it, rather than sending it to the runner", () => {
    const result = selectCodeRunFiles(
      [
        { name: "helper.h", extension: "h", previewContent: "int add(int, int);" },
        { name: "main.c", extension: "c", previewContent: "int main() { return 0; }" },
      ],
      "helper.h"
    );
    expect(result.runFiles).toEqual([]);
    expect(result.entryPoint).toBeNull();
    expect(result.requestedEntryPointError).toContain("helper.h");
    expect(result.requestedEntryPointError).toContain("header file");
  });

  it("rejects a data file with a reason naming it", () => {
    const result = selectCodeRunFiles(
      [
        { name: "story.txt", extension: "txt", previewContent: "once upon a time" },
        { name: "main.py", extension: "py", previewContent: "print(open('story.txt').read())" },
      ],
      "story.txt"
    );
    expect(result.runFiles).toEqual([]);
    expect(result.requestedEntryPointError).toContain("story.txt");
    expect(result.requestedEntryPointError).toContain("data file");
  });

  it("rejects an extension that is neither a recognized language nor a recognized data extension, with a reason naming it", () => {
    const result = selectCodeRunFiles(
      [{ name: "program.rs", extension: "rs", previewContent: "fn main() {}" }],
      "program.rs"
    );
    expect(result.requestedEntryPointError).toContain("program.rs");
    expect(result.requestedEntryPointError).toContain("not a language this sandbox recognizes");
  });

  it("rejects a markdown/text-like file the SAME way as any other data file - DATA_EXTENSIONS includes it, so it is classified as data, not as an unrecognized extension", () => {
    const result = selectCodeRunFiles(
      [{ name: "notes.md", extension: "md", previewContent: "# notes" }],
      "notes.md"
    );
    expect(result.requestedEntryPointError).toContain("notes.md");
    expect(result.requestedEntryPointError).toContain("data file");
  });

  it("rejects a file this module already excluded as truncated, with the SAME reason describeCodeRunSkip gives", () => {
    const result = selectCodeRunFiles(
      [{ name: "week1/main.py", extension: "py", previewContent: "print(1", previewTruncated: true }],
      "week1/main.py"
    );
    expect(result.requestedEntryPointError).toBe(
      describeCodeRunSkip({ name: "week1/main.py", reason: "truncated" })
    );
  });

  it("rejects a basename collision's LOSER with the SAME reason describeCodeRunSkip gives, naming which file was kept instead", () => {
    const result = selectCodeRunFiles(
      [
        { name: "week1/helpers.py", extension: "py", previewContent: "def a(): return 1" },
        { name: "week2/helpers.py", extension: "py", previewContent: "def a(): return 2" },
      ],
      "week2/helpers.py"
    );
    expect(result.requestedEntryPointError).toContain("week2/helpers.py");
    expect(result.requestedEntryPointError).toContain("week1/helpers.py");
  });

  it("does NOT reject the collision's WINNER just because a same-named loser also exists - only the exact requested name is checked against skips, never basename alone", () => {
    const result = selectCodeRunFiles(
      [
        { name: "week1/helpers.py", extension: "py", previewContent: "def a(): return 1" },
        { name: "week2/helpers.py", extension: "py", previewContent: "def a(): return 2" },
      ],
      "week1/helpers.py"
    );
    expect(result.requestedEntryPointError).toBeUndefined();
    expect(result.entryPoint).toBe("helpers.py");
    expect(result.runFiles).toEqual([{ name: "helpers.py", content: "def a(): return 1" }]);
  });

  it("rejects a name that decoded to nothing (empty content, silently dropped) - distinct wording from 'no file with this name'", () => {
    const result = selectCodeRunFiles(
      [{ name: "empty.py", extension: "py", previewContent: "" }],
      "empty.py"
    );
    expect(result.requestedEntryPointError).toContain("empty.py");
    expect(result.requestedEntryPointError).toContain("empty or could not be read");
  });

  it("rejects a name that names no file in the submission at all", () => {
    const result = selectCodeRunFiles(
      [{ name: "main.py", extension: "py", previewContent: "print(1)" }],
      "nonexistent.py"
    );
    expect(result.requestedEntryPointError).toContain("nonexistent.py");
    expect(result.requestedEntryPointError).toContain("no file with this name");
  });

  it("an empty-string request is treated as no request at all (the automatic heuristic still runs)", () => {
    const withoutRequest = selectCodeRunFiles([{ name: "main.py", extension: "py", previewContent: "print(1)" }]);
    const withEmptyRequest = selectCodeRunFiles(
      [{ name: "main.py", extension: "py", previewContent: "print(1)" }],
      ""
    );
    expect(withEmptyRequest).toEqual(withoutRequest);
  });
});

describe("capOutput (Item 4)", () => {
  it("leaves short output unchanged", () => {
    expect(capOutput("hello", 100)).toBe("hello");
  });

  it("cuts long output down and says it was truncated", () => {
    const text = "a".repeat(150);
    const result = capOutput(text, 100);
    expect(result.startsWith("a".repeat(100))).toBe(true);
    expect(result).toContain("truncated");
    expect(result).toContain("50");
  });

  it("treats output exactly at the cap as untouched", () => {
    const text = "a".repeat(100);
    expect(capOutput(text, 100)).toBe(text);
  });
});
