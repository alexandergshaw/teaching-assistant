/** Text formats whose original bytes must be strictly decoded in a static project. */
import { GUARDED_TEXT_EXTENSIONS } from "@/lib/guarded-text-formats";
const STATIC_TEXT_EXTENSIONS = new Set(["c", "cc", "cpp", "cxx", "h", "hpp", "py", "js", "jsx", "ts", "tsx", "java", "cs", "txt", "md", "markdown", "csv", "tsv", "json", "xml", "vcxproj", "sln", "slnx", "filters", "props", "targets", "ipynb", "css", "html", "htm", "yml", "yaml", "sql"]);
export function isStaticProjectText(extension: string): boolean { const normalized = extension.toLowerCase(); return STATIC_TEXT_EXTENSIONS.has(normalized) || GUARDED_TEXT_EXTENSIONS.has(normalized); }
