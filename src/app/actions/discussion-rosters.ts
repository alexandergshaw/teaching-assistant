"use server";

import { requireUser } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

/** Only the signed-in owner's course identifiers, labels and roster text. */
export async function listDiscussionRostersAction(): Promise<{ rosters: { id: string; name: string; roster: string | null; courseCode: string | null; term: string | null; institution: string | null }[] } | { error: string }> {
  try {
    const user = await requireUser();
    const { data, error } = await createServiceClient().from("course_hub").select("id,name,roster,course_code,term,institution").eq("user_id", user.id).order("name");
    if (error) return { error: "Could not load your course rosters." };
    return { rosters: (data ?? []).map((row) => ({ id: row.id, name: row.name, roster: row.roster, courseCode: row.course_code, term: row.term, institution: row.institution })) };
  } catch { return { error: "Could not load your course rosters." }; }
}
