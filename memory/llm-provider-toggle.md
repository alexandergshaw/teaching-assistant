---
name: llm-provider-toggle
description: How LLM calls are dispatched and the provider toggle that controls them
metadata:
  type: project
---

Most LLM calls route through `callLlm(req, provider)` in `src/lib/llm.ts` (single dispatcher; the old per-site Gemini `fetch` blocks were consolidated here on 2026-06-13). Provider is `"gemini"` or `"other"`.

The active provider is chosen via an in-app UI toggle (`src/app/components/ProviderToggle.tsx`), persisted in localStorage and read through `src/lib/llm-provider.ts` (`getStoredProvider` / `useLlmProvider`). The choice is passed to the server as an **argument**: server actions take a trailing `provider: LlmProvider = "gemini"` param; API routes (`ai-chat`, `parse-calendar`) read it from the request body/formData; the grading form sends it via a hidden `provider` input.

**The `"other"` provider is the Course Engine API** (`https://testing-knowledge-engine.vercel.app`), client in `src/lib/course-engine.ts` (env: `COURSE_ENGINE_URL`, optional `COURSE_ENGINE_API_KEY`). It is NOT wired into `callLlm` — `callLlm` ignores the provider and always uses Gemini (so any unmatched feature reaching it while the toggle is `"other"` transparently falls back to Gemini). The Course Engine covers only specific features, branched at the action level on `provider === "other"`:
- `generateCourseScheduleAction` → `POST /api/v1/schedule` (adapted to `CourseScheduleRow[]`; dates derived locally).
- lesson-planning deck (`page.tsx` `handleGenerateLesson` → `generateLectureDeckAction`) → `POST /api/v1/lecture`, downloads the `.pptx` directly (skips the editable preview + Gemini companion docs).
- lecture-planning package (`LecturePlanningTab` `handleGenerate` → `generateCourseMaterialsAction`) → `POST /api/v1/materials`, downloads `course-materials.zip`.
- `generateCourseRubricFromZipAction` → calls `/materials` and extracts `rubric.csv`.
- `generateCopilotProjectPromptAction` → `POST /api/v1/copilot-prompt` (deterministic, JSON in/out; returns `{ prompt }`).

Grading uses a **separate** dedicated service (NOT the Course Engine), client in `src/lib/grading-engine.ts` (env: `GRADING_ENGINE_URL` required, optional `GRADING_API_KEY`; error envelope `{error, messages}`). When the toggle is `"other"`, `gradeAction` (`src/app/actions.ts`) branches to `gradeViaGradingEngine` → `POST /api/v1/grade` (multipart: `submissions` zip + one of `rubric_csv`/`rubric_json`/`rubric_text`, auto-detected from an uploaded file or the pasted rubric). The deterministic per-criterion result is mapped to `GradingRun` via `gradingApiToRun` so the existing GradingTab matrix renders it (Files column shows "-", no full-credit checklist). The `GradingTab` shows a CSV/JSON rubric-file upload only when the toggle is `"other"`, and renders `state.warnings`.

Every other feature (syllabus, chat, calendar, standalone intro/assignment/examples) ignores the toggle and always uses Gemini.
