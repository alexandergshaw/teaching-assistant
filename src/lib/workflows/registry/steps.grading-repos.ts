import {
  listCourseHubAction,
  generateAssignmentRubricAction,
  generateModelAnswerAction,
  gradeRepoAction,
  ingestRepoAction,
  saveGradingDraftAction,
  deleteGradingDraftAction,
  generateFullCreditChecklistAction,
  getInstitutionCountsAction,
  getRepoTreeAction,
  getFileTextAction,
} from "@/app/actions";
import {
  type StepDefinition,
  resolveTileCurrentWeek,
  loadTileWeekTopic,
} from "@/lib/workflows/registry-helpers";
import type { GradingRunEntry, GradeResult } from "@/lib/grade";
import { courseProgressStatus } from "@/lib/week-numbering";

export const gradingRepoSteps: StepDefinition[] = [
  {
    type: "generate-full-credit-checklist",
    name: "Generate a full-credit checklist",
    description: "Produce a short student-facing 'how to earn full credit' checklist from an assignment's instructions and rubric.",
    inputs: [
      { key: "instructions", label: "Assignment instructions", type: "longtext", required: true },
      { key: "rubric", label: "Rubric", type: "longtext", required: false },
    ],
    outputs: [
      { key: "checklist", label: "Checklist", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const instructions = String(values.instructions ?? "").trim();
      if (!instructions) throw new Error("Provide the assignment instructions.");
      const rubric = String(values.rubric ?? "");

      onProgress("Generating checklist...");
      const r = await generateFullCreditChecklistAction(instructions, rubric, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: { checklist: r.checklist },
        summary: { kind: "text", text: r.checklist },
      };
    },
  },

  {
    type: "check-needs-grading",
    name: "Check for work needing grading",
    description: "Count submissions waiting to be graded (and unread messages) for an institution, so a scheduled run can fire only when work is waiting.",
    inputs: [
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
        help: "Defaults to the active institution.",
      },
    ],
    outputs: [
      { key: "needsGrading", label: "Submissions needing grading", type: "number" },
      { key: "unread", label: "Unread messages", type: "number" },
      { key: "hasWork", label: "Has work waiting", type: "boolean" },
      { key: "summary", label: "Summary", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || "";
      if (!inst) {
        throw new Error("Select an institution to check.");
      }

      onProgress("Checking for pending work...");
      const r = await getInstitutionCountsAction([inst]);
      if ("error" in r) {
        throw new Error(r.error);
      }

      const needsGrading = r.counts.reduce((n, c) => n + c.needsGrading, 0);
      const unread = r.counts.reduce((n, c) => n + c.unread, 0);

      return {
        outputs: {
          needsGrading,
          unread,
          hasWork: needsGrading > 0 ? "1" : "",
          summary: `${inst}: ${needsGrading} submission(s) need grading, ${unread} unread message(s)`,
        },
        summary: {
          kind: "text",
          text: `${needsGrading} submission(s) need grading; ${unread} unread message(s).`,
        },
      };
    },
  },

  {
    type: "discard-grading-draft",
    name: "Discard a grading draft",
    description: "Delete a pending grading draft during review triage. Attended-only.",
    inputs: [
      { key: "draftId", label: "Draft id", type: "text", required: true },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const draftId = String(values.draftId ?? "").trim();
      if (!draftId) {
        throw new Error("Provide the grading draft id.");
      }

      onProgress("Discarding draft...");
      const r = await deleteGradingDraftAction(draftId);
      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: {},
        summary: { kind: "text", text: `Discarded grading draft ${draftId}.` },
      };
    },
  },

  {
    type: "generate-model-answer",
    name: "Generate a model answer",
    description: "Write a full-credit model answer for an assignment against its rubric, as an instructor reference.",
    inputs: [
      { key: "instructions", label: "Assignment instructions", type: "longtext", required: true },
      { key: "rubric", label: "Rubric", type: "longtext", required: false },
    ],
    outputs: [
      { key: "modelAnswer", label: "Model answer", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const instructions = String(values.instructions ?? "").trim();
      if (!instructions) {
        throw new Error("Provide the assignment instructions.");
      }

      const rubric = String(values.rubric ?? "");
      onProgress("Writing model answer...");
      const r = await generateModelAnswerAction(instructions, rubric, helpers.provider);
      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: { modelAnswer: r.modelAnswer },
        summary: { kind: "text", text: r.modelAnswer },
      };
    },
  },

  {
    type: "grade-repo",
    name: "Grade a repository",
    description: "AI-grade a single student repository against a rubric. Produces a score and feedback (does not post to the LMS).",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "instructions", label: "Assignment instructions", type: "longtext", required: true },
      { key: "rubric", label: "Rubric", type: "longtext", required: false },
      { key: "branch", label: "Branch", type: "text", required: false },
    ],
    outputs: [
      { key: "gradeSummary", label: "Grade and feedback", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) {
        throw new Error("Provide a repository.");
      }

      const instructions = String(values.instructions ?? "").trim();
      if (!instructions) {
        throw new Error("Provide the assignment instructions.");
      }

      const rubric = String(values.rubric ?? "");
      const branch = String(values.branch ?? "").trim() || undefined;

      onProgress("Grading repository...");
      const r = await gradeRepoAction(repo, instructions, rubric, helpers.provider, branch);
      if ("error" in r) {
        throw new Error(r.error);
      }

      const summaryLines: string[] = [];
      summaryLines.push(r.fullName);
      summaryLines.push("");

      for (const result of r.run.results) {
        summaryLines.push(`Student: ${result.student}`);
        if (result.totalScore) {
          summaryLines.push(`Total Score: ${result.totalScore}`);
        }
        for (const area of result.rubricAreas) {
          if (area.score) {
            summaryLines.push(`${area.area}: ${area.score}`);
          }
        }
        if (result.overallComment) {
          summaryLines.push(`Feedback: ${result.overallComment}`);
        }
        summaryLines.push("");
      }

      const gradeSummary = summaryLines.join("\n").trim();

      return {
        outputs: { gradeSummary },
        summary: { kind: "text", text: gradeSummary },
      };
    },
  },

  {
    type: "batch-grade-repos-to-draft",
    name: "Batch grade student repos to a draft",
    description:
      "Grade every student's repo for the current week against a rubric synthesized from the week's README, and save the results as a reviewable grading draft (postable to Canvas when an assignment URL is given).",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
        help: "Uses the tile's Student repos and current week.",
      },
      {
        key: "week",
        label: "Current week (optional)",
        type: "number",
        required: false,
        help: "Bind from Find the current week and module, or leave blank to derive from the tile's start date.",
      },
      {
        key: "instructionsRepo",
        label: "Instructions repo (optional)",
        type: "repo",
        required: false,
        help: "Repo holding the week's assignment README used to synthesize the rubric. Defaults to the tile's first linked repo.",
      },
      {
        key: "rubric",
        label: "Rubric (optional)",
        type: "longtext",
        required: false,
        help: "Provide a rubric directly instead of synthesizing one from the README.",
      },
      {
        key: "assignmentUrl",
        label: "Canvas assignment URL (optional)",
        type: "text",
        required: false,
        help: "The Canvas assignment these repo grades map to. Provide it to make the draft postable to Canvas.",
      },
      {
        key: "pointsPossible",
        label: "Points possible (optional)",
        type: "number",
        required: false,
      },
    ],
    outputs: [
      { key: "draftId", label: "Draft id", type: "text" },
      { key: "graded", label: "Repos graded", type: "number" },
      { key: "moduleName", label: "Module", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      // Step 1: Load the tile.
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) throw new Error("Choose a course tile.");

      onProgress("Reading the course...");
      const list = await listCourseHubAction();
      if ("error" in list) throw new Error(list.error);
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) throw new Error("Course tile not found.");

      // Step 2: Get student repos.
      const students = (tile.studentRepos ?? []).filter((s) => s.repo && s.repo.trim());
      if (students.length === 0) {
        throw new Error("Add student repos to the course tile first (the Student repos tile).");
      }

      // Step 3: Resolve the week and module name.
      const boundWeek = Number(values.week);
      let rawWeek: number;
      if (Number.isFinite(boundWeek) && boundWeek > 0) {
        rawWeek = boundWeek;
      } else {
        const weekResolution = await resolveTileCurrentWeek(tile, helpers);
        if ("skip" in weekResolution) {
          throw new Error(
            `"${tile.name}" has no start date set - add one on the course tile, or bind a week.`
          );
        }
        rawWeek = weekResolution.rawWeek;
      }
      const status = courseProgressStatus(rawWeek, tile.weeks);
      const displayWeek = tile.weeks && tile.weeks > 0 ? Math.min(rawWeek, tile.weeks) : rawWeek;
      const wt = await loadTileWeekTopic(tile, displayWeek, helpers);
      const topic = "skip" in wt ? "" : wt.topic;
      const moduleName =
        status === "not-started"
          ? "Not started"
          : status === "complete"
            ? "Complete"
            : `Module ${String(displayWeek).padStart(2, "0")}${topic ? `: ${topic}` : ""}`;

      // Step 4-6: Grade each student repo (per-folder or shared-instructions mode).
      const instrRepoRef = String(values.instructionsRepo ?? "").trim() || "";
      const userRubric = String(values.rubric ?? "").trim();
      const wk = displayWeek;
      const weekRe = new RegExp(`(week|wk|module|unit)[^0-9]?0*${wk}(?![0-9])`, "i");

      // Shared-instructions fallback: read the instructions repo once if provided.
      let sharedInstructions = "";
      let sharedRubric = userRubric;
      if (instrRepoRef) {
        try {
          onProgress("Reading the instructions repo...");
          const r = await ingestRepoAction(instrRepoRef);
          if ("error" in r) {
            onProgress(`Note: could not ingest instructions repo: ${r.error}`);
          } else {
            const matched = r.digest.files.filter((f) => weekRe.test(f.path));
            if (matched.length > 0) {
              const readmeFile = matched.find((f) => /readme/i.test(f.path));
              sharedInstructions = readmeFile ? readmeFile.content : matched[0].content;
            } else {
              sharedInstructions = r.digest.text;
            }
          }
        } catch (err) {
          onProgress(`Note: error reading instructions repo: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (!sharedRubric && sharedInstructions) {
          onProgress("Generating rubric...");
          const rr = await generateAssignmentRubricAction(
            moduleName + (topic ? `: ${topic}` : ""),
            sharedInstructions,
            helpers.provider
          );
          if (typeof rr === "string") {
            sharedRubric = rr;
          } else {
            onProgress(`Note: rubric generation failed: ${rr.error}`);
          }
        }
      }

      const results: GradeResult[] = [];
      const notes: string[] = [];
      // Cache rubrics by README content to avoid redundant LLM calls.
      const rubricCache = new Map<string, string>();

      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const label = student.student || student.repo;
        try {
          // Try per-student folder grading: find the week folder in the student repo.
          let folderPath = "";
          let folderInstructions = "";
          let folderRubric = userRubric;

          if (!instrRepoRef) {
            // Folder-per-module mode: discover the week folder in the student repo.
            const treeRes = await getRepoTreeAction(student.repo);
            if ("error" in treeRes) {
              notes.push(`${label}: ${treeRes.error}`);
              continue;
            }
            // Find the first top-level folder matching the week pattern.
            const topFolders = new Set<string>();
            for (const entry of treeRes.tree) {
              const seg = entry.path.split("/")[0];
              topFolders.add(seg);
            }
            const matched = [...topFolders].find((seg) => weekRe.test(seg));
            if (!matched) {
              notes.push(`${label}: no folder matching week ${wk}`);
              continue;
            }
            folderPath = matched;

            // Read the folder's README for instructions.
            const readmeEntry = treeRes.tree.find(
              (e) =>
                e.path.toLowerCase().startsWith(`${matched.toLowerCase()}/`) &&
                /\/readme\.md$/i.test(e.path) &&
                e.path.split("/").length === 2
            );
            if (readmeEntry) {
              const fileRes = await getFileTextAction(student.repo, readmeEntry.path);
              if (!("error" in fileRes)) {
                folderInstructions = fileRes.content;
              }
            }
            if (!folderInstructions) {
              folderInstructions = `Evaluate the contents of the ${matched} directory.`;
            }

            // Synthesize or retrieve cached rubric for this README content.
            if (!folderRubric) {
              const cached = rubricCache.get(folderInstructions);
              if (cached) {
                folderRubric = cached;
              } else {
                onProgress(`Generating rubric for ${matched}...`);
                const rr = await generateAssignmentRubricAction(
                  moduleName + (topic ? `: ${topic}` : ""),
                  folderInstructions,
                  helpers.provider
                );
                if (typeof rr === "string") {
                  folderRubric = rr;
                  rubricCache.set(folderInstructions, rr);
                } else {
                  onProgress(`Note: rubric generation failed for ${label}: ${rr.error}`);
                }
              }
            }
          } else {
            // Shared-instructions mode (instructionsRepo provided).
            folderInstructions = sharedInstructions;
            folderRubric = sharedRubric;
          }

          if (!folderRubric && !folderInstructions) {
            notes.push(`${label}: no rubric or instructions available`);
            continue;
          }

          const progressFolder = folderPath ? ` (${folderPath}/)` : "";
          onProgress(`Grading ${i + 1}/${students.length}: ${label}${progressFolder}...`);
          const r = await gradeRepoAction(
            student.repo,
            folderInstructions,
            folderRubric,
            helpers.provider,
            undefined,
            folderPath || undefined
          );

          if ("error" in r) {
            notes.push(`${label}: ${r.error}`);
            continue;
          }

          const gr = r.run.results[0];
          if (!gr) {
            notes.push(`${label}: no result returned`);
            continue;
          }

          gr.student = student.student || gr.student;
          gr.userId = student.canvasUserId && /^\d+$/.test(student.canvasUserId) ? Number(student.canvasUserId) : undefined;
          results.push(gr);
        } catch (err) {
          notes.push(
            `${label}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Step 7: Assemble GradingRunEntry and save the draft.
      const rubricAreaNames = results[0]?.rubricAreas.map((a) => a.area) ?? [];
      const entry: GradingRunEntry = {
        courseName: tile.name,
        assignmentName: moduleName,
        canvasUrl: String(values.assignmentUrl ?? "").trim(),
        run: { results, rubricAreaNames, fullCreditChecklist: [], speedGraderUrl: null },
        institution: tile.institution || undefined,
        pointsPossible:
          String(values.pointsPossible ?? "").trim() !== "" && Number.isFinite(Number(values.pointsPossible))
            ? Number(values.pointsPossible)
            : null,
      };

      const summary = `${tile.name} - ${moduleName}: graded ${results.length} repo(s)`;
      const saveRes = await saveGradingDraftAction(summary, { runs: [entry] }, helpers.workflowId, helpers.workflowName, "repos");
      if ("error" in saveRes) throw new Error(saveRes.error);

      return {
        outputs: { draftId: saveRes.id, graded: results.length, moduleName },
        summary: {
          kind: "text",
          text: `${summary}.${notes.length ? ` (${notes.join("; ")})` : ""}`,
        },
      };
    },
  },
];
