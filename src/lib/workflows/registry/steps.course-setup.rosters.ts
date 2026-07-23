// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listCourseHubAction,
  updateCourseHubAction,
  listAssignmentTextSubmissionsAction,
  listCourseRosterAction,
  listCoursesByTermAction,
} from "@/app/actions";
import {
  type StepDefinition,
  courseToInputPayload,
} from "@/lib/workflows/registry-helpers";
import type { CourseInput } from "@/lib/supabase/courses";
import { extractGithubHandle } from "@/lib/github-usernames";
import { buildRosterUpdate, mergeCanvasRoster, mergeImportedRoster } from "@/lib/workflows/roster-merge";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { parseGradebookCsv, detectGradebookFormat } from "@/lib/gradebook-csv";

export const courseSetupRosterSteps: StepDefinition[] = [
  {
    type: "link-github-usernames",
    name: "Link GitHub usernames to roster",
    description: "Read a Canvas assignment where students submitted their GitHub username as text, write the course tile's roster, and link each username to the student name on the tile.",
    inputs: [
      {
        key: "course",
        label: "Canvas course",
        type: "lmsCourse",
        required: true,
        help: "The Canvas course with the assignment.",
      },
      {
        key: "assignment",
        label: "Assignment (URL)",
        type: "text",
        required: true,
        help: "The Canvas assignment where students submitted their GitHub username (its URL contains /assignments/<id>).",
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
        help: "The tile whose roster and GitHub links to write.",
      },
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
      },
    ],
    outputs: [
      { key: "roster", label: "Roster", type: "longtext" },
      { key: "linked", label: "Linked", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const courseUrl = String(values.course ?? "").trim();
      if (!courseUrl) {
        throw new Error("Select a Canvas course.");
      }
      const courseId = parseCanvasCourseId(courseUrl);
      if (!courseId) {
        throw new Error("The course URL must contain a course id.");
      }

      const assignmentUrl = String(values.assignment ?? "").trim();
      if (!assignmentUrl) {
        throw new Error("Paste the assignment URL.");
      }
      const assignmentMatch = assignmentUrl.match(/\/assignments\/(\d+)/);
      if (!assignmentMatch || !assignmentMatch[1]) {
        throw new Error("The assignment URL must contain /assignments/<id>.");
      }
      const assignmentId = assignmentMatch[1];

      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || "";
      if (!inst) {
        throw new Error("Select an institution.");
      }

      onProgress("Loading submissions...");
      const subResult = await listAssignmentTextSubmissionsAction(inst, courseId, assignmentId);
      if ("error" in subResult) {
        throw new Error(subResult.error);
      }

      const okRows: Array<{
        student: string;
        canvasUserId: string;
        username: string;
      }> = [];
      const ambiguousNotes: string[] = [];

      for (const s of subResult.submissions) {
        const { handle, ok } = extractGithubHandle(s.submittedText);
        if (ok) {
          okRows.push({
            student: s.name,
            canvasUserId: String(s.userId),
            username: handle,
          });
        } else if (handle) {
          ambiguousNotes.push(`${s.name}: "${s.submittedText}"`);
        }
      }

      onProgress("Loading course tile...");
      const listResult = await listCourseHubAction();
      if ("error" in listResult) {
        throw new Error(listResult.error);
      }

      const tileId = String(values.hubCourse ?? "").trim();
      const tile = listResult.courses.find((c) => c.id === tileId);
      if (!tile) {
        throw new Error("Could not find the course tile.");
      }

      if (okRows.length === 0) {
        const ambiguousNote = ambiguousNotes.length ? ` (${ambiguousNotes.length} ambiguous submission(s) need manual review.)` : "";
        return {
          outputs: { roster: tile.roster ?? "", linked: "0" },
          summary: {
            kind: "text",
            text: `Found no clean GitHub usernames in submissions; the tile was not changed.${ambiguousNote}`,
          },
        };
      }

      onProgress("Building roster...");
      const updateResult = buildRosterUpdate({
        submissions: okRows,
        existingStudentRepos: tile.studentRepos ?? [],
      });

      onProgress("Saving roster...");
      const writeResult = await updateCourseHubAction(tile.id, {
        ...courseToInputPayload(tile),
        roster: updateResult.roster,
        studentRepos: updateResult.studentRepos,
      });

      if ("error" in writeResult) {
        throw new Error(writeResult.error);
      }

      const allNotes = [...updateResult.conflicts, ...ambiguousNotes];
      const conflictSummary = allNotes.length ? ` Needs review: ${allNotes.join("; ")}` : "";

      return {
        outputs: { roster: updateResult.roster, linked: String(updateResult.linked) },
        summary: {
          kind: "text",
          text: `Linked ${updateResult.linked} GitHub username(s) to ${tile.name}.${conflictSummary}`,
        },
      };
    },
  },

  {
    type: "fetch-course-roster",
    name: "Fetch the course roster",
    description: "Pull an LMS course's enrolled students (names and login ids) into a roster, to feed repo or messaging fan-out.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "roster", label: "Roster", type: "longtext" },
      { key: "count", label: "Students", type: "number" },
      { key: "hasStudents", label: "Has students", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const url = String(values.course ?? "").trim();
      if (!url) throw new Error("Select an LMS course.");
      const courseId = parseCanvasCourseId(url);
      if (!courseId) throw new Error("The course URL must contain a course id.");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || "";
      if (!inst) throw new Error("Select an institution.");
      onProgress("Loading roster...");
      const r = await listCourseRosterAction(inst, courseId);
      if ("error" in r) throw new Error(r.error);
      const rosterLines = r.students.map((s) => `${s.name} | ${s.loginId}`);
      const rosterText = rosterLines.join("\n");
      const items = r.students.length > 0 ? r.students.map((s) => s.name) : ["(none)"];
      return {
        outputs: { roster: rosterText, count: r.students.length, hasStudents: r.students.length > 0 ? "1" : "" },
        summary: { kind: "list", label: `${r.students.length} student(s)`, items },
      };
    },
  },

  {
    type: "sync-course-tiles-from-lms",
    name: "Sync course tiles from the LMS",
    description:
      "For each selected course tile with a Canvas link, pull what the LMS knows - course code, term, start date, and the student roster - and fill in ONLY the tile fields that are empty. Existing values are never overwritten and roster merging preserves GitHub username links and repo bindings.",
    inputs: [
      {
        key: "courses",
        label: "Course tiles",
        type: "hubCourseList",
        required: true,
        help: "One, several, or all course tiles.",
      },
      {
        key: "includeRoster",
        label: "Pull rosters?",
        type: "boolean",
        required: false,
        help: "Also merge each course's student roster into the tile.",
      },
    ],
    outputs: [
      { key: "report", label: "Report", type: "longtext" },
      { key: "updated", label: "Tiles updated", type: "number" },
      { key: "hasUpdated", label: "Any updated?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const includeRoster = String(values.includeRoster ?? "") === "1";
      type LmsTermCourse = {
        id: string;
        name: string;
        courseCode: string | null;
        termName: string | null;
        startAt: string | null;
      };
      const termCoursesByInst = new Map<string, Map<string, LmsTermCourse>>();
      const reportLines: string[] = [];
      let updated = 0;

      for (const id of ids) {
        const tile = hub.courses.find((c) => c.id === id);
        if (!tile) {
          reportLines.push(`${id}: course tile not found - skipped`);
          continue;
        }

        try {
          onProgress(`Syncing ${tile.name}...`);

          const courseId = parseCanvasCourseId(tile.canvasUrl ?? "");
          if (!courseId) {
            reportLines.push(`${tile.name}: no LMS link - skipped`);
            continue;
          }

          const inst = (tile.institution ?? "").trim().toUpperCase();
          if (!inst) {
            reportLines.push(`${tile.name}: no institution on the tile - skipped`);
            continue;
          }

          if (!termCoursesByInst.has(inst)) {
            const coursesResult = await listCoursesByTermAction(inst, "");
            if ("error" in coursesResult) {
              reportLines.push(`${tile.name}: failed to fetch courses from ${inst} - ${coursesResult.error}`);
              continue;
            }
            const courseMap = new Map<string, LmsTermCourse>();
            for (const row of coursesResult.courses) {
              if (row.id) {
                courseMap.set(row.id, row);
              }
            }
            termCoursesByInst.set(inst, courseMap);
          }

          const courseMap = termCoursesByInst.get(inst)!;
          const lmsRow = courseMap.get(courseId);

          const overrides: Partial<CourseInput> = {};

          if (!tile.courseCode && lmsRow?.courseCode) {
            overrides.courseCode = lmsRow.courseCode;
          }
          if (!tile.term && lmsRow?.termName) {
            overrides.term = lmsRow.termName;
          }
          if (!tile.startDate && lmsRow?.startAt) {
            overrides.startDate = lmsRow.startAt.slice(0, 10);
          }
          if (!tile.lms && tile.canvasUrl) {
            overrides.lms = "canvas";
          }

          let addedStudents = 0;
          if (includeRoster) {
            try {
              const rosterResult = await listCourseRosterAction(inst, courseId);
              if ("error" in rosterResult) {
                reportLines.push(
                  `${tile.name}: failed to fetch roster - ${rosterResult.error}`
                );
              } else {
                const merged = mergeCanvasRoster(
                  tile.studentRepos ?? [],
                  rosterResult.students.map((s) => ({
                    id: s.id,
                    name: s.name,
                  }))
                );
                if (merged.added > 0) {
                  addedStudents = merged.added;
                  overrides.studentRepos = merged.studentRepos;
                  overrides.roster = merged.roster;
                }
              }
            } catch (err) {
              reportLines.push(
                `${tile.name}: roster sync failed - ${
                  err instanceof Error ? err.message : String(err)
                }`
              );
            }
          }

          if (Object.keys(overrides).length > 0) {
            const updatePayload = {
              ...courseToInputPayload(tile),
              ...overrides,
            };
            const updateResult = await updateCourseHubAction(id, updatePayload);
            if ("error" in updateResult) {
              throw new Error(updateResult.error);
            }

            const fields = Object.keys(overrides).join(", ");
            const added = addedStudents > 0 ? ` +${addedStudents} student(s)` : "";
            reportLines.push(`${tile.name}: filled ${fields}${added}`);
            updated++;
          } else {
            reportLines.push(`${tile.name}: already complete`);
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
          report,
          updated: String(updated),
          hasUpdated: updated > 0 ? "1" : "",
        },
        summary: { kind: "text", text: report },
      };
    },
  },

  {
    type: "import-roster-from-csv",
    name: "Import roster from CSV",
    description: "Parse a roster from a CSV file and merge it into a course tile's student roster.",
    inputs: [
      { key: "roster", label: "Roster CSV", type: "uploads", required: true, help: "Upload the .csv/.txt/.tsv roster file." },
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: true, help: "The course tile to merge the roster into." },
    ],
    outputs: [
      { key: "added", label: "Students added", type: "number" },
      { key: "matched", label: "Students matched", type: "number" },
      { key: "total", label: "Total students", type: "number" },
      { key: "report", label: "Import report", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const files = Array.isArray(values.roster) ? (values.roster as File[]) : [];
      if (files.length === 0) {
        throw new Error("Upload the roster CSV file.");
      }

      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) {
        throw new Error("Select a course tile.");
      }

      onProgress("Loading course...");
      const list = await listCourseHubAction();
      if ("error" in list) {
        throw new Error(list.error);
      }

      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error("Course tile not found.");
      }

      onProgress("Parsing roster...");
      const csv = await files[0].text();

      let students: Array<{ name: string; email?: string; externalId?: string }> = [];

      // Try parsing as gradebook first
      const headerLine = csv.split("\n")[0];
      const format = detectGradebookFormat(headerLine.split(/[,\t]/).map((s) => s.trim()));

      if (format !== "unknown") {
        const parsed = parseGradebookCsv(csv);
        students = parsed.students.map((s) => ({
          name: s.name,
          email: s.email,
          externalId: s.externalId,
        }));
      } else {
        // Plain CSV with name/email heuristics and header detection
        const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
        let startIndex = 0;

        // Detect and skip header row: if first row looks like column labels
        if (lines.length > 0) {
          const firstLineParts = lines[0].split(/[,\t]/).map((p) => p.trim());
          const looksLikeHeader =
            (firstLineParts.some((p) => /^name$/i.test(p) || /^email$/i.test(p))) &&
            (!firstLineParts[1] || !firstLineParts[1].includes("@"));
          if (looksLikeHeader) {
            startIndex = 1;
          }
        }

        for (let i = startIndex; i < lines.length; i++) {
          const parts = lines[i].split(/[,\t]/).map((p) => p.trim());
          if (parts.length >= 1) {
            students.push({
              name: parts[0],
              email: parts[1]?.includes("@") ? parts[1] : undefined,
            });
          }
        }
      }

      if (students.length === 0) {
        throw new Error("No students found in the roster file.");
      }

      onProgress("Merging roster...");
      const merged = mergeImportedRoster(tile.studentRepos ?? [], students);

      const updateResult = await updateCourseHubAction(hubCourseId, {
        ...courseToInputPayload(tile),
        studentRepos: merged.studentRepos,
        roster: merged.roster,
      });

      if ("error" in updateResult) {
        throw new Error(updateResult.error);
      }

      const reportLines: string[] = [];
      reportLines.push(`Added: ${merged.added}`);
      reportLines.push(`Matched: ${merged.matched}`);
      reportLines.push(`Total: ${merged.studentRepos.length}`);

      const report = reportLines.join("\n");

      return {
        outputs: {
          added: String(merged.added),
          matched: String(merged.matched),
          total: String(merged.studentRepos.length),
          report,
        },
        summary: { kind: "text", text: report },
      };
    },
  },
];
