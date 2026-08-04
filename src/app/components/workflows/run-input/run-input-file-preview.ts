// Pure helpers for the run-input table's per-row submission-file preview
// (DEFECT 3 split - extracted out of RunInputRowDetail.tsx's file-mapping
// JSX so both are unit-testable without a DOM/React harness; vitest.config.ts
// runs tests under a plain "node" environment, where global atob/TextDecoder
// are both available). Mirrors the original inline logic exactly.

// Extensions treated as text even when a file's mimeType is not "text/*" -
// mirrors the original inline list verbatim.
const TEXT_LIKE_EXTENSIONS = [
  "py", "js", "ts", "jsx", "tsx", "java", "c", "cpp", "h", "cs", "rb", "go",
  "rs", "php", "html", "css", "json", "md", "txt", "sql", "sh", "yml", "yaml",
];

/**
 * Whether a submission file should be decoded and shown as text rather than
 * left as "(binary file - download via SpeedGrader)": true for any
 * "text/*" mimeType, or a recognized source/text extension.
 */
export function isTextLikeSubmissionFile(name: string, mimeType: string): boolean {
  if (mimeType.startsWith("text/")) return true;
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : "";
  return TEXT_LIKE_EXTENSIONS.includes(ext);
}

const MAX_PREVIEW_CHARS = 20000;

/**
 * Decodes a submission file's base64 payload to displayable text, truncated
 * past MAX_PREVIEW_CHARS. Never throws - an undecodable payload (not valid
 * base64) falls back to a fixed error string, exactly like the original
 * inline try/catch.
 */
export function decodeSubmissionFileText(base64: string): string {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    return text.length > MAX_PREVIEW_CHARS
      ? text.substring(0, MAX_PREVIEW_CHARS) + "\n... (truncated)"
      : text;
  } catch {
    return "(Error decoding file)";
  }
}
