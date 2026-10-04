import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// READ-level reachability for W2 (ARC-S3 / ARC-S4): the panel must bind
// openMessageDrafts to a control on the saved-draft surface and render the
// save-time notice. Comment-stripped so a comment cannot satisfy a check.
// Actual navigation is OWNER-verified; this is a wiring claim only.

const PANEL = join(__dirname, "TakeAnnouncementPanel.tsx");

function withoutLineComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n\r]*/g, "");
}

const src = withoutLineComments(readFileSync(PANEL, "utf8"));

describe("TakeAnnouncementPanel drafts-link wiring (READ)", () => {
  it("imports openMessageDrafts from the drafts-nav leaf", () => {
    expect(src).toMatch(/import\s*\{\s*openMessageDrafts\s*\}\s*from\s*"@\/lib\/drafts-nav"/);
  });

  it("the saved-draft surface binds openMessageDrafts to onClick", () => {
    expect(src).toMatch(/draftSaved\s*&&[\s\S]{0,200}onClick=\{openMessageDrafts\}/);
  });

  it("renders the save-time notice from draftSavedHadCourse", () => {
    expect(src).toMatch(/takeDraftSavedNotice\(draftSavedHadCourse\)/);
  });

  it("the plain Saved-to-drafts span is gone", () => {
    expect(src).not.toMatch(/<span[^>]*>\s*Saved to drafts\.\s*<\/span>/);
  });
});
