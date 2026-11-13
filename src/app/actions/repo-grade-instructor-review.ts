"use server";

import { requireAppOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export type InstructorCriterion = { area: string; score: number; note: string };

export async function instructorReviewAction(input: { courseId: string; accountId: string; generation: number; sourceSha: string; criteria?: InstructorCriterion[]; feedback?: string; expectedReviewId?: number | null }) {
  const owner = await requireAppOwner();
  if (owner.id !== input.accountId || !Number.isSafeInteger(input.generation) || input.generation <= 0 || !/^[a-f0-9]{40}$/i.test(input.sourceSha)) throw new Error("Review unavailable");
  const args = { p_user_id: owner.id, p_course_id: input.courseId, p_generation: input.generation };
  if (!input.criteria) {
    const { data, error } = await createServiceClient().rpc("repo_grade_read_instructor_review", args);
    if (error) throw new Error("Review unavailable");
    return data;
  }
  if (input.criteria.length !== 4 || input.criteria.some(c => !c.area.trim() || !c.note.trim() || c.note.length > 4000 || !Number.isFinite(c.score) || c.score < 0 || c.score > 25 || Math.abs(Math.round(c.score * 100) - c.score * 100) > 1e-8) || !input.feedback?.trim() || input.feedback.length > 16000) throw new Error("Invalid review");
  const { data, error } = await createServiceClient().rpc("repo_grade_save_instructor_review", { ...args, p_source_sha: input.sourceSha, p_expected_review_id: input.expectedReviewId ?? null, p_criteria: input.criteria, p_feedback: input.feedback }).retry(false);
  if (error) throw new Error("Save outcome could not be confirmed. Reload before retrying.");
  return data;
}



/** Checks the saved rubric and attempt, not just the labels rendered in the browser. */
export async function instructorReviewEligibilityAction(input: { courseId: string; accountId: string; generation: number; sourceSha: string }) {
  const owner = await requireAppOwner();
  if (owner.id !== input.accountId || !Number.isSafeInteger(input.generation) || input.generation <= 0 || !/^[a-f0-9]{40}$/i.test(input.sourceSha)) return false;
  const { data, error } = await createServiceClient().rpc("repo_grade_instructor_review_eligible", { p_user_id: owner.id, p_course_id: input.courseId, p_generation: input.generation, p_source_sha: input.sourceSha });
  if (error) throw new Error("Review eligibility unavailable");
  return data === true;
}
