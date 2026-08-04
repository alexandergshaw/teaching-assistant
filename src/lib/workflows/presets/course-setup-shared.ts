import type { InputBinding } from "@/lib/workflows/types";

// Shared by all three presets that include course-refresh - COURSE_KICKOFF
// and NO_CODE_KICKOFF (course-setup.ts) and COURSE_BUILD (course-build.ts):
// on every run, each blanks the SAME 15 course-refresh inputs so those
// fields never surface on its own run form - the assignment/test template
// step's topic/week/pointsPossible/postToCanvas (each already derives from
// the tile and the template), the syllabus step's regenerate flag
// (starter-materials already generates the syllabus once, earlier in the
// same run), and castletop-workbook's six per-instructor fields (its own
// defaults already apply). Each preset still sets its own courseKind,
// groundInAssignment, and includeGithub overrides separately - those three
// DIFFER across the three presets, so they stay in each preset's own
// bindOverrides rather than here.
//
// Deliberately its own module, importing only `types` - not folded into
// course-setup.ts - so COURSE_BUILD (course-build.ts) can use it without
// importing course-setup.ts, which would reintroduce the very cycle
// course-build.ts's own header comment explains it avoids.
export const BLANK_TEMPLATE_AND_CASTLETOP_OVERRIDES: Record<string, InputBinding> = {
  "generate-assignment-from-template.topic": { source: "literal", value: "" },
  "generate-assignment-from-template.week": { source: "literal", value: "" },
  "generate-assignment-from-template.pointsPossible": { source: "literal", value: "" },
  "generate-assignment-from-template.postToCanvas": { source: "literal", value: "" },
  "generate-test-from-template.topic": { source: "literal", value: "" },
  "generate-test-from-template.week": { source: "literal", value: "" },
  "generate-test-from-template.pointsPossible": { source: "literal", value: "" },
  "generate-test-from-template.postToCanvas": { source: "literal", value: "" },
  "generate-syllabus.regenerate": { source: "literal", value: "" },
  "castletop-workbook.instructor": { source: "literal", value: "" },
  "castletop-workbook.instructorFileAs": { source: "literal", value: "" },
  "castletop-workbook.contactMinutes": { source: "literal", value: "" },
  "castletop-workbook.readingRate": { source: "literal", value: "" },
  "castletop-workbook.pagesPerChapter": { source: "literal", value: "" },
  "castletop-workbook.classSessionMinutes": { source: "literal", value: "" },
};
