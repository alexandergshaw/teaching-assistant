import type { WorkflowDef } from "@/lib/workflows/types";

export const PREPARE_LECTURE: WorkflowDef = {
  id: "prepare-lecture",
  preset: true,
  name: "Prepare Lecture",
  description:
    "Pick a course and module: builds a lecture deck in the app's slide style from the module's materials, saves it to the course tile, pauses for announcement review where you can edit, regenerate with AI, or approve it - then schedules the approved announcement for two hours after the next class meeting.",
  steps: [
    {
      type: "prepare-lecture",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        moduleId: { source: "runtime", fieldKey: "lmsModule" },
        template: { source: "runtime", fieldKey: "deckTemplate" },
        modulesAhead: { source: "runtime", fieldKey: "modulesAhead" },
      },
    },
    {
      type: "schedule-lecture-announcement",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        announcement: { source: "step", stepIndex: 0, outputKey: "announcement" },
        moduleName: { source: "step", stepIndex: 0, outputKey: "moduleName" },
      },
    },
  ],
};

export const LECTURE_QA: WorkflowDef = {
  id: "lecture-qa",
  preset: true,
  name: "Lecture Q&A",
  description:
    "Pick a course and module, optionally attach the lecture slides: anticipates the questions students are likely to ask during that lecture and drafts instructor-ready answers, saved to the course tile as a Word document.",
  steps: [
    {
      type: "lecture-qa",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        moduleId: { source: "runtime", fieldKey: "lmsModule" },
        slides: { source: "runtime", fieldKey: "slides" },
        modulesAhead: { source: "runtime", fieldKey: "modulesAhead" },
      },
    },
  ],
};

export const WEEKLY_STUDY_GUIDE_PAGE: WorkflowDef = {
  id: "weekly-study-guide-page",
  preset: true,
  name: "Weekly Study Guide Page",
  description:
    "Pick a course tile: finds its current week's topic, pulls cited research, and publishes it as a Canvas page for that course.",
  steps: [
    {
      type: "load-course-tile",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        allowMissingRepo: { source: "literal", value: "1" },
      },
    },
    {
      type: "course-progress",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
      },
    },
    {
      type: "research-topic",
      bindings: {
        topic: { source: "step", stepIndex: 1, outputKey: "topic" },
        count: { source: "literal", value: "5" },
      },
    },
    {
      type: "publish-file-as-page",
      bindings: {
        course: { source: "step", stepIndex: 0, outputKey: "course" },
        title: { source: "step", stepIndex: 1, outputKey: "moduleName" },
        content: { source: "step", stepIndex: 2, outputKey: "results" },
        published: { source: "literal", value: "1" },
      },
    },
  ],
};

export const WEEKLY_LECTURE_NARRATION: WorkflowDef = {
  id: "weekly-lecture-narration",
  preset: true,
  name: "Weekly Lecture Narration",
  description:
    "For this week's topic, generates a lecture script from the course repo and saves narrated audio to the course tile - fully unattended.",
  steps: [
    {
      type: "course-progress",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
      },
    },
    {
      type: "extract-topics-from-repo",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
      },
    },
    {
      type: "generate-lecture-script",
      bindings: {
        topic: { source: "step", stepIndex: 0, outputKey: "topic" },
        objectives: { source: "step", stepIndex: 1, outputKey: "topics" },
        minutes: { source: "literal", value: "10" },
      },
    },
    {
      type: "synthesize-narration",
      bindings: {
        text: { source: "step", stepIndex: 2, outputKey: "script" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        fileName: { source: "literal", value: "weekly-lecture.mp3" },
      },
    },
  ],
};

export const WEEKLY_LECTURE_VIDEO: WorkflowDef = {
  id: "weekly-lecture-video",
  preset: true,
  name: "Weekly Lecture Video",
  description:
    "Turns this week's lecture script into an in-house avatar talking-head video. Run again or schedule a follow-up poll if the render is still processing.",
  steps: [
    {
      type: "course-progress",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
      },
    },
    {
      type: "extract-topics-from-repo",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
      },
    },
    {
      type: "generate-lecture-script",
      bindings: {
        topic: { source: "step", stepIndex: 0, outputKey: "topic" },
        objectives: { source: "step", stepIndex: 1, outputKey: "topics" },
        minutes: { source: "literal", value: "10" },
      },
    },
    {
      type: "generate-avatar-video",
      bindings: {
        script: { source: "step", stepIndex: 2, outputKey: "script" },
      },
    },
    {
      type: "poll-avatar-video",
      bindings: {
        videoId: { source: "step", stepIndex: 3, outputKey: "videoId" },
      },
    },
  ],
};

export const QUIZ_FROM_REPO: WorkflowDef = {
  id: "quiz-from-repo",
  preset: true,
  name: "Quiz from Repo",
  description:
    "Mines a repo's topics, generates a quiz with answer key, and imports the questions into an existing Canvas quiz.",
  steps: [
    {
      type: "extract-topics-from-repo",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
      },
    },
    {
      type: "generate-quiz-from-material",
      bindings: {
        material: { source: "step", stepIndex: 0, outputKey: "topics" },
        count: { source: "literal", value: "10" },
      },
    },
    {
      type: "import-quiz-questions",
      bindings: {
        course: { source: "runtime", fieldKey: "course" },
        quizId: { source: "runtime", fieldKey: "quizId" },
        questionsJson: { source: "step", stepIndex: 1, outputKey: "questionsJson" },
      },
    },
  ],
};

export const ASSIGNMENT_KIT: WorkflowDef = {
  id: "assignment-kit",
  preset: true,
  name: "Assignment Kit",
  description:
    "From a repo, generates a full assignment brief, rubric, model answer, and full-credit checklist in one unattended pass.",
  steps: [
    {
      type: "extract-topics-from-repo",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
      },
    },
    {
      type: "generate-assignment-brief",
      bindings: {
        objectives: { source: "step", stepIndex: 0, outputKey: "topics" },
      },
    },
    {
      type: "generate-rubric-offline",
      bindings: {
        instructions: { source: "step", stepIndex: 1, outputKey: "assignment" },
      },
    },
    {
      type: "generate-model-answer",
      bindings: {
        instructions: { source: "step", stepIndex: 1, outputKey: "assignment" },
        rubric: { source: "step", stepIndex: 2, outputKey: "rubric" },
      },
    },
    {
      type: "generate-full-credit-checklist",
      bindings: {
        instructions: { source: "step", stepIndex: 1, outputKey: "assignment" },
        rubric: { source: "step", stepIndex: 2, outputKey: "rubric" },
      },
    },
  ],
};

export const GROW_KNOWLEDGE_BASE: WorkflowDef = {
  id: "grow-knowledge-base",
  preset: true,
  name: "Grow Knowledge Base",
  description:
    "Measures how well a topic is covered, runs the research loop to fill gaps, then re-measures to show the improvement.",
  steps: [
    {
      type: "measure-knowledge-gap",
      bindings: {
        topic: { source: "runtime", fieldKey: "topic" },
      },
    },
    {
      type: "run-research-loop",
      bindings: {
        topic: { source: "runtime", fieldKey: "topic" },
      },
    },
    {
      type: "measure-knowledge-gap",
      bindings: {
        topic: { source: "runtime", fieldKey: "topic" },
      },
    },
  ],
};

export const MODULE_SLIDES_FROM_TEMPLATE: WorkflowDef = {
  id: "module-slides-from-template",
  preset: true,
  name: "Module slides from a template",
  description:
    "Pick a module and a PowerPoint Design template; generate a deck for that module into Drafts > Presentations.",
  steps: [
    {
      type: "generate-presentation-from-template",
      // Explicit runtime bindings so the run form actually asks for each input
      // (collectRuntimeFields only surfaces inputs with an explicit runtime
      // binding; an empty bindings object asks for nothing).
      bindings: {
        template: { source: "runtime", fieldKey: "template" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        moduleId: { source: "runtime", fieldKey: "moduleId" },
        subject: { source: "runtime", fieldKey: "subject" },
        concepts: { source: "runtime", fieldKey: "concepts" },
        audience: { source: "runtime", fieldKey: "audience" },
      },
    },
  ],
};

export const WEEKLY_LECTURE_DECK: WorkflowDef = {
  id: "weekly-lecture-deck",
  preset: true,
  name: "Weekly lecture deck",
  description:
    "Detect the course's current week and module, then generate a slide deck from a PowerPoint Design template for that module into Drafts > Presentations. Pick the course and template once; schedule it to run every week.",
  steps: [
    {
      type: "course-progress",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        // Shares one Modules ahead field with the deck step so the detected
        // module name (the deck's subject) and the deck content shift together.
        modulesAhead: { source: "runtime", fieldKey: "modulesAhead" },
      },
    },
    {
      type: "generate-presentation-from-template",
      bindings: {
        // Shares the one course picker with step 1; the deck's subject is the
        // detected current module so each week's deck is named for that module.
        // The other inputs need explicit runtime bindings to be asked in the run
        // form (collectRuntimeFields ignores unbound inputs).
        template: { source: "runtime", fieldKey: "template" },
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        subject: { source: "step", stepIndex: 0, outputKey: "moduleName" },
        moduleId: { source: "runtime", fieldKey: "moduleId" },
        concepts: { source: "runtime", fieldKey: "concepts" },
        audience: { source: "runtime", fieldKey: "audience" },
        modulesAhead: { source: "runtime", fieldKey: "modulesAhead" },
      },
    },
  ],
};

export const QUIZ_PIPELINE: WorkflowDef = {
  id: "quiz-pipeline",
  preset: true,
  name: "Quiz from Repo (end to end)",
  description:
    "Mine a repo's topics, generate questions, create the (unpublished) Canvas quiz shell, and import the questions into it - the whole quiz pipeline in one run. Publish from Canvas when happy.",
  steps: [
    {
      type: "extract-topics-from-repo",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
      },
    },
    {
      type: "generate-quiz-from-material",
      bindings: {
        material: { source: "step", stepIndex: 0, outputKey: "topics" },
        count: { source: "runtime", fieldKey: "count" },
      },
    },
    {
      type: "create-canvas-quiz",
      bindings: {
        course: { source: "runtime", fieldKey: "course" },
        title: { source: "runtime", fieldKey: "quizTitle" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
    {
      type: "import-quiz-questions",
      bindings: {
        course: { source: "runtime", fieldKey: "course" },
        quizId: { source: "step", stepIndex: 2, outputKey: "quizId" },
        questionsJson: { source: "step", stepIndex: 1, outputKey: "questionsJson" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
  ],
};

export const NEXT_WEEK_LECTURES: WorkflowDef = {
  id: "next-week-lectures",
  preset: true,
  name: "Draft Next Week's Lectures (all courses)",
  description:
    "Every course tile across every institution: detect next week's module from the tile's schedule and draft a lesson plan, lecture script, and slide deck into the tile's materials. Fully headless - schedule it for Friday and walk into Monday with every lecture drafted. Finished or not-yet-started courses are skipped automatically.",
  steps: [
    {
      type: "draft-upcoming-lectures",
      bindings: {
        courses: { source: "literal", value: "*" },
        minutes: { source: "literal", value: "20" },
        extraNotes: { source: "runtime", fieldKey: "extraNotes" },
        template: { source: "runtime", fieldKey: "deckTemplate" },
      },
    },
  ],
};

export const WEEKLY_CONCEPT_ANIMATIONS: WorkflowDef = {
  id: "weekly-concept-animations",
  preset: true,
  name: "Next Week's Concept Animations (all courses)",
  description:
    "Every course tile across every institution: detect next week's module and generate a set of professional animated concept visualizations (SVG/CSS, no JavaScript - they render everywhere, including as Canvas pages) into the tile's materials. Fully headless: schedule it for the start of each week alongside Draft Next Week's Lectures. Canvas pages, when enabled, are created unpublished.",
  steps: [
    {
      type: "generate-concept-animations",
      bindings: {
        courses: { source: "literal", value: "*" },
        maxConcepts: { source: "literal", value: "3" },
        extraNotes: { source: "runtime", fieldKey: "extraNotes" },
        publish: { source: "runtime", fieldKey: "publish" },
      },
    },
  ],
};

export const WEEKLY_EVERYTHING_PREP: WorkflowDef = {
  id: "weekly-everything-prep",
  preset: true,
  name: "Weekly Everything Prep (all courses)",
  description:
    "The Sunday-night button: for every course at every institution, prepare the coming two weeks by default (the workflow's Looking ahead setting) for in-person, synchronous online, and asynchronous online students - lecture decks, scripts, and lesson plans (optionally narrated for async), concept animations, week-ahead announcement drafts per course, the deadline list, a gradebook at-risk report, and a draft-grading pass when anything is waiting - finished with a briefing report. Every artifact lands on the course tile AND in the Files tab; announcements wait in Drafts. Fully headless - schedule it weekly.",
  scope: { lookahead: "14" },
  steps: [
    {
      type: "draft-upcoming-lectures",
      bindings: {
        courses: { source: "literal", value: "*" },
        minutes: { source: "literal", value: "20" },
        lookahead: { source: "runtime", fieldKey: "lookahead" },
        template: { source: "runtime", fieldKey: "deckTemplate" },
        includeNarration: { source: "runtime", fieldKey: "includeNarration" },
        extraNotes: { source: "runtime", fieldKey: "extraNotes" },
      },
    },
    {
      type: "generate-concept-animations",
      bindings: {
        courses: { source: "literal", value: "*" },
        maxConcepts: { source: "literal", value: "3" },
        lookahead: { source: "runtime", fieldKey: "lookahead" },
        extraNotes: { source: "runtime", fieldKey: "extraNotes" },
        publish: { source: "runtime", fieldKey: "publish" },
      },
    },
    {
      type: "ensure-visualizer-pages",
      bindings: {
        courses: { source: "literal", value: "*" },
        lookahead: { source: "runtime", fieldKey: "lookahead" },
        maxConcepts: { source: "literal", value: "3" },
      },
    },
    {
      type: "draft-weekly-announcements",
      bindings: {
        courses: { source: "literal", value: "*" },
        lookahead: { source: "runtime", fieldKey: "lookahead" },
        extraNotes: { source: "runtime", fieldKey: "extraNotes" },
      },
    },
    {
      type: "list-upcoming-deadlines",
      bindings: {
        daysAhead: { source: "runtime", fieldKey: "lookahead" },
      },
    },
    {
      type: "gradebook-health-report",
      bindings: {
        courses: { source: "literal", value: "*" },
        threshold: { source: "runtime", fieldKey: "threshold" },
      },
    },
    {
      type: "check-needs-grading",
      bindings: {},
    },
    {
      type: "grade-to-draft",
      bindings: {},
      runIf: {
        binding: { source: "step", stepIndex: 6, outputKey: "hasWork" },
        expected: true,
      },
    },
    {
      type: "draft-weekly-study-guides",
      bindings: {
        courses: { source: "literal", value: "*" },
        lookahead: { source: "runtime", fieldKey: "lookahead" },
        citations: { source: "literal", value: "4" },
        extraNotes: { source: "runtime", fieldKey: "extraNotes" },
        publish: { source: "runtime", fieldKey: "publish" },
      },
    },
    {
      type: "compose-briefing",
      bindings: {
        title: { source: "literal", value: "Weekly prep report" },
        section1: { source: "step", stepIndex: 4, outputKey: "deadlines" },
        section2: { source: "step", stepIndex: 5, outputKey: "report" },
        section3: { source: "step", stepIndex: 0, outputKey: "report" },
        section4: { source: "step", stepIndex: 3, outputKey: "report" },
      },
    },
  ],
};

export const PROBLEM_SOLVING_COMPANION: WorkflowDef = {
  id: "problem-solving-companion",
  preset: true,
  name: "Propose Solutions to Open Problems",
  description:
    "When another workflow completes, read your open problems and propose 2-3 fresh solutions for each one. Solutions accumulate over time and are visible in the Problems panel. Runs fully headless.",
  steps: [
    {
      type: "list-open-problems",
      bindings: {},
    },
    {
      type: "propose-problem-solutions",
      bindings: {
        problems: { source: "step", stepIndex: 0, outputKey: "problems" },
      },
      runIf: {
        binding: { source: "step", stepIndex: 0, outputKey: "hasProblems" },
        expected: true,
      },
    },
  ],
};

export const MODULE_HOMEWORK_ANSWERS: WorkflowDef = {
  id: "module-homework-answers",
  preset: true,
  name: "Module Homework Answers",
  description:
    "Generate a full-credit model answer for every assignment and discussion in the current module as an instructor answer key. Answers are saved privately to the course tile and Files tab and never published to the LMS.",
  steps: [
    {
      type: "generate-module-answers",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        moduleId: { source: "runtime", fieldKey: "lmsModule" },
        maxItems: { source: "literal", value: "6" },
        modulesAhead: { source: "runtime", fieldKey: "modulesAhead" },
      },
    },
  ],
};
