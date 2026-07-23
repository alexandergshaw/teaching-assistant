"use server";

import { deriveAltTextFromHtml, deriveLinkTextFromHtml } from "@/lib/embedded/accessibility";
import { getCourseName, listAnnouncements, createAnnouncement, listConversations, getConversation, replyToConversation, listCourses, listCoursesByTerm, setConversationWorkflowState, listAssignments, listStudents, listCourseRoster, listAssignmentTextSubmissions, listCourseAssignmentDueDates, listAssignmentBriefsWithDue, listStudentGradeSummaries, type CanvasAnnouncement, type CanvasConversationSummary, type CanvasConversationDetail, type CanvasCourse, type CanvasAssignmentBrief, type CanvasPerson, type CanvasRosterEntry, type CanvasTextSubmission } from "@/lib/canvas";
import { resolveInstitution, resolveInstitutionByCode } from "@/lib/canvas-core";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";

// ── Canvas announcements + inbox (the Canvas tab) ───────────────────────────
//
// Every action below is owner-gated (owner allowlist + AAL2) because it uses the
// privileged Canvas API token, or — for the AI drafts — bills LLM usage. Each
// returns plain serializable data or an { error } string the UI surfaces inline.

/** Load a course's name + recent announcements for the announcements panel. */
/** List the active teacher courses for an institution (announcements picker). */
export async function listCoursesAction(
  acronym: string
): Promise<{ courses: CanvasCourse[] } | { error: string }> {
  try {
    await requireOwner();
    return { courses: await listCourses(acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load courses." };
  }
}

export async function listAssignmentsAction(
  code: string,
  courseId: string
): Promise<{ assignments: CanvasAssignmentBrief[] } | { error: string }> {
  try {
    await requireOwner();
    return { assignments: await listAssignments(code.trim().toUpperCase(), courseId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list assignments." };
  }
}

export async function listStudentsAction(
  code: string,
  courseId: string
): Promise<{ students: CanvasPerson[] } | { error: string }> {
  try {
    await requireOwner();
    return { students: await listStudents(code.trim().toUpperCase(), courseId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list students." };
  }
}

export async function listCourseRosterAction(
  code: string,
  courseId: string
): Promise<{ students: CanvasRosterEntry[] } | { error: string }> {
  try {
    await requireOwner();
    return { students: await listCourseRoster(code.trim().toUpperCase(), courseId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the roster." };
  }
}

export async function listCourseGradeSummariesAction(
  code: string,
  courseId: string
): Promise<
  | {
      students: Array<{ userId: string; name: string; currentScore: number | null; finalScore: number | null }>;
    }
  | { error: string }
> {
  try {
    await requireOwner();
    const summaries = await listStudentGradeSummaries(code.trim().toUpperCase(), courseId);
    return { students: summaries };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load grade summaries." };
  }
}

export async function listAssignmentTextSubmissionsAction(
  code: string,
  courseId: string,
  assignmentId: string
): Promise<{ submissions: CanvasTextSubmission[] } | { error: string }> {
  try {
    await requireOwner();
    return {
      submissions: await listAssignmentTextSubmissions(
        code.trim().toUpperCase(),
        courseId,
        assignmentId
      ),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read submissions." };
  }
}

export async function listCourseAssignmentDueDatesAction(
  code: string,
  courseId: string
): Promise<{ assignments: Array<{ assignmentId: string; name: string; dueAt: string | null }> } | { error: string }> {
  try {
    await requireOwner();
    return { assignments: await listCourseAssignmentDueDates(code.trim().toUpperCase(), courseId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load assignment due dates." };
  }
}

export async function listAssignmentDueDatesByUrlAction(
  courseUrl: string,
  fallbackAcronym?: string
): Promise<{ assignments: Array<{ assignmentId: string; name: string; dueAt: string | null }>; institution: string } | { error: string }> {
  try {
    await requireOwner();

    // Check if the URL is absolute (parseable as a full URL)
    let isAbsolute = false;
    try {
      new URL(courseUrl);
      isAbsolute = true;
    } catch {
      // relative URL
    }

    // Resolve institution from URL, with fallback to acronym for relative URLs only
    let resolved;
    try {
      resolved = resolveInstitution(courseUrl);
    } catch (e) {
      // Absolute URLs must resolve from their host; don't fall back to acronym
      if (isAbsolute) {
        return { error: e instanceof Error ? e.message : "Could not match the course URL to a configured institution." };
      }
      // Relative URLs can fall back to the provided acronym
      try {
        resolved = resolveInstitutionByCode((fallbackAcronym ?? "").trim().toUpperCase());
      } catch {
        return { error: "Could not match the course URL to a configured institution." };
      }
    }

    // Parse course ID from URL
    const courseMatch = courseUrl.match(/courses\/(\d+)/);
    if (!courseMatch || !courseMatch[1]) {
      return { error: "Could not parse the Canvas course ID from the URL." };
    }
    const courseId = courseMatch[1];

    // Fetch assignments and filter to published ones
    const briefs = await listAssignmentBriefsWithDue(resolved.baseUrl, resolved.token, resolved.institution, courseId);
    const assignments = briefs
      .filter((b) => b.published !== false)
      .map((b) => ({ assignmentId: b.assignmentId, name: b.name, dueAt: b.dueAt }));

    return { assignments, institution: resolved.institution.code };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load assignment due dates." };
  }
}

export async function listAnnouncementsAction(
  courseUrl: string,
  acronym?: string
): Promise<{ courseName: string; announcements: CanvasAnnouncement[] } | { error: string }> {
  try {
    await requireOwner();
    const [courseName, announcements] = await Promise.all([
      getCourseName(courseUrl, acronym),
      listAnnouncements(courseUrl, acronym),
    ]);
    return { courseName, announcements };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load announcements." };
  }
}

/** Post a new announcement to the course. */
export async function createAnnouncementAction(
  courseUrl: string,
  title: string,
  message: string,
  acronym?: string,
  // ISO 8601 time to schedule visibility; omit/empty to post immediately.
  delayedPostAt?: string
): Promise<{ announcement: CanvasAnnouncement } | { error: string }> {
  try {
    await requireOwner();
    const announcement = await createAnnouncement(courseUrl, title, message, acronym, delayedPostAt);
    return { announcement };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post the announcement." };
  }
}

/** List courses by institution and term. */
export async function listCoursesByTermAction(
  institution: string,
  term: string
): Promise<
  | {
      courses: Array<{
        id: string;
        name: string;
        courseCode: string | null;
        termName: string | null;
        startAt: string | null;
      }>;
    }
  | { error: string }
> {
  try {
    await requireOwner();
    if (!institution.trim()) {
      return { error: "Enter an institution." };
    }
    const courses = await listCoursesByTerm(institution.trim().toUpperCase(), term);
    return { courses };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list the term's courses." };
  }
}

/** Create a scheduled announcement in a course. */
export async function createScheduledAnnouncementAction(
  courseUrl: string,
  title: string,
  message: string,
  delayedPostAt: string | null,
  acronym?: string
): Promise<{ id: number } | { error: string }> {
  try {
    await requireOwner();
    if (!title.trim()) return { error: "An announcement needs a title." };
    if (!message.trim()) return { error: "An announcement needs a message." };
    const announcement = await createAnnouncement(courseUrl, title, message, acronym, delayedPostAt);
    return { id: announcement.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the announcement." };
  }
}

/** List the account Inbox conversations for the selected institution (or default). */
export async function listConversationsAction(
  acronym?: string
): Promise<{ conversations: CanvasConversationSummary[] } | { error: string }> {
  try {
    await requireOwner();
    return { conversations: await listConversations(acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the inbox." };
  }
}

/** Fetch one conversation's full thread. */
export async function getConversationAction(
  id: number,
  acronym?: string
): Promise<{ conversation: CanvasConversationDetail } | { error: string }> {
  try {
    await requireOwner();
    return { conversation: await getConversation(id, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the conversation." };
  }
}

/** Reply to a conversation, then return its refreshed thread. */
export async function replyToConversationAction(
  id: number,
  body: string,
  acronym?: string
): Promise<{ conversation: CanvasConversationDetail } | { error: string }> {
  try {
    await requireOwner();
    await replyToConversation(id, body, acronym);
    return { conversation: await getConversation(id, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send the reply." };
  }
}

/** Mark a conversation read/unread or archive it. */
export async function setConversationStateAction(
  id: number,
  state: "read" | "unread" | "archived",
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await setConversationWorkflowState(id, state, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the conversation." };
  }
}

/** Suggest concise alt text for an image, from its HTML + the item it lives on. */
export async function suggestAltTextAction(
  itemTitle: string,
  snippet: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    // Embedded Deterministic Engine: derive alt text from the image's file name.
    if (provider === "embedded") {
      const alt = deriveAltTextFromHtml(snippet);
      return alt
        ? { text: alt }
        : { error: "The embedded engine couldn't infer alt text from the image's file name. Switch to an LLM provider for a description." };
    }

    const prompt = `An image on a course item titled "${itemTitle}" needs better alt text for screen-reader users. Here is the image's HTML (use its file name and any context to infer the subject):

${snippet}

Write concise, descriptive alt text under 125 characters that conveys the image's content or purpose. Do not start with "image of" or "picture of". Return ONLY the alt text, with no quotes or commentary.`;
    const result = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 120 } },
      provider
    );
    if (!result.ok) return { error: `Suggestion failed: HTTP ${result.status}` };
    const text = result.text.trim().replace(/^["']|["']$/g, "").slice(0, 200);
    return text ? { text } : { error: "The model returned empty text." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/** Suggest descriptive link text from the link's HTML + the item it lives on. */
export async function suggestLinkTextAction(
  itemTitle: string,
  snippet: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    // Embedded Deterministic Engine: derive readable link text from the URL.
    if (provider === "embedded") {
      const linkText = deriveLinkTextFromHtml(snippet);
      return linkText
        ? { text: linkText }
        : { error: "The embedded engine couldn't derive link text from the URL. Switch to an LLM provider." };
    }

    const prompt = `A hyperlink on a course item titled "${itemTitle}" has unclear link text (e.g. "click here"). Here is the link's HTML:

${snippet}

Write concise, descriptive link text (a few words) that tells the reader where the link goes, based on its URL. Return ONLY the link text, with no quotes or commentary.`;
    const result = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 60 } },
      provider
    );
    if (!result.ok) return { error: `Suggestion failed: HTTP ${result.status}` };
    const text = result.text.trim().replace(/^["']|["']$/g, "").slice(0, 120);
    return text ? { text } : { error: "The model returned empty text." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}
