/**
 * Canvas inbox/conversations: reading and managing inbox messages and conversations.
 */

import { canvasError, resolveDefaultInstitution, resolveInstitution, resolveInstitutionByCode, type CanvasInstitution } from "../canvas-core";

export interface CanvasConversationSummary {
  id: number;
  subject: string;
  lastMessage: string;
  participants: string[];
  messageCount: number;
  workflowState: string;
  lastMessageAt: string | null;
}

export interface CanvasConversationMessage {
  id: number;
  authorId: number | null;
  author: string;
  body: string;
  createdAt: string | null;
}

export interface CanvasConversationDetail {
  id: number;
  subject: string;
  participants: string[];
  /** The signed-in user's Canvas id, so the UI can align their messages. */
  selfId: number | null;
  messages: CanvasConversationMessage[];
}

interface CanvasParticipant {
  id?: number;
  name?: string;
  full_name?: string;
}

interface CanvasConversationListItem {
  id?: number;
  subject?: string | null;
  workflow_state?: string;
  last_message?: string | null;
  last_message_at?: string | null;
  message_count?: number;
  participants?: CanvasParticipant[];
}

interface CanvasConversationDetailResponse {
  id?: number;
  subject?: string | null;
  participants?: CanvasParticipant[];
  messages?: Array<{
    id?: number;
    author_id?: number;
    created_at?: string | null;
    body?: string | null;
  }>;
}

function participantName(p: CanvasParticipant): string {
  return (p.name ?? p.full_name ?? (typeof p.id === "number" ? `User ${p.id}` : "")).trim();
}

/** Inbox is account-wide; an acronym selects that school's token, else default. */
function resolveInbox(code?: string): {
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
} {
  return code ? resolveInstitutionByCode(code) : resolveDefaultInstitution();
}

// The signed-in user's Canvas id, cached per institution base URL (it never
// changes for a token), so the inbox thread can tell "me" from the student.
const selfIdCache = new Map<string, number>();
async function getSelfId(ctx: { token: string; baseUrl: string }): Promise<number | null> {
  const cached = selfIdCache.get(ctx.baseUrl);
  if (typeof cached === "number") return cached;
  try {
    const response = await fetch(`${ctx.baseUrl}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${ctx.token}` },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { id?: number };
    if (typeof data.id === "number") {
      selfIdCache.set(ctx.baseUrl, data.id);
      return data.id;
    }
  } catch {
    // Alignment is a nicety; fall back to null if self can't be read.
  }
  return null;
}

export async function listConversations(code?: string): Promise<CanvasConversationSummary[]> {
  const { institution, token, baseUrl } = resolveInbox(code);
  const response = await fetch(`${baseUrl}/api/v1/conversations?per_page=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const items = (await response.json()) as CanvasConversationListItem[];
  return items
    .filter((c) => typeof c.id === "number")
    .map((c) => ({
      id: c.id!,
      subject: (c.subject ?? "").trim() || "(no subject)",
      lastMessage: (c.last_message ?? "").trim(),
      participants: (c.participants ?? []).map(participantName).filter(Boolean),
      messageCount: typeof c.message_count === "number" ? c.message_count : 0,
      workflowState: c.workflow_state ?? "",
      lastMessageAt: c.last_message_at ?? null,
    }));
}

/** Fetch one conversation's full thread, oldest message first. */
export async function getConversation(
  id: number,
  code?: string
): Promise<CanvasConversationDetail> {
  const { institution, token, baseUrl } = resolveInbox(code);
  const response = await fetch(`${baseUrl}/api/v1/conversations/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const [data, selfId] = await Promise.all([
    response.json() as Promise<CanvasConversationDetailResponse>,
    getSelfId({ token, baseUrl }),
  ]);

  const names = new Map<number, string>();
  for (const p of data.participants ?? []) {
    if (typeof p.id === "number") {
      names.set(p.id, participantName(p) || `User ${p.id}`);
    }
  }

  const messages = (data.messages ?? [])
    .filter((m) => typeof m.id === "number")
    .map((m) => ({
      id: m.id!,
      authorId: typeof m.author_id === "number" ? m.author_id : null,
      author:
        typeof m.author_id === "number"
          ? names.get(m.author_id) ?? `User ${m.author_id}`
          : "",
      body: (m.body ?? "").trim(),
      createdAt: m.created_at ?? null,
    }))
    // Canvas returns newest-first; reverse so the thread reads top-to-bottom.
    .reverse();

  return {
    id: data.id ?? id,
    subject: (data.subject ?? "").trim() || "(no subject)",
    participants: [...names.values()],
    selfId,
    messages,
  };
}

/** Reply to a conversation. Canvas sends the reply to all participants. */
export async function replyToConversation(
  id: number,
  body: string,
  code?: string
): Promise<void> {
  if (!body.trim()) throw new Error("A reply needs a message.");
  const { institution, token, baseUrl } = resolveInbox(code);

  const params = new URLSearchParams();
  params.append("body", body.trim());

  const response = await fetch(
    `${baseUrl}/api/v1/conversations/${id}/add_message`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
}

/** Mark a conversation read/unread or archive it. */
export async function setConversationWorkflowState(
  id: number,
  state: "read" | "unread" | "archived",
  code?: string
): Promise<void> {
  const { institution, token, baseUrl } = resolveInbox(code);
  const params = new URLSearchParams();
  params.append("conversation[workflow_state]", state);

  const response = await fetch(`${baseUrl}/api/v1/conversations/${id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
}

/** Create a new conversation (direct message) to one student in a course. */
export async function createConversation(
  courseUrl: string,
  recipientUserId: string,
  body: string,
  subject?: string
): Promise<void> {
  if (!body.trim()) throw new Error("A message needs a body.");
  const { institution, token, baseUrl } = resolveInstitution(courseUrl);

  const courseIdMatch = courseUrl.match(/\/courses\/(\d+)/);
  if (!courseIdMatch) {
    throw new Error("Could not read a course from that URL. Expected a link like .../courses/123.");
  }
  const courseId = courseIdMatch[1];

  const params = new URLSearchParams();
  params.append("recipients[]", recipientUserId);
  params.append("body", body.trim());
  if (subject && subject.trim()) {
    params.append("subject", subject.trim());
  }
  params.append("context_code", `course_${courseId}`);
  params.append("force_new", "1");

  const response = await fetch(`${baseUrl}/api/v1/conversations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
}

/** Unread Canvas inbox conversation count for an institution (for badges). */
export async function getUnreadCount(code: string): Promise<number> {
  const { institution, token, baseUrl } = resolveInbox(code);
  const response = await fetch(`${baseUrl}/api/v1/conversations/unread_count`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const data = (await response.json()) as { unread_count?: string | number };
  const raw = typeof data.unread_count === "string" ? Number.parseInt(data.unread_count, 10) : data.unread_count;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}
