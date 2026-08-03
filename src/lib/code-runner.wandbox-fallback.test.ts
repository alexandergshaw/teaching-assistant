import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  runSubmittedCode,
  __resetRuntimeCacheForTests,
  CodeFileInput,
} from "./code-runner";

describe("code-runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRuntimeCacheForTests();
  });

  afterEach(() => {
    __resetRuntimeCacheForTests();
  });

  describe("runSubmittedCode - Wandbox fallback and edge cases", () => {
    it("sends data files to the Wandbox fallback via codes[]", async () => {
      global.fetch = vi.fn(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          return new Response(
            JSON.stringify([{ language: "python", version: "3.10.0" }]),
            { status: 200 }
          );
        }
        if (urlStr.includes("/execute")) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (urlStr.includes("list.json")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (urlStr.includes("compile.json")) {
          const body = JSON.parse(String(init?.body));
          expect(body.code).toBe('print(open("story.txt").read())');
          expect(body.codes).toEqual([{ file: "story.txt", code: "Once upon a time" }]);
          expect(body["compiler-option-raw"]).toBeUndefined();
          return new Response(
            JSON.stringify({ status: "0", signal: "", program_output: "Once upon a time\n", program_error: "" }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const result = await runSubmittedCode([
        { name: "main.py", extension: "py", previewContent: 'print(open("story.txt").read())' },
        { name: "story.txt", extension: "txt", previewContent: "Once upon a time" },
      ]);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(true);
      expect(result!.files).toEqual(["main.py", "story.txt"]);
    });

    it("skips oversized data files and unknown binary extensions", async () => {
      global.fetch = vi.fn(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          return new Response(
            JSON.stringify([{ language: "python", version: "3.10.0" }]),
            { status: 200 }
          );
        }
        if (urlStr.includes("/execute")) {
          const body = JSON.parse(String(init?.body));
          expect(body.files.map((f: { name: string }) => f.name)).toEqual(["main.py"]);
          return new Response(
            JSON.stringify({
              language: "python",
              version: "3.10.0",
              run: { stdout: "", stderr: "", code: 0, signal: null, output: "" },
            }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const result = await runSubmittedCode([
        { name: "main.py", extension: "py", previewContent: "print(1)" },
        { name: "huge.txt", extension: "txt", previewContent: "x".repeat(200_001) },
        { name: "photo.png", extension: "png", previewContent: "binary-ish" },
      ]);
      expect(result).not.toBeNull();
      expect(result!.files).toEqual(["main.py"]);
    });

    it("falls back to Wandbox when Piston returns 401 (whitelist-only public API)", async () => {
      const pythonContent = 'print("via wandbox")';

      global.fetch = vi.fn(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          return new Response(
            JSON.stringify([{ language: "python", version: "3.10.0" }]),
            { status: 200 }
          );
        }
        if (urlStr.includes("/execute")) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (urlStr.includes("list.json")) {
          return new Response(
            JSON.stringify([
              { name: "cpython-head", language: "Python" },
              { name: "cpython-3.14.0", language: "Python" },
              { name: "cpython-3.13.8", language: "Python" },
            ]),
            { status: 200 }
          );
        }
        if (urlStr.includes("compile.json")) {
          const body = JSON.parse(String(init?.body));
          expect(body.compiler).toBe("cpython-3.14.0"); // newest non-head
          expect(body.code).toBe(pythonContent);
          expect(body.codes).toEqual([]);
          return new Response(
            JSON.stringify({
              status: "0",
              signal: "",
              compiler_output: "",
              compiler_error: "",
              program_output: "via wandbox\n",
              program_error: "",
            }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const files: CodeFileInput[] = [
        { name: "main.py", extension: "py", previewContent: pythonContent },
      ];

      const result = await runSubmittedCode(files);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(true);
      expect(result!.stdout).toBe("via wandbox\n");
      expect(result!.exitCode).toBe(0);
      expect(result!.files).toEqual(["main.py"]);
      expect(result!.error).toBeUndefined();
    });

    it("sends extra files to Wandbox via codes[] with their real names", async () => {
      global.fetch = vi.fn(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          return new Response(
            JSON.stringify([{ language: "python", version: "3.10.0" }]),
            { status: 200 }
          );
        }
        if (urlStr.includes("/execute")) {
          return new Response("Rate limited", { status: 429 });
        }
        if (urlStr.includes("list.json")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (urlStr.includes("compile.json")) {
          const body = JSON.parse(String(init?.body));
          expect(body.compiler).toBe("cpython-3.13.8"); // pinned fallback id
          expect(body.code).toBe("import helper\nprint(helper.add(1, 2))");
          expect(body.codes).toEqual([{ file: "helper.py", code: "def add(a, b):\n    return a + b" }]);
          return new Response(
            JSON.stringify({ status: "0", signal: "", program_output: "3\n", program_error: "" }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const files: CodeFileInput[] = [
        { name: "main.py", extension: "py", previewContent: "import helper\nprint(helper.add(1, 2))" },
        { name: "helper.py", extension: "py", previewContent: "def add(a, b):\n    return a + b" },
      ];

      const result = await runSubmittedCode(files);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(true);
      expect(result!.stdout).toBe("3\n");
    });

    it("runs Java on Wandbox through a shim main class with real file names in codes[]", async () => {
      const javaMain = "public class Main {\n  public static void main(String[] args) { System.out.println(Helper.value()); }\n}";
      const javaHelper = "class Helper { static int value() { return 7; } }";

      global.fetch = vi.fn(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          return new Response(
            JSON.stringify([{ language: "java", version: "15.0.2" }]),
            { status: 200 }
          );
        }
        if (urlStr.includes("/execute")) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (urlStr.includes("list.json")) {
          return new Response(
            JSON.stringify([{ name: "openjdk-jdk-22+36", language: "Java" }]),
            { status: 200 }
          );
        }
        if (urlStr.includes("compile.json")) {
          const body = JSON.parse(String(init?.body));
          expect(body.code).toContain("class prog");
          expect(body.code).toContain("Main.main(args)");
          expect(body.codes).toEqual([
            { file: "Main.java", code: javaMain },
            { file: "Helper.java", code: javaHelper },
          ]);
          return new Response(
            JSON.stringify({ status: "0", signal: "", program_output: "7\n", program_error: "" }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const files: CodeFileInput[] = [
        { name: "Main.java", extension: "java", previewContent: javaMain },
        { name: "Helper.java", extension: "java", previewContent: javaHelper },
      ];

      const result = await runSubmittedCode(files);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(true);
      expect(result!.stdout).toBe("7\n");
      expect(result!.files).toEqual(["Main.java", "Helper.java"]);
    });

    it("delegates to the outer class even when a nested class precedes main", async () => {
      const javaSource =
        "public class LinkedList {\n  static class Node { int v; }\n  public static void main(String[] args){ System.out.println(1); }\n}";

      global.fetch = vi.fn(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          return new Response(JSON.stringify([{ language: "java", version: "15.0.2" }]), { status: 200 });
        }
        if (urlStr.includes("/execute")) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (urlStr.includes("list.json")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (urlStr.includes("compile.json")) {
          const body = JSON.parse(String(init?.body));
          expect(body.code).toContain("LinkedList.main(args)");
          expect(body.code).not.toContain("Node.main");
          return new Response(
            JSON.stringify({ status: "0", signal: "", program_output: "1\n", program_error: "" }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const result = await runSubmittedCode([
        { name: "LinkedList.java", extension: "java", previewContent: javaSource },
      ]);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(true);
    });

    it("uses a class literally named prog as the Wandbox main code directly", async () => {
      const javaSource = "class prog { public static void main(String[] args){ System.out.println(9); } }";

      global.fetch = vi.fn(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          return new Response(JSON.stringify([{ language: "java", version: "15.0.2" }]), { status: 200 });
        }
        if (urlStr.includes("/execute")) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (urlStr.includes("list.json")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (urlStr.includes("compile.json")) {
          const body = JSON.parse(String(init?.body));
          expect(body.code).toBe(javaSource);
          expect(body.codes).toEqual([]);
          return new Response(
            JSON.stringify({ status: "0", signal: "", program_output: "9\n", program_error: "" }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const result = await runSubmittedCode([
        { name: "prog.java", extension: "java", previewContent: javaSource },
      ]);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(true);
    });

    it("names extra C++ sources on the Wandbox compile line so they link", async () => {
      global.fetch = vi.fn(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          return new Response(JSON.stringify([{ language: "c++", version: "10.2.0" }]), { status: 200 });
        }
        if (urlStr.includes("/execute")) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (urlStr.includes("list.json")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (urlStr.includes("compile.json")) {
          const body = JSON.parse(String(init?.body));
          expect(body["compiler-option-raw"]).toBe("helper.cpp");
          expect(body.codes).toEqual([
            { file: "helper.cpp", code: "int helper(){ return 42; }" },
            { file: "notes.h", code: "int helper();" },
          ]);
          return new Response(
            JSON.stringify({ status: "0", signal: "", program_output: "42\n", program_error: "" }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const result = await runSubmittedCode([
        { name: "main.cpp", extension: "cpp", previewContent: "int helper();\nint main(){ return helper() == 42 ? 0 : 1; }" },
        { name: "helper.cpp", extension: "cpp", previewContent: "int helper(){ return 42; }" },
        { name: "notes.h", extension: "h", previewContent: "int helper();" },
      ]);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(true);
    });

    it("picks the newest stable Wandbox compiler by version, not list order", async () => {
      global.fetch = vi.fn(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          return new Response(JSON.stringify([{ language: "python", version: "3.10.0" }]), { status: 200 });
        }
        if (urlStr.includes("/execute")) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (urlStr.includes("list.json")) {
          return new Response(
            JSON.stringify([
              { name: "cpython-2.7.18", language: "Python", version: "2.7.18" },
              { name: "cpython-head", language: "Python", version: "3.15.0" },
              { name: "cpython-3.14.0", language: "Python", version: "3.14.0" },
            ]),
            { status: 200 }
          );
        }
        if (urlStr.includes("compile.json")) {
          const body = JSON.parse(String(init?.body));
          expect(body.compiler).toBe("cpython-3.14.0");
          return new Response(
            JSON.stringify({ status: "0", signal: "", program_output: "ok\n", program_error: "" }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const result = await runSubmittedCode([
        { name: "main.py", extension: "py", previewContent: 'print("ok")' },
      ]);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(true);
    });

    it("reports both failures when Piston is unauthorized and Wandbox also fails", async () => {
      global.fetch = vi.fn(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          return new Response(
            JSON.stringify([{ language: "python", version: "3.10.0" }]),
            { status: 200 }
          );
        }
        if (urlStr.includes("/execute")) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (urlStr.includes("list.json")) {
          return new Response("down", { status: 503 });
        }
        if (urlStr.includes("compile.json")) {
          return new Response("down", { status: 503 });
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const files: CodeFileInput[] = [
        { name: "main.py", extension: "py", previewContent: 'print("x")' },
      ];

      const result = await runSubmittedCode(files);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(false);
      expect(result!.error).toContain("whitelist-only");
      expect(result!.error).toContain("Wandbox fallback also failed");
    });

    it("surfaces Wandbox compile errors through compileOutput", async () => {
      global.fetch = vi.fn(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          return new Response(
            JSON.stringify([{ language: "c++", version: "10.2.0" }]),
            { status: 200 }
          );
        }
        if (urlStr.includes("/execute")) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (urlStr.includes("list.json")) {
          return new Response(
            JSON.stringify([{ name: "gcc-13.2.0", language: "C++" }]),
            { status: 200 }
          );
        }
        if (urlStr.includes("compile.json")) {
          return new Response(
            JSON.stringify({
              status: "1",
              signal: "",
              compiler_error: "prog.cc:1:20: error: 'oops' was not declared in this scope",
              program_output: "",
              program_error: "",
            }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const files: CodeFileInput[] = [
        { name: "main.cpp", extension: "cpp", previewContent: "int main(){ return oops; }" },
      ];

      const result = await runSubmittedCode(files);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(false);
      expect(result!.exitCode).toBe(1);
      expect(result!.compileOutput).toContain("error:");
    });

    it("ignores files with empty content after decoding", async () => {
      const javaContent = "public class Main { }";
      const javaBase64 = Buffer.from(javaContent).toString("base64");

      global.fetch = vi.fn(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          return new Response(
            JSON.stringify([
              { language: "java", version: "15.0.2" },
              { language: "python", version: "3.10.0" },
            ]),
            { status: 200 }
          );
        }
        if (urlStr.includes("/execute")) {
          const body = JSON.parse(String(init?.body));
          // Only the non-empty Java file should be included
          expect(body.files).toHaveLength(1);
          expect(body.files[0].name).toBe("Main.java");

          return new Response(
            JSON.stringify({
              language: "java",
              version: "15.0.2",
              run: {
                stdout: "",
                stderr: "",
                code: 0,
                signal: null,
                output: "",
              },
            }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const files: CodeFileInput[] = [
        { name: "Main.java", extension: "java", rawBase64: javaBase64 },
        { name: "empty.py", extension: "py", previewContent: "" },
        { name: "whitespace.py", extension: "py", previewContent: "   \n\t" },
      ];

      const result = await runSubmittedCode(files);
      expect(result).not.toBeNull();
      expect(result!.language).toBe("java");
      expect(result!.files).toEqual(["Main.java"]);
    });
  });
});
