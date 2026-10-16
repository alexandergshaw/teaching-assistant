import { inventorySlides } from "@/lib/powerpoint-template-library/inventory";
import { fillOfficeTemplate, type OfficeTemplateReplacement } from "@/lib/decks/office-template-fill";
import { parseOfficeParagraphs } from "@/lib/office-edit";
import { TemplateError } from "@/lib/powerpoint-template-library/types";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { assertContainerWithinCaps, createZipBudget, readOfficeMember, ZipCapError } from "@/lib/zip-caps";
import { checkWireBudget, UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";
import { applySlideObjectOperations, inspectSlideObjects, type SlidePackageContext } from "@/lib/presentations/uploaded-slide-objects";
import { inspectUploadedSlideLayoutSet, type UploadedSlideLayouts } from "@/lib/presentations/uploaded-slide-layouts";
import { applyUploadedSlideNotes, inspectUploadedSlideNotesSet, type UploadedSlideNotes } from "@/lib/presentations/uploaded-slide-notes";

export interface UploadedSlideParagraph {
  id: string;
  text: string;
  editable?: boolean;
}

export interface UploadedSlide {
  number: number;
  title: string;
  paragraphs: UploadedSlideParagraph[];
  objects?: SlidePackageContext["objects"];
  layout?: SlidePackageContext["layout"];
  notes?: UploadedSlideNotes | null;
  availableLayouts?: UploadedSlideLayouts;
}

export class UploadedSlideEditorError extends Error {
  constructor(readonly code: "file_size" | "file_invalid" | "slide_order" | "slide_text" | "slide_limit") {
    super(code);
    this.name = "UploadedSlideEditorError";
  }
}

export function decodeUploadedPptx(base64: unknown): Buffer {
  if (typeof base64 !== "string" || !base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new UploadedSlideEditorError("file_invalid");
  }
  if (!checkWireBudget(base64.length, "PowerPoint").ok) throw new UploadedSlideEditorError("file_size");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64") !== base64) throw new UploadedSlideEditorError("file_invalid");
  return bytes;
}

function sortedMemberIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function inspectUploadedPptx(bytes: Buffer): Promise<UploadedSlide[]> {
  try {
    const slideMembers = await inventorySlides(bytes);
    if (slideMembers.length > 80) throw new UploadedSlideEditorError("slide_limit");

    // office-edit paragraph ids use numeric slide-member order. Refuse a deck
    // whose presentation order differs so the editor can never target N while
    // the user is looking at another slide.
    const memberOrder = slideMembers.map((slide) => slide.id);
    const sortedMembers = sortedMemberIds(memberOrder);
    if (memberOrder.some((member, index) => member !== sortedMembers[index])) {
      throw new UploadedSlideEditorError("slide_order");
    }

    const paragraphs = await parseOfficeParagraphs("pptx", bytes);
    const totalText = paragraphs.reduce((total, paragraph) => total + paragraph.text.length, 0);
    if (totalText > 24_000) throw new UploadedSlideEditorError("slide_limit");
    const zip = await JSZip.loadAsync(bytes);
    assertContainerWithinCaps(zip, "office-file");
    const budget = createZipBudget();
    const unsupportedIds = new Set<string>();
    for (let slideIndex = 0; slideIndex < memberOrder.length; slideIndex += 1) {
      const entry = zip.file(memberOrder[slideIndex]);
      if (!entry) throw new UploadedSlideEditorError("file_invalid");
      const xml = (await readOfficeMember(entry, memberOrder[slideIndex], budget)).toString("utf8");
      let paragraphIndex = 0;
      for (const match of xml.matchAll(/<a:p\b[^>]*(?<!\/)>[\s\S]*?<\/a:p>/g)) {
        const paragraphXml = match[0];
        if (/<a:(?:fld|br|tab)\b/i.test(paragraphXml)) unsupportedIds.add(`s${slideIndex}_p${paragraphIndex}`);
        paragraphIndex += 1;
      }
    }
    const slides = slideMembers.map((member, index) => {
      const number = index + 1;
      const slideParagraphs = paragraphs
        .filter((paragraph) => paragraph.slide === number)
        .map(({ id, text, runs }) => ({
          id,
          text,
          editable: !unsupportedIds.has(id) && runs.map((run) => run.text).join("") === text,
        }));
      return {
        number,
        title: slideParagraphs.find((paragraph) => paragraph.text.trim())?.text.trim().slice(0, 100) || `Slide ${number}`,
        paragraphs: slideParagraphs,
      };
    });
    const layoutInventory = await inspectUploadedSlideLayoutSet(bytes, slideMembers);
    const noteInventory = await inspectUploadedSlideNotesSet(bytes, slideMembers);
    return await Promise.all(slides.map(async (slide) => {
      const context = await inspectSlideObjects(bytes, slide.number, slideMembers);
      const availableLayouts = layoutInventory[slide.number - 1];
      return { ...slide, objects: context.objects, layout: context.layout, notes: noteInventory[slide.number - 1], availableLayouts };
    }));
  } catch (error) {
    if (error instanceof UploadedSlideEditorError) throw error;
    if (error instanceof TemplateError && error.code === "PPT_LIMIT") throw new UploadedSlideEditorError("slide_limit");
    if (error instanceof ZipCapError) throw new UploadedSlideEditorError("slide_limit");
    throw new UploadedSlideEditorError("file_invalid");
  }
}

export async function applyUploadedSlideReplacements(
  bytes: Buffer,
  slideNumber: number,
  input: unknown
): Promise<{ bytes: Buffer; slides: UploadedSlide[] }> {
  const slides = await inspectUploadedPptx(bytes);
  const target = slides[slideNumber - 1];
  if (!target || !Array.isArray(input) || !input.length) throw new UploadedSlideEditorError("slide_text");
  const allowed = new Set(target.paragraphs.filter((paragraph) => paragraph.editable).map((paragraph) => paragraph.id));
  const seen = new Set<string>();
  const replacements: OfficeTemplateReplacement[] = [];
  let total = 0;
  for (const item of input) {
    if (!item || typeof item !== "object") throw new UploadedSlideEditorError("slide_text");
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.text !== "string" || !record.text.trim() || !allowed.has(record.id) || seen.has(record.id)) {
      throw new UploadedSlideEditorError("slide_text");
    }
    if (record.text.length > 4_000) throw new UploadedSlideEditorError("slide_limit");
    total += record.text.length;
    if (total > 24_000) throw new UploadedSlideEditorError("slide_limit");
    seen.add(record.id);
    replacements.push({ id: record.id, text: record.text });
  }
  const updated = await fillOfficeTemplate("pptx", bytes, replacements);
  if (updated.toString("base64").length > UPLOAD_WIRE_BUDGET_BYTES) throw new UploadedSlideEditorError("file_size");
  return { bytes: updated, slides: await inspectUploadedPptx(updated) };
}

export async function applyUploadedSlideEdits(
  bytes: Buffer,
  slideNumber: number,
  replacements: unknown,
  operations: unknown,
  notes?: unknown
): Promise<{ bytes: Buffer; slides: UploadedSlide[]; changedMembers: string[] }> {
  if ((!Array.isArray(replacements) || replacements.length === 0) && (!Array.isArray(operations) || operations.length === 0) && notes === undefined) {
    throw new UploadedSlideEditorError("slide_text");
  }
  let updated = bytes;
  const changed = new Set<string>();
  if (Array.isArray(replacements) && replacements.length > 0) {
    const textResult = await applyUploadedSlideReplacements(updated, slideNumber, replacements);
    updated = textResult.bytes;
    const sourceSlides = await inventorySlides(bytes);
    const target = sourceSlides[slideNumber - 1];
    if (target) changed.add(target.id);
  }
  if (notes !== undefined) {
    const notesResult = await applyUploadedSlideNotes(updated, slideNumber, notes);
    updated = notesResult.bytes;
    notesResult.changedMembers.forEach((member) => changed.add(member));
  }
  if (Array.isArray(operations) && operations.length > 0) {
    const originalContext = await inspectSlideObjects(bytes, slideNumber);
    const sourceIdentity = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
    const objectResult = await applySlideObjectOperations(updated, slideNumber, operations, sourceIdentity, originalContext);
    updated = objectResult.bytes;
    objectResult.changedMembers.forEach((member) => changed.add(member));
  }
  if (updated.toString("base64").length > UPLOAD_WIRE_BUDGET_BYTES) throw new UploadedSlideEditorError("file_size");
  return { bytes: updated, slides: await inspectUploadedPptx(updated), changedMembers: [...changed] };
}

export function uploadedSlideEditorMessage(error: unknown): string {
  if (!(error instanceof UploadedSlideEditorError)) return "The PowerPoint could not be processed. The current working copy is unchanged.";
  switch (error.code) {
    case "file_size": return "This PowerPoint is too large to process or the edited deck would exceed the file limit.";
    case "slide_order": return "This PowerPoint uses a slide order the editor cannot safely map yet.";
    case "slide_limit": return "This PowerPoint exceeds the editor's 80-slide or 24,000-character limit.";
    case "slide_text": return "That slide edit does not match the selected slide's supported text.";
    case "file_invalid": return "That file could not be opened as a supported PowerPoint (.pptx).";
  }
}
