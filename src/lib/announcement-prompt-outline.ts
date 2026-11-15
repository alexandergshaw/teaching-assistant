import type { AnnouncementOutline } from "./announcement-outline-types";

// Allow only canonical structural labels. Unknown headings may name old facts
// or contain instructions; neither belongs in a new drafting request.
const LABELS = ["Complete", "Also Review", "Before You Submit", "Help", "Due Dates", "Quiz Details", "This Week", "Next Steps", "Resources"];
function headingRole(heading: string | null, prior?: "focus" | "consider" | "assessment" | "general") {
  if (!heading) return prior === "focus" || prior === "consider" || prior === "assessment" ? prior : "general";
  if (/\b(?:focus on|pay particular attention|key concepts)\b/i.test(heading)) return "focus" as const;
  if (/\b(?:consider|reflect)\b/i.test(heading)) return "consider" as const;
  if (/\b(?:quiz|assessment|exam|test)\b/i.test(heading)) return "assessment" as const;
  return "general" as const;
}
function bounded(value: unknown): number { return Math.max(1, Math.min(100, Math.round(Number(value)) || 1)); }
function sectionIndex(value: unknown): number | null { return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null; }
export function promptSafeAnnouncementOutline(outline: AnnouncementOutline): AnnouncementOutline {
  return {
    hasGreeting: !!outline.hasGreeting, hasSignOff: !!outline.hasSignOff,
    ...(outline.opensWithWelcome && { opensWithWelcome: true }),
    hasLinks: !!outline.hasLinks,
    ...(outline.hasBold && { hasBold: true }), ...(outline.hasItalic && { hasItalic: true }),
    dueDateSectionIndex: sectionIndex(outline.dueDateSectionIndex),
    todoSectionIndex: sectionIndex(outline.todoSectionIndex),
    sections: outline.sections.map((section, i) => ({
      index: i + 1,
      heading: section.heading === null ? null : LABELS.find(label => label.toLowerCase() === section.heading?.replace(/[^a-zA-Z ]/g, "").trim().toLowerCase()) ?? null,
      ...(section.break === "heading" && !LABELS.some(label => label.toLowerCase() === section.heading?.replace(/[^a-zA-Z ]/g, "").trim().toLowerCase()) ? { headingRole: headingRole(section.heading, section.headingRole) } : {}),
      break: section.break === "heading" ? "heading" : "paragraph-break",
      listKind: section.listKind === "ordered" ? "ordered" : section.listKind === "unordered" ? "unordered" : null,
      sentenceRange: [bounded(section.sentenceRange[0]), bounded(section.sentenceRange[1])] as const,
      ...(section.listItemRange ? { listItemRange: [bounded(section.listItemRange[0]), bounded(section.listItemRange[1])] as const } : {}),
      ...(section.checklist ? { checklist: true } : {}),
    })),
  };
}
