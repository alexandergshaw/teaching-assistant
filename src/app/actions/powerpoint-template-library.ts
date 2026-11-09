"use server";

import { requireUser } from "@/lib/supabase/auth";
import { uploadDeckTemplateFileAction } from "./deck-template-files";
import { decodeSource, inventorySlides } from "@/lib/powerpoint-template-library/inventory";
import { analyzeSlides, validateAssignments } from "@/lib/powerpoint-template-library/analysis";
import { getSource, listLibrariesWithCompleteness, getLibrary, saveLibrary } from "@/lib/powerpoint-template-library/store";
import { failure, libraryName, TemplateError, type LibraryDefinition } from "@/lib/powerpoint-template-library/types";
import { checkWireBudget } from "@/lib/upload-budget";
import { createHash } from "node:crypto";

export async function uploadPowerPointTemplateAction(name: string, fileName: string, base64: string, confirmed: boolean) {
  let user;
  try { user = await requireUser(); } catch { return failure(null, "PPT_AUTH"); }
  try {
    libraryName(name);
    if (confirmed !== true || typeof fileName !== "string" || fileName.length > 240 || !/\.pptx$/i.test(fileName)) throw new TemplateError("PPT_INVALID");
    await inventorySlides(decodeSource(base64));
    const uploaded = await uploadDeckTemplateFileAction(name, fileName, base64, true);
    if ("error" in uploaded) throw new TemplateError("PPT_STORAGE");
    await getSource(user.id, uploaded.template.id);
    return { sourceFileId: uploaded.template.id };
  } catch (error) { return failure(error, "PPT_STORAGE"); }
}
export async function analyzePowerPointTemplateAction(sourceFileId: string, mode: "auto" | "manual" = "auto") {
  let user;
  try { user = await requireUser(); } catch { return failure(null, "PPT_AUTH"); }
  try {
    const source = await getSource(user.id, sourceFileId);
    const inventory = await inventorySlides(decodeSource(source.content));
    if (mode !== "auto" && mode !== "manual") throw new TemplateError("PPT_INVALID");
    let manual = mode === "manual" || !inventory.some((slide) => slide.text.trim());
    let definition: LibraryDefinition;
    if (manual) definition = { version: 1, slides: inventory.map((slide) => ({ ...slide, role: "other" })) };
    else {
      try { definition = await analyzeSlides(inventory); }
      catch (error) {
        if (!(error instanceof TemplateError) || (error.code !== "PPT_MODEL" && error.code !== "PPT_LIMIT")) throw error;
        manual = true;
        definition = { version: 1, slides: inventory.map((slide) => ({ ...slide, role: "other" })) };
      }
    }
    const latest = await getSource(user.id, sourceFileId);
    const sourceDigest = createHash("sha256").update(source.content).digest("hex");
    if (createHash("sha256").update(latest.content).digest("hex") !== sourceDigest) throw new TemplateError("PPT_INVALID");
    return { definition, manual, sourceDigest };
  } catch (error) { return failure(error, "PPT_STORAGE"); }
}
export async function listPowerPointTemplateLibrariesAction() {
  try {
    const user = await requireUser();
    try { return await listLibrariesWithCompleteness(user.id); }
    catch (error) { return failure(error, "PPT_STORAGE"); }
  } catch { return failure(null, "PPT_AUTH"); }
}
export async function getPowerPointTemplateLibraryAction(id: string) {
  let user;
  try { user = await requireUser(); } catch { return failure(null, "PPT_AUTH"); }
  try {
    const library = await getLibrary(user.id, id);
    const source = await getSource(user.id, library.sourceFileId);
    const inventory = await inventorySlides(decodeSource(source.content));
    if (library.definition.version !== 1) throw new TemplateError("PPT_INVALID");
    return { library: { ...library, definition: validateAssignments(library.definition, inventory) }, sourceDigest: createHash("sha256").update(source.content).digest("hex") };
  } catch (error) { return failure(error, "PPT_STORAGE"); }
}
export async function savePowerPointTemplateLibraryAction(id: string | null, sourceFileId: string, name: string, proposal: LibraryDefinition) {
  let user;
  try { user = await requireUser(); } catch { return failure(null, "PPT_AUTH"); }
  try {
    libraryName(name);
    if (!proposal || JSON.stringify(proposal).length > 100000) throw new TemplateError("PPT_INVALID");
    const source = await getSource(user.id, sourceFileId);
    const inventory = await inventorySlides(decodeSource(source.content));
    const definition = validateAssignments(proposal, inventory);
    return { library: await saveLibrary(user.id, id, sourceFileId, name, definition) };
  } catch (error) { return failure(error, "PPT_STORAGE"); }
}
export async function reusePowerPointTemplateLibraryAction(id: string) {
  let user;
  try { user = await requireUser(); } catch { return failure(null, "PPT_AUTH"); }
  try {
    const library = await getLibrary(user.id, id);
    const source = await getSource(user.id, library.sourceFileId);
    const inventory = await inventorySlides(decodeSource(source.content));
    validateAssignments(library.definition, inventory);
    return { sourceFileId: source.id };
  } catch (error) { return failure(error, "PPT_STORAGE"); }
}
export async function downloadPowerPointTemplateLibraryAction(id: string, kind: "original" | "manifest") {
  let user;
  try { user = await requireUser(); } catch { return failure(null, "PPT_AUTH"); }
  try {
    const library = await getLibrary(user.id, id);
    const source = await getSource(user.id, library.sourceFileId);
    const inventory = await inventorySlides(decodeSource(source.content));
    const definition = validateAssignments(library.definition, inventory);
    if (kind !== "original" && kind !== "manifest") throw new TemplateError("PPT_INVALID");
    const base64 = kind === "original" ? source.content : Buffer.from(JSON.stringify(definition, null, 2)).toString("base64");
    if (!checkWireBudget(base64.length, "Download").ok) throw new TemplateError("PPT_DOWNLOAD");
    return { base64, fileName: kind === "original" ? source.fileName : "powerpoint-classifications.json",
      mimeType: kind === "original" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/json" };
  } catch (error) { return failure(error, "PPT_DOWNLOAD"); }
}
