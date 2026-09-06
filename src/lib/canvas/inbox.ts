/**
 * Canvas inbox/conversations: reading and managing inbox messages and conversations.
 */

import { canvasError, parseNextLink, resolveDefaultInstitution, resolveInstitution, resolveInstitutionByCode, type CanvasInstitution } from "../canvas-core";
import { CANVAS_PAGINATION_PAGE_CAP } from "../canvas-remote-url";
import { getEffectiveIdentity } from "../supabase/effective-identity";

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

/**
 * Inbox is account-wide; an acronym selects that school's token, else
 * default. This is the ONE synchronous encloser of a canvas-core resolver
 * call in the whole repo (E-ARCH1) - resolveInstitutionByCode and
 * resolveDefaultInstitution are both async now that credential resolution
 * reads a per-user store (see canvas-core.ts's own header), so this helper
 * has to become async too, and every one of its five callers below now
 * awaits it.
 */
async function resolveInbox(code?: string): Promise<{
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
}> {
  return code ? await resolveInstitutionByCode(code) : await resolveDefaultInstitution();
}

/**
 * The signed-in user's Canvas id, cached per (calling user, institution base
 * URL) pair.
 *
 * SEC10 (docs/lms-credentials-acceptance-criteria.md): this cache used to be
 * keyed on baseUrl alone, which was safe when one deployment had exactly one
 * token per Canvas host. With per-user credentials, two different users can
 * point at the SAME host (their own school's Canvas), and a baseUrl-only key
 * would let the second caller read back the FIRST caller's cached self id -
 * one user told they are a different Canvas person for the life of a warm
 * process.
 *
 * Keyed on `${identity.id}:${ctx.baseUrl}` instead. identity.id is this
 * app's own account id (from getEffectiveIdentity(), the same ambient-state
 * resolver the credential layer itself uses - never a parameter, per
 * E-ARCH4) - not a secret, and never the token or any value derived from it.
 * Two different credentials against the same host resolve to two different
 * identity ids (a stored row is keyed on the caller's own user id; the
 * owner's env fallback is only ever reachable for the owner's own identity),
 * so the composite key can never collide across two different credentials,
 * without ever putting anything token-shaped into a Map key.
 */
const selfIdCache = new Map<string, number>();
async function getSelfId(ctx: { token: string; baseUrl: string }): Promise<number | null> {
  try {
    const identity = await getEffectiveIdentity();
    const cacheKey = `${identity.id}:${ctx.baseUrl}`;
    const cached = selfIdCache.get(cacheKey);
    if (typeof cached === "number") return cached;
    const response = await fetch(`${ctx.baseUrl}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${ctx.token}` },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { id?: number };
    if (typeof data.id === "number") {
      selfIdCache.set(cacheKey, data.id);
      return data.id;
    }
  } catch {
    // Alignment is a nicety; fall back to null if identity or self can't be
    // read - this must never surface as a hard failure of the whole thread.
  }
  return null;
}

function mapConversationList(items: CanvasConversationListItem[]): CanvasConversationSummary[] {
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

/**
 * Reconciling the two page caps this file carried before this wave (Task 2,
 * E-CRIT1's reliability half): this loop already capped itself at 5 pages,
 * before the shared CANVAS_PAGINATION_PAGE_CAP (20, canvas-remote-url.ts)
 * existed anywhere in the codebase. 5 is KEPT here, not raised to 20 - this
 * path serves an interactive "does this course have any matching threads"
 * lookup (Match to Canvas, M15 below), not a bulk institution-wide read, and
 * scanning up to 20 pages of 100 (2,000 conversations) for a UI action that
 * only needs a handful of matches would be pure added latency for no benefit.
 * `Math.min` against the shared constant means a future change to
 * CANVAS_PAGINATION_PAGE_CAP can never silently let this narrower,
 * deliberately-tighter cap exceed the general ceiling it sits underneath.
 */
const INBOX_COURSE_SEARCH_PAGE_CAP = Math.min(5, CANVAS_PAGINATION_PAGE_CAP);

// M15 (docs/message-replies-acceptance-criteria.md): `opts` is additive and
// OFF by default - every existing caller (institution-wide inbox reads) omits
// it and gets exactly today's request: `per_page=50`, page 1 only, no course
// filter, byte-identical URL and behaviour. When `opts` IS supplied
// (Match to Canvas, M15), the request gains `filter[]=course_<id>` and
// `scope=` (the grading-queue.ts:174 idiom - `?scope=unread&filter[]=course_
// ${courseId}&per_page=100`) and follows `parseNextLink` (the same Link-header
// pagination grading-queue.ts's own `getCourseNotifications` uses at
// grading-queue.ts:161-174) for at most 5 pages, so a large inbox can never
// spin an unbounded number of requests just to find one course's threads.
export async function listConversations(
  code?: string,
  opts?: { courseId?: string; scope?: "unread" | "archived"; perPage?: number }
): Promise<CanvasConversationSummary[]> {
  const { institution, token, baseUrl } = await resolveInbox(code);

  if (!opts) {
    const response = await fetch(`${baseUrl}/api/v1/conversations?per_page=50`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    const items = (await response.json()) as CanvasConversationListItem[];
    return mapConversationList(items);
  }

  const params = new URLSearchParams();
  params.set("per_page", String(opts.perPage ?? 100));
  if (opts.courseId) params.append("filter[]", `course_${opts.courseId}`);
  if (opts.scope) params.set("scope", opts.scope);

  const out: CanvasConversationSummary[] = [];
  let next: string | null = `${baseUrl}/api/v1/conversations?${params.toString()}`;
  let pagesFetched = 0;
  while (next && pagesFetched < INBOX_COURSE_SEARCH_PAGE_CAP) {
    const response = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    const items = (await response.json()) as CanvasConversationListItem[];
    out.push(...mapConversationList(items));
    pagesFetched++;
    next = parseNextLink(response.headers.get("link"));
  }
  return out;
}

/** Fetch one conversation's full thread, oldest message first. */
export async function getConversation(
  id: number,
  code?: string
): Promise<CanvasConversationDetail> {
  const { institution, token, baseUrl } = await resolveInbox(code);
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
  const { institution, token, baseUrl } = await resolveInbox(code);

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
  const { institution, token, baseUrl } = await resolveInbox(code);
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
  const { institution, token, baseUrl } = await resolveInstitution(courseUrl);

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
  const { institution, token, baseUrl } = await resolveInbox(code);
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
