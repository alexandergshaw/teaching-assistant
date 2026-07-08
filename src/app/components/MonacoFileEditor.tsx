"use client";

import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";

// Map a file extension (or special filename) to a Monaco language id.
const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  mjs: "javascript", cjs: "javascript", json: "json", jsonc: "json",
  md: "markdown", mdx: "markdown", html: "html", htm: "html", xml: "xml",
  css: "css", scss: "scss", sass: "scss", less: "less", py: "python",
  rb: "ruby", php: "php", java: "java", c: "c", h: "c", cpp: "cpp",
  cc: "cpp", hpp: "cpp", cs: "csharp", go: "go", rs: "rust", swift: "swift",
  kt: "kotlin", scala: "scala", sh: "shell", bash: "shell", zsh: "shell",
  yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini", sql: "sql",
  vue: "html", svelte: "html", dart: "dart", r: "r", pl: "perl", lua: "lua",
  graphql: "graphql", proto: "proto", txt: "plaintext",
};

function languageForPath(path: string): string {
  const name = (path.split("/").pop() || path).toLowerCase();
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile") return "makefile";
  const ext = name.includes(".") ? name.split(".").pop() ?? "" : "";
  return LANGUAGE_BY_EXT[ext] || "plaintext";
}

interface MonacoFileEditorProps {
  /** The file path, used to pick the syntax-highlighting language. */
  path: string;
  value: string;
  onChange: (value: string) => void;
  height?: number | string;
}

/**
 * The Monaco editor (the engine behind VS Code) for editing a repo file: syntax
 * highlighting, line numbers, find/replace, multi-cursor, minimap, bracket
 * matching, and the command palette. Client-only; the theme follows the OS.
 */
export default function MonacoFileEditor({ path, value, onChange, height = "60vh" }: MonacoFileEditorProps) {
  const [theme, setTheme] = useState<"vs-dark" | "light">(() => {
    if (typeof window === "undefined" || !window.matchMedia) return "vs-dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "vs-dark" : "light";
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChangeMq = (e: MediaQueryListEvent) => setTheme(e.matches ? "vs-dark" : "light");
    mq.addEventListener("change", onChangeMq);
    return () => mq.removeEventListener("change", onChangeMq);
  }, []);

  return (
    <div style={{ border: "1px solid var(--field-border)", borderRadius: 8, overflow: "hidden" }}>
      <Editor
        height={height}
        language={languageForPath(path)}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        theme={theme}
        loading={<div style={{ padding: 16, fontSize: "0.85rem", color: "var(--text-secondary)" }}>Loading editor...</div>}
        options={{
          fontSize: 13,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: "on",
          renderWhitespace: "selection",
          smoothScrolling: true,
        }}
      />
    </div>
  );
}
