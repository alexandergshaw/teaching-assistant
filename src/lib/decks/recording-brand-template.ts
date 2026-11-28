import "server-only";
import JSZip from "jszip";
import { assertInstitutionDeckContainer } from "@/lib/institution-branded-decks-validate";
import type { InstitutionDeckExtension } from "@/lib/institution-branded-decks";
import { assertContainerWithinCaps, createZipBudget, readOfficeMember } from "@/lib/zip-caps";
import { describeFitReport } from "./fit-report";
import { fillOfficeTemplate, groupOfficeTemplateParagraphsBySlide, planSlideTemplateFill } from "./office-template-fill";
import { assertRecordingSampleSlots, checkRecordingTemplateComments, findRecordingTemplateLayout, fillRecordingTemplateLayout, readRecordingTemplateTypes, RecordingBrandLayoutRefusal, writeRecordingTemplateTypes } from "./recording-brand-layout";
import { recordingBrandFit, type RecordingBrandFit, type RecordingBrandSlide } from "./recording-brand-fit";

export class RecordingBrandTemplateError extends Error {}

/** JSZip may inflate untouched members during a rewrite. Verify actual sizes
 * through the bounded reader before any package is re-emitted. */
async function verifyTemplateMembers(zip: JSZip) {
  const budget = createZipBudget();
  for (const file of Object.values(zip.files)) {
    if (!file.dir) await readOfficeMember(file, file.name, budget);
  }
}

export async function prepareRecordingBrandTemplate(source: Buffer, extension: InstitutionDeckExtension) {
  try {
    await assertInstitutionDeckContainer(source, extension);
    const zip = await JSZip.loadAsync(source);
    assertContainerWithinCaps(zip, "template");
    const budget = createZipBudget();
    const types = await readRecordingTemplateTypes(zip, budget);
    const layout = await findRecordingTemplateLayout(zip, types, budget);
    await checkRecordingTemplateComments(zip, budget, !layout, layout?.sample?.notes);
    if (layout) return {
      fit: { kind: "layout" } satisfies RecordingBrandFit,
      async fill(slides: RecordingBrandSlide[]) {
        await verifyTemplateMembers(zip);
        return fillRecordingTemplateLayout(zip, layout, slides);
      },
    };

    await assertRecordingSampleSlots(zip, budget);
    let pptx = source;
    if (extension === "potx") {
      await verifyTemplateMembers(zip);
      writeRecordingTemplateTypes(zip, types);
      pptx = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    }
    const groups = await groupOfficeTemplateParagraphsBySlide("pptx", pptx);
    const fit = { kind: "fixed", bulletSlots: groups.map(({ paragraphs }) => paragraphs.length - 1) } satisfies RecordingBrandFit;
    if (!recordingBrandFit(fit)) throw new RecordingBrandTemplateError(
      "This branded file needs a title-and-content layout or 1–12 sample slides with editable titles and up to six bullet slots per slide.",
    );
    return {
      fit,
      async fill(slides: RecordingBrandSlide[]) {
        const plan = planSlideTemplateFill(groups, slides);
        if (!plan.ok) throw new RecordingBrandTemplateError(describeFitReport(plan.fitReport).join(" "));
        if (extension === "pptx") await verifyTemplateMembers(zip);
        return fillOfficeTemplate("pptx", pptx, plan.replacements);
      },
    };
  } catch (cause) {
    if (cause instanceof RecordingBrandTemplateError) throw cause;
    if (cause instanceof RecordingBrandLayoutRefusal) throw new RecordingBrandTemplateError(cause.message);
    throw new RecordingBrandTemplateError(
      "This uploaded PowerPoint is incompatible with recording slides. Use a file with a standard PowerPoint title-and-content layout or editable sample slides.",
    );
  }
}
