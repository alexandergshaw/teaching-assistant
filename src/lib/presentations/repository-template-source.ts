import type { PipelineTemplateChoice } from "@/app/components/presentations/pipeline/template-choice";
import { resolveTemplateForDownload } from "@/app/components/presentations/pipeline/template-choice";
import { getPowerPointTemplateLibraryAction, reusePowerPointTemplateLibraryAction } from "@/app/actions/powerpoint-template-library";
import { getSource } from "@/lib/powerpoint-template-library/store";
import { decodeSource } from "@/lib/powerpoint-template-library/inventory";

/** userId is supplied only by the authenticated owner action. */
export async function loadRepositoryTemplate(userId: string, choice: PipelineTemplateChoice): Promise<Buffer | undefined> {
  const resolution = await resolveTemplateForDownload(choice, { getLibrary: getPowerPointTemplateLibraryAction, reuseLibrary: reusePowerPointTemplateLibraryAction });
  if ("error" in resolution) throw new Error("TEMPLATE_SELECTION");
  if (resolution.source.kind === "own") return undefined;
  const source = await getSource(userId, resolution.source.sourceFileId);
  return decodeSource(source.content);
}
