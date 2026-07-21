// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  saveMessageDraftAction,
  listConversationsAction,
  getConversationAction,
  draftMessageReplyAction,
  replyToConversationAction,
  setConversationStateAction,
  detectMeetingRequestAction,
  getAvailableSlotsAction,
  draftMeetingReplyAction,
  createMeetingAction,
  getUnreadCountsAction,
  draftStudentNudgesAction,
  getOutlookStatusAction,
  listOutlookMessagesAction,
} from "@/app/actions";
import type { StepDefinition } from "@/lib/workflows/registry-helpers";
import type { MessageDraftPayload } from "@/lib/message-drafts";

export const messagingSteps: StepDefinition[] = [
  {
    type: "read-inbox",
    name: "Read the message inbox",
    description: "List the LMS inbox conversations, and optionally load one full thread by id, so a later step can triage or draft a reply.",
    inputs: [
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
        help: "Defaults to the active institution.",
      },
      {
        key: "conversationId",
        label: "Conversation id",
        type: "text",
        required: false,
        help: "Optional. A numeric id loads that one thread. Enter \"unread\" to load every unread thread. Leave blank to just list the inbox.",
      },
    ],
    outputs: [
      { key: "conversations", label: "Inbox list", type: "longtext" },
      { key: "thread", label: "Selected thread", type: "longtext" },
      { key: "unreadCount", label: "Unread count", type: "number" },
      { key: "hasUnread", label: "Has unread", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Loading inbox...");
      const r = await listConversationsAction(inst);
      if ("error" in r) throw new Error(r.error);

      const subjects: string[] = [];
      const convLines: string[] = [];

      for (const conv of r.conversations) {
        subjects.push(conv.subject);
        const snippet = conv.lastMessage ? conv.lastMessage.substring(0, 60).replace(/\n/g, " ") : "(no message)";
        const participantsStr = conv.participants.join(", ") || "(no participants)";
        convLines.push(
          `${conv.subject} | ${participantsStr} | ${snippet}${conv.lastMessage && conv.lastMessage.length > 60 ? "..." : ""}`
        );
      }

      const conversations = convLines.join("\n");

      // Compute unread set and outputs for all modes
      const unread = r.conversations.filter((c) => c.workflowState === "unread");
      const unreadCount = unread.length;
      const hasUnread = unreadCount > 0 ? "1" : "";

      let thread = "";
      const convIdRaw = String(values.conversationId ?? "").trim();
      const lower = convIdRaw.toLowerCase();

      // Three-way branch on conversationId
      if (lower === "unread" || lower === "all unread" || lower === "any unread" || lower === "all-unread" || lower === "any-unread") {
        // Unread mode: load all unread threads
        onProgress(`Loading ${unread.length} unread thread(s)...`);
        const threadParts: string[] = [];
        let totalLength = 0;
        const maxLength = 20000;

        for (let i = 0; i < unread.length; i++) {
          const conv = unread[i];
          try {
            const d = await getConversationAction(conv.id, inst);
            if ("error" in d) {
              continue;
            }

            const threadLines = [`Subject: ${d.conversation.subject}`, ""];
            threadLines.push("Participants: " + d.conversation.participants.join(", "));
            threadLines.push("");

            for (const msg of d.conversation.messages) {
              threadLines.push(`${msg.author}: ${msg.body}`);
              if (msg.createdAt) {
                threadLines.push(`(${msg.createdAt})`);
              }
              threadLines.push("");
            }

            const threadText = threadLines.join("\n");
            const partWithSeparator = threadParts.length === 0 ? threadText : `\n\n=====\n\n${threadText}`;

            if (totalLength + partWithSeparator.length > maxLength) {
              threadParts.push(`\n\n... (truncated; ${i} of ${unread.length} unread threads shown)`);
              break;
            }

            threadParts.push(partWithSeparator);
            totalLength += partWithSeparator.length;
          } catch {
            // Skip per-thread load failures
            continue;
          }
        }

        thread = threadParts.join("");
      } else if (/^\d+$/.test(convIdRaw)) {
        // Single-id mode: keep existing behavior
        onProgress("Loading thread...");
        const d = await getConversationAction(Number(convIdRaw), inst);
        if ("error" in d) throw new Error(d.error);

        const threadLines = [`Subject: ${d.conversation.subject}`, ""];
        threadLines.push("Participants: " + d.conversation.participants.join(", "));
        threadLines.push("");

        for (const msg of d.conversation.messages) {
          threadLines.push(`${msg.author}: ${msg.body}`);
          if (msg.createdAt) {
            threadLines.push(`(${msg.createdAt})`);
          }
          threadLines.push("");
        }

        thread = threadLines.join("\n");
      }
      // else: list-only mode, thread stays ""

      return {
        outputs: { conversations, thread, unreadCount, hasUnread },
        summary: {
          kind: "list",
          label: `${r.conversations.length} conversation(s), ${unreadCount} unread`,
          items: subjects.length ? subjects : ["(inbox empty)"],
        },
      };
    },
  },

  {
    type: "draft-message-reply",
    name: "Draft a reply to a student message",
    description: "Draft a courteous reply to a student's message thread, ready to review and send in a later step.",
    inputs: [
      { key: "thread", label: "Conversation thread", type: "longtext", required: true, help: "The thread text, e.g. wired from Read the message inbox." },
      {
        key: "instructions",
        label: "Reply guidance",
        type: "longtext",
        required: false,
        multi: true,
        options: [
          "Warm and encouraging tone",
          "Concise and to the point",
          "Acknowledge the student's concern",
          "Point them to office hours",
          "Reference the syllabus or course policy",
          "Offer to meet or schedule a call",
          "Clarify the deadline or extension policy",
          "Ask a clarifying question",
          "Provide step-by-step guidance",
          "Encourage using available resources",
        ],
        help: "Optional. Choose one or more guidance options (or, when asked at run time, type your own).",
      },
    ],
    outputs: [
      { key: "draftReply", label: "Draft reply", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const thread = String(values.thread ?? "").trim();
      if (!thread) {
        throw new Error("Provide the conversation thread to reply to (wire it from Read the message inbox).");
      }
      const instructions = String(values.instructions ?? "");
      onProgress("Drafting reply...");
      const r = await draftMessageReplyAction(thread, instructions, helpers.provider);
      if ("error" in r) throw new Error(r.error);
      return { outputs: { draftReply: r.body }, summary: { kind: "text", text: r.body } };
    },
  },

  {
    type: "save-message-draft",
    name: "Save a message draft",
    description: "Persist a drafted reply or announcement to your Drafts tab (Messages) for later review and sending.",
    inputs: [
      { key: "body", label: "Message body", type: "longtext", required: true, help: "The drafted message, e.g. wired from Draft a reply to a student message." },
      { key: "kind", label: "Kind", type: "text", required: false, help: "reply (default) or announcement." },
      { key: "conversationId", label: "Conversation id (reply)", type: "text", required: false, help: "For a reply: the conversation to send to." },
      { key: "courseUrl", label: "Course URL (announcement)", type: "lmsCourse", required: false, help: "For an announcement: the Canvas course." },
      { key: "title", label: "Title (announcement)", type: "text", required: false },
      { key: "institution", label: "Institution", type: "institution", required: false, help: "Defaults to the active institution." },
      { key: "context", label: "Context (optional)", type: "longtext", required: false, help: "Original thread text, kept for review." },
      { key: "hubCourse", label: "Course tile (announcement)", type: "hubCourse", required: false, help: "For a closed-LMS announcement: the course tile." },
    ],
    outputs: [{ key: "draftId", label: "Draft id", type: "text" }],
    run: async (values, helpers) => {
      const body = String(values.body ?? "").trim();
      if (!body) {
        throw new Error("Provide the message body to save.");
      }

      const kind = String(values.kind ?? "").trim().toLowerCase() === "announcement" ? "announcement" : "reply";
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || "";

      const payload: MessageDraftPayload = {
        kind,
        body,
        conversationId: String(values.conversationId ?? "").trim() || undefined,
        courseUrl: String(values.courseUrl ?? "").trim() || undefined,
        title: String(values.title ?? "").trim() || undefined,
        institution: inst || undefined,
        context: String(values.context ?? "").trim() || undefined,
        recipientEmail: undefined,
        hubCourseId: String(values.hubCourse ?? "").trim() || undefined,
      };

      const summary = kind === "reply" ? "Drafted reply" : "Drafted announcement";

      const res = await saveMessageDraftAction(summary, payload, helpers.workflowId, helpers.workflowName);
      if ("error" in res) throw new Error(res.error);

      return {
        outputs: { draftId: res.id },
        summary: { kind: "text", text: `Saved a ${kind} draft to Drafts > Messages.` },
      };
    },
  },

  {
    type: "reply-to-conversation",
    name: "Send a reply to a student message",
    description: "Send a reply to an LMS inbox conversation. Attended-only: wire the reply text from Draft a reply to a student message.",
    inputs: [
      { key: "conversationId", label: "Conversation id", type: "text", required: true },
      { key: "body", label: "Reply", type: "longtext", required: true, help: "The reply text, e.g. wired from Draft a reply to a student message." },
      { key: "institution", label: "Institution", type: "institution", required: false, help: "Defaults to the active institution." },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const convId = String(values.conversationId ?? "").trim();
      if (!convId || !/^\d+$/.test(convId)) {
        throw new Error("Provide the numeric conversation id to reply to.");
      }

      const body = String(values.body ?? "").trim();
      if (!body) {
        throw new Error("Provide the reply text (wire it from Draft a reply to a student message).");
      }

      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Sending reply...");
      const r = await replyToConversationAction(Number(convId), body, inst);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: `Reply sent on conversation ${convId}.` },
      };
    },
  },

  {
    type: "triage-inbox",
    name: "Triage an inbox conversation",
    description: "Mark an LMS inbox conversation read, unread, or archived after it has been handled.",
    inputs: [
      { key: "conversationId", label: "Conversation id", type: "text", required: true },
      { key: "state", label: "New state", type: "text", required: true, help: "read, unread, or archived." },
      { key: "institution", label: "Institution", type: "institution", required: false, help: "Defaults to the active institution." },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const convId = String(values.conversationId ?? "").trim();
      if (!convId || !/^\d+$/.test(convId)) {
        throw new Error("Provide the numeric conversation id.");
      }

      const state = String(values.state ?? "").trim().toLowerCase();
      if (state !== "read" && state !== "unread" && state !== "archived") {
        throw new Error("State must be read, unread, or archived.");
      }

      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Updating conversation...");
      const r = await setConversationStateAction(Number(convId), state as "read" | "unread" | "archived", inst);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: `Conversation ${convId} marked ${state}.` },
      };
    },
  },

  {
    type: "detect-meeting-request",
    name: "Detect a meeting request",
    description: "Classify whether a message thread is asking to meet live, with a confidence score, so a workflow can branch toward scheduling.",
    inputs: [
      { key: "thread", label: "Conversation thread", type: "longtext", required: true, help: "The thread text, e.g. wired from Read the message inbox." },
    ],
    outputs: [
      { key: "isMeetingRequest", label: "Is a meeting request", type: "boolean" },
      { key: "confidence", label: "Confidence", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const thread = String(values.thread ?? "").trim();
      if (!thread) {
        throw new Error("Provide the conversation thread to classify.");
      }
      onProgress("Classifying...");
      const r = await detectMeetingRequestAction(thread, helpers.provider);
      const pct = Math.round(r.confidence * 100);
      return {
        outputs: {
          isMeetingRequest: r.isMeetingRequest ? "1" : "",
          confidence: r.confidence,
        },
        summary: {
          kind: "text",
          text: `Meeting request: ${r.isMeetingRequest ? "yes" : "no"} (confidence ${pct}%)`,
        },
      };
    },
  },

  {
    type: "find-open-slots",
    name: "Find open meeting slots",
    description: "Compute the instructor's open meeting slots within working hours (time-zone aware). Emits ISO slots to feed a scheduling reply and human-readable labels.",
    inputs: [
      { key: "timeZone", label: "Time zone", type: "text", required: false, help: "Optional IANA zone (e.g. America/Chicago); blank uses your configured zone." },
    ],
    outputs: [
      { key: "slotsIso", label: "Open slots (ISO)", type: "longtext" },
      { key: "slots", label: "Open slots", type: "longtext" },
      { key: "timeZone", label: "Time zone", type: "text" },
      { key: "hasSlots", label: "Has open slots", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const tz = String(values.timeZone ?? "").trim() || undefined;
      onProgress("Finding open times...");
      const r = await getAvailableSlotsAction(tz);
      if ("error" in r) {
        throw new Error(r.error);
      }
      const slotsIso = r.slots.join("\n");
      const slotsText = r.slotLabels.join("\n");
      return {
        outputs: {
          slotsIso,
          slots: slotsText,
          timeZone: r.timeZone,
          hasSlots: r.slots.length > 0 ? "1" : "",
        },
        summary: {
          kind: "list",
          label: `${r.slots.length} open slot(s)`,
          items: r.slotLabels.length ? r.slotLabels : ["(no open slots)"],
        },
      };
    },
  },

  {
    type: "draft-meeting-reply",
    name: "Draft a scheduling reply",
    description: "Draft a reply proposing meeting times from the open slots, ready to review and send.",
    inputs: [
      { key: "thread", label: "Conversation thread", type: "longtext", required: true, help: "The student's message thread." },
      { key: "slotsIso", label: "Open slots (ISO)", type: "longtext", required: true, help: "ISO slots, one per line, e.g. wired from Find open meeting slots." },
      { key: "timeZone", label: "Time zone", type: "text", required: false, help: "Optional IANA zone to label the offered times." },
    ],
    outputs: [
      { key: "reply", label: "Draft reply", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const thread = String(values.thread ?? "").trim();
      if (!thread) throw new Error("Provide the conversation thread.");
      const slots = String(values.slotsIso ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
      if (slots.length === 0) throw new Error("Provide open time slots (wire them from Find open meeting slots).");
      const tz = String(values.timeZone ?? "").trim() || undefined;
      onProgress("Drafting reply...");
      const r = await draftMeetingReplyAction(thread, slots, helpers.provider, tz);
      if ("error" in r) throw new Error(r.error);
      return { outputs: { reply: r.body }, summary: { kind: "text", text: r.body } };
    },
  },

  {
    type: "book-meeting",
    name: "Book a meeting",
    description: "Create a calendar event with a Google Meet link and invite the student. Attended-only: wire the start time from an approved open slot.",
    inputs: [
      { key: "startISO", label: "Start time (ISO)", type: "text", required: true, help: "ISO datetime, e.g. one of the open slots." },
      { key: "studentName", label: "Student name", type: "text", required: false },
      { key: "studentEmail", label: "Student email", type: "text", required: false },
      { key: "timeZone", label: "Time zone", type: "text", required: false, help: "Optional IANA zone for the event." },
    ],
    outputs: [
      { key: "meetUrl", label: "Meet link", type: "text" },
      { key: "eventUrl", label: "Calendar event", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const startISO = String(values.startISO ?? "").trim();
      if (!startISO) throw new Error("Provide the meeting start time (ISO).");
      const studentName = String(values.studentName ?? "").trim() || undefined;
      const studentEmail = String(values.studentEmail ?? "").trim() || undefined;
      const tz = String(values.timeZone ?? "").trim() || undefined;
      onProgress("Booking meeting...");
      const r = await createMeetingAction(startISO, studentName, studentEmail, tz);
      if ("error" in r) throw new Error(r.error);
      const link = r.htmlLink ?? r.meetLink ?? "";
      const result = {
        outputs: { meetUrl: r.meetLink ?? "", eventUrl: r.htmlLink ?? "" },
        summary: link
          ? { kind: "link" as const, label: "Meeting booked", url: link }
          : { kind: "text" as const, text: "Meeting booked." },
      };
      return result;
    },
  },

  {
    type: "get-unread-and-notifications",
    name: "Get unread message counts",
    description: "Read unread inbox counts per institution, for a dashboard or digest step.",
    inputs: [
      {
        key: "institutions",
        label: "Institutions",
        type: "longtext",
        required: false,
        help: "One institution acronym per line; blank uses the active institution.",
      },
    ],
    outputs: [
      { key: "unread", label: "Total unread", type: "number" },
      { key: "breakdown", label: "Per-institution breakdown", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const raw = String(values.institutions ?? "")
        .split("\n")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const acronyms = raw.length ? raw : (helpers.activeInstitution ? [helpers.activeInstitution] : []);

      if (acronyms.length === 0) {
        throw new Error("Select at least one institution.");
      }

      onProgress("Loading unread counts...");
      const r = await getUnreadCountsAction(acronyms);
      if ("error" in r) {
        throw new Error(r.error);
      }

      const unread = r.counts.reduce((n, c) => n + c.unread, 0);
      const breakdown = r.counts.map((c) => `${c.acronym}: ${c.unread} unread`).join("\n");

      return {
        outputs: { unread, breakdown },
        summary: {
          kind: "list",
          label: `${unread} unread message(s)`,
          items: r.counts.map((c) => `${c.acronym}: ${c.unread}`),
        },
      };
    },
  },

  {
    type: "draft-student-nudges",
    name: "Draft student nudges",
    description:
      "Draft one short, personalized reminder message per student with missing work, saved to Drafts > Messages for review. Nothing is sent until you approve each message.",
    inputs: [
      { key: "course", label: "Course", type: "lmsCourse", required: false, help: "The Canvas course URL (optional for closed-LMS courses)." },
      { key: "missingJson", label: "Missing submissions (JSON)", type: "longtext", required: true, help: "Wired from List missing submissions." },
      { key: "extraNotes", label: "Extra notes (optional)", type: "longtext", required: false, help: "Folded into every nudge - e.g. mention the late policy or an upcoming deadline." },
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: false, help: "Optional - for closed-LMS courses with email-based nudging." },
    ],
    outputs: [
      { key: "drafted", label: "Drafts saved", type: "number" },
      { key: "hasDrafted", label: "Any drafted?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const courseUrl = String(values.course ?? "").trim() || undefined;
      const hubCourseId = String(values.hubCourse ?? "").trim() || undefined;

      if (!courseUrl && !hubCourseId) {
        throw new Error("Provide either an LMS course or select a course tile for closed-LMS email nudging.");
      }

      const missingJson = String(values.missingJson ?? "").trim();
      if (!missingJson) {
        throw new Error("Provide the missing submissions JSON.");
      }

      const extraNotes = String(values.extraNotes ?? "").trim();

      onProgress("Drafting nudges...");
      const res = await draftStudentNudgesAction(courseUrl ?? "", missingJson, extraNotes, helpers.provider, helpers.workflowId, helpers.workflowName, hubCourseId);
      if ("error" in res) {
        throw new Error(res.error);
      }

      return {
        outputs: {
          drafted: String(res.drafted),
          hasDrafted: res.drafted > 0 ? "1" : "",
        },
        summary: {
          kind: "text",
          text: res.drafted > 0
            ? `Drafted ${res.drafted} nudge message(s) - review in Drafts > Messages.`
            : "No nudges drafted - no students with missing work.",
        },
      };
    },
  },

  {
    type: "check-mailbox-connection",
    name: "Check mailbox connection",
    description: "Verify that Outlook is connected and email sending is enabled for an institution.",
    inputs: [
      { key: "institution", label: "Institution", type: "institution", required: true },
    ],
    outputs: [
      { key: "connected", label: "Connected?", type: "boolean" },
      { key: "canSend", label: "Can send?", type: "boolean" },
      { key: "report", label: "Status report", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const inst = String(values.institution ?? "").trim();
      if (!inst) {
        throw new Error("Select an institution.");
      }

      onProgress("Checking connection...");
      const status = await getOutlookStatusAction();
      if ("error" in status) {
        throw new Error(status.error);
      }

      const code = inst.toUpperCase();
      const connected = status.connected.includes(code);
      const canSend = status.canSend.includes(code);

      let report: string;
      if (!connected) {
        report = `Connect Outlook for ${code} under Account > Integrations.`;
      } else if (!canSend) {
        report = `Reconnect Outlook to grant email sending (Mail.Send).`;
      } else {
        report = `Outlook connected; sending enabled.`;
      }

      return {
        outputs: {
          connected: connected ? "1" : "",
          canSend: canSend ? "1" : "",
          report,
        },
        summary: { kind: "text", text: report },
      };
    },
  },

  {
    type: "read-email-inboxes",
    name: "Read the email inboxes",
    description: "One digest across every connected college Outlook account: who wrote, what about, and what is still unread. Feed it to the Morning Briefing or gate follow-up steps on hasUnread.",
    inputs: [
      { key: "institutions", label: "Institutions", type: "longtext", required: false, help: "One acronym per line; blank reads every connected Outlook account." },
      { key: "unreadOnly", label: "Unread only?", type: "boolean", required: false, help: "List only unread messages in the digest." },
      { key: "top", label: "Messages per account", type: "number", required: false, help: "Default 15." },
    ],
    outputs: [
      { key: "digest", label: "Digest", type: "longtext" },
      { key: "unread", label: "Unread", type: "number" },
      { key: "total", label: "Total listed", type: "number" },
      { key: "hasUnread", label: "Any unread?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      onProgress("Checking Outlook connection...");
      const status = await getOutlookStatusAction();
      if ("error" in status) {
        throw new Error(status.error);
      }

      const institutionsInput = String(values.institutions ?? "")
        .split("\n")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      let instList = status.connected;
      if (institutionsInput.length > 0) {
        instList = instList.filter((code) => institutionsInput.includes(code));
      }

      if (instList.length === 0) {
        throw new Error("Connect Outlook under Account > Integrations first.");
      }

      const unreadOnly = String(values.unreadOnly ?? "") === "1";
      const topN = Math.min(Math.max(Number(values.top ?? 15) || 15, 1), 50);
      const multi = instList.length > 1;

      const outLines: string[] = [];
      let totalUnread = 0;
      let totalListed = 0;

      for (let idx = 0; idx < instList.length; idx++) {
        const inst = instList[idx];
        const isLast = idx === instList.length - 1;

        onProgress(`Reading ${inst} mailbox...`);
        const r = await listOutlookMessagesAction(inst);

        if ("error" in r) {
          outLines.push(`${inst}: ${r.error}`);
        } else {
          const messages = r.messages || [];
          const unreadCount = messages.filter((m) => m.isRead === false).length;
          totalUnread += unreadCount;

          outLines.push(`${inst}: ${unreadCount} unread of ${messages.length} recent`);

          let messageLines = messages;
          if (unreadOnly) {
            messageLines = messageLines.filter((m) => m.isRead === false);
          }

          const listedMessages = messageLines.slice(0, topN);
          totalListed += listedMessages.length;

          for (const msg of listedMessages) {
            const unreadMarker = msg.isRead === false ? "[unread] " : "";
            outLines.push(`- ${unreadMarker}${msg.fromName} - ${msg.subject}`);
          }
        }

        if (multi && !isLast) {
          outLines.push("");
        }
      }

      const digest = outLines.join("\n").trim();
      const hasUnread = totalUnread > 0;

      return {
        outputs: {
          digest,
          unread: totalUnread,
          total: totalListed,
          hasUnread: hasUnread ? "1" : "",
        },
        summary: {
          kind: "text",
          text: digest || "(No messages)",
        },
      };
    },
  },
];
