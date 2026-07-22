import type { WorkflowDef } from "@/lib/workflows/types";

export const DRAFT_AND_POST_ANNOUNCEMENT: WorkflowDef = {
  id: "draft-and-post-announcement",
  preset: true,
  name: "Draft and Post Announcement",
  description:
    "Draft a warm announcement from a one-line instruction, then post or schedule it to a Canvas course.",
  steps: [
    {
      type: "draft-announcement",
      bindings: {
        instruction: { source: "runtime", fieldKey: "instruction" },
      },
    },
    {
      type: "post-announcement",
      bindings: {
        course: { source: "runtime", fieldKey: "course" },
        announcementTitle: { source: "step", stepIndex: 0, outputKey: "announcementTitle" },
        announcement: { source: "step", stepIndex: 0, outputKey: "announcement" },
        postAt: { source: "runtime", fieldKey: "postAt" },
      },
    },
  ],
};

export const WEEKLY_KICKOFF_ANNOUNCEMENT: WorkflowDef = {
  id: "weekly-kickoff-announcement",
  preset: true,
  name: "Weekly Kickoff Announcement",
  description:
    "At the start of the week, pull the current module's materials and draft an announcement (what we are learning, what we are doing, upcoming deadlines, and things to be aware of) to review and send.",
  steps: [
    {
      type: "course-progress",
      bindings: { hubCourse: { source: "runtime", fieldKey: "hubCourse" } },
    },
    {
      type: "pull-current-materials",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        week: { source: "step", stepIndex: 0, outputKey: "week" },
        repos: { source: "runtime", fieldKey: "repos" },
      },
    },
    {
      type: "compose-weekly-announcement",
      bindings: {
        moduleName: { source: "step", stepIndex: 0, outputKey: "moduleName" },
        materials: { source: "step", stepIndex: 1, outputKey: "materials" },
        extraNotes: { source: "runtime", fieldKey: "extraNotes" },
      },
    },
    {
      type: "save-message-draft",
      bindings: {
        kind: { source: "literal", value: "announcement" },
        body: { source: "step", stepIndex: 2, outputKey: "announcement" },
        title: { source: "step", stepIndex: 2, outputKey: "announcementTitle" },
        courseUrl: { source: "runtime", fieldKey: "courseUrl" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
  ],
};

export const MORNING_BRIEFING: WorkflowDef = {
  id: "morning-briefing",
  preset: true,
  name: "Morning Briefing",
  description:
    "One schedulable digest of everything that needs you today: unread Canvas messages per institution, institutional email across your connected accounts, how many submissions need grading, and every deadline in the next 7 days across every configured institution (pick courses to narrow) - composed into a Markdown briefing (saved to Files on unattended runs). Runs fully headless: schedule it for each morning.",
  steps: [
    {
      type: "get-unread-and-notifications",
      bindings: {
        institutions: { source: "runtime", fieldKey: "institutions" },
      },
    },
    {
      type: "check-needs-grading",
      bindings: {
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
    {
      type: "list-upcoming-deadlines",
      bindings: {
        courses: { source: "runtime", fieldKey: "courses" },
        daysAhead: { source: "literal", value: "7" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
    {
      type: "read-email-inboxes",
      bindings: {
        institutions: { source: "runtime", fieldKey: "institutions" },
        unreadOnly: { source: "literal", value: "1" },
      },
    },
    {
      type: "compose-briefing",
      bindings: {
        title: { source: "literal", value: "Morning Briefing" },
        section1: { source: "step", stepIndex: 0, outputKey: "breakdown" },
        section2: { source: "step", stepIndex: 1, outputKey: "summary" },
        section3: { source: "step", stepIndex: 2, outputKey: "deadlines" },
        section4: { source: "step", stepIndex: 3, outputKey: "digest" },
      },
    },
  ],
};

export const INBOX_REPLY_DRAFTS: WorkflowDef = {
  id: "inbox-reply-drafts",
  preset: true,
  name: "Inbox Replies to Drafts",
  description:
    "Read every unread Canvas conversation and draft a courteous reply for each thread into Drafts > Messages. Nothing sends until you review. Headless - schedule it and walk into an inbox of ready drafts.",
  steps: [
    {
      type: "read-inbox",
      bindings: {
        institution: { source: "runtime", fieldKey: "institution" },
        conversationId: { source: "literal", value: "unread" },
      },
    },
    {
      type: "draft-message-reply",
      bindings: {
        thread: { source: "step", stepIndex: 0, outputKey: "thread" },
        instructions: { source: "runtime", fieldKey: "guidance" },
      },
      runIf: {
        binding: { source: "step", stepIndex: 0, outputKey: "hasUnread" },
        expected: true,
      },
    },
    {
      type: "save-message-draft",
      bindings: {
        body: { source: "step", stepIndex: 1, outputKey: "draftReply" },
        kind: { source: "literal", value: "reply" },
        context: { source: "step", stepIndex: 0, outputKey: "thread" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
  ],
};

export const MEETING_REQUEST_AUTOPILOT: WorkflowDef = {
  id: "meeting-request-autopilot",
  preset: true,
  name: "Meeting Request Autopilot",
  description:
    "Read unread messages; when one asks for a meeting, pull your real open calendar slots and draft a reply offering them - saved to Drafts > Messages for review.",
  steps: [
    {
      type: "read-inbox",
      bindings: {
        institution: { source: "runtime", fieldKey: "institution" },
        conversationId: { source: "literal", value: "unread" },
      },
    },
    {
      type: "detect-meeting-request",
      bindings: {
        thread: { source: "step", stepIndex: 0, outputKey: "thread" },
      },
      runIf: {
        binding: { source: "step", stepIndex: 0, outputKey: "hasUnread" },
        expected: true,
      },
    },
    {
      type: "find-open-slots",
      bindings: {
        timeZone: { source: "runtime", fieldKey: "timeZone" },
      },
      runIf: {
        binding: { source: "step", stepIndex: 1, outputKey: "isMeetingRequest" },
        expected: true,
      },
    },
    {
      type: "draft-meeting-reply",
      bindings: {
        thread: { source: "step", stepIndex: 0, outputKey: "thread" },
        slotsIso: { source: "step", stepIndex: 2, outputKey: "slotsIso" },
        timeZone: { source: "runtime", fieldKey: "timeZone" },
      },
    },
    {
      type: "save-message-draft",
      bindings: {
        body: { source: "step", stepIndex: 3, outputKey: "reply" },
        kind: { source: "literal", value: "reply" },
        context: { source: "step", stepIndex: 0, outputKey: "thread" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
  ],
};

export const COPILOT_PR_SHEPHERD: WorkflowDef = {
  id: "copilot-pr-shepherd",
  preset: true,
  name: "Copilot PR Shepherd",
  description:
    "See every Copilot agent task and its pull request on a repo, read a PR's full diff, leave your review verdict, and merge - one guided pass instead of four GitHub tabs. Attended by design.",
  steps: [
    {
      type: "poll-copilot-tasks",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
      },
    },
    {
      type: "read-pr-diff",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
        prNumber: { source: "runtime", fieldKey: "prNumber" },
      },
    },
    {
      type: "review-pull-request",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
        prNumber: { source: "runtime", fieldKey: "prNumber" },
        verdict: { source: "runtime", fieldKey: "verdict" },
        body: { source: "runtime", fieldKey: "reviewComment" },
      },
    },
    {
      type: "merge-pull-request",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
        prNumber: { source: "runtime", fieldKey: "prNumber" },
        method: { source: "runtime", fieldKey: "method" },
      },
    },
  ],
};
