// Client-side step catalog: pull-request review and branch-protection steps,
// split out of steps.github.ts (that file was over the 1000-line cap - see
// docs/REGRESSION.md's line-count discipline). "Check Copilot agent tasks",
// "Read a pull request diff", "Review a pull request", "Merge a pull
// request", and "Protect a branch" form the PR review pipeline that follows
// a Copilot coding-agent task; they share no state with the other GitHub
// steps beyond the server actions imported here directly.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listCopilotTasksAction,
  listPullRequestFilesAction,
  reviewPullRequestAction,
  mergePullRequestAction,
  setBranchProtectionAction,
} from "@/app/actions";
import { type StepDefinition } from "@/lib/workflows/registry-helpers";

export const pullRequestSteps: StepDefinition[] = [
  {
    type: "poll-copilot-tasks",
    name: "Check Copilot agent tasks",
    description: "List a repository's Copilot coding-agent tasks with their status and linked pull request, to see whether the agent has finished.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
    ],
    outputs: [
      { key: "tasks", label: "Tasks", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      onProgress("Checking Copilot tasks...");
      const r = await listCopilotTasksAction(repo);
      if ("error" in r) throw new Error(r.error);

      const titles = r.tasks.map((task) => task.title);
      const tasksText = r.tasks
        .map((task) => {
          const prInfo = task.pr
            ? `PR #${task.pr.number} (${task.pr.state}${task.pr.isDraft ? ", draft" : ""})`
            : "(no PR)";
          return `${task.title}\n  Number: #${task.number}\n  State: ${task.state}\n  PR: ${prInfo}`;
        })
        .join("\n\n");

      return {
        outputs: { tasks: tasksText },
        summary: {
          kind: "list",
          label: `${r.tasks.length} task(s)`,
          items: r.tasks.length ? titles : ["(none)"],
        },
      };
    },
  },

  {
    type: "read-pr-diff",
    name: "Read a pull request diff",
    description: "Read a pull request's changed files and unified diffs, to feed a review or an automated grade.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "prNumber", label: "PR number", type: "text", required: true, help: "The pull request number." },
    ],
    outputs: [
      { key: "diff", label: "Diff", type: "longtext" },
      { key: "files", label: "Changed files", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      const prRaw = String(values.prNumber ?? "").trim();
      if (!/^\d+$/.test(prRaw)) throw new Error("Provide the numeric PR number.");

      onProgress("Reading PR diff...");
      const r = await listPullRequestFilesAction(repo, Number(prRaw));
      if ("error" in r) throw new Error(r.error);

      const filenames = r.files.map((f) => f.filename);
      const filesText = filenames.join("\n");
      const diffText = r.files
        .map((f) => `${f.filename}\n${f.patch || "(binary or too large)"}`)
        .join("\n\n");

      return {
        outputs: { diff: diffText, files: filesText },
        summary: {
          kind: "list",
          label: `${r.files.length} file(s) changed`,
          items: r.files.length ? filenames : ["(none)"],
        },
      };
    },
  },

  {
    type: "review-pull-request",
    name: "Review a pull request",
    description: "Submit an approve, request-changes, or comment review on a pull request. Attended-only.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "prNumber", label: "PR number", type: "text", required: true },
      { key: "verdict", label: "Verdict", type: "text", required: true, help: "approve, request-changes, or comment." },
      { key: "body", label: "Comment", type: "longtext", required: false },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      const prRaw = String(values.prNumber ?? "").trim();
      if (!/^\d+$/.test(prRaw)) throw new Error("Provide the numeric PR number.");

      const verdict = String(values.verdict ?? "").trim().toLowerCase();
      const eventMap: Record<string, "APPROVE" | "REQUEST_CHANGES" | "COMMENT"> = {
        "approve": "APPROVE",
        "request-changes": "REQUEST_CHANGES",
        "request_changes": "REQUEST_CHANGES",
        "comment": "COMMENT",
      };
      const event = eventMap[verdict];
      if (!event) throw new Error("Verdict must be approve, request-changes, or comment.");

      const body = String(values.body ?? "");

      onProgress("Submitting review...");
      const r = await reviewPullRequestAction(repo, Number(prRaw), event, body);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: `Submitted a ${verdict} review on PR #${prRaw}.` },
      };
    },
  },

  {
    type: "merge-pull-request",
    name: "Merge a pull request",
    description: "Merge a pull request (merge, squash, or rebase). Attended-only.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "prNumber", label: "PR number", type: "text", required: true },
      { key: "method", label: "Merge method", type: "text", required: false, help: "merge (default), squash, or rebase." },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      const prRaw = String(values.prNumber ?? "").trim();
      if (!/^\d+$/.test(prRaw)) throw new Error("Provide the numeric PR number.");

      const methodRaw = String(values.method ?? "").trim().toLowerCase();
      const method: "merge" | "squash" | "rebase" = methodRaw === "squash" ? "squash" : methodRaw === "rebase" ? "rebase" : "merge";

      onProgress("Merging pull request...");
      const r = await mergePullRequestAction(repo, Number(prRaw), method);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: `Merged PR #${prRaw} (${method}).` },
      };
    },
  },

  {
    type: "set-branch-protection",
    name: "Protect a branch",
    description: "Lock a repository branch (require reviews, checks, or linear history). Attended-only.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "branch", label: "Branch", type: "text", required: false, help: "Defaults to main." },
      { key: "requirePullRequestReviews", label: "Require pull request reviews", type: "boolean", required: false },
      { key: "requireStatusChecks", label: "Require status checks", type: "boolean", required: false },
      { key: "strictStatusChecks", label: "Require strict status checks", type: "boolean", required: false },
      { key: "enforceAdmins", label: "Enforce for administrators", type: "boolean", required: false },
      { key: "requireLinearHistory", label: "Require linear history", type: "boolean", required: false },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      const branch = String(values.branch ?? "").trim() || "main";

      const opts = {
        requirePullRequestReviews: String(values.requirePullRequestReviews ?? "") === "1",
        requiredApprovingReviewCount: 1,
        requireStatusChecks: String(values.requireStatusChecks ?? "") === "1",
        statusCheckContexts: [],
        strictStatusChecks: String(values.strictStatusChecks ?? "") === "1",
        enforceAdmins: String(values.enforceAdmins ?? "") === "1",
        requireLinearHistory: String(values.requireLinearHistory ?? "") === "1",
      };

      onProgress("Applying branch protection...");
      const r = await setBranchProtectionAction(repo, branch, opts);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: `Protected ${branch} on ${repo}.` },
      };
    },
  },
];
