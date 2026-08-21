// The real, server-stored version-history loader, extracted from
// useLmsGeneration.ts to keep that file under this repo's 1000-line ceiling -
// a STRUCTURAL split only, no behaviour change. Re-exported from
// useLmsGeneration.ts so every existing import of that file keeps compiling
// unchanged. See useLmsGeneration.test.ts for the executable coverage of
// every export here.

import type { GeneratedArtifact } from "@/lib/supabase/generated-artifacts";
import type { GenerationKindId } from "@/lib/lms-generation/kinds";

/** The structural subset of listGeneratedArtifactVersionsAction's return
 * shape loadVersionsForPreview needs - injected so this stays a plain,
 * DI-testable function like this file's other pure exports, rather than
 * requiring a vi.mock of the real Server Action to test. */
export type ListVersionsCall = (input: {
  courseUrl: string;
  kind: GenerationKindId;
  courseId?: string;
  /** M12: same identifier, same purpose as the hook's own `acronym` param
   * above - threaded straight through to listGeneratedArtifactVersionsAction,
   * which already accepts it (src/app/actions/lms-generation.ts). */
  acronym?: string;
}) => Promise<{ versions: GeneratedArtifact[] } | { error: string; courseNotLinked?: true }>;

/**
 * The REAL, server-stored version history for `courseUrl` + `kindId` -
 * this is the loader referenced in useLmsGeneration.ts's own header comment:
 * what populates `preview.versions` after every successful generate/refine, in
 * place of the old locally-accumulated `sessionVersions` array. Fails
 * forward to `[fallback]` (the version the caller just created/refined,
 * already known to be saved) rather than leaving the preview empty, so a
 * listing hiccup immediately after a successful save never hides the
 * version that IS, in fact, already in the database.
 *
 * `courseId` (AC1/AC2 defect fix): an export selection's course_hub row id,
 * threaded through unchanged - undefined for a live selection, which keeps
 * resolving by `courseUrl` alone (listGeneratedArtifactVersionsAction's own
 * source-aware resolution, src/app/actions/lms-generation.ts).
 *
 * `acronym` (M12): the hook's own `acronym` param, threaded through
 * unchanged - undefined leaves this call's shape byte-identical to before
 * M12 landed (see the "omitting courseId keeps the existing call shape"
 * test's own courseId precedent - the same equality-ignores-undefined
 * behaviour applies here).
 */
export async function loadVersionsForPreview(
  listVersions: ListVersionsCall,
  courseUrl: string,
  kindId: GenerationKindId,
  fallback: GeneratedArtifact,
  courseId?: string,
  acronym?: string
): Promise<GeneratedArtifact[]> {
  const result = await listVersions({ courseUrl, kind: kindId, courseId, acronym });
  if ("error" in result || result.versions.length === 0) return [fallback];
  return result.versions;
}
