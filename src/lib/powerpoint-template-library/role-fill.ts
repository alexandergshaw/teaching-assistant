import JSZip from "jszip";
import { inventorySlides } from "./inventory";
import { fillOfficeTemplate, groupOfficeTemplateParagraphsBySlide } from "@/lib/decks/office-template-fill";
import { planRoleAwareSlides } from "./role-plan";
import type { SlideRole } from "./types";

type Slide = { title: string; bullets: string[]; role: SlideRole };
export class RoleFillRefusal extends Error {}

/** Strict one-to-one role fill. No original slides are omitted or cloned. */
export async function fillRoleAwareTemplate(buffer: Buffer, definition: unknown, slides: Slide[]): Promise<Buffer> {
  const source = await inventorySlides(buffer);
  const groups = await groupOfficeTemplateParagraphsBySlide("pptx", buffer);
  const plan = planRoleAwareSlides(definition, source, groups, slides.map((slide) => ({ role: slide.role, bulletCount: slide.bullets.length })));
  if (!plan.ok) throw new RoleFillRefusal(plan.error);
  const replacements = plan.assignments.flatMap((assignment) => {
    const slide = slides[assignment.outputIndex];
    return assignment.paragraphIds.map((id, index) => ({ id, text: index === 0 ? slide.title : slide.bullets[index - 1] }));
  });
  const filled = await fillOfficeTemplate("pptx", buffer, replacements);
  const zip = await JSZip.loadAsync(filled);
  const entry = zip.file("ppt/presentation.xml");
  if (!entry) throw new RoleFillRefusal("The presentation order could not be verified.");
  const xml = await entry.async("string");
  const list = xml.match(/<(?:\w+:)?sldIdLst\b[^>]*>([\s\S]*?)<\/(?:\w+:)?sldIdLst>/);
  if (!list || list.index === undefined) throw new RoleFillRefusal("The presentation order could not be verified.");
  const tagPattern = /<(?:\w+:)?sldId\b[^>]*\/>/g;
  const tags = [...list[1].matchAll(tagPattern)].map((match) => match[0]);
  if (tags.length !== source.length) throw new RoleFillRefusal("This presentation uses an unsupported slide ordering format.");
  let position = 0;
  const reordered = list[1].replace(tagPattern, () => tags[plan.assignments[position++].sourceOrdinal - 1]);
  const revisedList = list[0].replace(list[1], reordered);
  zip.file("ppt/presentation.xml", xml.slice(0, list.index) + revisedList + xml.slice(list.index + list[0].length));
  const output = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
  const result = await inventorySlides(output);
  if (result.length !== plan.assignments.length || result.some((slide, index) => slide.id !== plan.assignments[index].sourceId)) {
    throw new RoleFillRefusal("The output slide order could not be verified.");
  }
  if (result.some((slide, index) => slide.text !== [slides[index].title, ...slides[index].bullets].map((text) => text.trim()).filter(Boolean).join("\n"))) {
    throw new RoleFillRefusal("Some slide text could not be safely replaced. Choose a different template.");
  }
  return output;
}
