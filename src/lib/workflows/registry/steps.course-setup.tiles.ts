// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listCourseHubAction,
  createCourseHubAction,
  fetchIcsFeedAction,
  saveInstitutionFieldsAction,
} from "@/app/actions";
import {
  type StepDefinition,
  type StepRunResult,
} from "@/lib/workflows/registry-helpers";
import { csvToSchedule } from "@/lib/workflows/types";
import { parseIcsEvents } from "@/lib/ics";
import type { InstitutionField } from "@/lib/institution-fields";

export const courseSetupTilesSteps: StepDefinition[] = [
  {
    type: "load-course-tile",
    name: "Load course tile",
    description: "Read the course tile's linked repository, LMS course, and start date so later steps need no separate inputs. Missing pieces surface as warnings.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
      },
      {
        key: "confirmMissingRepo",
        label: "Pause when repository is missing",
        type: "boolean",
        required: false,
        help: "Pause with an alert when the tile has no repository so the run can be cancelled.",
      },
      {
        key: "allowMissingRepo",
        label: "Allow a missing repository",
        type: "boolean",
        required: false,
        help: "Proceed without pausing when the tile has no repository - Course Kickoff creates one later.",
      },
    ],
    outputs: [
      { key: "repo", label: "Repository", type: "repo" },
      { key: "course", label: "LMS course", type: "lmsCourse" },
      { key: "startDate", label: "Start date", type: "date" },
      { key: "description", label: "Course description", type: "longtext" },
      { key: "weeks", label: "Number of weeks", type: "number" },
      { key: "tests", label: "Number of tests", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const hubCourseId = String(values.hubCourse ?? "").trim();

      onProgress("Loading course tile...");
      const listR = await listCourseHubAction();
      if ("error" in listR) {
        throw new Error(listR.error);
      }

      const tile = listR.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error("Choose a course tile.");
      }

      const repo = tile.repos[0]?.repo?.trim() ?? "";
      const course = (tile.canvasUrl ?? "").trim();
      const startDate = (tile.startDate ?? "").trim();
      const lms = (tile.lms ?? "").trim();
      const description = (tile.description ?? "").trim();
      const weeks =
        typeof tile.weeks === "number" && Number.isFinite(tile.weeks)
          ? String(tile.weeks)
          : "";
      const tests =
        typeof tile.tests === "number" && Number.isFinite(tile.tests)
          ? String(tile.tests)
          : "";

      // Missing-repo handling defaults to a hard stop: a repo-less tile must
      // never reach the destructive LMS steps with nothing to rebuild. The two
      // opt-in flags relax that - allowMissingRepo skips the pause entirely
      // (Course Kickoff creates the repo later); confirmMissingRepo pauses only
      // when a schedule fallback can actually succeed.
      let repoLine: string;
      let confirmMessage = "";
      if (repo) {
        repoLine = `Repository: ${repo}${
          tile.repos.length > 1 ? ` (first of ${tile.repos.length} linked)` : ""
        }`;
      } else if (String(values.allowMissingRepo ?? "") === "1") {
        repoLine = "Note: no repository linked yet.";
      } else if (String(values.confirmMissingRepo ?? "") === "1") {
        const csvOk = csvToSchedule(tile.csvData ?? "").length > 0;
        const topicsOk = Boolean(
          (tile.description?.trim() || tile.topics?.trim()) &&
            typeof tile.weeks === "number" &&
            Number.isInteger(tile.weeks) &&
            tile.weeks >= 1 &&
            tile.weeks <= 52
        );
        if (!csvOk && !topicsOk) {
          throw new Error(
            "The course tile has no repository and no usable fallback - link a repository, save a Schedule of Topics (CSV), or add topics plus a week count to the tile."
          );
        }
        repoLine =
          "Alert: no repository linked to the tile - repo-driven steps will fall back to the tile's Schedule of Topics or skip.";
        confirmMessage = csvOk
          ? "This tile has no linked repository. Continue to fall back to the tile's saved Schedule of Topics (CSV) for the schedule, or cancel to link a repository first."
          : "This tile has no linked repository. Continue to fall back to a schedule generated from the tile's topics and description, or cancel to link a repository first.";
      } else {
        throw new Error(
          "The course tile has no repository linked - add one on the Courses tab."
        );
      }

      const items = [
        repoLine,
        course
          ? `LMS course: ${course}`
          : "Warning: no LMS course (Canvas URL) on the tile - the LMS steps will be skipped.",
        startDate
          ? `Start date: ${startDate}`
          : "Warning: no start date on the tile - generated assignments will have no deadlines.",
        lms
          ? `LMS: ${lms}`
          : "Warning: no LMS set on the tile - the plain zip downloads instead of an LMS cartridge.",
        description
          ? `Description: ${description.slice(0, 80)}${
              description.length > 80 ? "..." : ""
            }`
          : "Note: no description on the tile - Course Kickoff cannot generate a schedule without it.",
        weeks
          ? `Weeks: ${weeks}`
          : "Note: no weeks on the tile - Course Kickoff needs it to generate a schedule.",
        tests
          ? `Tests: ${tests}`
          : "Note: no tests count on the tile.",
      ];

      const result: StepRunResult = {
        outputs: { repo, course, startDate, description, weeks, tests },
        summary: {
          kind: "list",
          label: `Loaded "${tile.name}"`,
          items,
        },
      };

      if (confirmMessage) {
        result.requireConfirmation = confirmMessage;
      }

      return result;
    },
  },

  {
    type: "create-course-tile",
    name: "Create a course tile",
    description: "Create a new course tile with a name, institution, start date, and LMS type.",
    inputs: [
      { key: "name", label: "Course name", type: "text", required: true },
      { key: "institution", label: "Institution", type: "institution", required: false },
      { key: "startDate", label: "Start date", type: "date", required: false },
      { key: "weeks", label: "Number of weeks", type: "number", required: false },
      { key: "lms", label: "LMS", type: "text", required: false, help: "canvas, blackboard, brightspace, moodle, or none." },
    ],
    outputs: [
      { key: "courseId", label: "Course tile", type: "hubCourse" },
      { key: "created", label: "Created?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const name = String(values.name ?? "").trim();
      if (!name) {
        throw new Error("Provide a course name.");
      }

      onProgress("Checking existing courses...");
      const list = await listCourseHubAction();
      if ("error" in list) {
        throw new Error(list.error);
      }

      const institution = String(values.institution ?? "").trim();
      const nameKey = `${name.trim().toLowerCase()}||${institution.trim().toLowerCase()}`;

      // Check if tile already exists
      for (const tile of list.courses) {
        const tileKey = `${(tile.name ?? "").trim().toLowerCase()}||${(tile.institution ?? "").trim().toLowerCase()}`;
        if (tileKey === nameKey) {
          return {
            outputs: { courseId: tile.id, created: "" },
            summary: { kind: "text", text: `Course tile already exists: ${name}` },
          };
        }
      }

      onProgress("Creating course tile...");

      const lms = String(values.lms ?? "").trim().toLowerCase();
      const lmsType = ["canvas", "blackboard", "brightspace", "moodle"].includes(lms)
        ? lms
        : lms === "none"
          ? null
          : null;

      const created = await createCourseHubAction({
        name,
        institution: institution || undefined,
        startDate: String(values.startDate ?? "").trim() || undefined,
        weeks: values.weeks ? Number(values.weeks) : undefined,
        lms: lmsType,
      });

      if ("error" in created) {
        throw new Error(created.error);
      }

      return {
        outputs: { courseId: created.course.id, created: "1" },
        summary: { kind: "text", text: `Created course tile: ${name}` },
      };
    },
  },

  {
    type: "configure-institution-feeds",
    name: "Configure institution feeds",
    description: "Set up calendar feed URLs (ICS) for an institution to enable deadline detection without LMS API access.",
    inputs: [
      { key: "institution", label: "Institution", type: "institution", required: true },
      { key: "calendarFeedUrl", label: "Calendar feed URLs", type: "longtext", required: true, help: "One ICS feed URL per line (from the LMS calendar's export/subscribe)." },
    ],
    outputs: [
      { key: "configured", label: "Configured?", type: "boolean" },
      { key: "report", label: "Configuration report", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const inst = String(values.institution ?? "").trim();
      if (!inst) {
        throw new Error("Select an institution.");
      }

      const urlsText = String(values.calendarFeedUrl ?? "").trim();
      if (!urlsText) {
        throw new Error("Provide at least one calendar feed URL.");
      }

      const urls = urlsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const invalidUrls = urls.filter((u) => !u.startsWith("http://") && !u.startsWith("https://"));
      if (invalidUrls.length > 0) {
        throw new Error(`Invalid URLs (must start with http:// or https://): ${invalidUrls.join(", ")}`);
      }

      onProgress("Validating feeds...");
      const reportLines: string[] = [];
      let successCount = 0;

      for (const url of urls) {
        try {
          const icsResult = await fetchIcsFeedAction(url);
          if ("error" in icsResult) {
            reportLines.push(`${url}: ${icsResult.error}`);
          } else {
            const events = parseIcsEvents(icsResult.ics);
            reportLines.push(`${url}: ${events.length} events`);
            successCount++;
          }
        } catch (err) {
          reportLines.push(`${url}: ${err instanceof Error ? err.message : "failed to fetch"}`);
        }
      }

      if (successCount === 0) {
        throw new Error("No feeds could be validated. Check the URLs and try again.");
      }

      onProgress("Saving configuration...");

      if (!helpers.getInstitutionFields) {
        throw new Error("Sign in to configure institutions.");
      }

      const getFieldsResult = await helpers.getInstitutionFields(inst);

      // Rebuild field list: keep non-calendarFeedUrl fields, set new calendar fields
      const newFields = getFieldsResult
        .filter((f) => !f.id.startsWith("calendarFeedUrl"))
        .map((f) => ({ ...f }));

      for (let i = 0; i < urls.length; i++) {
        const fieldId = i === 0 ? "calendarFeedUrl" : `calendarFeedUrl${i + 1}`;
        const fieldLabel = i === 0 ? "Calendar feed (.ics)" : `Calendar feed ${i + 1} (.ics)`;
        newFields.push({
          id: fieldId,
          label: fieldLabel,
          type: "url",
          value: urls[i],
        });
      }

      const saveResult = await saveInstitutionFieldsAction(inst, newFields as InstitutionField[]);
      if ("error" in saveResult) {
        throw new Error(saveResult.error);
      }

      const report = reportLines.join("\n");

      return {
        outputs: {
          configured: successCount > 0 ? "1" : "",
          report,
        },
        summary: { kind: "text", text: report },
      };
    },
  },
];
