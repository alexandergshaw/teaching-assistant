/**
 * Deterministic syllabus-field detection for the Embedded Deterministic Engine.
 * The LLM path uses a model to decide which paragraphs are editable, class-
 * specific fields; this finds them by matching common "Label: value" lines and
 * pre-fills a suggestion from the instructor-provided course facts when one maps.
 * The weekly-schedule rewrite is out of reach for rule-based templating, so the
 * embedded path returns no schedule replacements.
 */

export interface SyllabusParagraph {
  id: string;
  text: string;
}

export interface SyllabusFacts {
  courseName?: string;
  courseCode?: string;
  instructorName?: string;
  instructorEmail?: string;
  courseDescription?: string;
}

export interface SyllabusField {
  paragraphId: string;
  label: string;
  currentText: string;
  suggestedText: string;
}

const FIELD_PATTERNS: Array<{ test: RegExp; label: string; suggest?: (facts: SyllabusFacts) => string | undefined }> = [
  { test: /^\s*(?:course\s*(?:title|name)|title)\s*[:\-]/i, label: "Course title", suggest: (f) => f.courseName },
  { test: /^\s*(?:course\s*(?:number|code)|catalog\s*number)\s*[:\-]/i, label: "Course number", suggest: (f) => f.courseCode },
  { test: /^\s*(?:instructor|professor|teacher|faculty)\s*[:\-]/i, label: "Instructor", suggest: (f) => f.instructorName },
  { test: /^\s*(?:e-?mail|instructor\s*email|contact)\s*[:\-]/i, label: "Instructor email", suggest: (f) => f.instructorEmail },
  { test: /^\s*(?:term|semester|quarter)\s*[:\-]/i, label: "Term" },
  { test: /^\s*(?:meeting\s*(?:times?|days?)|class\s*(?:times?|schedule)|lecture\s*times?)\s*[:\-]/i, label: "Meeting times" },
  { test: /^\s*(?:location|room|classroom|building)\s*[:\-]/i, label: "Location" },
  { test: /^\s*office\s*hours\s*[:\-]/i, label: "Office hours" },
  { test: /^\s*(?:course\s*description|description)\s*[:\-]/i, label: "Course description", suggest: (f) => f.courseDescription },
  { test: /^\s*(?:textbooks?|required\s*(?:text|materials?)|materials?)\s*[:\-]/i, label: "Textbook / materials" },
  { test: /^\s*(?:grading|grade\s*breakdown|assessment)\s*[:\-]/i, label: "Grading" },
];

/**
 * Detect editable, class-specific syllabus fields from the paragraph list. A
 * paragraph is a field when it starts with a recognized label; the suggestion is
 * the mapped course fact when present, otherwise the paragraph's own text.
 */
export function scaffoldSyllabusFields(paragraphs: SyllabusParagraph[], facts: SyllabusFacts = {}): SyllabusField[] {
  const seen = new Set<string>();
  const fields: SyllabusField[] = [];
  for (const paragraph of paragraphs) {
    if (seen.has(paragraph.id)) continue;
    for (const pattern of FIELD_PATTERNS) {
      if (!pattern.test.test(paragraph.text)) continue;
      const suggested = pattern.suggest?.(facts)?.trim();
      fields.push({
        paragraphId: paragraph.id,
        label: pattern.label,
        currentText: paragraph.text,
        suggestedText: suggested || paragraph.text,
      });
      seen.add(paragraph.id);
      break;
    }
  }
  return fields;
}
