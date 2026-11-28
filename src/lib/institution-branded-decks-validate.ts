import "server-only";

import JSZip from "jszip";
import { assertContainerWithinCaps, createZipBudget, readOfficeMember } from "@/lib/zip-caps";
import {
  CONTENT_TYPES_MAX_BYTES,
  CONTENT_TYPES_MEMBER,
  PPTX_HEAD_BYTES,
  PPTX_MAIN_CONTENT_TYPES,
  PPTX_PRESENTATION_MEMBER,
  isPptxContentTypes,
  sniffZipHead,
} from "@/lib/decks/pptx-signature";
import type { InstitutionDeckExtension } from "./institution-branded-decks";

const POTX_MAIN_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml";
const invalidPowerPoint = "Invalid branded PowerPoint file.";

export async function assertInstitutionDeckContainer(buffer: Buffer, extension: InstitutionDeckExtension): Promise<void> {
  if (!sniffZipHead(buffer.subarray(0, PPTX_HEAD_BYTES))) throw new Error(invalidPowerPoint);
  const zip = await JSZip.loadAsync(buffer);
  assertContainerWithinCaps(zip, "office-file");

  const contentTypes = zip.file(CONTENT_TYPES_MEMBER);
  if (!contentTypes || !zip.file(PPTX_PRESENTATION_MEMBER) || Object.keys(zip.files).some((name) => /(?:^|\/)vbaProject\.bin$/i.test(name))) {
    throw new Error(invalidPowerPoint);
  }

  const budget = createZipBudget({ maxMemberDeclaredBytes: CONTENT_TYPES_MAX_BYTES });
  const xml = (await readOfficeMember(contentTypes, CONTENT_TYPES_MEMBER, budget)).toString("utf8");
  const isPresentation = isPptxContentTypes(xml);
  if (extension === "pptx" && isPresentation) return;
  if (extension === "potx" && !isPresentation) {
    // Validate the same main-part rules with the template MIME substituted in
    // the inspection text. The stored archive stays byte-for-byte unchanged.
    const templateAsPresentation = xml.replaceAll(POTX_MAIN_CONTENT_TYPE, PPTX_MAIN_CONTENT_TYPES[0]);
    if (isPptxContentTypes(templateAsPresentation)) return;
  }
  throw new Error(invalidPowerPoint);
}
