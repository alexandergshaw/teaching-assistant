// FilesTab's derived "shown" list (search + workflow + kind filtering,
// followed by the selected sort) - pulled out of FilesTab.tsx (kept that
// component under this project's 1000-line cap). Pure - touches no React
// state - so it is unit-testable in isolation; a mechanical relocation, no
// behavior change.
import type { RecordingFile } from "@/lib/recording-files";

export type FilesSortBy = "newest" | "oldest" | "name" | "largest";
export type FilesFilterKind = "all" | "recording" | "captioned" | "narrated" | "audio" | "bundle" | "file";
export type FilesFilterWorkflow = "all" | "workflow";

export interface FilterAndSortOptions {
  search: string;
  filterWorkflow: FilesFilterWorkflow;
  filterKind: FilesFilterKind;
  sortBy: FilesSortBy;
}

export function filterAndSortFiles(files: RecordingFile[], options: FilterAndSortOptions): RecordingFile[] {
  const { search, filterWorkflow, filterKind, sortBy } = options;
  return files
    .filter((f) => {
      // Filter by search term
      if (!f.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      // Filter by workflow source
      if (filterWorkflow === "workflow") {
        if (f.source !== "workflow") return false;
      }
      // Filter by kind
      if (filterKind === "audio") {
        return f.mimeType.startsWith("audio/");
      }
      if (filterKind === "bundle") {
        return f.kind === "bundle" || f.mimeType.includes("zip");
      }
      if (filterKind === "file") {
        return f.kind === "file";
      }
      if (filterKind !== "all") {
        return f.kind === filterKind && !f.mimeType.startsWith("audio/");
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "name":
          return a.name.localeCompare(b.name);
        case "largest":
          return b.sizeBytes - a.sizeBytes;
        case "newest":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
}
