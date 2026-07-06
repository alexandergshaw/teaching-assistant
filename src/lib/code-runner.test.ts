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
