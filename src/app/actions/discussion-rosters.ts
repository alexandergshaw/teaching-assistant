"use server";

import { requireUser } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { prepareDiscussionRoster } from "@/lib/discussion-rosters";

/** Only the signed-in owner's course identifiers, labels and roster text. */
export async function listDiscussionRostersAction(): Promise<{ rosters: { id: string; name: string; roster: string | null; courseCode: string | null; term: string | null; institution: string | null }[] } | { error: string }> {
  try {
    const user = await requireUser();
    const { data, error } = await createServiceClient().from("course_hub").select("id,name,roster,course_code,term,institution").eq("user_id", user.id).order("name");
    if (error) return { error: "Could not load your course rosters." };
    return { rosters: (data ?? []).map((row) => ({ id: row.id, name: row.name, roster: row.roster, courseCode: row.course_code, term: row.term, institution: row.institution })) };
  } catch { return { error: "Could not load your course rosters." }; }
}

/** Update only the roster field if the saved source still matches the reviewed source. */
export async function saveDiscussionRosterAction(input: { courseId: string; expectedRoster: string | null; names: string[] }): Promise<{ roster: string } | { error: string }> {
  try {
    const user = await requireUser();
    if (!input || typeof input.courseId !== "string" || !input.courseId.trim() || input.courseId.length > 200 || !(input.expectedRoster === null || typeof input.expectedRoster === "string") || (input.expectedRoster?.length ?? 0) > 200_000 || !Array.isArray(input.names)) return { error: "Invalid roster request." };
    const next = prepareDiscussionRoster(input.expectedRoster, input.names);
    if ("error" in next) return next;
    let query = createServiceClient().from("course_hub").update({ roster: next.roster, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("id", input.courseId);
    query = input.expectedRoster === null ? query.is("roster", null) : query.eq("roster", input.expectedRoster);
    const { data, error } = await query.select("roster").maybeSingle();
    if (error) return { error: "Could not save the roster." };
    if (!data) return { error: "The course roster changed or is no longer available. Reload it before saving." };
    return { roster: data.roster ?? "" };
  } catch { return { error: "Could not save the roster." }; }
}
