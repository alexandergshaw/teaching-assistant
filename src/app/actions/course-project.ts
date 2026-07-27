"use server";

// The course-long project: persisting one, and generating its brief and
// per-week milestones from the instructor's own one-line definition.

import { requireOwner } from "@/lib/supabase/auth";
import { updateCourseProject } from "@/lib/supabase/courses";
import {
  coerceCourseProject,
  renderProjectBrief,
  type CourseProject,
  type ProjectMilestone,
} from "@/lib/course-project";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { courseKindContract, type CourseKind } from "@/lib/course-kind";
import { jsonObjectSlice } from "./shared";

/**
 * The SOLE server entry point that writes course_project. The record is
 * coerced before it is stored, so a malformed payload from any caller is
 * normalized on the way in rather than on every read afterwards.
 */
export async function setCourseProjectAction(
  courseId: string,
  project: CourseProject
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await updateCourseProject(user.id, courseId, coerceCourseProject(project));
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the course project." };
  }
}

export interface GeneratedProjectPlan {
  name: string;
  brief: string;
  milestones: ProjectMilestone[];
}

/**
 * Turn a one-line project definition into a named project with a brief and one
 * milestone per course week.
 *
 * `weeklyTopics` is the course's own schedule when it has one, so a milestone
 * lands on the week whose material actually supports it rather than being
 * spread evenly over an imagined syllabus.
 */
export async function generateCourseProjectAction(
  definition: string,
  courseFacts: string,
  weeks: number,
  weeklyTopics: string,
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding"
): Promise<GeneratedProjectPlan | { error: string }> {
  try {
    const ask = definition.trim();
    if (!ask) return { error: "Describe the course project first." };

    const weekCount = Number.isFinite(weeks) && weeks > 0 ? Math.floor(weeks) : 0;
    if (weekCount === 0) {
      return { error: "Set the course's week count before generating a project plan." };
    }

    // Embedded Deterministic Engine: no model, so the definition becomes the
    // brief and one milestone is placed on each week from the schedule. It is
    // a real, usable skeleton rather than a fabricated plan.
    if (provider === "embedded") {
      const topics = weeklyTopics
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const milestones: ProjectMilestone[] = Array.from({ length: weekCount }, (_, i) => ({
        week: i + 1,
        title: topics[i] ? `Apply: ${topics[i]}` : `Week ${i + 1} increment`,
        deliverable: "One increment of the course project, submitted for feedback.",
      }));
      const project = coerceCourseProject({
        mode: "course-long",
        name: ask.split("\n")[0].slice(0, 120),
        definition: ask,
        milestones,
      });
      return { name: project.name, brief: renderProjectBrief(project), milestones: project.milestones };
    }

    const prompt = `You are designing the single semester-long project that an entire college course builds toward.

${courseKindContract(courseKind)}

THE INSTRUCTOR'S PROJECT IDEA:
${ask}

THE COURSE:
${courseFacts || "(no further details recorded)"}

THE WEEKLY SCHEDULE:
${weeklyTopics || "(no schedule recorded)"}

The course runs for ${weekCount} weeks.

Design the project and break it into exactly ${weekCount} milestones, one per week, each building directly on the previous one.

Return ONLY valid JSON:
{
  "name": "...",
  "brief": "...",
  "milestones": [
    { "week": 1, "title": "...", "deliverable": "..." }
  ]
}

Requirements:
- "name" is a short, concrete project name (under 120 characters).
- "brief" is the student-facing project brief in plain markdown-ish text: what they are building, why it matters, and how it will be assessed.
- Produce exactly ${weekCount} milestones, with "week" running 1 to ${weekCount} with no gaps and no repeats.
- Each milestone must be a REAL increment the student can finish in one week, and must depend on the previous week's output.
- Align each milestone with that week's topic from the schedule above wherever the schedule supports it.
- "deliverable" states exactly what the student hands in that week.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Project generation failed: HTTP ${result.status} - ${result.body.slice(0, 200)}` };
    }

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) return { error: "Could not parse the project plan from the model response." };

    const parsed = JSON.parse(jsonText) as {
      name?: string;
      brief?: string;
      milestones?: Array<{ week?: number; title?: string; deliverable?: string }>;
    };

    // Coerce before returning: this is the same sanitization a stored record
    // gets, so a model that emits duplicate or out-of-range weeks cannot
    // mis-order the semester.
    const coerced = coerceCourseProject({
      mode: "course-long",
      name: parsed.name ?? "",
      definition: ask,
      brief: parsed.brief ?? "",
      milestones: parsed.milestones ?? [],
    });

    if (coerced.milestones.length === 0) {
      return { error: "The model returned no usable milestones." };
    }

    return {
      name: coerced.name || ask.split("\n")[0].slice(0, 120),
      // A model that returns milestones but no prose still gets a real brief.
      brief: coerced.brief.trim() || renderProjectBrief(coerced),
      milestones: coerced.milestones,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}
