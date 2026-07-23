/**
 * Canvas work fetching: main entry point for pulling student work from Canvas.
 */

import { parseCanvasUrl } from "../canvas-url";
import { resolveInstitution } from "../canvas-core";
import { fetchDiscussion } from "./discussions";
import { fetchAssignment } from "./submissions";
import type { CanvasStudentWork } from "./discussions";

/**
 * Fetch a Canvas discussion or assignment (auto-detected from the URL) and
 * return one work item per student. The host selects the institution/token.
 */
export async function fetchCanvasWork(
  url: string
): Promise<{ kind: "discussion" | "assignment"; students: CanvasStudentWork[]; dueAt: string | null }> {
  const parsed = parseCanvasUrl(url);
  if (!parsed) {
    throw new Error(
      "Could not read a discussion or assignment from that URL. Expected .../courses/123/discussion_topics/456 or .../courses/123/assignments/456."
    );
  }

  const { institution, token, baseUrl } = resolveInstitution(url);

  if (parsed.kind === "discussion") {
    const { students, dueAt } = await fetchDiscussion(baseUrl, token, institution, parsed.courseId, parsed.id);
    return { kind: parsed.kind, students, dueAt };
  }

  const students = await fetchAssignment(baseUrl, token, institution, parsed.courseId, parsed.id);
  return { kind: parsed.kind, students, dueAt: null };
}
