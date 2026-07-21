// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listAnnouncementsAction,
  draftAnnouncementAction,
  createAnnouncementAction,
  listCourseHubAction,
  createScheduledAnnouncementAction,
  saveMessageDraftAction,
} from "@/app/actions";
import {
  type StepDefinition,
  parseDayTime,
  resolveTileCurrentWeek,
  loadTileWeekTopic,
} from "@/lib/workflows/registry-helpers";
import { nextLectureWeek } from "@/lib/workflows/next-week";
import type { MessageDraftPayload } from "@/lib/message-drafts";

export const announcementSteps: StepDefinition[] = [
  {
    type: "schedule-lecture-announcement",
    name: "Schedule lecture announcement",
    description: "Schedule the approved recap announcement for two hours after the next class meeting.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
      },
      {
        key: "announcement",
        label: "Announcement text",
        type: "longtext",
        required: false,
      },
      {
        key: "moduleName",
        label: "Module name",
        type: "text",
        required: false,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const announcement = String(values.announcement ?? "").trim();

      if (!announcement) {
        return {
          outputs: {},
          summary: {
            kind: "text",
            text: "Skipped - announcement not approved.",
          },
        };
      }

      const hubCourseId = String(values.hubCourse ?? "").trim();
      const list = await listCourseHubAction();
      if ("error" in list) {
        throw new Error(list.error);
      }
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error("Choose a course tile.");
      }

      const canvasUrl = (tile.canvasUrl ?? "").trim();
      const inst = helpers.activeInstitution || undefined;
      const moduleName = String(values.moduleName ?? "").trim() || "Upcoming module";
      const dayTime = (tile.dayTime ?? "").trim();

      let summaryLine: string;

      if (!canvasUrl) {
        summaryLine = "no LMS course on the tile - announcement skipped";
      } else if (!dayTime) {
        summaryLine = "no Day/Time on the tile - announcement not scheduled";
      } else {
        const parsed = parseDayTime(dayTime);
        if (!parsed) {
          summaryLine = `could not parse Day/Time "${dayTime}" - announcement not scheduled`;
        } else {
          const now = new Date();
          const candidate = new Date(now);
          candidate.setHours(parsed.hour, parsed.minute, 0, 0);
          let found = false;
          for (let i = 0; i < 8; i++) {
            if (
              parsed.days.has(candidate.getDay()) &&
              candidate.getTime() > now.getTime()
            ) {
              found = true;
              break;
            }
            candidate.setDate(candidate.getDate() + 1);
          }
          if (!found) {
            summaryLine = `could not find a future class meeting for Day/Time "${dayTime}" within 8 days - announcement not scheduled`;
          } else {
            const postAt = new Date(candidate.getTime() + 2 * 60 * 60 * 1000);
            try {
              onProgress("Scheduling the recap announcement...");
              const ann = await createScheduledAnnouncementAction(
                canvasUrl,
                `Lecture recap: ${moduleName}`,
                announcement,
                postAt.toISOString(),
                inst
              );
              if ("error" in ann) {
                throw new Error(ann.error);
              }
              summaryLine = `announcement scheduled for ${postAt.toLocaleString()}`;
            } catch (err) {
              summaryLine = `announcement failed: ${
                err instanceof Error ? err.message : "unknown error"
              }`;
            }
          }
        }
      }

      return {
        outputs: {},
        summary: {
          kind: "text",
          text: summaryLine,
        },
      };
    },
  },

  {
    type: "list-announcements",
    name: "List course announcements",
    description: "Read existing LMS announcements (scheduled ones surfaced first) for one, several, or all courses, so a later step can avoid duplicating them.",
    inputs: [
      {
        key: "course",
        label: "LMS courses",
        type: "lmsCourseList",
        required: true,
        help: "One, several, or all courses at the institution.",
      },
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
        help: "Defaults to the active institution.",
      },
    ],
    outputs: [
      { key: "announcements", label: "Announcements", type: "longtext" },
      { key: "hasAnnouncements", label: "Has announcements", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      // Scopeable list input: newline-joined course URLs (a single URL is a
      // one-element list, so pre-scope workflows keep working).
      const courses = String(values.course ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (courses.length === 0) {
        return {
          outputs: { announcements: "", hasAnnouncements: "" },
          summary: { kind: "text", text: "Skipped - no LMS course selected." },
        };
      }

      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      const multi = courses.length > 1;
      const outLines: string[] = [];
      const items: string[] = [];
      let total = 0;

      for (const course of courses) {
        onProgress(`Loading announcements${multi ? ` (${course})` : ""}...`);
        const r = await listAnnouncementsAction(course, inst);
        if ("error" in r) {
          items.push(`${course}: ${r.error}`);
          if (multi) outLines.push(`# ${course} - error: ${r.error}`);
          continue;
        }
        total += r.announcements.length;
        if (multi) outLines.push(`# ${r.courseName}`);
        for (const announcement of r.announcements) {
          const title = announcement.title.trim() || "(untitled)";
          let line = title;
          if (announcement.delayedPostAt && !announcement.postedAt) {
            line += ` (scheduled for ${announcement.delayedPostAt})`;
          }
          outLines.push(line);
          items.push(multi ? `${r.courseName}: ${title}` : title);
        }
      }

      return {
        outputs: { announcements: outLines.join("\n"), hasAnnouncements: total > 0 ? "1" : "" },
        summary: {
          kind: "list",
          label: `${total} announcement(s) across ${courses.length} course(s)`,
          items: items.length > 0 ? items : ["(none)"],
        },
      };
    },
  },

  {
    type: "draft-announcement",
    name: "Draft an announcement",
    description: "Draft a warm, professional course announcement (subject and body) from a short instruction, ready to review or post in a later step.",
    inputs: [
      {
        key: "instruction",
        label: "What should it say?",
        type: "longtext",
        required: true,
      },
    ],
    outputs: [
      { key: "announcementTitle", label: "Announcement title", type: "text" },
      { key: "announcement", label: "Announcement body", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const instruction = String(values.instruction ?? "").trim();
      if (!instruction) {
        throw new Error("Describe what the announcement should say first.");
      }

      onProgress("Drafting announcement...");
      const r = await draftAnnouncementAction(instruction, helpers.provider);

      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: { announcementTitle: r.title, announcement: r.message },
        summary: {
          kind: "text",
          text: `${r.title}\n\n${r.message}`,
        },
      };
    },
  },

  {
    type: "compose-weekly-announcement",
    name: "Compose a weekly announcement",
    description: "Compose a start-of-week announcement (what students will learn, what they will do, upcoming deadlines, and things to be aware of) from the week's module materials.",
    inputs: [
      {
        key: "moduleName",
        label: "Module / week",
        type: "text",
        required: false,
        help: "e.g. bound from Find the current week and module.",
      },
      {
        key: "materials",
        label: "Module materials",
        type: "longtext",
        required: false,
        help: "The week's materials, e.g. bound from Pull current module materials.",
      },
      {
        key: "extraNotes",
        label: "Extra notes (optional)",
        type: "longtext",
        required: false,
        help: "Upcoming deadlines or anything else to be aware of.",
      },
    ],
    outputs: [
      { key: "announcementTitle", label: "Announcement title", type: "text" },
      { key: "announcement", label: "Announcement body", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const moduleName = String(values.moduleName ?? "").trim() || "this week's module";
      const materials = String(values.materials ?? "").trim();
      const extraNotes = String(values.extraNotes ?? "").trim();
      const instruction = [
        `Write a warm, professional start-of-week course announcement for ${moduleName}.`,
        `Organize it into clear sections: what students will learn this week, what they will be doing this week, any upcoming deadlines, and anything else to be aware of.`,
        materials ? `Base it on these module materials:\n${materials}` : "",
        extraNotes ? `Also incorporate these notes (deadlines / things to be aware of):\n${extraNotes}` : "",
      ].filter(Boolean).join("\n\n");
      onProgress("Composing the weekly announcement...");
      const r = await draftAnnouncementAction(instruction, helpers.provider);
      if ("error" in r) throw new Error(r.error);
      return {
        outputs: { announcementTitle: r.title, announcement: r.message },
        summary: { kind: "text", text: `${r.title}\n\n${r.message}` },
      };
    },
  },

  {
    type: "draft-weekly-announcements",
    name: "Draft weekly announcements",
    description: "For every selected course tile, draft kickoff announcements for the coming weeks - what each week covers and what is due - into Drafts > Messages, one per course per week. Nothing posts until you review. The week's topic comes from the live LMS first, then the course's LMS export, then the schedule CSV, then the topics list. All announcements are saved to the course tile and the Files tab.",
    inputs: [
      {
        key: "courses",
        label: "Course tiles",
        type: "hubCourseList",
        required: true,
        help: "One, several, or all course tiles.",
      },
      {
        key: "lookahead",
        label: "How far ahead",
        type: "lookahead",
        required: false,
        help: "How far ahead to prepare. Default 7 days (the coming week); 14 days prepares the next two weeks.",
      },
      {
        key: "extraNotes",
        label: "Extra notes (optional)",
        type: "longtext",
        required: false,
        help: "Folded into every announcement (e.g. campus events, policy reminders).",
      },
    ],
    outputs: [
      { key: "drafted", label: "Drafts saved", type: "number" },
      { key: "hasDrafted", label: "Any drafted?", type: "boolean" },
      { key: "report", label: "Report", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (ids.length === 0) {
        throw new Error("Select at least one course tile.");
      }

      const lookaheadRaw = String(values.lookahead ?? "").trim();
      const daysAhead = Number.isFinite(Number(lookaheadRaw)) && Number(lookaheadRaw) >= 1
        ? Math.floor(Number(lookaheadRaw))
        : 7;
      const weeksAhead = Math.max(1, Math.min(4, Math.ceil(daysAhead / 7)));

      const extraNotes = String(values.extraNotes ?? "").trim();
      const reportLines: string[] = [];
      let drafted = 0;

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      for (const id of ids) {
        const tile = hub.courses.find((c) => c.id === id);
        if (!tile) {
          reportLines.push(`${id}: course tile not found - skipped`);
          continue;
        }

        try {
          onProgress(`Drafting announcements for ${tile.name}...`);

          const weekResolution = await resolveTileCurrentWeek(tile, helpers);
          const nw = nextLectureWeek({
            startDate: tile.startDate,
            weeks: tile.weeks,
            nowMs: Date.now(),
            rawWeek: "skip" in weekResolution ? undefined : weekResolution.rawWeek,
          });

          if ("skip" in nw) {
            reportLines.push(`${tile.name}: skipped - ${nw.skip}.`);
            continue;
          }

          const startWeek = nw.week;
          let sourceNote = "skip" in weekResolution ? "" : (weekResolution.source === "deadlines" ? " (from module deadlines)" : "");
          let tileSuccessCount = 0;
          let tileEndWeek = startWeek + weeksAhead - 1;

          for (let w = 0; w < weeksAhead; w++) {
            const targetWeek = startWeek + w;

            if (tile.weeks && tile.weeks > 0 && targetWeek > tile.weeks) {
              if (w === 0) {
                reportLines.push(`${tile.name}: skipped - target week ${targetWeek} is past course end.`);
              }
              tileEndWeek = targetWeek - 1;
              break;
            }

            try {
              const weekTopic = await loadTileWeekTopic(tile, targetWeek, helpers);
              if ("skip" in weekTopic) {
                if (w === 0) {
                  reportLines.push(`${tile.name}: skipped - ${weekTopic.skip}.`);
                }
                tileEndWeek = targetWeek - 1;
                break;
              }

              const topic = weekTopic.topic;
              const summary = weekTopic.summary;
              if (w === 0) {
                sourceNote = weekTopic.source !== "schedule"
                  ? ` (topic from the ${
                      weekTopic.source === "live"
                        ? "live LMS"
                        : weekTopic.source === "export"
                          ? "LMS export"
                          : "tile's topics list"
                    })`
                  : "";
              }

              const instruction = `Draft a week-ahead kickoff announcement for ${tile.name}. Week ${targetWeek} covers: ${topic}. ${summary}${extraNotes ? ` ${extraNotes}` : ""}`;

              const r = await draftAnnouncementAction(instruction, helpers.provider);
              if ("error" in r) {
                throw new Error(r.error);
              }

              const payload: MessageDraftPayload = {
                kind: "announcement",
                body: r.message,
                title: r.title,
                courseUrl: tile.canvasUrl ?? undefined,
                hubCourseId: tile.id,
                institution: tile.institution ?? undefined,
              };

              const res = await saveMessageDraftAction(
                `Weekly announcement - ${tile.name} week ${targetWeek}`,
                payload,
                helpers.workflowId,
                helpers.workflowName
              );
              if ("error" in res) {
                throw new Error(res.error);
              }

              tileSuccessCount++;
              drafted++;
            } catch (err) {
              reportLines.push(
                `${tile.name}, week ${targetWeek}: ${err instanceof Error ? err.message : "failed"}`
              );
            }
          }

          if (tileSuccessCount > 0) {
            reportLines.push(
              `${tile.name}: drafted announcement${weeksAhead > 1 ? `s for weeks ${startWeek}-${tileEndWeek}` : ` for week ${startWeek}`}${sourceNote}`
            );
          }
        } catch (err) {
          reportLines.push(
            `${tile.name}: ${err instanceof Error ? err.message : "failed"}`
          );
        }
      }

      const report = reportLines.join("\n");
      return {
        outputs: {
          drafted: String(drafted),
          hasDrafted: drafted > 0 ? "1" : "",
          report,
        },
        summary: { kind: "text", text: report },
      };
    },
  },

  {
    type: "post-announcement",
    name: "Post an announcement",
    description: "Publish an announcement to the LMS course (immediately, or scheduled for a future date). Attended-only: wire the title and body from Draft an announcement, or type them in.",
    inputs: [
      {
        key: "course",
        label: "LMS course",
        type: "lmsCourse",
        required: true,
      },
      {
        key: "announcementTitle",
        label: "Title",
        type: "text",
        required: true,
      },
      {
        key: "announcement",
        label: "Body",
        type: "longtext",
        required: true,
      },
      {
        key: "postAt",
        label: "Schedule for",
        type: "date",
        required: false,
        help: "Leave blank to post now; set a future date to schedule.",
      },
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
        help: "Defaults to the active institution.",
      },
    ],
    outputs: [
      { key: "announcementUrl", label: "Announcement URL", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) throw new Error("Select an LMS course to post to.");
      const title = String(values.announcementTitle ?? "").trim();
      const body = String(values.announcement ?? "").trim();
      if (!title || !body) throw new Error("Provide a title and body (wire these from Draft an announcement).");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      const postAt = String(values.postAt ?? "").trim() || undefined;
      onProgress(postAt ? "Scheduling announcement..." : "Posting announcement...");
      const r = await createAnnouncementAction(course, title, body, inst, postAt);
      if ("error" in r) throw new Error(r.error);
      return {
        outputs: { announcementUrl: r.announcement.htmlUrl },
        summary: {
          kind: "link",
          label: postAt ? `Scheduled "${title}"` : `Posted "${title}"`,
          url: r.announcement.htmlUrl,
        },
      };
    },
  },
];
