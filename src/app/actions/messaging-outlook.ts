"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/supabase/auth";
import { getMessageDraft, markMessageDraftReviewed } from "@/lib/message-drafts";
import { listConnectedInstitutionsWithScope, getValidAccessToken as getMicrosoftAccessToken, deleteCredentials as deleteMicrosoftCredentials } from "@/lib/microsoft-credentials";
import { listRecentMessages, sendMail, markMessageRead, type Message } from "@/lib/microsoft-graph";
import { listCourses as listCourseHubRows } from "@/lib/supabase/courses";

// ── Outlook ───────────────────────────────────────────────────────────────
// Split out of messaging.ts (which was pushing the 1000-line cap) with no
// behaviour change - every export below keeps its exact name, signature, and
// semantics from before the split.

/** E5: Fetch recent messages from Outlook inbox. */
export async function listOutlookMessagesAction(
  institution: string,
  sinceIso?: string
): Promise<
  { messages: Array<{ id: string; subject: string; fromAddress: string; fromName: string; receivedDateTime: string; isRead: boolean; webLink: string; bodyPreview: string }> } | { error: string }
> {
  try {
    const user = await requireOwner();
    const token = await getMicrosoftAccessToken(user.id, institution);

    if (!token) {
      return {
        error: `Connect Outlook for ${institution} under Account > Integrations first.`,
      };
    }

    const messages = await listRecentMessages(token, { top: 50, sinceIso });
    return { messages };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not list Outlook messages.",
    };
  }
}

/** List all Outlook messages from every connected account. Per-account failures are captured without aborting other accounts. */
export async function listAllOutlookMessagesAction(
  sinceIso?: string
): Promise<
  { accounts: Array<{ institution: string; messages: Message[]; error?: string }> } | { error: string }
> {
  try {
    const user = await requireOwner();
    const withScope = await listConnectedInstitutionsWithScope(user.id);

    if (withScope.length === 0) {
      return {
        error: "Connect Outlook under Account > Integrations first.",
      };
    }

    const accounts: Array<{ institution: string; messages: Message[]; error?: string }> = [];

    for (const { institution } of withScope) {
      try {
        const token = await getMicrosoftAccessToken(user.id, institution);

        if (!token) {
          accounts.push({
            institution,
            messages: [],
            error: `Connect Outlook for ${institution} under Account > Integrations first.`,
          });
          continue;
        }

        const messages = await listRecentMessages(token, { top: 50, sinceIso });
        accounts.push({ institution, messages });
      } catch (err) {
        accounts.push({
          institution,
          messages: [],
          error: err instanceof Error ? err.message : "Could not list messages.",
        });
      }
    }

    return { accounts };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not check Outlook connections.",
    };
  }
}

/** E6: Send an email via Outlook. */
async function sendOutlookMailAction(
  institution: string,
  to: string[],
  subject: string,
  body: string,
  bcc?: string[]
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const token = await getMicrosoftAccessToken(user.id, institution);

    if (!token) {
      return {
        error: `Connect Outlook for ${institution} under Account > Integrations first.`,
      };
    }

    await sendMail(token, { to, bcc, subject, body });
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === "MAIL_SEND_NOT_GRANTED") {
      return {
        error: `Outlook is connected but sending is not granted - reconnect Outlook for ${institution} to grant Mail.Send.`,
      };
    }
    return {
      error: err instanceof Error ? err.message : "Could not send the email.",
    };
  }
}

/**
 * E7: Send a message draft by email via Outlook.
 * Only accessible from the Drafts UI, never from workflow steps.
 * Requires institution and appropriate recipient/course info in the draft payload.
 */
export async function sendMessageDraftByEmailAction(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await getMessageDraft(supabase, user.id, id);

    if (!draft) {
      return { error: "That message draft was not found." };
    }

    const { payload } = draft;

    if (!payload.institution) {
      return { error: "The draft has no institution to send from." };
    }

    const institution = payload.institution;
    let to: string[] = [];
    let bcc: string[] = [];
    let subject: string;

    if (payload.kind === "message" || payload.kind === "reply") {
      if (!payload.recipientEmail) {
        return { error: "The draft has no recipient email." };
      }
      to = [payload.recipientEmail];
      subject = payload.title || draft.summary;
    } else if (payload.kind === "announcement") {
      if (!payload.hubCourseId) {
        return { error: "The draft has no course to announce to." };
      }

      const courses = await listCourseHubRows(user.id);
      const course = courses.find((c) => c.id === payload.hubCourseId);

      if (!course) {
        return { error: "The course tile was not found." };
      }

      const emails = course.studentRepos
        .map((s) => s.email)
        .filter((e): e is string => typeof e === "string" && e.trim().length > 0)
        .map((e) => e.trim());

      if (emails.length === 0) {
        return {
          error: "No student emails on the course tile roster - run Import roster from CSV first.",
        };
      }

      bcc = emails;
      to = [];
      subject = payload.title || "Announcement";
    } else {
      return { error: "Unknown message draft kind." };
    }

    const res = await sendOutlookMailAction(institution, to, subject, payload.body, bcc.length > 0 ? bcc : undefined);
    if ("error" in res) {
      throw new Error(res.error);
    }

    await markMessageDraftReviewed(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not send the message by email.",
    };
  }
}

/** Mark an Outlook message as read or unread. */
export async function markOutlookMessageReadAction(
  institution: string,
  messageId: string,
  isRead: boolean
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const token = await getMicrosoftAccessToken(user.id, institution);

    if (!token) {
      return {
        error: `Connect Outlook for ${institution} under Account > Integrations first.`,
      };
    }

    await markMessageRead(token, messageId, isRead);
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === "MAIL_READWRITE_NOT_GRANTED") {
      return {
        error: `Outlook is connected but mailbox updates are not granted - reconnect Outlook for ${institution} to grant Mail.ReadWrite.`,
      };
    }
    return {
      error: err instanceof Error ? err.message : "Could not mark message read.",
    };
  }
}

/** E8: Extended Outlook status with scope information (whether Mail.Send and Mail.ReadWrite are granted). */
export async function getOutlookStatusAction(): Promise<
  { connected: string[]; canSend: string[]; canMarkRead: string[] } | { error: string }
> {
  try {
    const user = await requireOwner();
    const withScope = await listConnectedInstitutionsWithScope(user.id);

    const connected = withScope.map((s) => s.institution);
    const canSend = withScope
      .filter((s) => s.scope && s.scope.includes("Mail.Send"))
      .map((s) => s.institution);
    const canMarkRead = withScope
      .filter((s) => s.scope && s.scope.includes("Mail.ReadWrite"))
      .map((s) => s.institution);

    return { connected, canSend, canMarkRead };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check Outlook connections." };
  }
}

/** Forget the owner's Outlook connection for one school. */
export async function disconnectOutlookAction(
  institution: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!institution.trim()) return { error: "Choose a school." };
    await deleteMicrosoftCredentials(user.id, institution);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not disconnect Outlook." };
  }
}
