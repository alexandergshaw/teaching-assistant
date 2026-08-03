"use server";

import { detectMeetingRequestEmbedded } from "@/lib/embedded/meeting";
import { stripLongDashes } from "@/lib/embedded/scaffold";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { getValidAccessToken } from "@/lib/google-credentials";
import { queryFreeBusy, createCalendarEvent, listCalendarEvents, type CalendarEventBlock } from "@/lib/google-calendar";
import { getSchedulingConfig, computeFreeSlots, formatSlotsForReply } from "@/lib/scheduling";

// ── Meeting scheduling ───────────────────────────────────────────────────
// Split out of messaging.ts (which was pushing the 1000-line cap) with no
// behaviour change - every export below keeps its exact name, signature, and
// semantics from before the split.

/**
 * Find open meeting slots from the owner's Google Calendar free/busy within the
 * configured working hours, plus the real events (with titles) in that window and
 * the grid config, so the inbox can render a week-view picker that shades busy
 * time and highlights the open slots.
 */
export async function getAvailableSlotsAction(
  // Optional IANA time zone to reckon and display slots in. Omit to use the
  // account's configured zone (the default — no per-request override).
  timeZoneOverride?: string
): Promise<
  | {
      slots: string[];
      slotLabels: string[];
      events: CalendarEventBlock[];
      timeZone: string;
      workStartHour: number;
      workEndHour: number;
      slotMinutes: number;
    }
  | { error: string }
> {
  try {
    const user = await requireOwner();
    const token = await getValidAccessToken(user.id);
    if (!token) {
      return { error: "Google Calendar isn't connected. Connect it under Account > Integrations." };
    }
    const baseConfig = getSchedulingConfig();
    const timeZone = timeZoneOverride?.trim() || baseConfig.timeZone;
    const config = { ...baseConfig, timeZone };
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + (config.lookaheadDays + 1) * 86_400_000).toISOString();
    // Free/busy drives the open-slot math; the events list (best-effort) only
    // supplies titles for the busy blocks, so a failure there still lets you pick.
    const [busy, events] = await Promise.all([
      queryFreeBusy(token, timeMin, timeMax, config.timeZone),
      listCalendarEvents(token, timeMin, timeMax, config.timeZone).catch(() => [] as CalendarEventBlock[]),
    ]);
    const slots = computeFreeSlots(busy, config, now);
    return {
      slots,
      slotLabels: formatSlotsForReply(slots, config.timeZone, config.slotMinutes),
      events,
      timeZone: config.timeZone,
      workStartHour: config.workStartHour,
      workEndHour: config.workEndHour,
      slotMinutes: config.slotMinutes,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load your availability." };
  }
}


/**
 * Draft a warm inbox reply that offers the given open times. Falls back to a
 * plain template if the model call fails, so the feature still works offline.
 */
export async function draftMeetingReplyAction(
  threadText: string,
  slotsISO: string[],
  provider: LlmProvider = "gemini",
  // Optional IANA zone to label the offered times in; defaults to the configured zone.
  timeZoneOverride?: string
): Promise<{ body: string } | { error: string }> {
  try {
    await requireOwner();
    if (slotsISO.length === 0) {
      return { error: "No open times to offer." };
    }
    const config = getSchedulingConfig();
    const timeZone = timeZoneOverride?.trim() || config.timeZone;
    const labels = formatSlotsForReply(slotsISO, timeZone, config.slotMinutes);
    const bulletedTimes = labels.map((l) => `- ${l}`).join("\n");

    const fallback = `Thanks for reaching out! I'd be glad to meet over a video call. Here are a few times that work on my end:\n\n${bulletedTimes}\n\nLet me know which one suits you and I'll send a Google Meet link.`;

    // Embedded Deterministic Engine: the plain template already offers the exact
    // open times; return it directly with no model call.
    if (provider === "embedded") {
      return { body: stripLongDashes(fallback) };
    }

    const prompt = `You are an instructor replying to a student who asked to meet over a video call.

CONVERSATION SO FAR (oldest message first):
${threadText.trim()}

AVAILABLE TIMES (offer these exact options, do not invent others):
${bulletedTimes}

Write the instructor's reply: warm and brief, confirm you're happy to meet over a video call, and list the available times as a short bulleted list exactly as given. Tell them to pick one and you'll send a Google Meet link. Output ONLY the reply text (plain text, no subject line, no salutation placeholder, no markdown headers). Never use em dashes or en dashes (the long dashes); use commas or hyphens instead.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      },
      provider
    );
    if (!result.ok || !result.text.trim()) {
      return { body: stripLongDashes(fallback) };
    }
    return { body: stripLongDashes(result.text.trim()) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not draft the reply." };
  }
}

/**
 * Book a 30-minute (config-length) Google Meet on the owner's primary calendar
 * at the chosen slot, returning the Meet link to paste into the reply. The
 * student is invited by email only when one is supplied (Canvas exposes names,
 * not addresses).
 */
export async function createMeetingAction(
  startISO: string,
  studentName?: string,
  studentEmail?: string,
  // Optional IANA zone for the event; defaults to the configured zone.
  timeZoneOverride?: string
): Promise<{ meetLink: string | null; htmlLink: string | null; startISO: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const token = await getValidAccessToken(user.id);
    if (!token) {
      return { error: "Google Calendar isn't connected. Connect it under Account > Integrations." };
    }
    const config = getSchedulingConfig();
    const timeZone = timeZoneOverride?.trim() || config.timeZone;
    const start = new Date(startISO);
    if (Number.isNaN(start.getTime())) {
      return { error: "That meeting time is invalid." };
    }
    const end = new Date(start.getTime() + config.slotMinutes * 60_000);
    const who = studentName?.trim() ? studentName.trim() : "student";
    const event = await createCalendarEvent(token, {
      summary: `Video call with ${who}`,
      description: "Scheduled from the Teaching Assistant inbox.",
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      timeZone,
      attendeeEmails: studentEmail?.trim() ? [studentEmail.trim()] : [],
    });
    return { meetLink: event.meetLink, htmlLink: event.htmlLink, startISO: start.toISOString() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the meeting." };
  }
}

/**
 * Classify whether the latest message in a thread is asking to schedule a live
 * meeting / video call, so the inbox can proactively surface the scheduler.
 * Fails closed (not a request) so a model hiccup never blocks the UI.
 */
export async function detectMeetingRequestAction(
  threadText: string,
  provider: LlmProvider = "gemini"
): Promise<{ isMeetingRequest: boolean; confidence: number }> {
  try {
    await requireOwner();
    if (!threadText.trim()) return { isMeetingRequest: false, confidence: 0 };

    // Embedded Deterministic Engine: classify by rule-based meeting-intent
    // signals in the latest message, no model call.
    if (provider === "embedded") {
      return detectMeetingRequestEmbedded(threadText);
    }

    const prompt = `Decide whether the MOST RECENT message in this conversation is asking the instructor to meet live (a video call, phone call, Zoom/Meet, office hours, or "can we talk"). A general question that does not ask to meet is not a meeting request.

CONVERSATION (oldest first):
${threadText.trim()}

Respond with ONLY a JSON object: {"isMeetingRequest": boolean, "confidence": number between 0 and 1}.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 80, responseMimeType: "application/json" },
      },
      provider
    );
    if (!result.ok) return { isMeetingRequest: false, confidence: 0 };

    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) return { isMeetingRequest: false, confidence: 0 };
    const parsed = JSON.parse(match[0]) as { isMeetingRequest?: unknown; confidence?: unknown };
    return {
      isMeetingRequest: parsed.isMeetingRequest === true,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    };
  } catch {
    return { isMeetingRequest: false, confidence: 0 };
  }
}
