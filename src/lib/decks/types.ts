// Domain model for reusable presentation templates: slide roles, loop groups, deck structure.
// Pure, unit-testable; no I/O or React dependencies.

export type DeckBackgroundKind = "solid" | "gradient";

export interface DeckTheme {
  backgroundKind: DeckBackgroundKind;
  backgroundColor: string;
  backgroundColor2: string;
  gradientAngle: number;
  fontColor: string;
}

export const DEFAULT_DECK_THEME: DeckTheme = {
  backgroundKind: "solid",
  backgroundColor: "#ffffff",
  backgroundColor2: "#e2e8f0",
  gradientAngle: 135,
  fontColor: "#1e293b",
};

export function coerceDeckTheme(raw: unknown): DeckTheme {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_DECK_THEME };
  }

  const obj = raw as Record<string, unknown>;
  const backgroundKind =
    obj.backgroundKind === "gradient" ? "gradient" : "solid";

  const isValidHex = (hex: unknown): boolean => {
    if (typeof hex !== "string") return false;
    const cleaned = hex.startsWith("#") ? hex.substring(1) : hex;
    return /^[0-9a-fA-F]{6}$/.test(cleaned);
  };

  const parseHex = (hex: unknown, fallback: string): string => {
    if (!isValidHex(hex)) return fallback;
    const str = hex as string;
    return str.startsWith("#") ? str : `#${str}`;
  };

  const backgroundColor = parseHex(
    obj.backgroundColor,
    DEFAULT_DECK_THEME.backgroundColor
  );
  const backgroundColor2 = parseHex(
    obj.backgroundColor2,
    DEFAULT_DECK_THEME.backgroundColor2
  );

  const gradientAngle =
    typeof obj.gradientAngle === "number"
      ? Math.max(0, Math.min(360, obj.gradientAngle))
      : DEFAULT_DECK_THEME.gradientAngle;

  const fontColor = parseHex(
    obj.fontColor,
    DEFAULT_DECK_THEME.fontColor
  );

  return {
    backgroundKind,
    backgroundColor,
    backgroundColor2,
    gradientAngle,
    fontColor,
  };
}

export type SlideRole =
  | "title" | "agenda" | "objectives" | "concept" | "definition"
  | "example" | "walkthrough" | "practice" | "answer" | "quiz"
  | "discussion" | "activity" | "case-study" | "summary" | "reference"
  | "section" | "custom";

export interface SlideRoleDef {
  role: SlideRole;
  label: string;
  hint: string;
  promptContract: string;
  codeDefault: boolean;
  maxBulletsDefault: number;
  answersPrevious?: boolean;
}

export const SLIDE_ROLES: SlideRoleDef[] = [
  {
    role: "title",
    label: "Title",
    hint: "Opening title slide (deck title + subtitle); no bullets.",
    promptContract: "opening title slide (deck title + subtitle); no bullets",
    codeDefault: false,
    maxBulletsDefault: 0,
  },
  {
    role: "agenda",
    label: "Agenda",
    hint: "An outline/roadmap of what the session covers. 4-6 bullets.",
    promptContract: "an outline/roadmap of what the session covers",
    codeDefault: false,
    maxBulletsDefault: 5,
  },
  {
    role: "objectives",
    label: "Objectives",
    hint: "Learning objectives (by the end you can...). 3-5 bullets.",
    promptContract: "learning objectives (by the end you can...)",
    codeDefault: false,
    maxBulletsDefault: 4,
  },
  {
    role: "concept",
    label: "Concept",
    hint: "Introduce/explain one concept clearly. 3-5 bullets, code optional.",
    promptContract: "introduce/explain one concept clearly",
    codeDefault: false,
    maxBulletsDefault: 4,
  },
  {
    role: "definition",
    label: "Definition",
    hint: "A precise definition + key properties. 3-4 bullets.",
    promptContract: "a precise definition + key properties",
    codeDefault: false,
    maxBulletsDefault: 3,
  },
  {
    role: "example",
    label: "Example",
    hint: "A concrete worked example; usually carries code.",
    promptContract: "a concrete worked example",
    codeDefault: true,
    maxBulletsDefault: 4,
  },
  {
    role: "walkthrough",
    label: "Walkthrough",
    hint: "Step-by-step explanation of the example; reuses the example's code.",
    promptContract: "step-by-step explanation of the example; reuses the example's code",
    codeDefault: true,
    maxBulletsDefault: 4,
  },
  {
    role: "practice",
    label: "Practice",
    hint: "A task for the student to attempt; do NOT reveal the solution.",
    promptContract: "a task for the student to attempt; do NOT reveal the solution",
    codeDefault: true,
    maxBulletsDefault: 4,
  },
  {
    role: "answer",
    label: "Answer",
    hint: "The worked solution to the immediately preceding practice.",
    promptContract: "the worked solution to the immediately preceding practice",
    codeDefault: true,
    maxBulletsDefault: 4,
    answersPrevious: true,
  },
  {
    role: "quiz",
    label: "Quiz",
    hint: "1-3 quick check questions (no answers shown). 3-5 bullets.",
    promptContract: "1-3 quick check questions (no answers shown)",
    codeDefault: false,
    maxBulletsDefault: 4,
  },
  {
    role: "discussion",
    label: "Discussion",
    hint: "An open prompt to discuss. 2-4 bullets.",
    promptContract: "an open prompt to discuss",
    codeDefault: false,
    maxBulletsDefault: 3,
  },
  {
    role: "activity",
    label: "Activity",
    hint: "A hands-on group/individual activity with instructions. 3-5 bullets.",
    promptContract: "a hands-on group/individual activity with instructions",
    codeDefault: false,
    maxBulletsDefault: 4,
  },
  {
    role: "case-study",
    label: "Case Study",
    hint: "A real-world scenario tying concepts together. 3-5 bullets.",
    promptContract: "a real-world scenario tying concepts together",
    codeDefault: false,
    maxBulletsDefault: 4,
  },
  {
    role: "summary",
    label: "Summary",
    hint: "Recap of key takeaways. 3-5 bullets.",
    promptContract: "recap of key takeaways",
    codeDefault: false,
    maxBulletsDefault: 4,
  },
  {
    role: "reference",
    label: "Reference",
    hint: "Further reading / documentation links. 3-6 bullets.",
    promptContract: "further reading / documentation links",
    codeDefault: false,
    maxBulletsDefault: 5,
  },
  {
    role: "section",
    label: "Section",
    hint: "A section divider (Part 2: ...); no bullets.",
    promptContract: "a section divider; no bullets",
    codeDefault: false,
    maxBulletsDefault: 0,
  },
  {
    role: "custom",
    label: "Custom",
    hint: "Freeform; author notes fully drive it. 3-5 bullets.",
    promptContract: "freeform; author notes fully drive it",
    codeDefault: false,
    maxBulletsDefault: 4,
  },
];

export function getSlideRole(role: string): SlideRoleDef | undefined {
  return SLIDE_ROLES.find((r) => r.role === role);
}

export type LoopSourceKind = "literal" | "runtime" | "courseTopics";

export interface DeckLoopGroup {
  id: string;
  label: string;
  source: LoopSourceKind;
  items: string[];
  courseId?: string | null;
  runtimeLabel?: string;
}

export interface DeckSlide {
  id: string;
  role: SlideRole;
  title: string;
  notes: string;
  includeCode: boolean;
  codeLanguage: string;
  maxBullets: number;
  loopGroupId: string | null;
}

export interface DeckTemplate {
  id: string;
  name: string;
  description: string;
  audience: string;
  tone: string;
  slides: DeckSlide[];
  loops: DeckLoopGroup[];
  theme: DeckTheme;
  createdAt?: string;
  updatedAt?: string;
}

export interface ResolvedSlideSpec {
  role: SlideRole;
  title: string;
  notes: string;
  includeCode: boolean;
  codeLanguage: string;
  maxBullets: number;
  loopItem?: string;
  loopLabel?: string;
}

// Module-local counters for stable ID generation across sessions.
let slideCounter = 0;
let loopCounter = 0;
let templateCounter = 0;

export function newDeckSlide(role: SlideRole = "concept"): DeckSlide {
  const roleDef = getSlideRole(role);
  const id = `slide-${Date.now().toString(36)}-${(slideCounter++).toString(36)}`;

  return {
    id,
    role,
    title: "",
    notes: "",
    includeCode: roleDef?.codeDefault ?? false,
    codeLanguage: roleDef?.codeDefault ?? false ? "python" : "",
    maxBullets: 0,
    loopGroupId: null,
  };
}

export function newDeckLoopGroup(): DeckLoopGroup {
  const id = `loop-${Date.now().toString(36)}-${(loopCounter++).toString(36)}`;

  return {
    id,
    label: "Per item",
    source: "runtime",
    items: [],
    runtimeLabel: "Items",
  };
}

export function emptyDeckTemplate(name: string): DeckTemplate {
  const id = `deck-${Date.now().toString(36)}-${(templateCounter++).toString(36)}`;

  return {
    id,
    name,
    description: "",
    audience: "",
    tone: "",
    slides: [newDeckSlide("title")],
    loops: [],
    theme: { ...DEFAULT_DECK_THEME },
  };
}

export function duplicateDeckTemplate(template: DeckTemplate, name: string): DeckTemplate {
  const id = `deck-${Date.now().toString(36)}-${(templateCounter++).toString(36)}`;

  return {
    ...template,
    id,
    name,
    slides: [...template.slides],
    loops: [...template.loops],
    theme: { ...template.theme },
  };
}

export function expandTemplate(
  template: DeckTemplate,
  loopItems: Record<string, string[]>
): ResolvedSlideSpec[] {
  const resolved: ResolvedSlideSpec[] = [];
  let i = 0;

  while (i < template.slides.length) {
    const slide = template.slides[i];

    // Check if this slide starts a loop block.
    if (slide.loopGroupId !== null) {
      // Find the contiguous run of slides with this loopGroupId.
      const blockStart = i;
      let blockEnd = i + 1;

      while (
        blockEnd < template.slides.length &&
        template.slides[blockEnd].loopGroupId === slide.loopGroupId
      ) {
        blockEnd++;
      }

      // Get the loop group and resolve the items.
      const loopGroup = template.loops.find((g) => g.id === slide.loopGroupId);
      const items = loopItems[slide.loopGroupId] ?? loopGroup?.items ?? [];

      // If items is empty, emit the block once with no loopItem.
      const itemsToUse = items.length > 0 ? items : [undefined];

      for (const item of itemsToUse) {
        // For each item, emit all slides in the block.
        for (let j = blockStart; j < blockEnd; j++) {
          const blockSlide = template.slides[j];
          const roleDef = getSlideRole(blockSlide.role);
          const maxBullets =
            blockSlide.maxBullets > 0
              ? blockSlide.maxBullets
              : roleDef?.maxBulletsDefault ?? 0;

          resolved.push({
            role: blockSlide.role,
            title: blockSlide.title,
            notes: blockSlide.notes,
            includeCode: blockSlide.includeCode,
            codeLanguage: blockSlide.codeLanguage,
            maxBullets,
            ...(item ? { loopItem: item } : {}),
            ...(loopGroup ? { loopLabel: loopGroup.label } : {}),
          });
        }
      }

      // Skip past the block.
      i = blockEnd;
    } else {
      // Non-loop slide: emit once.
      const roleDef = getSlideRole(slide.role);
      const maxBullets =
        slide.maxBullets > 0 ? slide.maxBullets : roleDef?.maxBulletsDefault ?? 0;

      resolved.push({
        role: slide.role,
        title: slide.title,
        notes: slide.notes,
        includeCode: slide.includeCode,
        codeLanguage: slide.codeLanguage,
        maxBullets,
      });

      i++;
    }
  }

  return resolved;
}
