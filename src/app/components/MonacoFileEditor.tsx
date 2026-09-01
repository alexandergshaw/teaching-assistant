"use client";

import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import styles from "../page.module.css";

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
  /** Disables editing (keeps syntax highlighting, line numbers, find, and the
   *  minimap). Used to display code the app has no business letting the user
   *  edit, e.g. a student's fetched-live GitHub submission. */
  readOnly?: boolean;
}

/**
 * The Monaco editor (the engine behind VS Code) for editing a repo file: syntax
 * highlighting, line numbers, find/replace, multi-cursor, minimap, bracket
 * matching, and the command palette. Client-only; the editor theme follows the
 * app's data-theme attribute.
 */
export default function MonacoFileEditor({ path, value, onChange, height = "60vh", readOnly = false }: MonacoFileEditorProps) {
  const [theme, setTheme] = useState<"vs-dark" | "light">(() => {
    if (typeof window === "undefined") return "light";
    const dataTheme = document.documentElement.dataset.theme;
    return dataTheme === "dark" ? "vs-dark" : "light";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Watch for changes to data-theme attribute
    const observer = new MutationObserver(() => {
      const newDataTheme = document.documentElement.dataset.theme;
      setTheme(newDataTheme === "dark" ? "vs-dark" : "light");
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ border: "1px solid var(--field-border)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
      <Editor
        height={height}
        language={languageForPath(path)}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        theme={theme}
        loading={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "var(--space-4)",
              fontSize: "var(--font-size-md)",
              color: "var(--text-secondary)",
            }}
          >
            <span className={styles.spinner} aria-hidden="true" />
            Loading editor...
          </div>
        }
        options={{
          // Monaco's own rendering metric (a canvas pixel size passed to a
          // third-party engine), not a CSS font-size on an owned stylesheet
          // or inline style - it takes a plain number, not a custom-property
          // string, so this is left as a literal. See the group report for
          // why (AC1 governs CSS/JSX font-size, not this option).
          fontSize: 13,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: "on",
          renderWhitespace: "selection",
          smoothScrolling: true,
          readOnly,
        }}
      />
    </div>
  );
}
