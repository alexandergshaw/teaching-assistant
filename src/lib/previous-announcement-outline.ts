import { deriveRichTree } from "./announcement-rich-tree";
import { deriveRichTemplate } from "./announcement-rich-template";
import { deriveAnnouncementOutline } from "./announcement-outline";
import { previousAnnouncementEmphasis, previousAnnouncementText } from "./announcement-library-rich-text";
import type { AnnouncementOutline } from "./announcement-outline-types";

/** Keep rich emphasis shape alongside the text-derived outline. */
export function derivePreviousAnnouncementOutline(value: string): AnnouncementOutline {
  const outline = deriveAnnouncementOutline(previousAnnouncementText(value));
  const emphasis = previousAnnouncementEmphasis(value);
  const richTemplate = deriveRichTemplate(value);
  const richTree = richTemplate ? null : deriveRichTree(value);
  return { ...outline, ...(richTemplate && { richTemplate }), ...(richTree && { richTree }), ...(value.startsWith("<!--announcement-rich-v1-->") && !richTemplate && !richTree && { richTemplateUnsupported: true }), ...(emphasis.hasBold && { hasBold: true }), ...(emphasis.hasItalic && { hasItalic: true }) };
}
