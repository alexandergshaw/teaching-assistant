// Built-in reusable presentation templates (presets).

import type { DeckTemplate, DeckSlide, DeckLoopGroup } from "./types";
import { DEFAULT_DECK_THEME } from "./types";
import type { CourseKind } from "@/lib/course-kind";

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
    depth: "standard",
  };
}

const PRESET_CODING_LECTURE_LOOP: DeckLoopGroup = {
  id: "preset-coding-lecture-concepts",
  label: "Per concept",
  source: "runtime",
  items: [],
  runtimeLabel: "Concepts",
  breadth: "standard",
};

const PRESET_CLASSIC_LECTURE_LOOP: DeckLoopGroup = {
  id: "preset-classic-lecture-concepts",
  label: "Concepts",
  source: "runtime",
  items: [],
  runtimeLabel: "Concepts",
  breadth: "standard",
};

export const DECK_PRESETS: DeckTemplate[] = [
  {
    id: "preset-classic-lecture",
    name: "Classic Lecture",
    description: "The app's standard lecture deck - navy title and header bars with accent highlights. The default styling for every workflow that builds slides.",
    audience: "Any level",
    tone: "clear, informative",
    slides: [
      presetSlide("preset-classic-s1", "title"),
      presetSlide("preset-classic-s2", "objectives"),
      presetSlide("preset-classic-s3", "agenda"),
      presetSlide("preset-classic-s4", "concept", "preset-classic-lecture-concepts"),
      presetSlide("preset-classic-s5", "example", "preset-classic-lecture-concepts"),
      presetSlide("preset-classic-s6", "practice", "preset-classic-lecture-concepts"),
      presetSlide("preset-classic-s7", "summary"),
    ],
    loops: [PRESET_CLASSIC_LECTURE_LOOP],
    theme: {
      backgroundKind: "classic",
      backgroundColor: "#1a2744",
      backgroundColor2: "#2563eb",
      gradientAngle: 135,
      fontColor: "#ffffff",
    },
  },
  {
    id: "preset-coding-lecture",
    name: "Coding Concept Lecture",
    description: "Teach a programming concept with worked examples and practice problems",
    audience: "Intro to CS",
    tone: "clear, encouraging, hands-on",
    // Tagged coding-flavoured: defaultDeckTemplateIdForCourseKind below
    // matches on this field, never on the "coding" substring in this
    // template's own name.
    courseKind: "coding",
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
    theme: {
      backgroundKind: "solid",
      backgroundColor: "#1a2744",
      backgroundColor2: "#0f172a",
      gradientAngle: 135,
      fontColor: "#ffffff",
    },
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
    theme: { ...DEFAULT_DECK_THEME },
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
        breadth: "standard",
      },
    ],
    theme: { ...DEFAULT_DECK_THEME },
  },
  {
    id: "preset-sdlc-lecture",
    name: "SDLC Lecture",
    description: "A full week's lecture on the software development lifecycle: intro, objectives, roadmap, a case study, three hands-on concepts (Jira story to code, pull request norms, CI/CD with Vercel), summary, quiz, deadlines, and office hours.",
    audience: "Software engineering students learning a professional dev workflow",
    tone: "clear, encouraging, practical",
    // Tagged coding-flavoured - see preset-coding-lecture's own comment above.
    courseKind: "coding",
    slides: [
      {
        id: "preset-sdlc-s1",
        role: "title",
        title: "The Software Development Lifecycle (SDLC)",
        notes: "Opening title slide for this week's lecture introducing the SDLC.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 0,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s2",
        role: "concept",
        title: "",
        notes: "Introduce the concept of the SDLC at a high level: what it is, its main phases (plan, build, test, review, deploy, maintain), and why a structured lifecycle matters on professional software teams.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 4,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s3",
        role: "objectives",
        title: "",
        notes: "State exactly THREE learning objectives for today, each phrased as 'By the end you will be able to...': (1) translate a user story from Jira into working code, (2) follow pull request norms, (3) set up CI/CD deployment with Vercel.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 3,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s4",
        role: "agenda",
        title: "Roadmap",
        notes: "Give the lecture roadmap: introduce the SDLC and a real-world case study, then three hands-on concepts (translate a Jira story to code in GitHub Codespaces, pull request norms in GitHub, CI/CD with Vercel), each with a walkthrough and a student activity, and finish with a summary, a quiz, and this week's deadlines and office hours.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 6,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s5",
        role: "case-study",
        title: "",
        notes: "Present a brief, real-world case study tied to the SDLC (a well-known software outage/failure or success that hinged on process, review, or deployment). Summarize what happened, and END with a question posed to the students to get them thinking about today's topics - moving an idea from a ticket to reviewed, deployed code.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 4,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s6",
        role: "concept",
        title: "",
        notes: "Introduce the FIRST of three concepts: translating a user story from Jira into code. Explain what a Jira story/ticket and its acceptance criteria are, and how a developer picks up a story, creates a branch for it, and turns the requirements into code changes.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 4,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s7",
        role: "walkthrough",
        title: "",
        notes: "Walk students through translating a Jira story into code in GitHub Codespaces. Use images/screenshots of Codespaces (describe the screenshots to include). Reference git branching as something already covered - create a branch for the story first. Show opening a Codespace from the branch, reading the story's acceptance criteria, and starting the implementation.",
        includeCode: true,
        codeLanguage: "typescript",
        maxBullets: 4,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s8",
        role: "activity",
        title: "",
        notes: "Have students do the activity themselves (individually): pick a Jira story, create a branch, and translate the story into code in their own GitHub Codespace, using GitHub Copilot to help write the code. Give clear step-by-step instructions and a definition of done.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 4,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s9",
        role: "concept",
        title: "",
        notes: "Introduce the SECOND of three concepts: pull request (PR) norms. Explain what a pull request is, why teams use them, and good PR norms - a clear description, small focused scope, linking the Jira story, requesting a reviewer, and responding to review feedback.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 4,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s10",
        role: "walkthrough",
        title: "",
        notes: "Walk students through opening and reviewing a pull request in GitHub. Use images/screenshots of the GitHub PR interface (describe the screenshots to include): opening a PR from a branch, writing a good description that links the Jira story, requesting reviewers, and leaving and resolving review comments.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 4,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s11",
        role: "activity",
        title: "",
        notes: "Have students do the activity WITH EACH OTHER: in pairs, each opens a pull request for their branch and reviews their partner's PR following the norms just covered, leaving at least two constructive review comments and approving once addressed.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 4,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s12",
        role: "concept",
        title: "",
        notes: "Introduce the THIRD of three concepts: CI/CD and continuous deployment with Vercel. Explain what CI/CD means and how Vercel automatically builds and deploys the app on each push or merge, giving preview URLs for branches and a production URL for the main branch.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 4,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s13",
        role: "walkthrough",
        title: "",
        notes: "Walk students through connecting a repository to Vercel and deploying. Use images/screenshots of the Vercel dashboard (describe the screenshots to include): importing a project, watching the build/deploy logs, and finding the live preview URL and the production URL that updates on each merge.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 4,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s14",
        role: "activity",
        title: "",
        notes: "Have students do the activity WITH EACH OTHER: in pairs, connect their project to Vercel, trigger a deploy by merging a pull request, and verify the deployed URL updates. Each partner confirms the other's deployment succeeded and opens the live URL.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 4,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s15",
        role: "summary",
        title: "",
        notes: "Recap the key knowledge covered today: translating a Jira story into code in Codespaces with Copilot, pull request norms and review in GitHub, and CI/CD deployment with Vercel. Tie the three concepts back to the SDLC as one end-to-end flow from ticket to deployed feature.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 5,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s16",
        role: "quiz",
        title: "",
        notes: "A short check-for-understanding quiz (3-4 questions, do NOT show the answers) covering: reading a Jira story and its acceptance criteria, pull request norms, and how Vercel CI/CD deploys on merge.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 4,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s17",
        role: "deadlines",
        title: "",
        notes: "Cover the assignments and quizzes due this week - MAKE UP realistic ones with names and due dates, e.g. an assignment to take a Jira story all the way to a deployed Vercel feature (due end of week) and a short quiz on PR norms and CI/CD (due mid-week). Include specific due days/times.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 5,
        loopGroupId: null,
        depth: "standard",
      },
      {
        id: "preset-sdlc-s18",
        role: "office-hours",
        title: "",
        notes: "Cover this week's digital office hours - MAKE UP realistic virtual office-hour slots with days, times, and how to join (a video call link). Include at least two slots and a note on how to book or drop in.",
        includeCode: false,
        codeLanguage: "",
        maxBullets: 4,
        loopGroupId: null,
        depth: "standard",
      },
    ],
    loops: [],
    theme: {
      backgroundKind: "gradient",
      backgroundColor: "#ffffff",
      backgroundColor2: "#e8eefc",
      gradientAngle: 135,
      fontColor: "#14213d",
    },
  },
];

export function isPresetDeckId(id: string): boolean {
  return id.startsWith("preset-");
}

// The DEFAULT deck template id for a course kind - "deck template should
// default to just pull from the type of class it is (coding or applied)".
// Matched ONLY on each preset's own `courseKind` FIELD VALUE (DeckTemplate.
// courseKind, types.ts) - never a string comparison against a template's
// name or id. That distinction is load-bearing: a real production run used
// a bare UUID (`2f3a1972-fcaf-403b-87e3-b6198067d72e`) as a user-created
// template's id, which a name/id lookup table is structurally incapable of
// covering.
//
// Falls back to "preset-classic-lecture" whenever no preset in `templates`
// carries a matching courseKind - which today means every "applied" lookup
// (no applied-flavoured preset exists yet - see this file's own header for
// preset-coding-lecture/preset-sdlc-lecture, the only two tagged presets)
// and a blank/omitted courseKind (every untagged preset's own `courseKind`
// is undefined, so `find` on an omitted `courseKind` argument still lands on
// preset-classic-lecture - the first untagged entry above - exactly like the
// old hardcoded fallback it replaces; see resolveDeckTheme's own
// single-argument contract, registry-helpers.assembleLectureFiles.ts).
//
// Scoped to DECK_PRESETS only (the `templates` default) - pure and
// synchronous, no I/O, so a custom (non-preset) template's own courseKind
// column (deck-templates.ts, once an instructor tags one) is not consulted
// here this pass.
export function defaultDeckTemplateIdForCourseKind(
  courseKind: CourseKind | null | undefined,
  templates: DeckTemplate[] = DECK_PRESETS
): string {
  return templates.find((t) => t.courseKind === courseKind)?.id ?? "preset-classic-lecture";
}
