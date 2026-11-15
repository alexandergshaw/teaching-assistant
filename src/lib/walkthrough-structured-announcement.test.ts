import { expect, it } from "vitest";
import type { AnnouncementOutline } from "./announcement-outline-types";
import { assembleAnnouncementSections, announcementContentSignature, announcementSectionFailure, normalizeAnnouncementEmoji, normalizeAnnouncementSectionText } from "./walkthrough-structured-announcement";

const outline: AnnouncementOutline = { sections: [
  { index: 1, heading: null, break: "paragraph-break", listKind: null, sentenceRange: [1, 3] },
  { index: 2, heading: "Complete", break: "heading", listKind: "unordered", sentenceRange: [1, 3] },
  { index: 3, heading: "Quiz Details", break: "heading", listKind: "unordered", sentenceRange: [1, 3] },
], hasGreeting: false, hasSignOff: false, hasLinks: false, dueDateSectionIndex: null, todoSectionIndex: null };

it("classifies invalid section shapes without returning supplied text", () => {
  expect(announcementSectionFailure([{ index: 1, heading: null, paragraphs: ["private"], items: ["private"] }], outline)).toBe("list shape");
  expect(announcementSectionFailure([{ index: 9, heading: null, paragraphs: ["private"], items: [] }], outline)).toBe("section order or index");
  expect(announcementSectionFailure([{ index: 1, heading: null, paragraphs: ["private\ntext"], items: [] }], outline)).toBe("paragraph or item text");
});

it("places model-selected emoji at saved positions and preserves content if none are selected", () => {
  const icon = String.fromCodePoint(0x1f4cc);
  const withPosition = { ...outline, sections: [{ ...outline.sections[0], emojiPlacements: [{ target: "paragraph" as const, index: 0, position: "prefix" as const }] }] };
  const incoming = [{ index: 1, heading: null, paragraphs: ["Current content."], items: [], emojis: [{ target: "item", index: 9, position: "suffix", value: icon }] }];
  const normalized = normalizeAnnouncementEmoji(incoming, withPosition);
  expect(normalized.adjusted).toBe(true);
  expect(assembleAnnouncementSections(normalized.sections, withPosition, true)).toBe(`${icon} Current content.`);
  const missing = normalizeAnnouncementEmoji([{ ...incoming[0], emojis: [] }], withPosition);
  expect(missing.adjusted).toBe(true);
  expect(assembleAnnouncementSections(missing.sections, withPosition, true)).toBe("Current content.");
});

it("does not discard content or malformed fields masquerading as emoji", () => {
  for (const slot of [{ target: "paragraph", index: 0, position: "prefix", value: "Important deadline" }, { target: "paragraph", position: "prefix", value: String.fromCodePoint(0x1f4cc) }]) {
    const source = [{ index: 1, heading: null, paragraphs: ["Current content."], items: [], emojis: [slot] }];
    const result = normalizeAnnouncementEmoji(source, outline);
    expect(result.sections).toEqual(source);
    expect(assembleAnnouncementSections(result.sections, outline, true)).toBeNull();
  }
});

it("preserves item boundaries when individual list items contain line breaks", () => {
  const source = [{ index: 2, heading: "Complete", paragraphs: [], items: ["First line\ncontinued", "Second\ncontinued"], emojis: [] }];
  const normalized = normalizeAnnouncementSectionText(source);
  expect(normalized.adjusted).toBe(true);
  expect(assembleAnnouncementSections(normalized.sections, outline)).toBe("## Complete\n\n- First line continued\n- Second continued");
  const one = normalizeAnnouncementSectionText([{ ...source[0], items: ["Only line\ncontinued"] }]);
  expect(assembleAnnouncementSections(one.sections, outline)).toBe("## Complete\n\n- Only line continued");
});

it("assembles supported sections in example order and skips missing optional sections", () => {
  const text = assembleAnnouncementSections([
    { index: 1, heading: null, paragraphs: ["Welcome to the current unit."], items: [] },
    { index: 2, heading: "Complete", paragraphs: [], items: ["Read the chapter.", "Submit the project."] },
  ], outline);
  expect(text).toBe("Welcome to the current unit.\n\n## Complete\n\n- Read the chapter.\n- Submit the project.");
  expect(announcementContentSignature(text!)).toBe(announcementContentSignature("Welcome to the current unit.\n\nComplete\n1. Read the chapter.\n2. Submit the project."));
});
it("rejects duplicate, out-of-order, invalid or extra model content instead of dropping it", () => {
  const good = { index: 1, heading: null, paragraphs: ["Current fact."], items: [] };
  for (const value of [[good, good], [{ ...good, index: 5 }], [{ ...good, unexpected: "lost content" }], [{ ...good, items: ["not allowed"] }], [{ ...good, paragraphs: ["Line one\n- hidden line"] }]]) {
    expect(assembleAnnouncementSections(value, outline)).toBeNull();
  }
});
it("rejects a mismatched list kind or missing heading", () => {
  expect(assembleAnnouncementSections([{ index: 2, heading: "Complete", paragraphs: ["Prose only"], items: [] }], outline)).toBeNull();
  expect(assembleAnnouncementSections([{ index: 2, heading: null, paragraphs: [], items: ["Read"] }], outline)).toBeNull();
});

it("requires canonical headings and keeps generated content within the example plan", () => {
  expect(assembleAnnouncementSections([{ index: 2, heading: "Renamed", paragraphs: [], items: ["Read"] }], outline)).toBeNull();
  expect(assembleAnnouncementSections([{ index: 2, heading: "Complete", paragraphs: [], items: ["Read"] }], outline)).toBe("## Complete\n\n- Read");
});
it("inserts model-chosen graphemes only in specified slots and only when enabled", () => {
  const pin = String.fromCodePoint(0x1f4cc), flag = String.fromCodePoint(0x1f1fa, 0x1f1f8), technologist = String.fromCodePoint(0x1f469, 0x200d, 0x1f4bb);
  const shaped: AnnouncementOutline = { ...outline, sections: [{ ...outline.sections[1], index: 1, emojiPlacements: [
    { target: "heading", index: 0, position: "prefix" }, { target: "heading", index: 0, position: "suffix" }, { target: "item", index: 0, position: "prefix" },
  ] }] };
  const row = { index: 1, heading: "Complete", paragraphs: [], items: ["Read the chapter."], emojis: [
    { target: "heading", index: 0, position: "prefix", value: pin }, { target: "heading", index: 0, position: "suffix", value: flag }, { target: "item", index: 0, position: "prefix", value: technologist },
  ] };
  expect(assembleAnnouncementSections([row], shaped, true)).toBe(`## ${pin} Complete ${flag}\n\n- ${technologist} Read the chapter.`);
  expect(assembleAnnouncementSections([row], shaped, false)).toBeNull();
  expect(assembleAnnouncementSections([{ ...row, emojis: [] }], shaped, false)).toBe("## Complete\n\n- Read the chapter.");
  expect(assembleAnnouncementSections([{ ...row, emojis: [{ ...row.emojis[0], value: pin + flag }] }], shaped, true)).toBeNull();
  expect(assembleAnnouncementSections([{ ...row, items: [pin + " text"], emojis: [] }], shaped, true)).toBeNull();
});

it("does not emit emoji from an omitted example section", () => {
  const icon = String.fromCodePoint(0x1f4cc);
  const shaped: AnnouncementOutline = { ...outline, sections: [{ ...outline.sections[0], emojiPlacements: [{ target: "paragraph", index: 0, position: "prefix" }] }, outline.sections[1]] };
  const result = assembleAnnouncementSections([{ index: 2, heading: "Complete", paragraphs: [], items: ["Read."], emojis: [] }], shaped, true);
  expect(result).toBe("## Complete\n\n- Read.");
  expect(result).not.toContain(icon);
});

it("preserves ordinary copyright and trademark symbols in text", () => {
  const copyright = String.fromCodePoint(0x00a9), trademark = String.fromCodePoint(0x2122);
  const text = `Read the ${copyright} guide and the product ${trademark} policy.`;
  expect(assembleAnnouncementSections([{ index: 1, heading: null, paragraphs: [text], items: [] }], outline)).toBe(text);
});
