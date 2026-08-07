import type { RecordingFile } from "@/lib/recording-files";
import styles from "../../page.module.css";

export const fmt = (s: number | null) => {
  if (s === null) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export const formatBytes = (bytes: number) => (bytes / 1048576).toFixed(1);

export const kindLabels: Record<string, string> = {
  recording: "Recording",
  captioned: "Captioned",
  narrated: "Narrated",
  sample: "Sample",
  avatar: "Avatar",
};

export const getDisplayKind = (file: RecordingFile): { label: string; badgeClass: string } => {
  if (file.mimeType.includes("zip") || file.kind === "bundle") {
    return { label: "Bundle", badgeClass: styles.ghBadgeNeutral };
  }
  if (file.mimeType.startsWith("audio/")) {
    return { label: "Audio", badgeClass: styles.ghBadgeNeutral };
  }
  if (file.kind === "file") {
    if (file.mimeType.includes("pdf")) {
      return { label: "PDF", badgeClass: styles.ghBadgeNeutral };
    }
    if (file.mimeType.startsWith("image/")) {
      return { label: "Image", badgeClass: styles.ghBadgeNeutral };
    }
    if (file.mimeType.includes("wordprocessingml") || file.mimeType.includes("presentationml") || file.mimeType.includes("spreadsheetml") || file.mimeType.includes("msword")) {
      return { label: "Document", badgeClass: styles.ghBadgeNeutral };
    }
    return { label: "File", badgeClass: styles.ghBadgeNeutral };
  }
  const baseLabel = kindLabels[file.kind] || file.kind;
  if (file.kind === "captioned") {
    return { label: baseLabel, badgeClass: styles.ghBadgeSuccess };
  }
  if (file.kind === "narrated") {
    return { label: baseLabel, badgeClass: styles.ghBadgeAccent };
  }
  return { label: baseLabel, badgeClass: styles.ghBadgeNeutral };
};

// Extracted from FileRow.tsx (formerly inlined at its Play button) so the
// gate is independently testable - vitest.config.ts has no jsdom, so
// component-level behavior can only be pinned by testing the pure seam a
// component calls into. Behavior is unchanged: it still passes on the MIME
// arm for any video, not the kind arm, which is why a new video kind (e.g.
// "sample"/"avatar") keeps a working Play button without needing its own
// entry here - see docs/REGRESSION.md, "2026-08-06 - recording_files.kind as
// a five-place contract", check 4.
export const canPlayInline = (file: RecordingFile): boolean => {
  const isAudio = file.mimeType.startsWith("audio/");
  const displayKind = getDisplayKind(file);
  return (
    isAudio ||
    ((file.mimeType.startsWith("video/") || ["recording", "captioned", "narrated"].includes(file.kind)) &&
      displayKind.label !== "Bundle")
  );
};
