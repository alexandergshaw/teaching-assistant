// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  createRepoFromTemplateAction,
  fillAssignmentReadmesAction,
  createCopilotTaskAction,
  setupStudentRepoAction,
  listCourseHubAction,
  checkStudentActivityAction,
  setRepoTopicsAction,
  generateCopilotProjectPromptAction,
  listCopilotTasksAction,
  listPullRequestFilesAction,
  reviewPullRequestAction,
  mergePullRequestAction,
  setBranchProtectionAction,
  listGithubReposAction,
  ingestRepoAction,
  commitFileAction,
  detectRepoFrontendAction,
  inviteOrgMemberAction,
  setRepoCollaboratorAction,
  updateRepoAction,
  deleteOrgReposAction,
} from "@/app/actions";
import { type StepRunResult, type StepDefinition, parseRosterLines } from "@/lib/workflows/registry-helpers";
import type { RepoPermission } from "@/lib/github";

export const githubSteps: StepDefinition[] = [
  {
    type: "repo-from-template",
    name: "Create repo from template",
    description: "Generate a new GitHub repository from a template",
    inputs: [
      {
        key: "templateRepo",
        label: "Template repository",
        type: "repo",
        required: true,
      },
      {
        key: "newRepoName",
        label: "New repository name",
        type: "text",
        required: true,
      },
    ],
    outputs: [{ key: "repo", label: "Repository", type: "repo" }],
    run: async (values, helpers, onProgress) => {
      const templateRepo = String(values.templateRepo);
      const newRepoName = String(values.newRepoName);

      onProgress("Creating repository...");
      const r = await createRepoFromTemplateAction(
        templateRepo,
        newRepoName,
        true,
        true
      );

      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: { repo: r.repo.fullName },
        summary: {
          kind: "link",
          label: `Created ${r.repo.fullName}`,
          url: r.repo.htmlUrl,
        },
      };
    },
  },

  {
    type: "fill-readmes",
    name: "Write assignment READMEs",
    description: "Generate assignment instructions and place them in the repository",
    inputs: [
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: true,
      },
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: true,
      },
      {
        key: "description",
        label: "Course description",
        type: "longtext",
        required: true,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo);
      const schedule = values.schedule as ScheduleWeekPlan[];
      const description = String(values.description);

      onProgress("Writing assignment READMEs...");
      const r = await fillAssignmentReadmesAction(
        repo,
        schedule,
        description,
        helpers.provider
      );

      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: {},
        summary: {
          kind: "list",
          label: `Wrote ${r.written.length} README file(s)`,
          items: r.written,
        },
      };
    },
  },

  {
    type: "agent-edit-repo",
    name: "Kick off repo agent task",
    description: "Open a GitHub Copilot coding-agent task on the repository; Copilot opens a pull request for you to review and merge.",
    inputs: [
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: true,
      },
      {
        key: "title",
        label: "Task title",
        type: "text",
        required: true,
      },
      {
        key: "instructions",
        label: "Instructions for the agent",
        type: "longtext",
        required: true,
      },
    ],
    outputs: [
      { key: "repo", label: "Repository", type: "repo" },
    ],
    run: async (values, helpers, onProgress) => {
      onProgress("Creating Copilot task...");
      const r = await createCopilotTaskAction(
        String(values.repo),
        String(values.title),
        String(values.instructions)
      );

      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: { repo: values.repo },
        summary: {
          kind: "link",
          label: `Copilot task created (issue #${r.issueNumber})`,
          url: r.issueUrl,
        },
      };
    },
  },

  {
    type: "assign-student-repos",
    name: "Assign students to repos",
    description: "Create one repo per student from a template and invite each student as an outside collaborator - the GitHub Classroom pattern. Existing repos are skipped, so re-running is safe.",
    inputs: [
      {
        key: "org",
        label: "Organization",
        type: "org",
        required: true,
      },
      {
        key: "templateRepo",
        label: "Template repository",
        type: "repo",
        required: true,
      },
      {
        key: "roster",
        label: "Students",
        type: "longtext",
        required: false,
        help: 'One student per line: "Student" or "Student | github-username". The student text names the repo; the username receives the invite.',
      },
      {
        key: "rosterCourse",
        label: "Course tile roster",
        type: "hubCourse",
        required: false,
        help: "Optional - fills the student list from this tile's roster when the Students box is empty.",
      },
      {
        key: "prefix",
        label: "Repo name prefix",
        type: "text",
        required: false,
        help: "Repos become <prefix>-<student>.",
      },
      {
        key: "permission",
        label: "Student access",
        type: "text",
        required: false,
        help: "push (default), pull, or maintain.",
      },
      {
        key: "visibility",
        label: "Visibility",
        type: "text",
        required: false,
        help: "private (default) or public.",
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      let rosterText = String(values.roster ?? "").trim();

      if (!rosterText && values.rosterCourse) {
        const courseId = String(values.rosterCourse);
        const list = await listCourseHubAction();
        if ("error" in list) {
          throw new Error(list.error);
        }
        const course = list.courses.find((c) => c.id === courseId);
        rosterText = (course?.roster ?? "").trim();
      }

      const rows = parseRosterLines(rosterText);
      if (rows.length === 0) {
        throw new Error("Enter at least one student (or pick a course tile with a roster).");
      }

      const permRaw = String(values.permission ?? "").trim().toLowerCase();
      const permission = (["push", "pull", "maintain"].includes(permRaw)
        ? permRaw
        : "push") as RepoPermission;

      const isPrivate =
        String(values.visibility ?? "").trim().toLowerCase() !== "public";

      const lines: string[] = [];
      let createdCount = 0;
      let existedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        onProgress(
          `Setting up ${i + 1} of ${rows.length}: ${row.student || row.username}`
        );

        const r = await setupStudentRepoAction(
          String(values.org),
          String(values.templateRepo),
          String(values.prefix ?? "").trim(),
          row.student,
          row.username,
          isPrivate,
          permission
        );

        if ("error" in r) {
          lines.push(`${row.student || row.username}: ${r.error}`);
          failedCount++;
        } else {
          const parts: string[] = [r.repo];
          parts.push(r.created);
          if (r.invited) parts.push("invited");
          if (r.inviteError) parts.push(`invite failed: ${r.inviteError}`);
          if (!row.username && r.created !== "failed") parts.push("no username yet");

          lines.push(parts.join(", "));

          if (r.created === "created") createdCount++;
          else if (r.created === "existed") existedCount++;
          else if (r.created === "failed") failedCount++;
        }
      }

      if (failedCount === rows.length) {
        throw new Error(`All ${rows.length} student setups failed.`);
      }

      return {
        outputs: {},
        summary: {
          kind: "list",
          label: `${createdCount} created, ${existedCount} already existed, ${failedCount} failed (of ${rows.length})`,
          items: lines,
        },
      };
    },
  },

  {
    type: "agent-improve-repos",
    name: "Improve repos via Copilot agent",
    description:
      "Fire a GitHub Copilot agent task on each course's linked repository with the listed improvements; courses without a repository can hand off to another workflow.",
    inputs: [
      {
        key: "courses",
        label: "Courses",
        type: "hubCourseList",
        required: true,
      },
      {
        key: "improvements",
        label: "Improvements",
        type: "longtext",
        required: true,
        help: "One improvement per line.",
      },
      {
        key: "report",
        label: "Report context",
        type: "longtext",
        required: false,
        help: "Optional context appended to the agent instructions.",
      },
    ],
    outputs: [{ key: "workflowChoice", label: "Follow-up workflow", type: "text" }],
    run: async (values, helpers, onProgress) => {
      const improvements = String(values.improvements ?? "").trim();
      if (!improvements) {
        return {
          outputs: { workflowChoice: "" },
          summary: { kind: "text", text: "Skipped - no improvements provided." },
        };
      }

      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const lines: string[] = [];
      const noRepo: Array<{ id: string; name: string }> = [];
      let taskCount = 0;

      for (const id of ids) {
        try {
          const tile = hub.courses.find((c) => c.id === id);
          if (!tile) {
            lines.push(`${id}: not found`);
            continue;
          }

          const repo = (tile.repos[0]?.repo ?? "").trim();
          if (!repo) {
            noRepo.push({ id: tile.id, name: tile.name });
            lines.push(`${tile.name}: no repository on the tile`);
            continue;
          }

          const reportContext = String(values.report ?? "").trim();
          const body =
            improvements +
            (reportContext
              ? `\n\nContext from the technology report:\n${reportContext.slice(0, 4000)}`
              : "");

          onProgress(`Firing Copilot task for ${tile.name}...`);
          const r = await createCopilotTaskAction(
            repo,
            "Course technology improvements",
            body
          );

          if ("error" in r) {
            lines.push(`${tile.name}: ${r.error}`);
          } else {
            taskCount++;
            lines.push(`${tile.name}: Copilot task #${r.issueNumber}`);
          }
        } catch (err) {
          lines.push(
            `${hub.courses.find((c) => c.id === id)?.name ?? id}: ${
              err instanceof Error ? err.message : "failed"
            }`
          );
        }
      }

      const result: StepRunResult = {
        outputs: { workflowChoice: "" },
        summary: {
          kind: "list",
          label: `Fired ${taskCount} Copilot task(s)`,
          items: lines,
        },
      };

      if (noRepo.length > 0) {
        const noRepoNames = noRepo.map((t) => t.name).join(", ");
        result.requireInput = {
          message: `${noRepoNames} ${
            noRepo.length === 1 ? "has" : "have"
          } no linked repository. Choose a workflow to run for ${
            noRepo.length === 1 ? "it" : "them"
          } next, or skip to finish.`,
          key: "workflowChoice",
          kind: "workflow",
          optional: true,
          handoffPrefill: {
            hubCourse: noRepo[0].id,
            courses: noRepo.map((t) => t.id).join("\n"),
          },
        };
      }

      return result;
    },
  },

  {
    type: "check-student-activity",
    name: "Check student repo activity",
    description: "List each student repo (across one, several, or all orgs) with its last-commit date, flagging repos with no recent activity as at-risk.",
    inputs: [
      { key: "org", label: "Organizations", type: "orgList", required: true, help: "One, several, or all of your GitHub orgs." },
      { key: "prefix", label: "Repo name prefix", type: "text", required: false, help: "Only repos whose name starts with this." },
      { key: "staleDays", label: "Stale after (days)", type: "number", required: false, help: "Flag repos with no commit in this many days (default 7)." },
    ],
    outputs: [
      { key: "activity", label: "Activity report", type: "longtext" },
      { key: "staleCount", label: "Stale repos", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      // Scopeable list input: newline-joined org logins (a single login is a
      // one-element list, so pre-scope workflows keep working).
      const orgs = String(values.org ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (orgs.length === 0) throw new Error("Provide a GitHub organization.");
      const prefix = String(values.prefix ?? "").trim() || undefined;
      const staleRaw = String(values.staleDays ?? "").trim();
      const staleDays = staleRaw && Number.isFinite(Number(staleRaw)) ? Number(staleRaw) : 7;

      const cutoff = Date.now() - staleDays * 86400000;
      const multi = orgs.length > 1;
      const lines: string[] = [];
      let staleCount = 0;
      let repoCount = 0;

      for (const org of orgs) {
        onProgress(`Reading student repos${multi ? ` (${org})` : ""}...`);
        const r = await checkStudentActivityAction(org, prefix);
        if ("error" in r) {
          lines.push(`${org}: ${r.error}`);
          continue;
        }
        if (multi) lines.push(`# ${org}`);
        for (const row of r.rows) {
          repoCount++;
          const stale = !row.lastCommit || new Date(row.lastCommit).getTime() < cutoff;
          if (stale) staleCount++;
          lines.push(`${row.repo}: ${row.lastCommit ? row.lastCommit : "no commits"}${stale ? " (STALE)" : ""}`);
        }
      }

      return {
        outputs: { activity: lines.join("\n"), staleCount },
        summary: {
          kind: "list",
          label: `${repoCount} repo(s), ${staleCount} stale`,
          items: lines.length ? lines : ["(no repos found)"],
        },
      };
    },
  },

  {
    type: "generate-copilot-prompt",
    name: "Generate a Copilot agent prompt",
    description: "Draft a GitHub Copilot coding-agent project/scaffolding prompt, ready to feed an agent task.",
    inputs: [
      { key: "schedule", label: "Course schedule", type: "longtext", required: true },
      { key: "fileName", label: "Schedule file name", type: "text", required: false, help: "Defaults to schedule.csv." },
    ],
    outputs: [
      { key: "prompt", label: "Agent prompt", type: "longtext" }
    ],
    run: async (values, helpers, onProgress) => {
      const schedule = String(values.schedule ?? "").trim();
      if (!schedule) throw new Error("Provide course schedule content.");

      const fileName = String(values.fileName ?? "").trim() || "schedule.csv";

      onProgress("Drafting Copilot prompt...");
      const r = await generateCopilotProjectPromptAction(schedule, fileName, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      const promptText = r.prompt;

      return {
        outputs: { prompt: promptText },
        summary: { kind: "text", text: promptText }
      };
    },
  },

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

  {
    type: "tag-repos",
    name: "Tag a repository",
    description: "Set the topics (labels) on a repository to organize it by section or cohort. Attended-only.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "topics", label: "Topics", type: "longtext", required: true, help: "One topic per line (lowercase, hyphenated)." },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");
      const topics = String(values.topics ?? "")
        .split("\n")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (topics.length === 0) throw new Error("Provide at least one topic.");

      onProgress("Tagging repository...");
      const r = await setRepoTopicsAction(repo, topics);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: `Set ${topics.length} topic(s) on ${repo}.` },
      };
    },
  },

  {
    type: "list-github-repos",
    name: "List GitHub repositories",
    description: "Enumerate the repositories the token can see, to seed a repo selection or fan-out.",
    inputs: [],
    outputs: [
      { key: "repos", label: "Repositories", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      onProgress("Listing repositories...");
      const r = await listGithubReposAction();
      if ("error" in r) throw new Error(r.error);
      const names = r.repos.map((repo) => repo.fullName);
      return {
        outputs: { repos: names.join("\n") },
        summary: {
          kind: "list",
          label: `${r.repos.length} repo(s)`,
          items: names.length ? names : ["(none)"],
        },
      };
    },
  },

  {
    type: "ingest-repo-digest",
    name: "Build a repo digest",
    description: "Build a bounded text digest of a repository's README and source, to feed grading, analysis, or an outline step.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "branch", label: "Branch", type: "text", required: false },
    ],
    outputs: [
      { key: "digest", label: "Repo digest", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");
      const branch = String(values.branch ?? "").trim() || undefined;
      onProgress("Building repo digest...");
      const r = await ingestRepoAction(repo, branch);
      if ("error" in r) throw new Error(r.error);
      const digest = r.digest;
      const digestText = [
        `File count: ${digest.fileCount}${digest.truncated ? " (truncated)" : ""}`,
        digest.description,
        "",
        digest.text,
      ].join("\n");
      return {
        outputs: { digest: digestText },
        summary: {
          kind: "text",
          text: `Digest of ${digest.fullName}: ${digest.fileCount} file(s), ${digest.text.length} char(s)`,
        },
      };
    },
  },

  {
    type: "commit-file-to-repo",
    name: "Commit a file to a repo",
    description: "Commit a single file's content to a branch (e.g. push feedback or a solution file). Attended-only.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "path", label: "File path", type: "text", required: true, help: "e.g. feedback/week01.md" },
      { key: "content", label: "File content", type: "longtext", required: true },
      { key: "message", label: "Commit message", type: "text", required: false },
      { key: "branch", label: "Branch", type: "text", required: false, help: "Defaults to main." },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");
      const path = String(values.path ?? "").trim();
      if (!path) throw new Error("Provide the file path.");
      const content = String(values.content ?? "");
      if (!content) throw new Error("Provide the file content.");
      const message = String(values.message ?? "").trim() || `Update ${path}`;
      const branch = String(values.branch ?? "").trim() || "main";
      onProgress("Committing file...");
      const r = await commitFileAction(repo, path, content, message, branch);
      if ("error" in r) throw new Error(r.error);
      return { outputs: {}, summary: { kind: "text", text: `Committed ${path} to ${repo} (${branch}).` } };
    },
  },

  {
    type: "detect-repo-frontend",
    name: "Detect a repo's stack",
    description: "Detect a repository's frontend framework and dev command (and backend), to configure a run, preview, or automated build.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true, help: "As owner/name." },
    ],
    outputs: [
      { key: "framework", label: "Framework", type: "text" },
      { key: "devCommand", label: "Dev command", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository (owner/name).");
      onProgress("Detecting stack...");
      const r = await detectRepoFrontendAction(repo);
      if ("error" in r) throw new Error(r.error);
      const framework = r.frontend?.framework ?? "";
      const devCommand = r.frontend?.devCommand ?? "";

      const summaryParts: string[] = [];
      if (r.frontend) {
        summaryParts.push(`Frontend: ${r.frontend.framework}`);
        summaryParts.push(`Dev command: ${r.frontend.devCommand}`);
      } else {
        summaryParts.push("No frontend detected.");
      }

      if (r.backend) {
        summaryParts.push(`Backend: ${r.backend.framework} (${r.backend.runtime})`);
        summaryParts.push(`Backend dev: ${r.backend.devCommand}`);
      }

      const summaryText = summaryParts.join("\n");
      return { outputs: { framework, devCommand }, summary: { kind: "text", text: summaryText } };
    },
  },

  {
    type: "invite-org-members",
    name: "Invite students to the GitHub org",
    description: "Invite each listed student to a GitHub organization by username or email. Attended-only.",
    inputs: [
      { key: "org", label: "Organization", type: "org", required: true },
      { key: "members", label: "Usernames or emails", type: "longtext", required: true, help: "One GitHub username or email per line." },
      { key: "role", label: "Role", type: "text", required: false, help: "member (default) or admin." },
    ],
    outputs: [
      { key: "invited", label: "Invited", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const org = String(values.org ?? "").trim();
      if (!org) throw new Error("Provide a GitHub organization.");
      const members = String(values.members ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
      if (members.length === 0) throw new Error("Provide at least one username or email.");
      const role: "admin" | "member" = String(values.role ?? "").trim().toLowerCase() === "admin" ? "admin" : "member";
      onProgress("Inviting members...");
      let invited = 0;
      const failures: string[] = [];
      for (const m of members) {
        const r = await inviteOrgMemberAction(org, m, role);
        if ("error" in r) {
          failures.push(`${m}: ${r.error}`);
        } else {
          invited++;
        }
      }
      const items = failures.length ? failures : [`Invited ${invited} member(s) to ${org}.`];
      return {
        outputs: { invited },
        summary: { kind: "list", label: `Invited ${invited} of ${members.length}`, items },
      };
    },
  },

  {
    type: "set-repo-collaborator-access",
    name: "Grant repo access",
    description: "Grant or adjust a collaborator's permission on a repository. Attended-only.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "username", label: "GitHub username", type: "text", required: true },
      { key: "permission", label: "Permission", type: "text", required: false, help: "pull, push (default), or maintain." },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");
      const username = String(values.username ?? "").trim();
      if (!username) throw new Error("Provide the GitHub username.");
      const permRaw = String(values.permission ?? "").trim().toLowerCase();
      const permission: RepoPermission =
        permRaw === "pull" ? "pull" : permRaw === "maintain" ? "maintain" : "push";
      onProgress("Setting collaborator access...");
      const r = await setRepoCollaboratorAction(repo, username, permission);
      if ("error" in r) throw new Error(r.error);
      return {
        outputs: {},
        summary: { kind: "text", text: `Granted ${username} ${permission} on ${repo}.` },
      };
    },
  },

  {
    type: "archive-repo",
    name: "Archive a repository",
    description: "Archive a repository (make it read-only) at end of term, or unarchive it. Attended-only (non-destructive).",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "unarchive", label: "Unarchive instead", type: "boolean", required: false },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");
      const archived = String(values.unarchive ?? "") !== "1";
      onProgress(archived ? "Archiving repository..." : "Unarchiving repository...");
      const r = await updateRepoAction(repo, { archived });
      if ("error" in r) throw new Error(r.error);
      return { outputs: {}, summary: { kind: "text", text: `${archived ? "Archived" : "Unarchived"} ${repo}.` } };
    },
  },

  {
    type: "delete-org-repos",
    name: "Delete org repositories",
    description: "Permanently delete repositories in a GitHub organization (end-of-term teardown). Attended-only and irreversible: type DELETE to confirm.",
    inputs: [
      { key: "org", label: "Organization", type: "org", required: true },
      { key: "repoNames", label: "Repository names", type: "longtext", required: true, help: "One repo name (without owner) per line." },
      { key: "confirm", label: "Confirmation", type: "text", required: true, help: "Type DELETE to confirm permanent deletion." },
    ],
    outputs: [
      { key: "deleted", label: "Deleted", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const org = String(values.org ?? "").trim();
      if (!org) throw new Error("Provide a GitHub organization.");
      if (String(values.confirm ?? "").trim() !== "DELETE") throw new Error("Type DELETE in the confirmation field to permanently delete these repositories.");
      const names = String(values.repoNames ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
      if (names.length === 0) throw new Error("Provide at least one repository name.");
      onProgress("Deleting repositories...");
      const r = await deleteOrgReposAction(org, names);
      if ("error" in r) throw new Error(r.error);
      let deleted = 0;
      const lines: string[] = [];
      for (const res of r.results) {
        if (res.error) {
          lines.push(`${res.name}: ${res.error}`);
        } else {
          deleted++;
          lines.push(`${res.name}: deleted`);
        }
      }
      return { outputs: { deleted }, summary: { kind: "list", label: `Deleted ${deleted} of ${r.results.length} repo(s)`, items: lines.length ? lines : ["(none)"] } };
    },
  },
];
