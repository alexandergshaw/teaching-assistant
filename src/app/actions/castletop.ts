"use server";

import { buildCastletopWorkbook } from "@/lib/castletop";
import { buildCastletopPlan } from "@/lib/castletop-plan";
import { buildCastletopSources } from "@/lib/castletop-sources";
import { listCourses as listCourseHubTiles } from "@/lib/supabase/courses";
import { requireOwner } from "@/lib/supabase/auth";
import { resolveRepolessSchedule } from "@/lib/workflows/registry/schedule-resolution";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { listAssignmentBriefsByUrlAction } from "./canvas-inbox";

export interface GenerateCastletopConfig {
  instructor?: string | null;
  contactMinutes?: number | null;
  readingRate?: number | null;
  pagesPerChapter?: number | null;
  classSessionMinutes?: number | null;
}

export async function generateCastletopWorkbookAction(
  courseId: string,
  config?: GenerateCastletopConfig
): Promise<{ base64: string; fileName: string; notes: string[]; weeks: number } | { error: string }> {
  try {
    const user = await requireOwner();

    if (!courseId.trim()) {
      return { error: "Choose a course." };
    }

    const courses = await listCourseHubTiles(user.id);
    const tile = courses.find((c) => c.id === courseId);
    if (!tile) {
      return { error: "Course not found." };
    }

    const scheduleResolution = resolveRepolessSchedule(null, tile, undefined);
    const allNotes: string[] = [];
    if (scheduleResolution.note) {
      allNotes.push(scheduleResolution.note);
    }

    let assignments: Array<{ name: string; pointsPossible: number | null; dueAt: string | null }> = [];
    if (tile.lms && tile.canvasUrl) {
      try {
        const briefResult = await listAssignmentBriefsByUrlAction(tile.canvasUrl, tile.institution ?? undefined);
        if ("assignments" in briefResult) {
          assignments = briefResult.assignments;
        } else if ("error" in briefResult) {
          allNotes.push(`LMS enrichment note: ${briefResult.error}`);
        }
      } catch {
        allNotes.push("LMS enrichment attempted but failed; continuing with schedule only.");
      }
    }

    let weeks = 16;
    if (tile.weeks && Number.isInteger(tile.weeks) && tile.weeks > 0) {
      weeks = tile.weeks;
    } else if (scheduleResolution.schedule.length > 0) {
      weeks = scheduleResolution.schedule.length;
    }

    const sourceInput = {
      schedule: scheduleResolution.schedule,
      assignments,
      startDate: tile.startDate,
      weeks,
    };

    const sourceResult = buildCastletopSources(sourceInput);
    allNotes.push(...sourceResult.notes);

    const plan = buildCastletopPlan({
      courseCode: tile.courseCode,
      courseName: tile.name,
      instructor: config?.instructor ?? undefined,
      term: tile.term,
      weeks,
      contactMinutes: config?.contactMinutes ?? undefined,
      readingRate: config?.readingRate ?? undefined,
      pagesPerChapter: config?.pagesPerChapter ?? undefined,
      classSessionMinutes: config?.classSessionMinutes ?? undefined,
      topicsByWeek: sourceResult.topicsByWeek,
      itemsByWeek: sourceResult.itemsByWeek,
    });

    const buffer = await buildCastletopWorkbook(plan);
    const base64 = Buffer.from(buffer).toString("base64");

    const today = new Date().toISOString().split("T")[0];
    const fileName = buildWorkflowFileName({
      course: tile,
      artifact: "Castletop Workload",
      date: today,
      ext: "xlsx",
    });

    return { base64, fileName, notes: allNotes, weeks };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the Castletop workbook." };
  }
}
