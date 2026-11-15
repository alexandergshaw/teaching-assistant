import { deriveAnnouncementOutline } from "./announcement-outline";
import { previousAnnouncementEmphasis, previousAnnouncementText } from "./announcement-library-rich-text";
import type { AnnouncementOutline } from "./announcement-outline-types";

/** Keep rich emphasis shape alongside the text-derived outline. */
export function derivePreviousAnnouncementOutline(value: string): AnnouncementOutline {
  const outline = deriveAnnouncementOutline(previousAnnouncementText(value));
  const emphasis = previousAnnouncementEmphasis(value);
  return { ...outline, ...(emphasis.hasBold && { hasBold: true }), ...(emphasis.hasItalic && { hasItalic: true }) };
}
