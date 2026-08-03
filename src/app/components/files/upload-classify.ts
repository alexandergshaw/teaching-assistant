// Decide the RecordingFile kind + mimeType handleUploadFiles saves an
// uploaded browser File under, from the File's own `type` - pulled out of
// FilesTab.tsx (kept that component under this project's 1000-line cap).
// Pure - a mechanical relocation, no behavior change. Reading a video's
// duration stays a separate, async step in FilesTab.tsx (readDuration in
// files/read-duration.ts), since this classification itself is synchronous.
export type UploadFileKind = "recording" | "captioned" | "narrated" | "bundle" | "file";

export function classifyUploadFile(file: File): { kind: UploadFileKind; mimeType: string } {
  let kind: UploadFileKind = "file";
  let mimeType = file.type || "application/octet-stream";

  if (file.type.startsWith("video/")) {
    kind = "recording";
    mimeType = file.type;
  } else if (file.type.startsWith("audio/")) {
    kind = "recording";
    mimeType = file.type;
  } else if (mimeType.includes("zip")) {
    kind = "bundle";
  }

  return { kind, mimeType };
}
