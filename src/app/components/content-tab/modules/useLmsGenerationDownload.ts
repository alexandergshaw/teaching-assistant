"use client";

// The artifact-download concern, extracted from useLmsGeneration.ts to keep
// that file under this repo's 1000-line ceiling - a STRUCTURAL split only,
// no behaviour change. Unlike lmsGenerationVersions.ts/lmsGenerationNotes.ts/
// etc (plain pure-function modules), this one is itself a small hook: the
// download control needs its OWN `downloading` state (which format, if any,
// is mid-build) the same way `refining`/`savingEdit` are hook-local state in
// the parent - so the split follows useLmsSyllabusButtons.ts's own precedent
// of a dedicated hook per self-contained concern rather than folding more
// state into the one already-large hook.
//
// "Self-contained read-only concern the generation lifecycle does not
// touch" is what makes this a safe extraction rather than a superficial one:
// `download` only ever READS an already-saved `preview.versions` entry
// (never writes to it, never calls setPreview, never touches Canvas) and
// reports failure through the same `setNote` channel every other entry point
// in useLmsGeneration.ts already uses - so wiring this hook in needs nothing
// from the parent but `preview`, `busy` (to keep the same "a generate/refine
// already running" guard `download` always had) and `setNote` itself. See
// docs/generated-artifact-download-acceptance-criteria.md for the AC this
// implements; re-exported from useLmsGeneration.ts so every existing import
// of that file keeps compiling unchanged.
import { useState } from "react";
import {
  artifactDownloadFormats,
  artifactDownloadFilename,
  artifactDownloadFormatLabel,
  buildArtifactDownloadBlob,
  type ArtifactDownloadFormat,
} from "@/lib/lms-generation/artifact-download";
import { triggerFileDownload } from "../../course-planning/utils";
import type { GenerationBusy } from "./lmsGenerationKindHelpers";
import type { GenerationPreviewState } from "./lmsGenerationTypes";

export function useLmsGenerationDownload(
  preview: GenerationPreviewState | null,
  busy: GenerationBusy,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void
) {
  const [downloading, setDownloading] = useState<ArtifactDownloadFormat | null>(null);

  // The version the preview modal currently has ON SCREEN - AC 1 of
  // docs/generated-artifact-download-acceptance-criteria.md: "not the newest
  // version, not the current-marked one", whatever `selectedVersion` points
  // at. Shared by `downloadFormats` (below) and `download` so both always
  // agree on which row is being offered/built - mirrors useLmsGeneration.ts's
  // own `refine`/`saveEdit` `currentVersion` lookups.
  const selectedPreviewVersion = preview?.versions.find((v) => v.version === preview.selectedVersion);

  const downloadFormats = selectedPreviewVersion ? artifactDownloadFormats(selectedPreviewVersion) : [];

  const download = (format: ArtifactDownloadFormat) => {
    // Three independent no-op guards (AC 7): no preview to download from, a
    // generate/refine already running, or a download already in flight -
    // matches useLmsGeneration.ts's other entry points' own upfront-guard
    // style (generate/refine).
    if (!preview || busy !== "" || downloading !== null) return;
    const artifact = selectedPreviewVersion;
    // Defensive only: downloadFormats/artifactDownloadFormats would already
    // have excluded `format` from what the UI offers if this were false, so
    // this branch should be unreachable in practice.
    if (!artifact) return;
    const { kindLabel } = preview;

    void (async () => {
      setDownloading(format);
      try {
        const blob = await buildArtifactDownloadBlob(artifact, kindLabel, format);
        const filename = artifactDownloadFilename(artifact, kindLabel, format);
        triggerFileDownload(blob, filename);
      } catch (e) {
        // Surfaces through the SAME setNote channel generate/refine already
        // use (AC 6) - never an unhandled rejection, and the preview modal
        // is never closed here, so the instructor's place in the version
        // history is not lost just because a download failed.
        const message = e instanceof Error ? e.message : String(e);
        setNote({
          kind: "error",
          text: `Could not build the ${artifactDownloadFormatLabel(format)} download: ${message}`,
        });
      } finally {
        setDownloading(null);
      }
    })();
  };

  return { downloadFormats, downloading, download };
}
