import type { DeckContent } from "./types";
import { assertPptxContainer } from "@/lib/decks/pptx-validate";
import { fillOfficeTemplate, groupOfficeTemplateParagraphsBySlide, planSlideTemplateFill } from "@/lib/decks/office-template-fill";
import { describeFitReport } from "@/lib/decks/fit-report";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";

/** The download's shared positional fill; generated rich fields remain in deck.json. */
export async function renderRepositoryTemplate(original: Buffer, deck: DeckContent): Promise<Buffer> {
  await assertPptxContainer(original);
  const groups = await groupOfficeTemplateParagraphsBySlide("pptx", original);
  if (!groups.length) throw new Error("TEMPLATE_FIT: no editable slide text.");
  const plan = planSlideTemplateFill(groups, deck.slides);
  if (!plan.ok) throw new Error("TEMPLATE_FIT: " + describeFitReport(plan.fitReport).join(" "));
  if (deck.slides.some((slide, index) => slide.bullets.length > groups[index].paragraphs.length - 1)) throw new Error("TEMPLATE_FIT: more bullets than editable template paragraphs.");
  const filled = await fillOfficeTemplate("pptx", original, plan.replacements);
  if (filled.toString("base64").length > UPLOAD_WIRE_BUDGET_BYTES) throw new Error("TEMPLATE_FIT: filled deck exceeds the download response limit.");
  return filled;
}
