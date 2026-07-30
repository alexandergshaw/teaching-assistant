"use server";

// Server action backing institution REMOVAL (the "delete institutions"
// feature - see docs/REGRESSION.md #133 and its follow-up entry). The
// registry itself is client-side localStorage (src/lib/institutions.ts), but
// what it points AT lives in the database, so the removal confirmation
// (src/lib/institution-removal.ts) needs a real count from here rather than
// guessing client-side.

import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { countInstitutionPages, normalizeInstitution } from "@/lib/knowledge-base";
import { countCoursesByInstitution } from "@/lib/supabase/courses";
import type { InstitutionDeletionImpact } from "@/lib/institution-removal";

/**
 * Count what references an institution acronym in the database: knowledge
 * base pages and course tiles - the two records regression #133 held removal
 * back over. Both counts are read-only, owner-scoped queries; nothing here
 * deletes or modifies any row (see confirmAndRemoveInstitution's docstring
 * for why removal can never cascade into a database delete - AC3).
 */
export async function getInstitutionDeletionImpactAction(
  institution: string
): Promise<{ impact: InstitutionDeletionImpact } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const code = normalizeInstitution(institution);

    const [pageCount, tileCount] = await Promise.all([
      countInstitutionPages(supabase, user.id, code),
      countCoursesByInstitution(user.id, code),
    ]);

    return { impact: { pageCount, tileCount } };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not check what references this institution.",
    };
  }
}
