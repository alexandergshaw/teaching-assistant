// The shape of an announcement's STRUCTURE, separated from both the code that
// derives it and the code that renders it into a prompt.
//
// It lives in its own leaf, importing nothing, for a reason this repo has been
// bitten by: the deriver (announcement-exemplar.ts) and the two prompt
// composers are built by different people at the same time, and if the type
// lived in the deriver the composers would have to wait for it - or, worse,
// declare their own copy, which type-checks fine and then silently diverges.
// A leaf that imports nothing also cannot create the import cycle that yields
// `undefined` at runtime while tsc stays quiet.
//
// WHAT THIS IS AND IS NOT. This describes an announcement's SHAPE - what
// sections it has, in what order, whether each is prose or a list, roughly how
// long. It deliberately carries no CONTENT: it says "there is a bulleted
// due-date block near the end", never "the due dates are these". That is the
// whole containment argument for the exemplar feature. An instructor pastes
// last term's announcement to reuse its format, and the thing that reaches the
// model must not be able to carry last term's dates - or an instruction
// someone embedded in the document the instructor copied it from.

/** Whether a section's body reads as prose or as a list, and if a list, which
 * kind. `null` for a section whose body is a single paragraph. */
export type OutlineListKind = "ordered" | "unordered" | null;

/** How a section is separated from the one before it. A real heading line is a
 * different signal from a bare paragraph break, and an exemplar that uses one
 * consistently should not be reproduced with the other. */
export type OutlineSectionBreak = "heading" | "paragraph-break";

/** One section of the exemplar's structure. */
export interface OutlineSection {
  /** 1-based position in the document, so a section can be referred to by
   * INDEX rather than by heading text. Headings are not unique - "This week"
   * can appear twice - and referring to them by name is the mistake the
   * knowledge-overview prompt already documents having made. */
  index: number;
  /** The heading's own text when there is one, else null. Carried because
   * reproducing an instructor's own section names is most of what "the same
   * format" means to them - but see the module comment: a heading is a LABEL,
   * never an instruction, and the composer must frame it as such. */
  heading: string | null;
  break: OutlineSectionBreak;
  listKind: OutlineListKind;
  /** Approximate length as an inclusive [min, max] range of sentences, never a
   * count. A count invites the model to pad or truncate to hit a number; a
   * range describes the shape without pretending to a precision that reading
   * one example cannot support. */
  sentenceRange: readonly [number, number];
}

/** The structural outline of one pasted announcement. */
export interface AnnouncementOutline {
  sections: readonly OutlineSection[];
  /** Whether the exemplar opens with a greeting ("Hi everyone,"). Its presence
   * and its absence are both meaningful - an instructor whose announcements
   * start cold should not suddenly be given a greeting. */
  hasGreeting: boolean;
  /** Whether it closes with a sign-off. Same reasoning as hasGreeting. */
  hasSignOff: boolean;
  /** The 1-based section index holding the due-date block, or null when the
   * exemplar has none. An index rather than a boolean, because "near the end"
   * is part of the format and "somewhere" is not. */
  dueDateSectionIndex: number | null;
  /** The 1-based section index holding a "what to do this week" block, or
   * null. */
  todoSectionIndex: number | null;
  /** Whether the exemplar contains links at all. Deliberately a boolean and
   * not the links themselves: the URLs in last term's announcement are
   * CONTENT, and reproducing them would send students to last term's pages. */
  hasLinks: boolean;
}

/** The outline of a document with no discernible structure - a single
 * unheaded paragraph, or an empty paste. Exported rather than reconstructed at
 * each call site, so "no structure" is one value every consumer compares
 * against instead of several look-alikes that drift apart. */
export const EMPTY_ANNOUNCEMENT_OUTLINE: AnnouncementOutline = {
  sections: [],
  hasGreeting: false,
  hasSignOff: false,
  dueDateSectionIndex: null,
  todoSectionIndex: null,
  hasLinks: false,
};
