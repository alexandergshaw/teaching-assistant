import { describe, it, expect } from "vitest";
import {
  basenameOf,
  capOutput,
  chooseEntryPoint,
  describeCodeRunSkip,
  isStdinEofFailure,
  languageForExtension,
  selectCodeRunFiles,
  sourceLooksLikeItReadsStdin,
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

describe("isStdinEofFailure", () => {
  it("recognizes Python's exact EOFError signature (input() at EOF) when the source actually calls input()", () => {
    const stderr = [
      'Traceback (most recent call last):',
      '  File "main.py", line 1, in <module>',
      "    a = int(input())",
      "        ^^^^^^^",
      "EOFError: EOF when reading a line",
      "",
    ].join("\n");
    const files = [{ name: "main.py", content: "a = int(input())\nprint(a * 2)\n" }];
    expect(isStdinEofFailure(stderr, files)).toBe(true);
  });

  it("does NOT flag pickle.load's identical bare EOFError on a truncated/empty file - nothing to do with stdin", () => {
    // Real trace shape: pickle.load's Unpickler chain ends in a bare
    // "EOFError" with no message, byte-for-byte the same token input()'s
    // EOFError carries. The source never calls input() or touches sys.stdin
    // - it only unpickles a file - so this must NOT be excluded from scoring.
    const stderr = [
      "Traceback (most recent call last):",
      '  File "main.py", line 3, in <module>',
      '    data = pickle.load(open("save.dat", "rb"))',
      '  File "C:\\Python312\\Lib\\pickle.py", line 1213, in load',
      "    return Unpickler(file, fix_imports=fix_imports, encoding=encoding, errors=errors).load()",
      '  File "C:\\Python312\\Lib\\pickle.py", line 1099, in load',
      "    dispatch[key[0]](self)",
      '  File "C:\\Python312\\Lib\\pickle.py", line 1385, in load_eof',
      "    raise EOFError",
      "EOFError",
    ].join("\n");
    const files = [
      {
        name: "main.py",
        content: 'import pickle\ndata = pickle.load(open("save.dat", "rb"))\nprint(data)\n',
      },
    ];
    expect(isStdinEofFailure(stderr, files)).toBe(false);
  });

  it("does not flag a genuine, unrelated failure (syntax error)", () => {
    const stderr = '  File "main.py", line 1\n    def f(:\n          ^\nSyntaxError: invalid syntax';
    expect(isStdinEofFailure(stderr, [])).toBe(false);
  });

  it("does not flag a genuine, unrelated failure (unhandled exception)", () => {
    const stderr = [
      "Traceback (most recent call last):",
      '  File "main.py", line 2, in <module>',
      "    x = 1 / 0",
      "ZeroDivisionError: division by zero",
    ].join("\n");
    expect(isStdinEofFailure(stderr, [])).toBe(false);
  });

  it("returns false for empty stderr", () => {
    expect(isStdinEofFailure("", [])).toBe(false);
  });

  it("recognizes Java's Scanner.nextInt() EOF signature when the source constructs Scanner(System.in)", () => {
    // A real javac/java stack trace: Main.java calls new Scanner(System.in).nextInt()
    // with nothing on stdin.
    const stderr = [
      'Exception in thread "main" java.util.NoSuchElementException',
      "\tat java.base/java.util.Scanner.throwFor(Scanner.java:937)",
      "\tat java.base/java.util.Scanner.next(Scanner.java:1594)",
      "\tat java.base/java.util.Scanner.nextInt(Scanner.java:2258)",
      "\tat java.base/java.util.Scanner.nextInt(Scanner.java:2212)",
      "\tat Main.main(Main.java:6)",
    ].join("\n");
    const files = [
      {
        name: "Main.java",
        content:
          "import java.util.Scanner;\n\npublic class Main {\n  public static void main(String[] args) {\n    Scanner sc = new Scanner(System.in);\n    int x = sc.nextInt();\n    System.out.println(x);\n  }\n}\n",
      },
    ];
    expect(isStdinEofFailure(stderr, files)).toBe(true);
  });

  it("does NOT flag a Scanner(new File(...)) that runs out of lines, even though the stack trace is byte-identical to the Scanner(System.in) case above", () => {
    const stderr = [
      'Exception in thread "main" java.util.NoSuchElementException',
      "\tat java.base/java.util.Scanner.throwFor(Scanner.java:937)",
      "\tat java.base/java.util.Scanner.next(Scanner.java:1594)",
      "\tat java.base/java.util.Scanner.nextInt(Scanner.java:2258)",
      "\tat java.base/java.util.Scanner.nextInt(Scanner.java:2212)",
      "\tat Main.main(Main.java:8)",
    ].join("\n");
    const files = [
      {
        name: "Main.java",
        content:
          "import java.io.File;\nimport java.util.Scanner;\n\npublic class Main {\n  public static void main(String[] args) throws Exception {\n    Scanner sc = new Scanner(new File(\"data.txt\"));\n    while (true) {\n      int x = sc.nextInt();\n      System.out.println(x);\n    }\n  }\n}\n",
      },
    ];
    expect(isStdinEofFailure(stderr, files)).toBe(false);
  });

  it("recognizes Scanner wrapped over BufferedReader(InputStreamReader(System.in)) as reading from stdin", () => {
    const stderr = [
      'Exception in thread "main" java.util.NoSuchElementException: No line found',
      "\tat java.base/java.util.Scanner.nextLine(Scanner.java:1651)",
      "\tat Main.main(Main.java:7)",
    ].join("\n");
    const files = [
      {
        name: "Main.java",
        content:
          "import java.io.BufferedReader;\nimport java.io.InputStreamReader;\nimport java.util.Scanner;\n\npublic class Main {\n  public static void main(String[] args) {\n    Scanner sc = new Scanner(new BufferedReader(new InputStreamReader(System.in)));\n    String line = sc.nextLine();\n    System.out.println(line);\n  }\n}\n",
      },
    ];
    expect(isStdinEofFailure(stderr, files)).toBe(true);
  });

  it("does NOT flag a Java NoSuchElementException with no Scanner frame (e.g. an empty collection's iterator - a genuine student bug)", () => {
    const stderr = [
      'Exception in thread "main" java.util.NoSuchElementException',
      "\tat java.base/java.util.ArrayList$Itr.next(ArrayList.java:1002)",
      "\tat Main.main(Main.java:11)",
    ].join("\n");
    expect(isStdinEofFailure(stderr, [])).toBe(false);
  });

  it("does NOT flag Java's InputMismatchException (malformed, not absent, input - a genuine student bug) even though it also goes through Scanner.throwFor", () => {
    const stderr = [
      'Exception in thread "main" java.util.InputMismatchException',
      "\tat java.base/java.util.Scanner.throwFor(Scanner.java:939)",
      "\tat java.base/java.util.Scanner.nextInt(Scanner.java:2373)",
      "\tat Main.main(Main.java:7)",
    ].join("\n");
    expect(isStdinEofFailure(stderr, [])).toBe(false);
  });

  it("does NOT flag a Java NullPointerException (a genuine student bug, unrelated to stdin)", () => {
    const stderr = [
      'Exception in thread "main" java.lang.NullPointerException: Cannot invoke "String.length()" because "s" is null',
      "\tat Main.main(Main.java:4)",
    ].join("\n");
    expect(isStdinEofFailure(stderr, [])).toBe(false);
  });

  it("does NOT flag a Java compiler error (never reached Scanner at all)", () => {
    const stderr = "Main.java:3: error: ';' expected\n    int x = 5\n             ^\n1 error";
    expect(isStdinEofFailure(stderr, [])).toBe(false);
  });

  it("recognizes Python's sys.stdin.readline() parsed directly by int() on the same line - no source evidence required, the stderr text already proves it", () => {
    const stderr = [
      "Traceback (most recent call last):",
      '  File "main.py", line 3, in <module>',
      "    n = int(sys.stdin.readline())",
      "            ^^^^^^^^^^^^^^^^^^^^^",
      "ValueError: invalid literal for int() with base 10: ''",
    ].join("\n");
    expect(isStdinEofFailure(stderr, [])).toBe(true);
  });

  it("recognizes Python's sys.stdin.read() parsed directly by float() on the same line", () => {
    const stderr = [
      "Traceback (most recent call last):",
      '  File "calculator.py", line 5, in <module>',
      "    x = float(sys.stdin.read())",
      "ValueError: could not convert string to float: ''",
    ].join("\n");
    expect(isStdinEofFailure(stderr, [])).toBe(true);
  });

  it("recognizes Python's sys.stdin.readline().split()[0] indexed directly on the same line (IndexError)", () => {
    const stderr = [
      "Traceback (most recent call last):",
      '  File "calculator.py", line 4, in <module>',
      "    op = sys.stdin.readline().split()[0]",
      "IndexError: list index out of range",
    ].join("\n");
    expect(isStdinEofFailure(stderr, [])).toBe(true);
  });

  it("recognizes Python's a, b = sys.stdin.readline().split() unpacking an empty split on the same line", () => {
    const stderr = [
      "Traceback (most recent call last):",
      '  File "calculator.py", line 4, in <module>',
      "    a, b = sys.stdin.readline().split()",
      "ValueError: not enough values to unpack (expected 2, got 0)",
    ].join("\n");
    expect(isStdinEofFailure(stderr, [])).toBe(true);
  });

  it("does NOT flag Python's two-statement form - the failing line no longer mentions sys.stdin (documented limitation)", () => {
    const stderr = [
      "Traceback (most recent call last):",
      '  File "calculator.py", line 5, in <module>',
      "    n = int(line)",
      "ValueError: invalid literal for int() with base 10: ''",
    ].join("\n");
    expect(isStdinEofFailure(stderr, [])).toBe(false);
  });

  it("does NOT flag a bare ValueError with no stdin call on the failing line - ambiguous, could be anything", () => {
    const stderr = [
      "Traceback (most recent call last):",
      '  File "main.py", line 2, in <module>',
      "    n = int(user_input)",
      "ValueError: invalid literal for int() with base 10: ''",
    ].join("\n");
    expect(isStdinEofFailure(stderr, [])).toBe(false);
  });
});

describe("sourceLooksLikeItReadsStdin", () => {
  it("flags C++ source that reads via cin >>", () => {
    const files = [{ name: "main.cpp", content: "int main() { int a, b; std::cin >> a >> b; }" }];
    expect(sourceLooksLikeItReadsStdin("c++", files)).toBe(true);
  });

  it("flags C source that reads via scanf", () => {
    const files = [{ name: "main.c", content: '#include <stdio.h>\nint main(){int a;scanf("%d",&a);}' }];
    expect(sourceLooksLikeItReadsStdin("c", files)).toBe(true);
  });

  it("does not flag C++ source with no stdin read", () => {
    const files = [{ name: "main.cpp", content: 'int main() { std::cout << "hi"; }' }];
    expect(sourceLooksLikeItReadsStdin("c++", files)).toBe(false);
  });

  it("never flags languages outside c/c++, even if the source reads stdin (Python fails loudly instead)", () => {
    const files = [{ name: "main.py", content: "x = input()" }];
    expect(sourceLooksLikeItReadsStdin("python", files)).toBe(false);
  });

  it("does not flag a cin >> that is entirely commented out with //", () => {
    const files = [
      { name: "main.cpp", content: 'int main() { int a; // std::cin >> a;\n std::cout << "hi"; }' },
    ];
    expect(sourceLooksLikeItReadsStdin("c++", files)).toBe(false);
  });

  it("still flags a genuine cin >> that appears before a trailing // comment on the same line", () => {
    const files = [{ name: "main.cpp", content: "int main() { int a; std::cin >> a; // read input\n }" }];
    expect(sourceLooksLikeItReadsStdin("c++", files)).toBe(true);
  });
});
