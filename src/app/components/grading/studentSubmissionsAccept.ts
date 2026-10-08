// A39 wave 1 ("one submission needs no zip"): every extension
// classifyGradingUpload (src/lib/grade/single-file-entry.ts) treats as
// "single" - i.e. every non-zip type the server can grade directly without
// an archive. Kept in sync with TEXT_EXTENSIONS/DOCUMENT_EXTENSIONS/
// IMAGE_EXTENSIONS (src/lib/office-extract.ts, src/lib/grade/constants.ts)
// by hand: this is a client component and cannot import those server-only
// modules (JSZip, officeparser) directly.
export const SINGLE_SUBMISSION_EXTENSIONS = [
  ".txt", ".md", ".markdown", ".py", ".js", ".ts", ".tsx", ".jsx", ".java",
  ".c", ".cpp", ".cs", ".html", ".htm", ".css", ".json", ".xml", ".rb",
  ".go", ".rs", ".csv", ".tsv", ".dat", ".in", ".ipynb", ".yml", ".yaml",
  ".sql", ".sh", ".bash", ".zsh", ".php", ".swift", ".kt", ".kts", ".scala",
  ".r", ".m", ".tex",
  ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls", ".odt", ".odp", ".ods",
  ".pdf", ".rtf",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".heic", ".heif",
];
export const STUDENT_SUBMISSIONS_ACCEPT = [".zip", "application/zip", ...SINGLE_SUBMISSION_EXTENSIONS].join(",");
