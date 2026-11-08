import { safeCanvasLabel } from "../canvas/omitted-video";
import { prepareDocumentVisuals } from "./document-visuals";
import type { StudentSubmissionEntry } from "./types";

/** The deterministic grader cannot evaluate pictures. Inspect source bytes rather than trusting prepared metadata. */
export async function canvasEmbeddedOfficeRefusals(entries: readonly StudentSubmissionEntry[]): Promise<Map<number, string>> {
  const refusals = new Map<number, string>();
  for (const [index, entry] of entries.entries()) {
    for (const file of entry.submittedFiles) {
      if (file.extension !== "docx" && file.extension !== "pptx") continue;
      const bytes = file.rawBase64 ? Buffer.from(file.rawBase64, "base64") : undefined;
      const inspection = await prepareDocumentVisuals(file.extension, bytes);
      if (inspection.status !== "complete" || inspection.found > 0) {
        refusals.set(index, `Visual evidence in "${safeCanvasLabel(file.name)}" for ${safeCanvasLabel(entry.student)} cannot be evaluated by the deterministic grader. No grade was produced; use a visual-capable grader or supply a text-only submission.`);
        break;
      }
    }
  }
  return refusals;
}
