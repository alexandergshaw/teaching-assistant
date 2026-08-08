import type { WorkflowDef } from "@/lib/workflows/types";

export const DRAFT_AND_POST_ANNOUNCEMENT: WorkflowDef = {
  id: "draft-and-post-announcement",
  preset: true,
  category: "communication",
  name: "Draft and Post Announcement",
  description:
    "Draft a warm announcement from a one-line instruction, then post or schedule it to a Canvas course.",
  steps: [
    {
      id: "draft-announcement",
      type: "draft-announcement",
      bindings: {
        instruction: { source: "runtime", fieldKey: "instruction" },
      },
    },
    {
      id: "post-announcement",
      type: "post-announcement",
      bindings: {
        course: { source: "runtime", fieldKey: "course" },
        announcementTitle: { source: "step", stepId: "draft-announcement", outputKey: "announcementTitle" },
        announcement: { source: "step", stepId: "draft-announcement", outputKey: "announcement" },
        postAt: { source: "runtime", fieldKey: "postAt" },
      },
    },
  ],
};

export const WEEKLY_KICKOFF_ANNOUNCEMENT: WorkflowDef = {
  id: "weekly-kickoff-announcement",
  preset: true,
  category: "communication",
  name: "Weekly Kickoff Announcement",
  description:
    "At the start of the week, pull the current module's materials and draft an announcement (what we are learning, what we are doing, upcoming deadlines, and things to be aware of) to review and send.",
  steps: [
    {
      id: "course-progress",
      type: "course-progress",
      bindings: { hubCourse: { source: "runtime", fieldKey: "hubCourse" } },
    },
    {
      id: "pull-current-materials",
      type: "pull-current-materials",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        week: { source: "step", stepId: "course-progress", outputKey: "week" },
        // Target the SAME module course-progress derived, by NAME - not by
        // position in the LMS module list. This is the structural fix for
        // the "Module 07 announcement described Module 06 content" bug: a
        // leading non-module Canvas entry (Start Here/Course Information)
        // used to shift the positional lookup by one.
        moduleRef: { source: "step", stepId: "course-progress", outputKey: "moduleRef" },
        repos: { source: "runtime", fieldKey: "repos" },
      },
    },
    {
      id: "compose-weekly-announcement",
      type: "compose-weekly-announcement",
      bindings: {
        // The module actually pulled (step 1), not course-progress's derived
        // name (step 0) - the announcement's title and its body now come
        // from ONE source, so they can never disagree again.
        moduleName: { source: "step", stepId: "pull-current-materials", outputKey: "moduleName" },
        materials: { source: "step", stepId: "pull-current-materials", outputKey: "materials" },
        extraNotes: { source: "runtime", fieldKey: "extraNotes" },
      },
    },
    {
      id: "save-message-draft",
      type: "save-message-draft",
      bindings: {
        kind: { source: "literal", value: "announcement" },
        body: { source: "step", stepId: "compose-weekly-announcement", outputKey: "announcement" },
        title: { source: "step", stepId: "compose-weekly-announcement", outputKey: "announcementTitle" },
        courseUrl: { source: "runtime", fieldKey: "courseUrl" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
  ],
};

// Standalone (one step) rather than folded into WEEKLY_KICKOFF_ANNOUNCEMENT
// or wired into COURSE_REFRESH: docs/weekly-announcement-scheduling-
// acceptance-criteria.md's own "Relationship to the existing step" section
// requires this run standalone against a bare course tile (no generated
// materials needed), and inserting into COURSE_REFRESH would shift every
// later step's index and its bindOverrides keys - REGRESSION.md #157
// records that breaking twice already. A dedicated preset avoids that
// hazard entirely, at the cost of one more entry in this list.
export const SCHEDULE_WEEKLY_ANNOUNCEMENTS: WorkflowDef = {
  id: "schedule-weekly-announcements",
  preset: true,
  category: "communication",
  name: "Schedule Weekly Announcements",
  description:
    "Pre-schedule one announcement per in-session week, on a chosen weekday and time, for the whole term in one run - each is created immediately in Canvas with a future release date, so nothing appears to students until its own week. Safe to re-run: already-scheduled weeks are left alone, and a start-date edit reschedules them instead of duplicating the term. Break weeks are not excluded. Headless-safe - schedule it once per term.",
  steps: [
    {
      id: "schedule-weekly-announcements-for-term",
      type: "schedule-weekly-announcements-for-term",
      bindings: {
        hubCourse: { source: "runtime", fieldKey: "hubCourse" },
        weekday: { source: "runtime", fieldKey: "weekday" },
        postTime: { source: "runtime", fieldKey: "postTime" },
        title: { source: "runtime", fieldKey: "title" },
        message: { source: "runtime", fieldKey: "message" },
      },
    },
  ],
};

export const MORNING_BRIEFING: WorkflowDef = {
  id: "morning-briefing",
  preset: true,
  category: "communication",
  name: "Morning Briefing",
  description:
    "One schedulable digest of everything that needs you today: unread Canvas messages per institution, institutional email across your connected accounts, how many submissions need grading, and every deadline in the next 7 days across every configured institution (pick courses to narrow) - composed into a Markdown briefing (saved to Files on unattended runs). Runs fully headless: schedule it for each morning.",
  steps: [
    {
      id: "get-unread-and-notifications",
      type: "get-unread-and-notifications",
      bindings: {
        institutions: { source: "runtime", fieldKey: "institutions" },
      },
    },
    {
      id: "check-needs-grading",
      type: "check-needs-grading",
      bindings: {
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
    {
      id: "list-upcoming-deadlines",
      type: "list-upcoming-deadlines",
      bindings: {
        courses: { source: "runtime", fieldKey: "courses" },
        daysAhead: { source: "literal", value: "7" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
    {
      id: "read-email-inboxes",
      type: "read-email-inboxes",
      bindings: {
        institutions: { source: "runtime", fieldKey: "institutions" },
        unreadOnly: { source: "literal", value: "1" },
      },
    },
    {
      id: "compose-briefing",
      type: "compose-briefing",
      bindings: {
        title: { source: "literal", value: "Morning Briefing" },
        section1: { source: "step", stepId: "get-unread-and-notifications", outputKey: "breakdown" },
        section2: { source: "step", stepId: "check-needs-grading", outputKey: "summary" },
        section3: { source: "step", stepId: "list-upcoming-deadlines", outputKey: "deadlines" },
        section4: { source: "step", stepId: "read-email-inboxes", outputKey: "digest" },
      },
    },
  ],
};

export const INBOX_REPLY_DRAFTS: WorkflowDef = {
  id: "inbox-reply-drafts",
  preset: true,
  category: "communication",
  name: "Inbox Replies to Drafts",
  description:
    "Read every unread Canvas conversation and draft a courteous reply for each thread into Drafts > Messages. Nothing sends until you review. Headless - schedule it and walk into an inbox of ready drafts.",
  steps: [
    {
      id: "read-inbox",
      type: "read-inbox",
      bindings: {
        institution: { source: "runtime", fieldKey: "institution" },
        conversationId: { source: "literal", value: "unread" },
      },
    },
    {
      id: "draft-message-reply",
      type: "draft-message-reply",
      bindings: {
        thread: { source: "step", stepId: "read-inbox", outputKey: "thread" },
        instructions: { source: "runtime", fieldKey: "guidance" },
      },
      runIf: {
        binding: { source: "step", stepId: "read-inbox", outputKey: "hasUnread" },
        expected: true,
      },
    },
    {
      id: "save-message-draft",
      type: "save-message-draft",
      bindings: {
        body: { source: "step", stepId: "draft-message-reply", outputKey: "draftReply" },
        kind: { source: "literal", value: "reply" },
        context: { source: "step", stepId: "read-inbox", outputKey: "thread" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
  ],
};

export const MEETING_REQUEST_AUTOPILOT: WorkflowDef = {
  id: "meeting-request-autopilot",
  preset: true,
  category: "communication",
  name: "Meeting Request Autopilot",
  description:
    "Read unread messages; when one asks for a meeting, pull your real open calendar slots and draft a reply offering them - saved to Drafts > Messages for review.",
  steps: [
    {
      id: "read-inbox",
      type: "read-inbox",
      bindings: {
        institution: { source: "runtime", fieldKey: "institution" },
        conversationId: { source: "literal", value: "unread" },
      },
    },
    {
      id: "detect-meeting-request",
      type: "detect-meeting-request",
      bindings: {
        thread: { source: "step", stepId: "read-inbox", outputKey: "thread" },
      },
      runIf: {
        binding: { source: "step", stepId: "read-inbox", outputKey: "hasUnread" },
        expected: true,
      },
    },
    {
      id: "find-open-slots",
      type: "find-open-slots",
      bindings: {
        timeZone: { source: "runtime", fieldKey: "timeZone" },
      },
      runIf: {
        binding: { source: "step", stepId: "detect-meeting-request", outputKey: "isMeetingRequest" },
        expected: true,
      },
    },
    {
      id: "draft-meeting-reply",
      type: "draft-meeting-reply",
      bindings: {
        thread: { source: "step", stepId: "read-inbox", outputKey: "thread" },
        slotsIso: { source: "step", stepId: "find-open-slots", outputKey: "slotsIso" },
        timeZone: { source: "runtime", fieldKey: "timeZone" },
      },
    },
    {
      id: "save-message-draft",
      type: "save-message-draft",
      bindings: {
        body: { source: "step", stepId: "draft-meeting-reply", outputKey: "reply" },
        kind: { source: "literal", value: "reply" },
        context: { source: "step", stepId: "read-inbox", outputKey: "thread" },
        institution: { source: "runtime", fieldKey: "institution" },
      },
    },
  ],
};

export const COPILOT_PR_SHEPHERD: WorkflowDef = {
  id: "copilot-pr-shepherd",
  preset: true,
  category: "communication",
  name: "Copilot PR Shepherd",
  description:
    "See every Copilot agent task and its pull request on a repo, read a PR's full diff, leave your review verdict, and merge - one guided pass instead of four GitHub tabs. Attended by design.",
  steps: [
    {
      id: "poll-copilot-tasks",
      type: "poll-copilot-tasks",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
      },
    },
    {
      id: "read-pr-diff",
      type: "read-pr-diff",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
        prNumber: { source: "runtime", fieldKey: "prNumber" },
      },
    },
    {
      id: "review-pull-request",
      type: "review-pull-request",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
        prNumber: { source: "runtime", fieldKey: "prNumber" },
        verdict: { source: "runtime", fieldKey: "verdict" },
        body: { source: "runtime", fieldKey: "reviewComment" },
      },
    },
    {
      id: "merge-pull-request",
      type: "merge-pull-request",
      bindings: {
        repo: { source: "runtime", fieldKey: "repo" },
        prNumber: { source: "runtime", fieldKey: "prNumber" },
        method: { source: "runtime", fieldKey: "method" },
      },
    },
  ],
};
