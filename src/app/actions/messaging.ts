"use server";

import type { MissingAssignmentReport } from "../actions-types";
import { parseLenientJsonArray } from "@/lib/lenient-json";
import { scaffoldAnnouncement, scaffoldMessageReply, scaffoldStudentNudge } from "@/lib/embedded/communication";
import { stripLongDashes } from "@/lib/embedded/scaffold";
import { createConversation } from "@/lib/canvas";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/supabase/auth";
import { getMessageDraft, createMessageDraft, markMessageDraftReviewed, updateMessageDraft, type MessageDraftPayload } from "@/lib/message-drafts";
import { createAnnouncementAction, replyToConversationAction } from "./canvas";
import { getWritingStyleBlock, jsonObjectSlice } from "./shared";


// ── Message drafts ───────────────────────────────────────────────────────
//
// Persistence for the save-message-draft workflow step's output. Every action
// below is owner-gated and uses the service-role client + the owner's own id
// (from requireOwner()) - the same pattern as the grading-draft actions - so
// it works identically whether called from a signed-in browser session or,
// via requireOwner()'s runAsOwner impersonation, from inside a headless cron
// run. NONE of these actions post anything to Canvas; posting only ever
// happens through createAnnouncementAction or replyToConversationAction above,
// called from the post-message step after the user approves a draft.

/**
 * E9: Draft one short, personalized reminder message per student with missing work.
 * Saved to Drafts > Messages for review. Nothing sends until approved.
 * Falls back to deterministic scaffold if LLM fails.
 */
export async function draftStudentNudgesAction(
  courseUrl: string,
  missingJson: string,
  extraNotes: string,
  provider: LlmProvider = "gemini",
  workflowId?: string,
  workflowName?: string,
  hubCourseId?: string
): Promise<{ drafted: number; preview: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    // Parse missing assignments JSON
    let missing: MissingAssignmentReport[];
    try {
      missing = JSON.parse(missingJson) as MissingAssignmentReport[];
    } catch {
      return { error: "Provide the missing-submissions JSON from List missing submissions." };
    }

    if (!Array.isArray(missing)) {
      return { error: "Provide the missing-submissions JSON from List missing submissions." };
    }

    // Group by student key (userId ?? email ?? name)
    const studentMap = new Map<string, { userId?: number; name: string; email?: string; lines: string[] }>();

    for (const assignment of missing) {
      for (const student of assignment.students) {
        const key = String(student.userId ?? student.email ?? student.name);
        if (!studentMap.has(key)) {
          studentMap.set(key, {
            ...(student.userId !== undefined ? { userId: student.userId } : {}),
            name: student.name,
            ...(student.email ? { email: student.email } : {}),
            lines: [],
          });
        }
        const line = `${assignment.assignmentName}${assignment.dueAt ? ` (was due ${assignment.dueAt})` : ""}`;
        studentMap.get(key)!.lines.push(line);
      }
    }

    if (studentMap.size === 0) {
      return { drafted: 0, preview: "No students to nudge." };
    }

    const students = Array.from(studentMap.entries())
      .map(([, student]) => student)
      .sort((a, b) => {
        if (a.userId && b.userId) return a.userId - b.userId;
        if (a.userId) return -1;
        if (b.userId) return 1;
        return a.name.localeCompare(b.name);
      });

    // Prepare messages per student
    const studentMessages = new Map<string, { body: string }>();

    if (provider === "embedded") {
      // Use deterministic scaffold for each student. Key from the student's
      // own row (not a name lookup) so two students sharing a name still
      // each get their own message.
      for (const student of students) {
        const body = scaffoldStudentNudge(student.name, student.lines, extraNotes);
        const key = String(student.userId ?? student.email ?? student.name);
        studentMessages.set(key, { body });
      }
    } else {
      // Use LLM to generate all nudges at once
      const studentLines = students
        .map((s) => {
          const id = s.userId ? `ID: ${s.userId}` : s.email ? `Email: ${s.email}` : "Name";
          return `\nStudent: ${s.name} (${id})\nMissing:\n${s.lines.map((l) => `  - ${l}`).join("\n")}`;
        })
        .join("\n");

      const styleBlock = await getWritingStyleBlock(user.id);

      const prompt = `You are an instructor sending personalized reminder messages to students with missing work.

STUDENTS AND THEIR MISSING ASSIGNMENTS:
${studentLines}

EXTRA CONTEXT FOR ALL MESSAGES:
${extraNotes.trim() || "(none)"}${styleBlock}

Draft one short, warm reminder message for EACH student. Messages should be plain text, no emojis, no threats. Mention each missing assignment by name. Fold in the extra context when relevant. Sign off "Your instructor".

Return ONLY a valid JSON array with exactly one object per student:
[
  {"name": "Student Name", "message": "..."},
  {"name": "Another Student", "message": "..."}
]

Do not include any text outside the JSON array.`;

      const result = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 4096 },
        },
        provider
      );

      // Parse LLM result
      let llmMessages: Array<{ name: string; message: string }> = [];
      if (result.ok) {
        try {
          const jsonText = jsonObjectSlice(result.text);
          if (jsonText) {
            const parsed = parseLenientJsonArray(jsonText);
            if (parsed) {
              llmMessages = parsed.map((obj: unknown) => {
                const o = obj as { name?: unknown; message?: unknown };
                return {
                  name: typeof o.name === "string" ? o.name : "",
                  message: typeof o.message === "string" ? o.message : "",
                };
              });
            }
          }
        } catch {
          // Fall through to scaffold fallback
        }
      }

      // Assign messages, fallback to scaffold for missing students
      for (const student of students) {
        const llmMsg = llmMessages.find((m) => m.name === student.name);
        const key = String(student.userId ?? student.email ?? student.name);
        if (llmMsg && llmMsg.message.trim()) {
          studentMessages.set(key, { body: llmMsg.message.trim() });
        } else {
          const body = scaffoldStudentNudge(student.name, student.lines, extraNotes);
          studentMessages.set(key, { body });
        }
      }
    }

    // Save one draft per student
    let drafted = 0;
    let firstPreview = "";

    for (const student of students) {
      const key = String(student.userId ?? student.email ?? student.name);
      const msg = studentMessages.get(key);
      if (!msg) continue;

      const context = student.lines.map((l) => `- ${l}`).join("\n");
      const summary = `Nudge ${student.name} - ${student.lines.length} missing assignment(s)`;

      const payload: MessageDraftPayload = {
        kind: "message",
        body: msg.body,
        ...(courseUrl.trim() ? { courseUrl } : {}),
        recipientName: student.name,
        context,
        ...(student.userId !== undefined ? { recipientUserId: String(student.userId) } : {}),
        ...(student.email ? { recipientEmail: student.email } : {}),
        ...(hubCourseId ? { hubCourseId } : {}),
      };

      await createMessageDraft(supabase, user.id, {
        summary,
        payload,
        workflowId,
        workflowName,
      });

      drafted += 1;
      if (drafted === 1) {
        firstPreview = msg.body;
      }
    }

    return { drafted, preview: firstPreview };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not draft student nudges.",
    };
  }
}

/** Save a new pending message draft. */
export async function saveMessageDraftAction(
  summary: string,
  payload: MessageDraftPayload,
  workflowId?: string,
  workflowName?: string
): Promise<{ id: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await createMessageDraft(supabase, user.id, { summary, payload, workflowId, workflowName });
    return { id: draft.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the message draft." };
  }
}

/** One draft's full payload. */

/** Update a draft's payload. */
export async function updateMessageDraftPayloadAction(
  id: string,
  payload: MessageDraftPayload
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await updateMessageDraft(supabase, user.id, id, { payload });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the message draft." };
  }
}

/**
 * Send a new direct Canvas conversation message to a single student.
 */
async function sendCanvasMessageAction(
  courseUrl: string,
  recipientUserId: string,
  body: string,
  subject?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await createConversation(courseUrl, recipientUserId, body, subject);
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not send the message.",
    };
  }
}

/** Post a message draft to Canvas (as a reply, announcement, or new message), then mark it reviewed. */
export async function postMessageDraftAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await getMessageDraft(supabase, user.id, id);
    if (!draft) return { error: "That message draft was not found." };

    const { payload } = draft;

    if (payload.kind === "reply") {
      if (!payload.conversationId || !/^\d+$/.test(payload.conversationId)) {
        return { error: "Invalid or missing conversation id for reply." };
      }
      const res = await replyToConversationAction(Number(payload.conversationId), payload.body, payload.institution || undefined);
      if ("error" in res) throw new Error(res.error);
    } else if (payload.kind === "announcement") {
      if (!payload.courseUrl) {
        return { error: "Invalid or missing course URL for announcement." };
      }
      const res = await createAnnouncementAction(
        payload.courseUrl,
        payload.title || "Announcement",
        payload.body,
        payload.institution || undefined
      );
      if ("error" in res) throw new Error(res.error);
    } else if (payload.kind === "message") {
      if (!payload.courseUrl || !payload.recipientUserId || !/^\d+$/.test(payload.recipientUserId)) {
        return { error: "Invalid or missing recipient for message." };
      }
      const res = await sendCanvasMessageAction(
        payload.courseUrl,
        payload.recipientUserId,
        payload.body,
        payload.title || undefined
      );
      if ("error" in res) throw new Error(res.error);
    } else {
      return { error: "Unknown message draft kind." };
    }

    await markMessageDraftReviewed(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post the message." };
  }
}

/** Regenerate only the recap announcement for a prepared lecture. */
export async function regenerateAnnouncementAction(
  courseName: string,
  moduleName: string,
  materialsText: string,
  previousAnnouncement: string,
  provider: LlmProvider = "gemini"
): Promise<{ announcement: string } | { error: string }> {
  try {
    await requireOwner();
    const truncated = materialsText.slice(0, 24000);

    if (provider === "embedded") {
      return { announcement: previousAnnouncement };
    }

    const prompt = `You are an expert lecturer. Given the following module materials and the previous draft announcement, write a NEW, improved 2-3 short paragraph plain-text announcement for students that is clearly different in wording and structure from the previous draft.

MODULE: ${moduleName}
COURSE: ${courseName}

MATERIALS:
${truncated}

PREVIOUS DRAFT:
${previousAnnouncement}

Return ONLY valid JSON: { "announcement": "..." }`;

    let parsed: { announcement?: string } | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        },
        provider
      );

      if (!result.ok) {
        return {
          error: `LLM API error for "${moduleName}": HTTP ${result.status}`,
        };
      }

      const jsonText = jsonObjectSlice(result.text);
      if (!jsonText) {
        if (attempt === 1) {
          console.error(`Announcement regeneration JSON parse failed for "${moduleName}" (attempt 1)`);
          continue;
        }
        return { error: `Could not parse the announcement from the model output.` };
      }

      try {
        parsed = JSON.parse(jsonText) as { announcement?: string };
        break;
      } catch (err) {
        if (attempt === 1) {
          console.error(
            `Announcement regeneration JSON parse failed for "${moduleName}" (attempt 1): ${err instanceof Error ? err.message : String(err)}`
          );
          continue;
        }
        return { error: `Could not parse the announcement from the model output.` };
      }
    }

    if (!parsed || !parsed.announcement || typeof parsed.announcement !== "string" || !parsed.announcement.trim()) {
      return { error: "Generated announcement is empty. Try again." };
    }

    return { announcement: parsed.announcement };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not regenerate the announcement." };
  }
}

/**
 * Draft an announcement (title + body) from a short instruction. The author
 * reviews and edits before anything is posted.
 */
export async function draftAnnouncementAction(
  instruction: string,
  provider: LlmProvider = "gemini"
): Promise<{ title: string; message: string } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!instruction.trim()) {
      return { error: "Describe what the announcement should say first." };
    }

    // Embedded Deterministic Engine: template the announcement from the
    // instruction with no model call.
    if (provider === "embedded") {
      return scaffoldAnnouncement(instruction);
    }

    const styleBlock = await getWritingStyleBlock(user.id);

    const prompt = `You are an instructor writing a course announcement for students.

WHAT TO ANNOUNCE:
${instruction.trim()}${styleBlock}

Write a clear, warm, professional announcement. Return ONLY valid JSON:
{
  "title": "...",
  "message": "..."
}

Requirements:
- "title": a short, specific subject line (no more than ~10 words).
- "message": the announcement body, addressed directly to students. Use plain text with blank lines between paragraphs; do not use markdown, headings, or bullet symbols.
- Keep it concise and actionable. Do not invent dates, links, or details that were not provided.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Draft failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) {
      return { error: "Could not parse the draft from the model response." };
    }

    const parsed = JSON.parse(jsonText) as {
      title?: string;
      message?: string;
    };

    return { title: (parsed.title ?? "").trim(), message: (parsed.message ?? "").trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Draft a reply to a Canvas message, given the existing thread (oldest first)
 * and an optional steer. Returns plain text the author can edit before sending.
 */
export async function draftMessageReplyAction(
  threadText: string,
  instructions: string,
  provider: LlmProvider = "gemini"
): Promise<{ body: string } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!threadText.trim()) {
      return { error: "Open a conversation before drafting a reply." };
    }

    // Embedded Deterministic Engine: return a courteous, editable reply template
    // with no model call.
    if (provider === "embedded") {
      return scaffoldMessageReply(threadText, instructions);
    }

    const styleBlock = await getWritingStyleBlock(user.id);

    const steer = instructions.trim()
      ? `\n\nHOW TO REPLY:\n${instructions.trim()}`
      : "";

    const prompt = `You are an instructor replying to a student's message in the Canvas inbox.

CONVERSATION SO FAR (oldest message first):
${threadText.trim()}${steer}${styleBlock}

Write the instructor's reply. Respond directly to the most recent message, in a warm, helpful, professional tone. Output ONLY the reply text itself: plain text, no subject line, no salutation placeholder like "[Name]", no markdown. Do not invent facts, dates, grades, or links that are not present in the thread. Never use em dashes or en dashes (the long dashes); use commas or hyphens instead.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Draft failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const body = stripLongDashes(result.text.trim());
    if (!body) {
      return { error: "The model returned an empty reply." };
    }
    return { body };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}
