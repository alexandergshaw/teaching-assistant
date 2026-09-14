"use server";

// Backlog 3.5 (scratchpad/b35-rulings.md, Ruling B35-2/B35-20). THE PRODUCER
// for the confirmed-rubric-areas control: the panel cannot parse rubricText
// itself (extractRubricCriteria reaches node:crypto transitively via
// ../research/rubric-bank, and the panel is "use client" - the same reason
// snapshot-grade.ts used to derive criteria server-side before this chunk).
// This action owns that import now; snapshot-grade.ts no longer imports or
// calls extractRubricCriteria at all (Ruling B35-20).
//
// Ruling B35-21 (BINDING, do not mirror snapshot-grade.ts's own auth
// placement): requireUser() goes INSIDE the try. snapshot-grade.ts's
// requireUser() call sits OUTSIDE its try, so a rejecting requireUser() there
// is never caught - copying that shape here would reproduce the exact bug
// Ruling B35-16 exists to close. requireUser() REJECTS on an auth failure; it
// does not resolve to an {error} shape on its own, so without this try/catch
// the declared `{error: string}` half of this action's return type would be
// unreachable and a caller's `await` would throw instead of receiving a
// message it can render and retry from.
import { requireUser } from "@/lib/supabase/auth";
import { extractRubricCriteria } from "@/lib/grade/rubric";

export interface SnapshotParseRubricResult {
  areas: { name: string; points: number | null }[];
}

export async function snapshotParseRubricAction(
  rubricText: string
): Promise<SnapshotParseRubricResult | { error: string }> {
  try {
    await requireUser();
    const areas = extractRubricCriteria(rubricText).map((c) => ({ name: c.name, points: c.points }));
    return { areas };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the rubric." };
  }
}
