// Runs untrusted student code through the public Piston sandbox
// (https://emkc.org/api/v2/piston) and reports whether it ran cleanly. Execution
// is always external—never in-process—and is network-dependent, so this module
// is not part of the deterministic grading engine.

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

// Module-level cache for runtimes lookup.
let runtimesCache: Array<{ language: string; version: string; aliases?: string[] }> | null = null;

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
      const res = await fetch(`${PISTON_URL}/runtimes`);
      if (!res.ok) {
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
    const res = await fetch(`${PISTON_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: dominantLanguage,
        version,
        files: pistonFiles,
        stdin: "",
      }),
    });

    if (!res.ok) {
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
 * Reset the runtimes cache. Test-only helper.
 */
export function __resetRuntimeCacheForTests(): void {
  runtimesCache = null;
}
