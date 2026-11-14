import { isSafeGenericExecutionComponent } from "./generic-execution-path";

/** A conservative plan: no user-provided shell commands are executed. */
export type GenericLanguage = "python" | "javascript" | "java" | "c" | "c++";
export type GenericRunPlan = { language: GenericLanguage; entryPoint: string; selection: "heuristic" };
export type GenericExecutionPlan = { runs: GenericRunPlan[]; held: Array<{ language: GenericLanguage; reason: "ambiguous" | "no-entry-point" }> };
const extensions: Record<string, GenericLanguage> = { py: "python", js: "javascript", java: "java", c: "c", cpp: "c++", cc: "c++", cxx: "c++" };

/** Resolve Java's runtime name only when the declared package agrees with
 * the submitted path. A mismatch is held instead of guessing a classpath. */
export function resolveJavaSourceEntry(path: string, content: string): { classpath: string; className: string } | null {
  const name = path.split("/").at(-1) ?? "";
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*\.java$/.test(name)) return null;
  const className = name.slice(0, -5);
  const declarations = [...content.matchAll(/^\s*package\s+([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*;/gm)];
  if (declarations.length > 1) return null;
  const pkg = declarations[0]?.[1];
  if (!pkg) {
    if (/^\s*package\b/m.test(content)) return null;
    return { classpath: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".", className };
  }
  const suffix = `${pkg.replaceAll(".", "/")}/${name}`;
  if (path !== suffix && !path.endsWith(`/${suffix}`)) return null;
  const root = path.slice(0, -suffix.length).replace(/\/$/, "");
  return { classpath: root || ".", className: `${pkg}.${className}` };
}

/** Only text from verified complete blobs is eligible. A filename or program
 * output alone is not proof of a test count, coverage, or correctness. */
export function planGenericRepoExecution(files: readonly { path: string; bytes: Uint8Array }[]): GenericExecutionPlan {
  const paths = new Set<string>();
  const grouped = new Map<GenericLanguage, Array<{ path: string; content: string }>>();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const file of files) {
    const parts = file.path.split("/");
    if (!parts.length || parts.some(part => !isSafeGenericExecutionComponent(part)) || paths.has(file.path.toLowerCase())) throw new Error("Unsafe or colliding execution path");
    paths.add(file.path.toLowerCase());
    const suffix = parts.at(-1)?.split(".").at(-1)?.toLowerCase() ?? "";
    const language = Object.hasOwn(extensions, suffix) ? extensions[suffix] : undefined;
    if (!language) continue;
    let content: string;
    try { content = decoder.decode(file.bytes); } catch { throw new Error("Source is not valid UTF-8"); }
    if (content.includes("\0")) throw new Error("Source contains binary data");
    const group = grouped.get(language) ?? []; group.push({ path: file.path, content }); grouped.set(language, group);
  }
  const runs: GenericRunPlan[] = [], held: GenericExecutionPlan["held"] = [];
  for (const [language, group] of grouped) {
    const candidates = group.filter(({ path, content }) => {
      const name = path.split("/").at(-1)!.toLowerCase();
      if (language === "python") return /\bif\s+__name__\s*==\s*["']__main__["']\s*:/.test(content);
      // A conventional filename alone also describes empty files and library
      // modules. Require an explicit command-line entry guard or visible output
      // operation; this is still a heuristic, not proof that tests ran.
      if (language === "javascript") return (name === "main.js" || name === "index.js")
        && !/\b(?:module\s*\.\s*exports|exports\s*(?:\.|\[))/.test(content)
        && (/\brequire\s*\.\s*main\s*===?\s*module\b/.test(content)
          || /\bconsole\s*\.\s*(?:log|info|warn|error)\s*\(/.test(content)
          || /\bprocess\s*\.\s*(?:stdout|stderr)\s*\.\s*write\s*\(/.test(content));
      if (language === "java") return /\bpublic\s+static\s+void\s+main\s*\(/.test(content) && !!resolveJavaSourceEntry(path, content);
      return /\b(?:int|void)\s+main\s*\(/.test(content);
    });
    if (candidates.length !== 1) { held.push({ language, reason: candidates.length ? "ambiguous" : "no-entry-point" }); continue; }
    runs.push({ language, entryPoint: candidates[0].path, selection: "heuristic" });
  }
  return { runs, held };
}
