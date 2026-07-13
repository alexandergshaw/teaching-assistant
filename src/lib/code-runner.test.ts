import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  languageForExtension,
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

  describe("languageForExtension", () => {
    it("maps common extensions correctly", () => {
      expect(languageForExtension("py")).toBe("python");
      expect(languageForExtension("ts")).toBe("typescript");
      expect(languageForExtension("java")).toBe("java");
      expect(languageForExtension("js")).toBe("javascript");
      expect(languageForExtension("c")).toBe("c");
    });

    it("maps C++ variants to c++", () => {
      expect(languageForExtension("cpp")).toBe("c++");
      expect(languageForExtension("cc")).toBe("c++");
      expect(languageForExtension("cxx")).toBe("c++");
      expect(languageForExtension("hpp")).toBe("c++");
      expect(languageForExtension("h")).toBe("c++");
    });

    it("normalizes leading dots and case", () => {
      expect(languageForExtension(".PY")).toBe("python");
      expect(languageForExtension(".CPP")).toBe("c++");
    });

    it("returns null for unknown extensions", () => {
      expect(languageForExtension("txt")).toBeNull();
      expect(languageForExtension("xyz")).toBeNull();
      expect(languageForExtension("")).toBeNull();
    });
  });

  describe("runSubmittedCode", () => {
    it("returns null when given only non-code files", async () => {
      const files: CodeFileInput[] = [
        {
          name: "readme.txt",
          extension: "txt",
          previewContent: "Hello world",
        },
      ];

      const result = await runSubmittedCode(files);
      expect(result).toBeNull();
    });

    it("runs a clean Python submission successfully", async () => {
      const pythonContent = 'print("hello")';
      const pythonBase64 = Buffer.from(pythonContent).toString("base64");

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
          expect(body.language).toBe("python");
          expect(body.version).toBe("3.10.0");
          expect(body.files).toHaveLength(1);
          expect(body.files[0].content).toBe(pythonContent);

          return new Response(
            JSON.stringify({
              language: "python",
              version: "3.10.0",
              run: {
                stdout: "hello\n",
                stderr: "",
                code: 0,
                signal: null,
                output: "hello\n",
              },
            }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const files: CodeFileInput[] = [
        {
          name: "main.py",
          extension: "py",
          rawBase64: pythonBase64,
        },
      ];

      const result = await runSubmittedCode(files);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(true);
      expect(result!.stdout).toBe("hello\n");
      expect(result!.stderr).toBe("");
      expect(result!.language).toBe("python");
      expect(result!.files).toEqual(["main.py"]);
      expect(result!.exitCode).toBe(0);
      expect(result!.error).toBeUndefined();
    });

    it("handles a failed Python run (non-zero exit code)", async () => {
      const pythonContent = 'raise ValueError("boom")';
      const pythonBase64 = Buffer.from(pythonContent).toString("base64");

      global.fetch = vi.fn(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          return new Response(
            JSON.stringify([{ language: "python", version: "3.10.0" }]),
            { status: 200 }
          );
        }
        if (urlStr.includes("/execute")) {
          return new Response(
            JSON.stringify({
              language: "python",
              version: "3.10.0",
              run: {
                stdout: "",
                stderr: "Traceback ...\nValueError: boom\n",
                code: 1,
                signal: null,
                output: "Traceback ...\nValueError: boom\n",
              },
            }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const files: CodeFileInput[] = [
        {
          name: "main.py",
          extension: "py",
          rawBase64: pythonBase64,
        },
      ];

      const result = await runSubmittedCode(files);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(false);
      expect(result!.exitCode).toBe(1);
      expect(result!.stderr).toContain("ValueError: boom");
    });

    it("captures compile failure for C++", async () => {
      const cppContent = 'int main() { invalid syntax }';
      const cppBase64 = Buffer.from(cppContent).toString("base64");

      global.fetch = vi.fn(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          return new Response(
            JSON.stringify([{ language: "c++", version: "10.2.0" }]),
            { status: 200 }
          );
        }
        if (urlStr.includes("/execute")) {
          return new Response(
            JSON.stringify({
              language: "c++",
              version: "10.2.0",
              compile: {
                stdout: "",
                stderr: "error: expected ';' before '}'",
                code: 1,
                output: "error: expected ';' before '}'",
              },
              run: {
                stdout: "",
                stderr: "",
                code: null,
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
        {
          name: "main.cpp",
          extension: "cpp",
          rawBase64: cppBase64,
        },
      ];

      const result = await runSubmittedCode(files);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(false);
      expect(result!.compileOutput).toContain("error:");
    });

    it("selects the dominant language (most files)", async () => {
      const javaContent1 = "public class A {}";
      const javaContent2 = "public class B {}";
      const pyContent = "print('hi')";

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
          // Java is dominant (2 files vs 1 Python file)
          expect(body.language).toBe("java");
          expect(body.files).toHaveLength(2);

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
        { name: "A.java", extension: "java", previewContent: javaContent1 },
        { name: "B.java", extension: "java", previewContent: javaContent2 },
        { name: "main.py", extension: "py", previewContent: pyContent },
      ];

      const result = await runSubmittedCode(files);
      expect(result).not.toBeNull();
      expect(result!.language).toBe("java");
      expect(result!.files).toContain("A.java");
      expect(result!.files).toContain("B.java");
      expect(result!.files).not.toContain("main.py");
    });

    it("falls back to hardcoded version when runtimes lookup fails", async () => {
      const pythonContent = 'print("works")';
      const pythonBase64 = Buffer.from(pythonContent).toString("base64");

      global.fetch = vi.fn(async (url) => {
        const urlStr = String(url);

        if (urlStr.includes("/runtimes")) {
          // Simulate network failure on runtimes lookup
          throw new Error("Network error");
        }
        if (urlStr.includes("/execute")) {
          const expectVersion = "3.10.0"; // The fallback
          // Just verify execution is attempted and succeeds
          return new Response(
            JSON.stringify({
              language: "python",
              version: expectVersion,
              run: {
                stdout: "works\n",
                stderr: "",
                code: 0,
                signal: null,
                output: "works\n",
              },
            }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const files: CodeFileInput[] = [
        {
          name: "main.py",
          extension: "py",
          rawBase64: pythonBase64,
        },
      ];

      const result = await runSubmittedCode(files);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(true);
      expect(result!.stdout).toBe("works\n");
      expect(result!.error).toBeUndefined();
    });

    it("returns error result (not throw) on network failure", async () => {
      const pythonContent = 'print("test")';
      const pythonBase64 = Buffer.from(pythonContent).toString("base64");

      global.fetch = vi.fn(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          throw new Error("Network error");
        }
        if (urlStr.includes("/execute")) {
          throw new Error("Connection refused");
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const files: CodeFileInput[] = [
        {
          name: "main.py",
          extension: "py",
          rawBase64: pythonBase64,
        },
      ];

      const result = await runSubmittedCode(files);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(false);
      expect(result!.error).toBeDefined();
      // The error is from the execute call (after runtimes falls back)
      expect(result!.error).toContain("Connection refused");
      expect(result!.stdout).toBe("");
      expect(result!.stderr).toBe("");
    });

    it("prefers rawBase64 over previewContent", async () => {
      const actualContent = 'print("base64")';
      const fallbackContent = 'print("preview")';
      const actualBase64 = Buffer.from(actualContent).toString("base64");

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
          // Should use the base64-decoded content, not preview
          expect(body.files[0].content).toBe(actualContent);
          expect(body.files[0].content).not.toBe(fallbackContent);

          return new Response(
            JSON.stringify({
              language: "python",
              version: "3.10.0",
              run: {
                stdout: "base64\n",
                stderr: "",
                code: 0,
                signal: null,
                output: "base64\n",
              },
            }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const files: CodeFileInput[] = [
        {
          name: "main.py",
          extension: "py",
          rawBase64: actualBase64,
          previewContent: fallbackContent,
        },
      ];

      const result = await runSubmittedCode(files);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(true);
    });

    it("handles exit signal (non-zero code takes precedence)", async () => {
      const pythonContent = 'import os; os.kill(os.getpid(), 9)';
      const pythonBase64 = Buffer.from(pythonContent).toString("base64");

      global.fetch = vi.fn(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/runtimes")) {
          return new Response(
            JSON.stringify([{ language: "python", version: "3.10.0" }]),
            { status: 200 }
          );
        }
        if (urlStr.includes("/execute")) {
          return new Response(
            JSON.stringify({
              language: "python",
              version: "3.10.0",
              run: {
                stdout: "",
                stderr: "",
                code: null,
                signal: "SIGKILL",
                output: "",
              },
            }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const files: CodeFileInput[] = [
        {
          name: "main.py",
          extension: "py",
          rawBase64: pythonBase64,
        },
      ];

      const result = await runSubmittedCode(files);
      expect(result).not.toBeNull();
      expect(result!.ran).toBe(false);
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
