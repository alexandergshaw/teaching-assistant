// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  generateSchedulePlanAction,
  generateSchedulePlanFromRepoAction,
  listCourseHubAction,
  listCoursesByTermAction,
  listCourseAssignmentDueDatesAction,
  listConfiguredInstitutionsAction,
  listAssignmentDueDatesByUrlAction,
  listInstitutionsWithFeedsAction,
  fetchIcsFeedAction,
  listInstitutionFeedUrlsAction,
} from "@/app/actions";
import {
  type StepDefinition,
  resolveModulesAhead,
  resolveTileCurrentWeek,
  loadTileWeekTopic,
} from "@/lib/workflows/registry-helpers";
import { parseIcsEvents } from "@/lib/ics";
import { filterUpcoming, formatDeadlineReport, type DeadlineSection } from "@/lib/workflows/deadline-report";
import { planningGeneratorSteps } from "@/lib/workflows/registry/steps.planning-generators";
import { scheduleToCsv, csvToSchedule } from "@/lib/workflows/types";
import { courseProgressStatus } from "@/lib/week-numbering";
import { parseTocChapters, validateScheduleAlignment, formatBalanceSummary } from "@/lib/workflows/source-alignment";

export const planningSteps: StepDefinition[] = [
  {
    type: "generate-schedule",
    name: "Generate course schedule",
    description: "Create a structured course schedule with topics and assignments",
    inputs: [
      {
        key: "description",
        label: "Course description",
        type: "longtext",
        required: true,
      },
      {
        key: "weeks",
        label: "Number of weeks",
        type: "number",
        required: true,
      },
      {
        key: "tests",
        label: "Number of tests",
        type: "number",
        required: true,
      },
      {
        key: "context",
        label: "Additional context (optional)",
        type: "longtext",
        required: false,
        help: "Steers the generated schedule (tone, emphases, constraints, course-specific facts).",
      },
      {
        key: "sourceMaterial",
        label: "Source material (optional)",
        type: "longtext",
        required: false,
        help: "Name the primary source (textbook, course module, etc.) and paste its table of contents or chapter list. The schedule maps weeks onto it, balancing chapters across weeks automatically, and names covered chapters in each week. Include the platform URL to enable link embedding in the LMS integration step. A bare URL or short citation with no chapter list triggers one web search for the source's official table of contents before falling back to name-only. Instructor context above overrides this policy where it speaks (e.g. \"no exam weeks\").",
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Fallback only: when Source material is blank, the tile's textbook field is used as a name-only source (no chapter alignment).",
      },
    ],
    outputs: [
      { key: "schedule", label: "Course schedule", type: "schedule" },
      { key: "courseTitle", label: "Course title", type: "text" },
      { key: "weeks", label: "Number of weeks", type: "number" },
      {
        key: "resolvedSourceMaterial",
        label: "Resolved source material",
        type: "longtext",
      },
    ],
    run: async (values, helpers, onProgress) => {
      const description = String(values.description);
      const weeks = Number(values.weeks);
      const tests = Number(values.tests);

      if (!description.trim()) {
        throw new Error(
          "Provide a course description (Course Kickoff reads it from the course tile)."
        );
      }

      if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
        throw new Error(
          "Provide a valid number of weeks (1-52). Course Kickoff reads it from the course tile."
        );
      }

      if (!Number.isInteger(tests) || tests < 0) {
        throw new Error(
          "Provide a valid number of tests (0 or more). Course Kickoff reads it from the course tile."
        );
      }

      const context = String(values.context ?? "").trim() || undefined;
      let sourceMaterial = String(values.sourceMaterial ?? "").trim();

      // Fallback: an empty sourceMaterial falls back to the course tile's
      // textbook field, used as a name-only source (weaker grounding - see
      // the balance note appended below, which degrades the same way for any
      // sourceMaterial with no parseable chapter list).
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!sourceMaterial && hubCourseId) {
        const tileList = await listCourseHubAction();
        if (!("error" in tileList)) {
          const tile = tileList.courses.find((c) => c.id === hubCourseId);
          const textbook = (tile?.textbook ?? "").trim();
          if (textbook) sourceMaterial = textbook;
        }
      }

      onProgress("Generating schedule...");
      const r = await generateSchedulePlanAction(
        description,
        weeks,
        tests,
        helpers.provider,
        context,
        sourceMaterial || undefined
      );

      if ("error" in r) {
        throw new Error(r.error);
      }

      // Post-generation alignment check (AC1b): parse the source's chapter
      // list and compare it against what the returned schedule actually
      // covers, so a mismatch is a summary note - never silent. The tier
      // reported mirrors how the action grounded the schedule:
      // - a pasted TOC aligns directly ("aligned (pasted TOC)");
      // - a URL/short citation with no pasted TOC may have been grounded by
      //   one web-search-derived TOC instead (r.derivedToc) -
      //   ("aligned (derived TOC - N chapters, M sources)"), with the
      //   derived-TOC sources listed for transparency;
      // - anything else (including a derivation miss, or the tile.textbook
      //   fallback when it is a bare citation) degrades to a name-only note.
      let notes: string | undefined;
      if (sourceMaterial) {
        const pastedChapters = parseTocChapters(sourceMaterial);
        if (pastedChapters.length > 0) {
          const balance = formatBalanceSummary(validateScheduleAlignment(r.schedule, pastedChapters));
          notes = `aligned (pasted TOC) | ${balance}`;
        } else if (r.derivedToc?.trim()) {
          const derivedChapters = parseTocChapters(r.derivedToc);
          const balance = formatBalanceSummary(validateScheduleAlignment(r.schedule, derivedChapters));
          const sources = r.derivedSources ?? [];
          notes = `aligned (derived TOC - ${derivedChapters.length} chapters, ${sources.length} sources) | ${balance}`;
          if (sources.length > 0) {
            notes += "\nDerived-TOC sources:\n" + sources.map((s) => `- ${s.title}: ${s.uri}`).join("\n");
          }
        } else {
          notes = "name-only | Source material has no parseable chapter list - schedule generated with name-only grounding (no chapter alignment to verify).";
        }
      }

      // Fed forward to the lecture-materials-from-schedule step (see
      // NO_CODE_KICKOFF's binding to this output) so a derived TOC grounds
      // that step's aligned prompt branch too, without a second search call:
      // the derived TOC when one was found, otherwise the same sourceMaterial
      // this step used (a pasted TOC or a name-only citation) unchanged.
      const resolvedSourceMaterial = r.derivedToc?.trim() ? r.derivedToc : sourceMaterial;

      const csv = scheduleToCsv(r.schedule);
      return {
        outputs: {
          schedule: r.schedule,
          courseTitle: r.courseTitle,
          weeks: r.schedule.length,
          resolvedSourceMaterial,
        },
        summary: {
          kind: "schedule",
          courseTitle: r.courseTitle,
          schedule: r.schedule,
          csv,
          notes,
        },
      };
    },
  },

  {
    type: "schedule-from-repo",
    name: "Generate schedule from repo",
    description: "Derive the week-by-week schedule from the repository's actual assignment folders.",
    inputs: [
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: true,
      },
      {
        key: "weeks",
        label: "Number of weeks",
        type: "number",
        required: false,
        help: "Leave blank to match the repo's assignments",
      },
      {
        key: "tests",
        label: "Number of tests",
        type: "number",
        required: false,
      },
      {
        key: "description",
        label: "Course description",
        type: "longtext",
        required: false,
        help: "Steers the generated topics and summaries.",
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Used for the Schedule of Topics fallback when the repository is blank.",
      },
    ],
    outputs: [
      { key: "schedule", label: "Course schedule", type: "schedule" },
      { key: "courseTitle", label: "Course title", type: "text" },
      { key: "weeks", label: "Number of weeks", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      const rawWeeks = String(values.weeks ?? "").trim();
      const weeksOrNull = rawWeeks ? Number(rawWeeks) : null;
      const rawTests = String(values.tests ?? "").trim();
      const testsOrNull = rawTests ? Number(rawTests) : null;

      // Normal path: repo is provided
      if (repo) {
        onProgress("Generating schedule from repository...");
        const r = await generateSchedulePlanFromRepoAction(
          repo,
          weeksOrNull,
          testsOrNull,
          helpers.provider,
          String(values.description ?? "").trim() || undefined
        );

        if ("error" in r) {
          throw new Error(r.error);
        }

        const csv = scheduleToCsv(r.schedule);
        return {
          outputs: {
            schedule: r.schedule,
            courseTitle: r.courseTitle,
            weeks: r.schedule.length,
          },
          summary: {
            kind: "schedule",
            courseTitle: r.courseTitle,
            schedule: r.schedule,
            csv,
          },
        };
      }

      // Fallback path: repo is empty, use hubCourse
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) {
        throw new Error(
          "Provide a repository or select a course tile for the Schedule of Topics fallback."
        );
      }

      onProgress("Loading course tile...");
      const listR = await listCourseHubAction();
      if ("error" in listR) {
        throw new Error(listR.error);
      }

      const tile = listR.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error(
          "The course tile could not be found. Provide a repository instead."
        );
      }

      // Fallback 1: CSV data on the tile
      if (tile.csvData?.trim()) {
        onProgress("Loading schedule from tile...");
        const schedule = csvToSchedule(tile.csvData);
        if (schedule.length > 0) {
          const csv = scheduleToCsv(schedule);
          // Gapped Schedules of Topics keep their real week numbers, so the
          // module count must cover the highest week, not the row count.
          const weeks = Math.max(...schedule.map((w) => w.week));
          return {
            outputs: {
              schedule,
              courseTitle: tile.name || "Course",
              weeks,
            },
            summary: {
              kind: "schedule",
              courseTitle: tile.name || "Course",
              schedule,
              csv,
            },
          };
        }
      }

      // Fallback 2: Generate from topics or description
      if (tile.description?.trim() || tile.topics?.trim()) {
        const descriptionText = [
          tile.description?.trim(),
          tile.topics?.trim()
            ? "Topics, one per line:\n" + tile.topics.trim()
            : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        const tileWeeks =
          typeof tile.weeks === "number" && Number.isFinite(tile.weeks)
            ? tile.weeks
            : null;
        const tileTests =
          typeof tile.tests === "number" &&
          Number.isInteger(tile.tests) &&
          tile.tests >= 0
            ? tile.tests
            : null;

        const weeksForGen = weeksOrNull ?? tileWeeks;

        if (
          weeksForGen === null ||
          !Number.isInteger(weeksForGen) ||
          weeksForGen < 1 ||
          weeksForGen > 52
        ) {
          throw new Error(
            "No repository and no saved Schedule of Topics - set the number of weeks on the tile to generate from topics."
          );
        }

        const testsForGen = testsOrNull ?? tileTests ?? 0;

        onProgress("Generating schedule from topics...");
        const r = await generateSchedulePlanAction(
          descriptionText,
          weeksForGen,
          testsForGen,
          helpers.provider
        );

        if ("error" in r) {
          throw new Error(r.error);
        }

        // There is no repository for slugs to reference, so drop the
        // LLM-generated assignmentSlug values; otherwise downstream steps
        // would emit "read the README in folder ..." for a codebase-less tile.
        const schedule = r.schedule.map((w) => ({
          ...w,
          assignmentSlug: null,
        }));

        const csv = scheduleToCsv(schedule);
        return {
          outputs: {
            schedule,
            courseTitle: r.courseTitle,
            weeks: schedule.length,
          },
          summary: {
            kind: "schedule",
            courseTitle: r.courseTitle,
            schedule,
            csv,
          },
        };
      }

      // Fallback 3: nothing available
      throw new Error(
        "The tile has no repository, no saved Schedule of Topics (CSV), and no topics - link a repository or add a schedule to the tile."
      );
    },
  },

  {
    type: "course-progress",
    name: "Find the current week and module",
    description:
      "Work out which week a course is currently in from its start date, and the matching module/topic from the course schedule. Outputs feed later steps (e.g. draft an announcement for the current module).",
    inputs: [
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: true },
      {
        key: "modulesAhead",
        label: "Modules ahead",
        type: "moduleOffset",
        required: false,
        help: "How many modules past the current one to target. 0 or blank = the current module.",
      },
    ],
    outputs: [
      { key: "week", label: "Current week", type: "number" },
      { key: "moduleName", label: "Current module", type: "text" },
      { key: "topic", label: "Current topic", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "inProgress", label: "Course in progress", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) throw new Error("Choose a course tile.");

      onProgress("Reading the course...");
      const list = await listCourseHubAction();
      if ("error" in list) throw new Error(list.error);
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) throw new Error("Course tile not found.");

      const weekResolution = await resolveTileCurrentWeek(tile, helpers);
      if ("skip" in weekResolution) {
        throw new Error(`"${tile.name}" has no start date set - add one on the course tile first.`);
      }
      const rawWeek = weekResolution.rawWeek;
      const weekSource = weekResolution.source;
      const status = courseProgressStatus(rawWeek, tile.weeks);

      // Apply modulesAhead offset
      const modulesAhead = resolveModulesAhead(values);
      let effectiveWeek = rawWeek + modulesAhead;
      let clamped = false;
      if (tile.weeks && tile.weeks > 0) {
        if (effectiveWeek > tile.weeks) {
          effectiveWeek = tile.weeks;
          clamped = true;
        }
      }

      // Topic for the target week - export-first fallback to CSV then topics list.
      let topic = "";
      const weekTopic = await loadTileWeekTopic(tile, effectiveWeek, helpers);
      if (!("skip" in weekTopic)) {
        topic = weekTopic.topic;
      }
      const totalLabel = tile.weeks && tile.weeks > 0 ? ` of ${tile.weeks}` : "";
      const sourceNote = weekSource === "deadlines" ? " (week from module deadlines)" : " (week from start date)";

      let moduleName: string;
      let summaryText: string;
      if (status === "not-started") {
        moduleName = "Not started";
        summaryText = `${tile.name} has not started yet${tile.startDate ? ` (starts ${tile.startDate})` : ""}.`;
      } else if (status === "complete") {
        moduleName = "Complete";
        summaryText = `${tile.name} has finished${tile.weeks ? ` (${tile.weeks} week(s))` : ""}.`;
      } else {
        moduleName = `Module ${String(effectiveWeek).padStart(2, "0")}${topic ? `: ${topic}` : ""}`;
        let targetingNote = "";
        if (modulesAhead > 0) {
          targetingNote = clamped ? ` (targeting ${modulesAhead} module(s) ahead - clamped to the final module)` : ` (targeting ${modulesAhead} module(s) ahead)`;
        }
        summaryText = `${tile.name} is in week ${effectiveWeek}${totalLabel}${topic ? ` - ${topic}` : ""}${sourceNote}${targetingNote}.`;
      }

      return {
        outputs: {
          week: status === "not-started" ? 0 : effectiveWeek,
          moduleName,
          topic,
          status,
          inProgress: status === "in-progress" ? "1" : "",
        },
        summary: { kind: "text", text: summaryText },
      };
    },
  },

  {
    type: "resolve-week-topic",
    name: "Resolve the week's topic",
    description:
      "Find what a course teaches in a given week by checking the sources in priority order: the live LMS, then the course's LMS export, then the tile's schedule CSV, then its topics list. Exposes which source answered so later steps can branch on it - gate follow-ups on Found? like the rubric fallback steps.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
      },
      {
        key: "week",
        label: "Week (optional)",
        type: "number",
        required: false,
        help: "Absolute week number. Leave blank to use the course's current week.",
      },
      {
        key: "offset",
        label: "Week offset",
        type: "moduleOffset",
        required: false,
        help: "Added when Week is blank: 0 = this week (default), 1 = next week.",
      },
      {
        key: "lookahead",
        label: "How far ahead",
        type: "lookahead",
        required: false,
        help: "Used when Week and Week offset are blank: whole weeks ahead = days / 7 rounded up.",
      },
    ],
    outputs: [
      { key: "topic", label: "Topic", type: "text" },
      { key: "summary", label: "Summary", type: "longtext" },
      { key: "week", label: "Week", type: "number" },
      { key: "source", label: "Source", type: "text" },
      { key: "found", label: "Found?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) throw new Error("Choose a course tile.");

      onProgress("Reading the course...");
      const list = await listCourseHubAction();
      if ("error" in list) throw new Error(list.error);
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) throw new Error("Course tile not found.");

      // Determine the target week: explicit week > offset > lookahead-derived offset > default current week
      let targetWeek: number;
      const weekInput = Number(values.week ?? "");
      if (Number.isFinite(weekInput) && weekInput >= 1) {
        targetWeek = Math.trunc(weekInput);
      } else {
        const weekResolution = await resolveTileCurrentWeek(tile, helpers);
        if ("skip" in weekResolution) {
          // Not-started/no start date - return status reason
          return {
            outputs: {
              topic: "",
              summary: "No start date set on the course tile.",
              week: "0",
              source: "",
              found: "",
            },
            summary: {
              kind: "text" as const,
              text: "No start date set on the course tile.",
            },
          };
        }
        const rawWeek = weekResolution.rawWeek;
        const status = courseProgressStatus(rawWeek, tile.weeks);
        const displayWeek = tile.weeks && tile.weeks > 0 ? Math.min(rawWeek, tile.weeks) : rawWeek;
        if (status === "not-started" || status === "complete") {
          // Return status reason
          const statusText = status === "not-started" ? "Not started" : "Complete";
          return {
            outputs: {
              topic: "",
              summary: statusText,
              week: "0",
              source: "",
              found: "",
            },
            summary: {
              kind: "text" as const,
              text: statusText,
            },
          };
        }
        const offsetRaw = String(values.offset ?? "").trim();
        let offsetVal: number;
        if (offsetRaw !== "") {
          offsetVal = Math.trunc(Number(offsetRaw) || 0);
        } else {
          const lookaheadRaw = String(values.lookahead ?? "").trim();
          if (lookaheadRaw !== "" && Number.isFinite(Number(lookaheadRaw))) {
            const daysAhead = Math.floor(Number(lookaheadRaw));
            offsetVal = Math.max(1, Math.ceil(daysAhead / 7));
          } else {
            offsetVal = 0;
          }
        }
        targetWeek = displayWeek + offsetVal;
      }

      const weekTopic = await loadTileWeekTopic(tile, targetWeek, helpers);
      if ("skip" in weekTopic) {
        return {
          outputs: {
            topic: "",
            summary: weekTopic.skip,
            week: String(targetWeek),
            source: "",
            found: "",
          },
          summary: {
            kind: "text" as const,
            text: weekTopic.skip,
          },
        };
      }

      return {
        outputs: {
          topic: weekTopic.topic,
          summary: weekTopic.summary,
          week: String(targetWeek),
          source: weekTopic.source,
          found: "1",
        },
        summary: {
          kind: "text" as const,
          text: `Week ${targetWeek}: ${weekTopic.topic} (from the ${weekTopic.source})`,
        },
      };
    },
  },

  ...planningGeneratorSteps,

  {
    type: "list-upcoming-deadlines",
    name: "List upcoming deadlines",
    description:
      "List every published assignment with a due date inside the next N days across the chosen Canvas courses, or read calendar feeds at institutions with no API access. Feed the list to an announcement draft or a briefing.",
    inputs: [
      { key: "courses", label: "LMS courses", type: "lmsCourseList", required: false, help: "One, several, or all courses. Leave blank to scan every course at every configured institution." },
      { key: "daysAhead", label: "How far ahead", type: "lookahead", required: false, help: "How far ahead to look. Default 7 days." },
      { key: "institution", label: "Institution", type: "institution", required: false, help: "Fallback for relative /courses/<id> URLs; each full course URL resolves its own institution automatically." },
    ],
    outputs: [
      { key: "deadlines", label: "Upcoming deadlines", type: "longtext" },
      { key: "count", label: "How many", type: "number" },
      { key: "hasUpcoming", label: "Any upcoming?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const daysAheadRaw = String(values.daysAhead ?? "").trim();
      const daysAhead = Number.isFinite(Number(daysAheadRaw)) && Number(daysAheadRaw) >= 1 ? Math.floor(Number(daysAheadRaw)) : 7;

      const courseLines = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const institutionInput = String(values.institution ?? "").trim();

      const nowMs = Date.now();
      const sections: DeadlineSection[] = [];

      if (courseLines.length === 0) {
        // Blank courses: scan all institutions
        onProgress("Loading configured institutions...");
        const listResult = await listConfiguredInstitutionsAction();
        if ("error" in listResult) {
          throw new Error(listResult.error);
        }
        if (listResult.acronyms.length === 0) {
          throw new Error("No institutions are configured on the server.");
        }

        for (const inst of listResult.acronyms) {
          onProgress(`Scanning ${inst}...`);

          // Fetch courses for this institution
          const coursesResult = await listCoursesByTermAction(inst, "");
          if ("error" in coursesResult) {
            sections.push({ course: inst, error: coursesResult.error, assignments: [] });
            continue;
          }

          // Fetch deadlines for each course
          for (const courseRow of coursesResult.courses) {
            const assignmentsResult = await listCourseAssignmentDueDatesAction(inst, courseRow.id);
            if ("error" in assignmentsResult) {
              sections.push({ course: `${inst} ${courseRow.name}`, error: assignmentsResult.error, assignments: [] });
              continue;
            }

            const filtered = filterUpcoming(assignmentsResult.assignments, nowMs, daysAhead);
            sections.push({
              course: `${inst} ${courseRow.name}`,
              assignments: filtered,
            });
          }
        }

        // Blank courses fallback: scan feed-only institutions
        onProgress("Checking for calendar feeds...");
        const feedsResult = await listInstitutionsWithFeedsAction();
        if (!("error" in feedsResult)) {
          for (const { acronym: inst, feedUrls } of feedsResult.institutions) {
            // Skip institutions already swept via API
            if (listResult.acronyms.includes(inst)) continue;

            // Per feed URL (fail-forward)
            for (const feedUrl of feedUrls) {
              try {
                onProgress(`Fetching calendar feed for ${inst}...`);
                const icsResult = await fetchIcsFeedAction(feedUrl);
                if ("error" in icsResult) {
                  sections.push({ course: `${inst} calendar feed`, error: icsResult.error, assignments: [] });
                  continue;
                }

                const events = parseIcsEvents(icsResult.ics);
                const assignments = events.map((e) => ({
                  name: e.summary,
                  dueAt: e.startsAt,
                }));

                const filtered = filterUpcoming(assignments, nowMs, daysAhead);
                sections.push({
                  course: `${inst} calendar feed`,
                  assignments: filtered,
                });
              } catch (err) {
                sections.push({
                  course: `${inst} calendar feed`,
                  error: err instanceof Error ? err.message : "failed to fetch",
                  assignments: [],
                });
              }
            }
          }
        }
      } else {
        // Courses provided: fetch each by URL
        for (const courseUrl of courseLines) {
          onProgress(`Scanning ${courseUrl}...`);
          const res = await listAssignmentDueDatesByUrlAction(courseUrl, institutionInput || helpers.activeInstitution || undefined);
          if ("error" in res) {
            sections.push({ course: courseUrl, error: res.error, assignments: [] });
            continue;
          }

          const filtered = filterUpcoming(res.assignments, nowMs, daysAhead);
          sections.push({
            course: courseUrl,
            assignments: filtered,
          });
        }
      }

      const report = formatDeadlineReport(sections, daysAhead);

      return {
        outputs: {
          deadlines: report.deadlines,
          count: String(report.count),
          hasUpcoming: report.count > 0 ? "1" : "",
        },
        summary: report.count > 0
          ? { kind: "list", label: `Deadlines in the next ${daysAhead} day(s)`, items: report.items }
          : { kind: "text", text: report.deadlines },
      };
    },
  },

  {
    type: "compose-briefing",
    name: "Compose a briefing",
    description:
      "Stitch up to four text sections into one titled Markdown briefing - deterministic, no AI. Unattended runs save it to the Files tab via the run report.",
    inputs: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "section1", label: "Section 1", type: "longtext", required: false, help: "Sections are included in order; empty ones are skipped." },
      { key: "section2", label: "Section 2", type: "longtext", required: false },
      { key: "section3", label: "Section 3", type: "longtext", required: false },
      { key: "section4", label: "Section 4", type: "longtext", required: false },
    ],
    outputs: [
      { key: "briefing", label: "Briefing", type: "longtext" },
    ],
    run: async (values) => {
      const title = String(values.title ?? "").trim();
      if (!title) {
        throw new Error("Provide a title for the briefing.");
      }

      const sections = [1, 2, 3, 4]
        .map((i) => String(values[`section${i}` as keyof typeof values] ?? "").trim())
        .filter(Boolean);

      const briefing = `# ${title}` + (sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "");

      return {
        outputs: { briefing },
        summary: { kind: "text", text: briefing },
      };
    },
  },

  {
    type: "list-deadlines-from-feed",
    name: "List deadlines from calendar feed",
    description: "Read upcoming events from an institution's calendar feed (ICS) and list those due in the next N days.",
    inputs: [
      { key: "institution", label: "Institution", type: "institution", required: true },
      { key: "daysAhead", label: "How far ahead", type: "lookahead", required: false, help: "How far ahead to look. Default 7 days." },
    ],
    outputs: [
      { key: "deadlines", label: "Upcoming deadlines", type: "longtext" },
      { key: "count", label: "How many", type: "number" },
      { key: "hasUpcoming", label: "Any upcoming?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const inst = String(values.institution ?? "").trim();
      if (!inst) {
        throw new Error("Select an institution.");
      }

      const daysAheadRaw = String(values.daysAhead ?? "").trim();
      const daysAhead = Number.isFinite(Number(daysAheadRaw)) && Number(daysAheadRaw) >= 1 ? Math.floor(Number(daysAheadRaw)) : 7;

      onProgress("Loading calendar feeds...");
      const feedsResult = await listInstitutionFeedUrlsAction(inst);
      if ("error" in feedsResult) {
        throw new Error(feedsResult.error);
      }

      if (feedsResult.feedUrls.length === 0) {
        throw new Error(`No calendar feed is saved for ${inst}. Add one under the institution's fields or run Configure institution feeds.`);
      }

      const nowMs = Date.now();
      const sections: DeadlineSection[] = [];

      for (const feedUrl of feedsResult.feedUrls) {
        try {
          onProgress(`Fetching calendar feed...`);
          const icsResult = await fetchIcsFeedAction(feedUrl);
          if ("error" in icsResult) {
            sections.push({ course: `${inst} calendar feed`, error: icsResult.error, assignments: [] });
            continue;
          }

          const events = parseIcsEvents(icsResult.ics);
          const assignments = events.map((e) => ({
            name: e.summary,
            dueAt: e.startsAt,
          }));

          const filtered = filterUpcoming(assignments, nowMs, daysAhead);
          sections.push({
            course: `${inst} calendar feed`,
            assignments: filtered,
          });
        } catch (err) {
          sections.push({
            course: `${inst} calendar feed`,
            error: err instanceof Error ? err.message : "failed to fetch",
            assignments: [],
          });
        }
      }

      const report = formatDeadlineReport(sections, daysAhead);

      return {
        outputs: {
          deadlines: report.deadlines,
          count: String(report.count),
          hasUpcoming: report.count > 0 ? "1" : "",
        },
        summary: report.count > 0
          ? { kind: "list", label: `Deadlines in the next ${daysAhead} day(s)`, items: report.items }
          : { kind: "text", text: report.deadlines },
      };
    },
  },
];
