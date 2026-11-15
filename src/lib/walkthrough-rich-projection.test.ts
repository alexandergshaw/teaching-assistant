import { expect, it } from "vitest";
import { deriveRichTemplate } from "./announcement-rich-template";
import { encodePreviousAnnouncementHtml } from "./announcement-library-rich-text";
import { projectRichTemplate } from "./walkthrough-rich-projection";

it("projects safe block styles onto current content without old text", () => {
  const template = deriveRichTemplate(encodePreviousAnnouncementHtml('<p style="font-size:20px;color:red">Old content</p><ul><li style="font-weight:bold">Old item</li></ul>'));
  const result = projectRichTemplate("Current content\n\n- New item", template);
  expect(result).toContain("font-size:20px;color:red");
  expect(result).toContain("New item");
  expect(result).not.toContain("Old");
});
it("refuses ambiguous block and inline style mapping instead of dropping content", () => {
  const template = deriveRichTemplate(encodePreviousAnnouncementHtml('<p>Old <strong>emphasis</strong></p>'));
  expect(projectRichTemplate("New content", template)).toBeNull();
  expect(projectRichTemplate("New content\n\nExtra", template)).toBeNull();
});
