// Client-side step catalog: assignment sync step definitions.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  getAssignmentSyncStateAction,
  syncAssignmentToRepoAction,
  syncAssignmentFromRepoAction,
} from "@/app/actions";
import { type StepDefinition } from "@/lib/workflows/registry-helpers";

export const assignmentSyncSteps: StepDefinition[] = [
  {
    type: "get-assignment-sync-state",
    name: "Check assignment/repo sync",
    description: "Compare an LMS assignment against its repo file and report whether they are in sync.",
    inputs: [
      { key: "assignmentUrl", label: "Assignment URL", type: "text", required: true },
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "path", label: "File path in repo", type: "text", required: true, help: "e.g. week01/README.md" },
      { key: "institution", label: "Institution", type: "institution", required: false },
      { key: "branch", label: "Branch", type: "text", required: false },
    ],
    outputs: [
      { key: "inSync", label: "In sync", type: "boolean" },
      { key: "diff", label: "Difference", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const assignmentUrl = String(values.assignmentUrl ?? "").trim();
      if (!assignmentUrl) throw new Error("Provide the assignment URL.");
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide the repository.");
      const path = String(values.path ?? "").trim();
      if (!path) throw new Error("Provide the file path in the repo.");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      const branch = String(values.branch ?? "").trim() || undefined;

      onProgress("Comparing assignment and repo...");
      const r = await getAssignmentSyncStateAction(assignmentUrl, repo, path, inst, branch);
      if ("error" in r) throw new Error(r.error);

      const isSync = r.repoMarkdown !== null && r.repoMarkdown === r.canvasMarkdown;
      const inSyncOutput = isSync ? "1" : "";

      let diffText: string;
      if (r.repoMarkdown === null) {
        diffText = "Repo file does not exist.\n\nCanvas assignment markdown:\n" + r.canvasMarkdown;
      } else if (isSync) {
        diffText = "No differences.";
      } else {
        diffText = "Canvas:\n" + r.canvasMarkdown + "\n\n---\n\nRepo file:\n" + r.repoMarkdown;
      }

      const summaryText = isSync
        ? "In sync."
        : r.repoMarkdown === null
          ? "Repo file does not exist."
          : "Content differs between Canvas and repo file.";

      return {
        outputs: { inSync: inSyncOutput, diff: diffText },
        summary: { kind: "text", text: summaryText },
      };
    },
  },

  {
    type: "sync-assignment-to-repo",
    name: "Push assignment into the repo",
    description: "Write an LMS assignment's content into the repo file (README). Attended-only.",
    inputs: [
      { key: "assignmentUrl", label: "Assignment URL", type: "text", required: true },
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "path", label: "File path in repo", type: "text", required: true, help: "e.g. week01/README.md" },
      { key: "institution", label: "Institution", type: "institution", required: false },
      { key: "branch", label: "Branch", type: "text", required: false },
    ],
    outputs: [
      { key: "path", label: "Committed path", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const assignmentUrl = String(values.assignmentUrl ?? "").trim();
      if (!assignmentUrl) throw new Error("Provide the assignment URL.");
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide the repository.");
      const path = String(values.path ?? "").trim();
      if (!path) throw new Error("Provide the file path in the repo.");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      const branch = String(values.branch ?? "").trim() || undefined;

      onProgress("Syncing assignment to the repo...");
      const r = await syncAssignmentToRepoAction(assignmentUrl, repo, path, inst, branch);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: { path: r.path },
        summary: { kind: "text", text: `Wrote the assignment to ${r.path}.` },
      };
    },
  },

  {
    type: "sync-assignment-from-repo",
    name: "Update assignment from the repo",
    description: "Update an LMS assignment's description from the repo file (README). Attended-only.",
    inputs: [
      { key: "assignmentUrl", label: "Assignment URL", type: "text", required: true },
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "path", label: "File path in repo", type: "text", required: true, help: "e.g. week01/README.md" },
      { key: "institution", label: "Institution", type: "institution", required: false },
      { key: "branch", label: "Branch", type: "text", required: false },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const assignmentUrl = String(values.assignmentUrl ?? "").trim();
      if (!assignmentUrl) throw new Error("Provide the assignment URL.");
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide the repository.");
      const path = String(values.path ?? "").trim();
      if (!path) throw new Error("Provide the file path in the repo.");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      const branch = String(values.branch ?? "").trim() || undefined;

      onProgress("Updating the assignment from the repo...");
      const r = await syncAssignmentFromRepoAction(assignmentUrl, repo, path, inst, branch);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: "Updated the assignment from the repo file." },
      };
    },
  },
];
