// Runs untrusted student code through an external sandbox and reports whether
// it ran cleanly. Piston (https://emkc.org/api/v2/piston) is tried first; its
// public /execute endpoint went whitelist-only on 2026-02-15, so auth and
// rate-limit failures fall back to the keyless Wandbox API
// (https://wandbox.org/api). Execution is always external—never in-process—and
// is network-dependent, so this module is not part of the deterministic
// grading engine.

import { Buffer } from "buffer";

/** One source file to execute. */
export interface CodeFileInput {
  name: string;
  /** File extension without a dot, lowercased (e.g. "py", "cpp"). */
  extension: string;
  /** Full file bytes, base64 (preferred source of truth). */
  rawBase64?: string;
  /** Fallback text when rawBase64 is absent (may be truncated). */
  previewContent?: string;
}

/** The outcome of running one student's code. */
export interface CodeRunResult {
  /** Piston language that was run (e.g. "python", "c++"). */
  language: string;
  /** Names of the files sent to the runner. */
  files: string[];
  /** True when it compiled (if applicable) and exited 0. */
  ran: boolean;
  /** Process exit code, or null when unknown / not reached. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Compiler stage output, when the language has a compile step. */
  compileOutput?: string;
  /** Set when execution could not be attempted (e.g. network error). Non-fatal. */
  error?: string;
}

// Map from extension to Piston language.
const EXTENSION_MAP: Record<string, string> = {
  ts: "typescript",
  py: "python",
  java: "java",
  c: "c",
  cpp: "c++",
  cc: "c++",
  cxx: "c++",
  hpp: "c++",
  h: "c++",
  js: "javascript",
};

const FALLBACK_VERSIONS: Record<string, string> = {
  python: "3.10.0",
  typescript: "5.0.3",
  java: "15.0.2",
  c: "10.2.0",
  "c++": "10.2.0",
  javascript: "18.15.0",
};

const PISTON_URL =
  process.env.PISTON_API_URL?.trim().replace(/\/+$/, "") || "https://emkc.org/api/v2/piston";

// Optional API key sent as the Authorization header. emkc.org issues keys; self-hosted
// Piston instances may also require one. No "Bearer" prefix—send the bare token.
const PISTON_KEY = process.env.PISTON_API_KEY?.trim() || "";

const WANDBOX_URL =
  process.env.WANDBOX_API_URL?.trim().replace(/\/+$/, "") || "https://wandbox.org/api";

// Wandbox language names (list.json) per Piston language.
const WANDBOX_LANGUAGES: Record<string, string> = {
  python: "Python",
  typescript: "TypeScript",
  javascript: "JavaScript",
  java: "Java",
  c: "C",
  "c++": "C++",
};

// Known-good Wandbox compiler ids used when list.json is unreachable.
const WANDBOX_FALLBACK_COMPILERS: Record<string, string> = {
  python: "cpython-3.13.8",
  typescript: "typescript-5.6.2",
  javascript: "nodejs-20.17.0",
  java: "openjdk-jdk-22+36",
  c: "gcc-13.2.0-c",
  "c++": "gcc-13.2.0",
};

// Module-level cache for runtimes lookup.
let runtimesCache: Array<{ language: string; version: string; aliases?: string[] }> | null = null;

// Module-level cache for the Wandbox compiler list.
let wandboxCompilersCache: Array<{ name: string; language: string; version?: string }> | null =
  null;

/**
 * Normalize an extension (strip leading dot, lowercase) and return the Piston
 * language, or null if not recognized.
 */
export function languageForExtension(extension: string): string | null {
  const normalized = extension.replace(/^\./, "").toLowerCase();
  return EXTENSION_MAP[normalized] ?? null;
}

/**
 * Compare two semantic versions by splitting on dots and comparing numeric
 * segments. Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map((x) => parseInt(x, 10) || 0);
  const bParts = b.split(".").map((x) => parseInt(x, 10) || 0);
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const aPart = aParts[i] || 0;
    const bPart = bParts[i] || 0;
    if (aPart < bPart) return -1;
    if (aPart > bPart) return 1;
  }
  return 0;
}

/**
 * Fetch the Piston runtimes list and cache it. Return the version of the
 * runtime matching the language (or highest alias match). Fall back to
 * FALLBACK_VERSIONS if lookup fails.
 */
async function resolveVersion(language: string): Promise<string> {
  if (!runtimesCache) {
    try {
      const headers: Record<string, string> = {};
      if (PISTON_KEY) {
        headers.Authorization = PISTON_KEY;
      }
      const res = await fetch(`${PISTON_URL}/runtimes`, { headers });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Piston rejected the request (401 unauthorized). Set PISTON_API_KEY (for the public emkc.org API) or point PISTON_API_URL at a self-hosted Piston instance.");
        }
        throw new Error(`Runtimes lookup returned ${res.status}`);
      }
      runtimesCache = (await res.json()) as Array<{
        language: string;
        version: string;
        aliases?: string[];
      }>;
    } catch {
      // Fall through to FALLBACK_VERSIONS
      const fallback = FALLBACK_VERSIONS[language];
      if (!fallback) {
        throw new Error(`No runtime found for language "${language}" and no fallback available`);
      }
      return fallback;
    }
  }

  // Find the best match: exact language match, or highest alias match.
  let best: { language: string; version: string; aliases?: string[] } | null = null;
  let bestIsAlias = false;

  for (const runtime of runtimesCache) {
    if (runtime.language === language) {
      best = runtime;
      bestIsAlias = false;
      break; // Exact match wins immediately
    }
    if (!bestIsAlias && runtime.aliases?.includes(language)) {
      if (!best || compareVersions(runtime.version, best.version) > 0) {
        best = runtime;
        bestIsAlias = true;
      }
    }
  }

  if (best) {
    return best.version;
  }

  // Fall back to hardcoded version.
  const fallback = FALLBACK_VERSIONS[language];
  if (!fallback) {
    throw new Error(`No runtime found for language "${language}" and no fallback available`);
  }
  return fallback;
}

/**
 * Pick a Wandbox compiler for the language: newest stable (non-head) entry in
 * list.json, falling back to a known-good pinned id when the list is
 * unreachable. Throws when the language has no Wandbox mapping at all.
 */
async function resolveWandboxCompiler(language: string): Promise<string> {
  const wandboxLanguage = WANDBOX_LANGUAGES[language];
  if (!wandboxLanguage) {
    throw new Error(`No fallback runner available for language "${language}".`);
  }
  if (!wandboxCompilersCache) {
    try {
      const res = await fetch(`${WANDBOX_URL}/list.json`);
      if (res.ok) {
        wandboxCompilersCache = (await res.json()) as Array<{
          name: string;
          language: string;
          version?: string;
        }>;
      }
    } catch {
      // Fall through to the pinned compiler id.
    }
  }
  // Newest stable release by version (not list order), skipping -head builds.
  const stable = (wandboxCompilersCache ?? [])
    .filter((c) => c.language === wandboxLanguage && !c.name.includes("head"))
    .sort((a, b) => compareVersions(b.version ?? "0", a.version ?? "0"))[0];
  return stable?.name || WANDBOX_FALLBACK_COMPILERS[language];
}

interface WandboxResponse {
  status?: string;
  signal?: string;
  compiler_output?: string;
  compiler_error?: string;
  program_output?: string;
  program_error?: string;
}

/**
 * Run files via the Wandbox compile API. Wandbox names its main source file
 * "prog.<ext>", so extra files ride along in codes[] under their real names;
 * Java (where the public class name must match the file name) puts every real
 * file in codes[] and delegates from a tiny shim main class instead.
 */
async function runViaWandbox(
  language: string,
  files: Array<{ name: string; content: string }>
): Promise<CodeRunResult> {
  const compiler = await resolveWandboxCompiler(language);

  let mainCode: string;
  let extraFiles: Array<{ name: string; content: string }>;
  if (language === "java") {
    const mainFile = files.find((f) => /public\s+static\s+void\s+main/.test(f.content)) ?? files[0];
    // Pick the type that owns main(): the type named after the file (the Java
    // convention, and mandatory for public classes), else the first public
    // type, else the first declared type. Interfaces/enums/records can carry a
    // static main too, and nested types must not win over the outer one.
    const fileBase = mainFile.name.replace(/^.*[\\/]/, "").replace(/\.java$/i, "");
    const typeNames = [...mainFile.content.matchAll(/\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    const publicType = mainFile.content.match(/\bpublic\s+(?:final\s+|abstract\s+)?(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/);
    const mainClass = typeNames.includes(fileBase) ? fileBase : publicType?.[1] ?? typeNames[0] ?? null;
    if (!mainClass) {
      throw new Error("Could not find a Java class to run.");
    }
    if (mainClass === "prog") {
      // The student's own entry class already has Wandbox's main-file name.
      mainCode = mainFile.content;
      extraFiles = files.filter((f) => f !== mainFile);
    } else {
      mainCode = `class prog { public static void main(String[] args) throws Exception { ${mainClass}.main(args); } }`;
      extraFiles = files;
    }
  } else {
    mainCode = files[0].content;
    extraFiles = files.slice(1);
  }

  // Wandbox only compiles its main file; extra C/C++ sources in codes[] land on
  // disk but must be named on the compile line or cross-file calls fail to link.
  const extraSources =
    language === "c" || language === "c++"
      ? extraFiles.filter((f) => /\.(c|cc|cpp|cxx)$/i.test(f.name)).map((f) => f.name)
      : [];

  const res = await fetch(`${WANDBOX_URL}/compile.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      compiler,
      code: mainCode,
      codes: extraFiles.map((f) => ({ file: f.name, code: f.content })),
      ...(extraSources.length > 0 ? { "compiler-option-raw": extraSources.join("\n") } : {}),
      stdin: "",
    }),
  });
  if (!res.ok) {
    throw new Error(`Wandbox returned ${res.status}`);
  }
  const result = (await res.json()) as WandboxResponse;

  const parsedStatus =
    result.status !== undefined && result.status !== "" ? parseInt(result.status, 10) : NaN;
  const exitCode = Number.isFinite(parsedStatus) ? parsedStatus : null;
  const compileOutput = result.compiler_error || result.compiler_output || undefined;

  return {
    language,
    files: files.map((f) => f.name),
    ran: exitCode === 0 && !result.signal,
    exitCode,
    stdout: result.program_output ?? "",
    stderr: result.program_error ?? "",
    compileOutput,
  };
}

interface PistonFile {
  name: string;
  content: string;
}

interface PistonResponse {
  language: string;
  version: string;
  run: {
    stdout: string;
    stderr: string;
    code: number | null;
    signal: string | null;
    output: string;
  };
  compile?: {
    stdout: string;
    stderr: string;
    code: number | null;
    output: string;
  };
}

/**
 * Run the dominant language's files via Piston. Return null if no valid
 * code files are present. Always return a result on error (never throw).
 */
export async function runSubmittedCode(files: CodeFileInput[]): Promise<CodeRunResult | null> {
  // Step 1: Decode files and detect their language.
  const decodedFiles: Array<{ name: string; content: string; language: string | null }> = [];

  for (const file of files) {
    let content: string | null = null;

    if (file.rawBase64) {
      try {
        content = Buffer.from(file.rawBase64, "base64").toString("utf8");
      } catch {
        // Silently skip if decoding fails
        continue;
      }
    } else if (file.previewContent) {
      content = file.previewContent;
    }

    if (!content || !content.trim()) {
      continue; // Skip empty files
    }

    const lang = languageForExtension(file.extension);
    decodedFiles.push({ name: file.name, content, language: lang });
  }

  // Step 2: Keep only files with recognized languages.
  const validFiles = decodedFiles.filter((f) => f.language !== null);
  if (validFiles.length === 0) {
    return null;
  }

  // Step 3: Select the dominant language (most files, or by total content length).
  const byLanguage = new Map<string, Array<{ name: string; content: string }>>();
  for (const file of validFiles) {
    const lang = file.language!;
    if (!byLanguage.has(lang)) {
      byLanguage.set(lang, []);
    }
    byLanguage.get(lang)!.push({ name: file.name, content: file.content });
  }

  let dominantLanguage = "";
  let dominantFiles: Array<{ name: string; content: string }> = [];
  let maxFiles = 0;
  let maxLength = 0;

  for (const [lang, langFiles] of byLanguage) {
    const totalLength = langFiles.reduce((sum, f) => sum + f.content.length, 0);
    if (
      langFiles.length > maxFiles ||
      (langFiles.length === maxFiles && totalLength > maxLength)
    ) {
      dominantLanguage = lang;
      dominantFiles = langFiles;
      maxFiles = langFiles.length;
      maxLength = totalLength;
    }
  }

  // Step 4: Resolve version and execute.
  let version: string;
  try {
    version = await resolveVersion(dominantLanguage);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      language: dominantLanguage,
      files: dominantFiles.map((f) => f.name),
      ran: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      error: message,
    };
  }

  const pistonFiles: PistonFile[] = dominantFiles.map((f) => ({
    name: f.name,
    content: f.content,
  }));

  let result: PistonResponse;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (PISTON_KEY) {
      headers.Authorization = PISTON_KEY;
    }
    const res = await fetch(`${PISTON_URL}/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        language: dominantLanguage,
        version,
        files: pistonFiles,
        stdin: "",
      }),
    });

    if (!res.ok) {
      // Auth (the public API is whitelist-only since 2026-02-15) and
      // rate-limit failures get a second chance on the keyless Wandbox API.
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        const pistonMessage =
          res.status === 429
            ? "Piston rate-limited the request (429)."
            : `Piston rejected the request (${res.status}): the public emkc.org API is whitelist-only. Set PISTON_API_KEY if whitelisted, or point PISTON_API_URL at a self-hosted Piston instance.`;
        try {
          return await runViaWandbox(dominantLanguage, dominantFiles);
        } catch (fallbackErr) {
          const fallbackMessage =
            fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          throw new Error(`${pistonMessage} Wandbox fallback also failed: ${fallbackMessage}`);
        }
      }
      throw new Error(`Piston returned ${res.status}`);
    }

    result = (await res.json()) as PistonResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      language: dominantLanguage,
      files: dominantFiles.map((f) => f.name),
      ran: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      error: message,
    };
  }

  // Step 5: Parse response into CodeRunResult.
  const compileOutput = result.compile?.output || result.compile?.stderr;
  const exitCode = result.run.code ?? null;
  const stdout = result.run.stdout ?? "";
  const stderr = result.run.stderr ?? "";

  const compiledSuccessfully = !result.compile || result.compile.code === 0;
  const ranSuccessfully = result.run.code === 0 && !result.run.signal;
  const ran = compiledSuccessfully && ranSuccessfully;

  return {
    language: dominantLanguage,
    files: dominantFiles.map((f) => f.name),
    ran,
    exitCode,
    stdout,
    stderr,
    compileOutput,
  };
}

/**
 * Reset the runtimes and Wandbox compiler caches. Test-only helper.
 */
export function __resetRuntimeCacheForTests(): void {
  runtimesCache = null;
  wandboxCompilersCache = null;
}
