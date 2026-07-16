// Built-in reusable presentation templates (presets).

import type { DeckTemplate, DeckSlide, DeckLoopGroup } from "./types";

function presetSlide(id: string, role: DeckTemplate["slides"][0]["role"], loopGroupId: string | null = null): DeckSlide {
  return {
    id,
    role,
    title: "",
    notes: "",
    includeCode: role === "example" || role === "walkthrough" || role === "practice" || role === "answer",
    codeLanguage: role === "example" || role === "walkthrough" || role === "practice" || role === "answer" ? "python" : "",
    maxBullets: 0,
    loopGroupId,
  };
}

const PRESET_CODING_LECTURE_LOOP: DeckLoopGroup = {
  id: "preset-coding-lecture-concepts",
  label: "Per concept",
  source: "runtime",
  items: [],
  runtimeLabel: "Concepts",
};

export const DECK_PRESETS: DeckTemplate[] = [
  {
    id: "preset-coding-lecture",
    name: "Coding Concept Lecture",
    description: "Teach a programming concept with worked examples and practice problems",
    audience: "Intro to CS",
    tone: "clear, encouraging, hands-on",
    slides: [
      presetSlide("preset-coding-lecture-s1", "title"),
      presetSlide("preset-coding-lecture-s2", "agenda"),
      presetSlide("preset-coding-lecture-s3", "objectives"),
      presetSlide("preset-coding-lecture-s4", "concept", "preset-coding-lecture-concepts"),
      presetSlide("preset-coding-lecture-s5", "example", "preset-coding-lecture-concepts"),
      presetSlide("preset-coding-lecture-s6", "walkthrough", "preset-coding-lecture-concepts"),
      presetSlide("preset-coding-lecture-s7", "practice", "preset-coding-lecture-concepts"),
      presetSlide("preset-coding-lecture-s8", "answer", "preset-coding-lecture-concepts"),
      presetSlide("preset-coding-lecture-s9", "summary"),
      presetSlide("preset-coding-lecture-s10", "quiz"),
    ],
    loops: [PRESET_CODING_LECTURE_LOOP],
  },
  {
    id: "preset-lecture-quiz",
    name: "Lecture + Quiz",
    description: "Alternate between concept and example slides, ending with a quiz",
    audience: "Any level",
    tone: "informative, engaging",
    slides: [
      presetSlide("preset-lecture-quiz-s1", "title"),
      presetSlide("preset-lecture-quiz-s2", "objectives"),
      presetSlide("preset-lecture-quiz-s3", "concept"),
      presetSlide("preset-lecture-quiz-s4", "example"),
      presetSlide("preset-lecture-quiz-s5", "concept"),
      presetSlide("preset-lecture-quiz-s6", "example"),
      presetSlide("preset-lecture-quiz-s7", "summary"),
      presetSlide("preset-lecture-quiz-s8", "quiz"),
    ],
    loops: [],
  },
  {
    id: "preset-review-session",
    name: "Review Session",
    description: "Practice problems with worked solutions for each topic",
    audience: "Any level",
    tone: "supportive, thorough",
    slides: [
      presetSlide("preset-review-session-s1", "title"),
      presetSlide("preset-review-session-s2", "agenda"),
      presetSlide("preset-review-session-s3", "concept", "preset-review-session-topics"),
      presetSlide("preset-review-session-s4", "practice", "preset-review-session-topics"),
      presetSlide("preset-review-session-s5", "answer", "preset-review-session-topics"),
      presetSlide("preset-review-session-s6", "summary"),
    ],
    loops: [
      {
        id: "preset-review-session-topics",
        label: "Per topic",
        source: "runtime",
        items: [],
        runtimeLabel: "Topics",
      },
    ],
  },
];

export function isPresetDeckId(id: string): boolean {
  return id.startsWith("preset-");
}
