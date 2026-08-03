"use server";

// The course-long project: persisting one, and generating its brief and
// per-week milestones from the instructor's own one-line definition.

import { requireOwner } from "@/lib/supabase/auth";
import { updateCourseProject } from "@/lib/supabase/courses";
import {
  coerceCourseProject,
  renderProjectBrief,
  PROJECT_HANDS_ON_CONTRACT,
  PROJECT_EVERYDAY_CONTRACT,
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
 *
 * A blank `definition` is allowed: the model is asked to PROPOSE the project
 * instead of turning a description into one, grounded in `courseFacts` and
 * `weeklyTopics`. Only when the definition AND both grounding inputs are
 * blank is there nothing left to design from, which still errors.
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
    const facts = courseFacts.trim();
    const topics = weeklyTopics.trim();
    if (!ask && !facts && !topics) {
      return {
        error:
          "Describe the course project, or provide course facts or a weekly schedule for the model to propose one from.",
      };
    }

    const weekCount = Number.isFinite(weeks) && weeks > 0 ? Math.floor(weeks) : 0;
    if (weekCount === 0) {
      return { error: "Set the course's week count before generating a project plan." };
    }

    // Embedded Deterministic Engine: no model, so the definition becomes the
    // brief and one milestone is placed on each week from the schedule. It is
    // a real, usable skeleton rather than a fabricated plan. A blank
    // definition (the branch a real model would use to propose one) falls
    // back to a deterministic name instead - the first weekly topic when
    // there is one, else a generic placeholder - so this branch never
    // returns a blank name.
    if (provider === "embedded") {
      const topicLines = weeklyTopics
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const milestones: ProjectMilestone[] = Array.from({ length: weekCount }, (_, i) => ({
        week: i + 1,
        title: topicLines[i] ? `Apply: ${topicLines[i]}` : `Week ${i + 1} increment`,
        deliverable: "One increment of the course project, submitted for feedback.",
      }));
      const name = ask ? ask.split("\n")[0].slice(0, 120) : topicLines[0]?.slice(0, 120) || "Course project";
      const project = coerceCourseProject({
        mode: "course-long",
        name,
        definition: ask,
        milestones,
      });
      return { name: project.name, brief: renderProjectBrief(project), milestones: project.milestones };
    }

    // With no instructor idea, the model must PROPOSE the project instead of
    // elaborating on one - every other requirement (course-kind contract,
    // hands-on/authorized-targets contract, milestone count, JSON contract)
    // is identical either way.
    const projectIdeaSection = ask
      ? `THE INSTRUCTOR'S PROJECT IDEA:\n${ask}`
      : `THE INSTRUCTOR'S PROJECT IDEA:\n(none given - PROPOSE the single project this course should build toward, grounded in the course facts and weekly schedule below.)`;

    // PROJECT_EVERYDAY_CONTRACT only applies when the APP is choosing the
    // subject for itself: an instructor's own idea already states what the
    // project is about, and that stated instruction governs over the app's
    // own preference for everyday subject matter.
    const everydaySection = ask ? "" : `\n\n${PROJECT_EVERYDAY_CONTRACT}`;

    const prompt = `You are designing the single semester-long project that an entire college course builds toward.

${courseKindContract(courseKind)}

${PROJECT_HANDS_ON_CONTRACT}${everydaySection}

${projectIdeaSection}

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
- "name" plainly describes what the student actually produces over the term (under 120 characters) - for example "Personal Budgeting App" or "Small Business Network Security Assessment". Do not invent a codename, operation name, or "Project <word>" construction, and avoid mythological, military, or brand-like words (e.g. "Aegis", "Phoenix", "Sentinel") - a reader must be able to tell what the deliverable IS from the name alone, not just that a project exists.
- "brief" is the student-facing project brief in plain markdown-ish text: what they are building, why it matters, and how it will be assessed. State plainly, in the brief, whenever the HANDS-ON, NOT ABOUT THE FIELD and AUTHORIZED TARGETS ONLY rules above apply to this project, so the student sees the boundary up front, not just inside a single week's assignment.
- Produce exactly ${weekCount} milestones, with "week" running 1 to ${weekCount} with no gaps and no repeats.
- Each milestone must be a REAL increment the student can finish in one week, and must depend on the previous week's output.
- Align each milestone with that week's topic from the schedule above wherever the schedule supports it.
- "deliverable" states exactly what the student hands in that week, and must itself be hands-on evidence of the work per the HANDS-ON, NOT ABOUT THE FIELD rule above (never a report, summary, or diagram about the work when the real work can be done and evidenced instead), and must stay within the AUTHORIZED TARGETS ONLY boundary above whenever this field's work could touch a system, network, account, or dataset the student does not own.
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
      // A model that omits "name" AND was given no ask to derive one from
      // (the propose-from-schedule path) still gets a real, non-blank name.
      name: coerced.name || ask.split("\n")[0].slice(0, 120) || "Course project",
      // A model that returns milestones but no prose still gets a real brief.
      brief: coerced.brief.trim() || renderProjectBrief(coerced),
      milestones: coerced.milestones,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}
