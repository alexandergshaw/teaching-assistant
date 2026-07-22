"use server";

import type { ClassroomRowResult, RepoQueueItem, TestSummary, ScheduleWeekPlan } from "../actions-types";
import { generateRubric, gradeEntries, type GradingRun, type StudentSubmissionEntry, type SubmittedFileInfo } from "@/lib/grade";
import { parseLenientJsonArray } from "@/lib/lenient-json";
import { buildEmbeddedRubric, gradeEntriesEmbedded, renderRubricText } from "@/lib/embedded-grader";
import { rememberRubric } from "@/lib/research/rubric-bank";
import { getAccessibilityItem, saveAccessibilityItemHtml } from "@/lib/canvas-modules";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { githubConfigured, githubWebhookSecret, listRepos, listOwnedOrgs, listOrgRepos, listBranches, ingestRepo, parseRepoRef, createRepo, createOrgRepo, startCopilotBuild, createCopilotAgentTask, listCopilotTasks, deletePaths, movePaths, generateFromTemplate, putFile, getFileText, getRepo, listWorkflows, dispatchWorkflow, findWorkflowRunSince, downloadArtifactZip, downloadRepoZipball, listOrgMembers, inviteOrgMember, setOrgMemberRole, createOrgPushHook, listRepoCollaborators, setRepoCollaborator, createPullRequest, setBranchProtection, updateRepo, deleteRepo, forkRepo, createBranch, deleteBranch, listCommits, listPullRequests, mergePullRequest, markPullRequestReady, listPullRequestReviews, reviewPullRequest, listPullRequestFiles, listWorkflowRuns, listRunJobs, rerunWorkflowRun, cancelWorkflowRun, rerunFailedJobs, setWorkflowEnabled, listRunArtifacts, getArtifactDownloadUrl, getRunLogsDownloadUrl, listPendingDeployments, reviewPendingDeployments, getRepoTree, copyRepo, type GithubRepo, type RepoDigest, type WorkflowRunInfo, type WorkflowInfo, type OrgMember, type RepoCollaborator, type RepoPermission, type BranchProtectionOptions, type UpdateRepoPatch, type PullRequestInfo, type PullRequestReviewInfo, type PullRequestFileInfo, type WorkflowJobInfo, type RepoTreeEntry, type CopilotTask, type ArtifactInfo, type PendingDeployment, type CopyRepoOptions, type CopyRepoResult, copyPathsToRepo, type CopyPathsOptions, type CopyPathsResult, setRepoTopics } from "@/lib/github";
import { listGithubModels, chatWithGithubModel, type GithubModel, type ModelUsage, type ChatMessage } from "@/lib/github-models";
import { htmlToMarkdown, markdownToHtml } from "@/lib/markdown";
import { classifyFrontend, classifyBackend, type BackendInfo } from "@/lib/frontend-detect";
import { requireOwner } from "@/lib/supabase/auth";
import { assignmentSlug, extractAssignmentContentBundle, extractJsonObject, findAssignmentsPrefix, listAssignmentFolders } from "./shared";
import type { AssignmentContentBundle } from "./shared";


/**
 * Extract an ordered list of course topics from a repository's file tree, README,
 * and package.json. Used to prefill the Topics field for review and editing.
 */
export async function extractTopicsFromRepoAction(
  repoRef: string,
  provider: LlmProvider = "gemini"
): Promise<{ topics: string[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };

    // Gather repo context: tree, README, and package.json (each with graceful fallback).
    let tree = "";
    try {
      const treeData = await getRepoTree(parsed.owner, parsed.repo);
      const blobs = treeData.filter((e) => e.type === "blob").map((e) => e.path);
      tree = blobs.slice(0, 400).join("\n");
    } catch {
      // If tree fetch fails, that's okay; we'll try other sources.
    }

    let readmeContent = "";
    try {
      readmeContent = await getFileText(parsed.owner, parsed.repo, "README.md");
    } catch {
      // Try lowercase fallback.
      try {
        readmeContent = await getFileText(parsed.owner, parsed.repo, "readme.md");
      } catch {
        // No README found; continue without it.
      }
    }
    if (readmeContent.length > 6000) readmeContent = readmeContent.slice(0, 6000);

    let packageJsonContent = "";
    try {
      packageJsonContent = await getFileText(parsed.owner, parsed.repo, "package.json");
    } catch {
      // package.json not present or not readable; continue without it.
    }
    if (packageJsonContent.length > 2000) packageJsonContent = packageJsonContent.slice(0, 2000);

    // Guard: insufficient content.
    const blobCount = tree.split("\n").filter(Boolean).length;
    if (!readmeContent && blobCount < 3) {
      return { error: "The repo has too little content to extract topics from." };
    }

    // Build prompt for LLM.
    const sections: string[] = [];
    if (tree) sections.push(`FILE TREE:\n${tree}`);
    if (readmeContent) sections.push(`README:\n${readmeContent}`);
    if (packageJsonContent) sections.push(`PACKAGE.JSON:\n${packageJsonContent}`);

    const prompt = [
      "You are an expert curriculum designer. Below are the file tree and README of a course-related code repository. Derive the ordered list of TOPICS a course built on this repository covers. Return ONLY a JSON array of strings, one concise topic per entry (8-30 topics), ordered from foundational to advanced. No numbering inside the strings, no markdown.",
      "",
      sections.join("\n\n"),
    ].join("\n\n");

    const r = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 2048 } },
      provider
    );
    if (!r.ok) return { error: "The model returned no topics. Try again." };
    const raw = parseLenientJsonArray(r.text) as string[] | null;
    if (!raw) return { error: "Could not parse topics from the model output. Try extracting again." };
    const topics = raw.filter((t) => typeof t === "string" && t.trim()).map((t) => (t as string).trim());
    if (!topics.length) return { error: "The model produced no usable topics." };
    return { topics };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not extract topics from the repository." };
  }
}

/**
 * Set the topics (labels) on a repository to organize it by section or cohort.
 */
export async function setRepoTopicsAction(repoRef: string, topics: string[]): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await setRepoTopics(parsed.owner, parsed.repo, topics);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not set repo topics." };
  }
}

// ── GitHub integration ────────────────────────────────────────────────────────

/** Whether a GitHub token is configured, so the UI can show/hide GitHub features. */
export async function githubConfiguredAction(): Promise<{ configured: boolean }> {
  return { configured: githubConfigured() };
}

/** List the repos the configured token can see (for repo pickers). */
export async function listGithubReposAction(): Promise<{ repos: GithubRepo[] } | { error: string }> {
  try {
    await requireOwner();
    return { repos: await listRepos() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list GitHub repositories." };
  }
}

/** Result of generating one student's repo from a template. */

const repoSlug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Permanently delete repositories from an org, one result per repo so the UI
 * can show partial failures (e.g. missing delete_repo scope or protection).
 */
export async function deleteOrgReposAction(
  org: string,
  names: string[]
): Promise<{ results: Array<{ name: string; error?: string }> } | { error: string }> {
  try {
    await requireOwner();
    if (!org.trim()) return { error: "Choose an organization." };
    const list = names.map((n) => n.trim()).filter(Boolean);
    if (list.length === 0) return { error: "Choose at least one repository." };
    const results: Array<{ name: string; error?: string }> = [];
    for (const name of list) {
      try {
        await deleteRepo(org.trim(), name);
        results.push({ name });
      } catch (err) {
        results.push({ name, error: err instanceof Error ? err.message : "Failed" });
      }
    }
    return { results };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete repositories." };
  }
}

/**
 * Generate one repo per student in `org` from a template repo (may live under any owner the token can access).
 * Each repo is named `<prefix>-<student>` (prefix optional). Returns a per-student
 * result so the UI can show successes and failures (e.g. a name that already exists).
 * templateRepo may be a bare repo name ("my-template", lives in org) or a full name ("owner/my-template").
 */

/** Outcome of one student's classroom setup (repo creation + invite). */

/**
 * Set up ONE student: create their repo from the template (an existing repo
 * with the same name counts as success, so re-runs are safe) and, when a
 * GitHub username is given, invite them to that repo as an outside
 * collaborator (never an org member).
 */
export async function setupStudentRepoAction(
  org: string,
  templateRepo: string,
  prefix: string,
  student: string,
  username: string,
  isPrivate: boolean,
  permission: RepoPermission
): Promise<ClassroomRowResult | { error: string }> {
  try {
    await requireOwner();
    if (!org.trim()) return { error: "Choose an organization." };
    if (!templateRepo.trim()) return { error: "Choose a template repository." };
    if (!student.trim() && !username.trim()) return { error: "Empty row." };
    const t = templateRepo.trim();
    const [templateOwner, templateName] = t.includes("/") ? [t.split("/")[0], t.split("/").slice(1).join("/")] : [org.trim(), t];
    const base = prefix.trim() ? repoSlug(prefix) : "";
    const suffix = repoSlug(student.trim() || username.trim()) || "student";
    const repo = (base ? `${base}-${suffix}` : suffix).slice(0, 95);
    let created: ClassroomRowResult["created"] = "created";
    let createError: string | undefined;
    try {
      await generateFromTemplate(templateOwner, templateName, org.trim(), repo, isPrivate);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      if (/already exists/i.test(msg)) {
        created = "existed";
      } else {
        created = "failed";
        createError = msg;
      }
    }
    let invited = false;
    let inviteError: string | undefined;
    const user = username.trim().replace(/^@/, "");
    if (user && created !== "failed") {
      try {
        await setRepoCollaborator(org.trim(), repo, user, permission);
        invited = true;
      } catch (err) {
        inviteError = err instanceof Error ? err.message : "Invite failed";
      }
    }
    return { repo, created, createError, invited, inviteError };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Setup failed." };
  }
}

/** List the orgs the token owns, for the "Import from org" dropdown. */
export async function listMyOrgsAction(): Promise<{ orgs: string[] } | { error: string }> {
  try {
    await requireOwner();
    return { orgs: await listOwnedOrgs() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list organizations." };
  }
}

/** List an org's repos (optionally filtered by name prefix) for bulk import. */
export async function listOrgReposAction(
  org: string,
  prefix?: string
): Promise<{ repos: GithubRepo[] } | { error: string }> {
  try {
    await requireOwner();
    if (!org.trim()) return { error: "Choose an organization." };
    return { repos: await listOrgRepos(org.trim(), prefix?.trim() || undefined) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list the organization's repositories." };
  }
}

/** List a repo's branches (default first) for the branch picker. */
export async function listGithubBranchesAction(
  repoRef: string
): Promise<{ branches: string[]; defaultBranch: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return await listBranches(parsed.owner, parsed.repo);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list branches." };
  }
}

/** Build a bounded text digest of a repo (README + source) for course/rubric generation. */
export async function ingestRepoAction(repoRef: string, branch?: string): Promise<{ digest: RepoDigest } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { digest: await ingestRepo(parsed.owner, parsed.repo, {}, branch) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the repository." };
  }
}

/** Create a new personal repo (auto-initialized). */
export async function createRepoAction(
  name: string,
  description: string,
  isPrivate: boolean,
  isTemplate: boolean
): Promise<{ repo: GithubRepo } | { error: string }> {
  try {
    await requireOwner();
    const clean = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
    if (!clean) return { error: "Enter a repository name." };
    return {
      repo: await createRepo(clean, {
        description: description.trim(),
        private: isPrivate,
        autoInit: true,
        isTemplate,
      }),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the repository." };
  }
}

/**
 * Create a new repo from an existing one used as a template. GitHub only allows
 * generating from a repo whose is_template flag is set, so when `markTemplate`
 * is true the source is flagged as a template first (the caller warns the user).
 * The new repo is created under the same owner/org as the template.
 */
export async function createRepoFromTemplateAction(
  templateRepoRef: string,
  name: string,
  isPrivate: boolean,
  markTemplate: boolean
): Promise<{ repo: { fullName: string; htmlUrl: string } } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(templateRepoRef);
    if (!parsed) return { error: "Choose a source repository as owner/name." };
    const clean = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
    if (!clean) return { error: "Enter a name for the new repository." };
    if (markTemplate) {
      await updateRepo(parsed.owner, parsed.repo, { isTemplate: true });
    }
    const repo = await generateFromTemplate(parsed.owner, parsed.repo, parsed.owner, clean, isPrivate);
    return { repo: { fullName: repo.fullName, htmlUrl: repo.htmlUrl } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the repository from the template." };
  }
}

/**
 * Create a new GitHub repo seeded with a generated Copilot prompt, then kick off
 * GitHub's Copilot coding agent to build it: the prompt is written to
 * .github/copilot-instructions.md and PROMPT.md, and an issue containing the
 * prompt is opened and assigned to Copilot (which works and opens a PR). If the
 * Copilot coding agent is not available for the account/org, the repo is still
 * created and a note explains why Copilot did not start.
 */
export async function createCopilotRepoAction(
  name: string,
  prompt: string,
  isPrivate = true,
  org?: string,
  isTemplate = false,
  description?: string
): Promise<{ fullName: string; htmlUrl: string; issueUrl?: string; copilotNote?: string } | { error: string }> {
  try {
    await requireOwner();
    const clean = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
    if (!clean) return { error: "Enter a repository name." };
    if (!prompt.trim()) return { error: "Generate the Copilot prompt first." };
    const opts = {
      description: description?.trim() || "Project scaffold generated from a Copilot prompt.",
      private: isPrivate,
      autoInit: true,
      isTemplate,
    };
    const repo = org?.trim() ? await createOrgRepo(org.trim(), clean, opts) : await createRepo(clean, opts);
    await putFile(repo.owner, repo.name, ".github/copilot-instructions.md", prompt, "Add Copilot project instructions", repo.defaultBranch);
    await putFile(
      repo.owner,
      repo.name,
      "PROMPT.md",
      `# Build prompt\n\nOpen this repository in GitHub Copilot (Agent mode) to scaffold the project. The full instructions are in \`.github/copilot-instructions.md\`.\n\n---\n\n${prompt}\n`,
      "Add build prompt",
      repo.defaultBranch
    );
    // The repo is created and seeded. Kick off the Copilot coding agent to build
    // it (open an issue with the prompt and assign Copilot). Repo creation has
    // already succeeded, so a Copilot failure is surfaced as a note rather than
    // failing the whole action.
    let issueUrl: string | undefined;
    let copilotNote: string | undefined;
    try {
      const build = await startCopilotBuild(repo.owner, repo.name, prompt);
      issueUrl = build.issueUrl;
    } catch (copilotErr) {
      copilotNote =
        copilotErr instanceof Error ? copilotErr.message : "Could not start the Copilot coding agent.";
    }
    return { fullName: repo.fullName, htmlUrl: repo.htmlUrl, issueUrl, copilotNote };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the repository." };
  }
}

/** Create a Copilot coding-agent task (an issue assigned to Copilot) on a repo. */
export async function createCopilotTaskAction(
  repoRef: string,
  title: string,
  body: string
): Promise<{ issueUrl: string; issueNumber: number } | { error: string }> {
  try {
    await requireOwner();
    if (!title.trim()) return { error: "Enter a task title." };
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return await createCopilotAgentTask(parsed.owner, parsed.repo, title.trim(), body.trim());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the Copilot task." };
  }
}

/** List the Copilot coding-agent tasks (issues assigned to Copilot) on a repo. */
export async function listCopilotTasksAction(
  repoRef: string
): Promise<{ tasks: CopilotTask[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { tasks: await listCopilotTasks(parsed.owner, parsed.repo) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list Copilot tasks." };
  }
}

/** Bulk delete files/folders (a folder deletes everything under it) in one commit. */
export async function bulkDeletePathsAction(
  repoRef: string,
  branch: string,
  paths: string[],
  message?: string
): Promise<{ deleted: number } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    if (!branch.trim()) return { error: "Pick a branch." };
    if (!paths || paths.length === 0) return { error: "Select at least one file or folder." };
    return await deletePaths(parsed.owner, parsed.repo, branch.trim(), paths, message?.trim() || `Delete ${paths.length} item(s)`);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the selected items." };
  }
}

/** Bulk move files/folders into a destination folder (blank = repo root) in one commit. */
export async function bulkMovePathsAction(
  repoRef: string,
  branch: string,
  paths: string[],
  destination: string,
  message?: string
): Promise<{ moved: number } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    if (!branch.trim()) return { error: "Pick a branch." };
    if (!paths || paths.length === 0) return { error: "Select at least one file or folder." };
    const dest = destination.trim().replace(/^\/+/, "").replace(/\/+$/, "");
    const moves = paths.map((p) => {
      const clean = p.trim().replace(/^\/+/, "").replace(/\/+$/, "");
      const base = clean.split("/").pop() || clean;
      return { from: clean, to: dest ? `${dest}/${base}` : base };
    });
    return await movePaths(parsed.owner, parsed.repo, branch.trim(), moves, message?.trim() || `Move ${paths.length} item(s)`);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not move the selected items." };
  }
}

/** List the GitHub Models available to the account (for the file-editor chat). */
export async function listGithubModelsAction(): Promise<{ models: GithubModel[] } | { error: string }> {
  try {
    await requireOwner();
    return { models: await listGithubModels() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list GitHub models." };
  }
}

/** Run a Copilot (GitHub Models) chat completion for the file-editor chat panel. */
export async function copilotChatAction(
  model: string,
  messages: ChatMessage[]
): Promise<{ content: string; usage: ModelUsage } | { error: string }> {
  try {
    await requireOwner();
    if (!model.trim()) return { error: "Choose a model." };
    if (!messages || messages.length === 0) return { error: "Enter a message." };
    return await chatWithGithubModel(model, messages);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The chat request failed." };
  }
}

/** Check student repo activity: list repos in an org with their last-commit date. */
export async function checkStudentActivityAction(
  org: string,
  prefix?: string
): Promise<{ rows: Array<{ repo: string; lastCommit: string | null; htmlUrl: string }> } | { error: string }> {
  try {
    await requireOwner();
    if (!org.trim()) return { error: "Provide a GitHub organization." };
    const repos = await listOrgRepos(org.trim(), prefix?.trim() || undefined);
    const rows = await Promise.all(
      repos.map(async (r) => {
        const [owner, name] = r.fullName.split("/");
        let lastCommit: string | null = null;
        try {
          const commits = await listCommits(owner, name, undefined, 1);
          lastCommit = commits[0]?.date || null;
        } catch {
          lastCommit = null;
        }
        return { repo: r.fullName, lastCommit, htmlUrl: r.htmlUrl };
      })
    );
    rows.sort((a, b) => (a.lastCommit ?? "").localeCompare(b.lastCommit ?? ""));
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read student activity." };
  }
}

/** The stable public base url this deployment is reachable at, for outbound webhook
 * registration. Must be the production domain (GitHub cannot reach preview/localhost). */
function publicWebhookBaseUrl(): string {
  const explicit = process.env.WEBHOOK_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) return `https://${vercelProd}`;
  return "https://teaching-assistant-pi.vercel.app";
}

/** Auto-register the GitHub org-level push webhook that feeds /api/github/webhook so
 * repo-push triggers fire instantly. Idempotent. Never returns the webhook secret. */
export async function registerOrgPushWebhookAction(
  org: string
): Promise<
  | { ok: true; url: string; hookId: number; alreadyExisted: boolean }
  | { ok: false; url: string; error: string }
> {
  const url = `${publicWebhookBaseUrl()}/api/github/webhook`;
  try {
    await requireOwner();
    const cleanOrg = org.trim();
    if (!cleanOrg) return { ok: false, url, error: "Provide a GitHub organization." };
    if (!githubConfigured()) {
      return { ok: false, url, error: "GitHub is not configured. Set the GITHUB_TOKEN environment variable." };
    }
    const secret = githubWebhookSecret();
    if (!secret) {
      return { ok: false, url, error: "Set the GITHUB_WEBHOOK_SECRET environment variable to enable instant webhooks." };
    }
    const { id, alreadyExisted } = await createOrgPushHook(cleanOrg, url, secret);
    return { ok: true, url, hookId: id, alreadyExisted };
  } catch (err) {
    return { ok: false, url, error: err instanceof Error ? err.message : "Could not register the webhook." };
  }
}

/** Generate a grading rubric from a repo's code (optionally guided by instructions). */
export async function generateRubricFromRepoAction(
  repoRef: string,
  instructions = "",
  provider: LlmProvider = "gemini",
  branch?: string
): Promise<{ rubric: string; fullName: string; fileCount: number } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const digest = await ingestRepo(parsed.owner, parsed.repo, {}, branch);
    const basis = `${instructions.trim() ? `${instructions.trim()}\n\n` : ""}Reference codebase (${digest.fullName}) — base the rubric criteria on the features, structure, and logic actually present here:\n\n${digest.text}`;
    const rubric = await generateRubric(basis, provider);
    return { rubric, fullName: digest.fullName, fileCount: digest.fileCount };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate a rubric." };
  }
}

/** One queued student repo to grade/test. */

/**
 * Turn a repo digest into a gradable entry for the embedded engine. The digest's
 * files become `submittedFiles` (so file-type / file-count checks are meaningful
 * and each file can be previewed), while `content` stays the concatenated text
 * that the keyword / code-symbol checks scan.
 */
function repoDigestToEmbeddedEntry(digest: RepoDigest, label?: string): StudentSubmissionEntry {
  const submittedFiles: SubmittedFileInfo[] = digest.files.map((file) => {
    const name = file.path.split("/").pop() || file.path;
    const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    return {
      name: file.path,
      extension,
      previewContent: file.content,
      previewTruncated: false,
      mimeType: "text/plain",
    };
  });
  return {
    student: label?.trim() || digest.fullName,
    content: digest.text,
    mergedFileCount: digest.fileCount,
    submittedFiles,
  };
}

/**
 * Grade several student repos against one rubric in a single run, so the results
 * matrix shows every student as a row. Generates a rubric from the first repo
 * when none is supplied.
 */
export async function gradeReposAction(
  repos: RepoQueueItem[],
  assignmentInstructions: string,
  rubric: string,
  provider: LlmProvider = "gemini"
): Promise<{ run: GradingRun; rubric: string } | { error: string }> {
  try {
    await requireOwner();
    const digests: Array<{ label?: string; digest: RepoDigest }> = [];
    for (const item of repos) {
      const parsed = parseRepoRef(item.repoRef);
      if (!parsed) continue;
      const digest = await ingestRepo(parsed.owner, parsed.repo, {}, item.branch || undefined);
      digests.push({ label: item.label, digest });
    }
    if (digests.length === 0) return { error: "No valid repositories to grade." };
    const instructions = assignmentInstructions.trim() || "Evaluate each student's repository.";

    // Embedded Deterministic Engine: grade each repo in-process against the
    // supplied rubric, or one generated from the instructions. No model call.
    if (provider === "embedded") {
      const builtRubric = buildEmbeddedRubric({ rubricText: rubric, instructions });
      if (builtRubric.checks.length === 0) {
        return { error: builtRubric.warnings[0] ?? "Provide a rubric or assignment instructions." };
      }
      // Grow the rubric bank from human-authored rubrics (fire-and-forget).
      if (rubric.trim()) void rememberRubric(instructions, rubric);
      const run = gradeEntriesEmbedded(
        digests.map(({ label, digest }) => repoDigestToEmbeddedEntry(digest, label)),
        builtRubric
      );
      return { run, rubric: renderRubricText(builtRubric) };
    }

    const entries: StudentSubmissionEntry[] = digests.map(({ label, digest }) => ({
      student: label?.trim() || digest.fullName,
      content: digest.text,
      mergedFileCount: digest.fileCount,
      submittedFiles: [],
    }));
    const effectiveRubric = rubric.trim() || (await generateRubric(`${instructions}\n\n${entries[0].content}`, provider));
    const run = await gradeEntries(entries, instructions, effectiveRubric, provider);
    return { run, rubric: effectiveRubric };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not grade the repositories." };
  }
}

/** List a repo's Actions workflows (so the user can choose which to run). */
export async function listWorkflowsAction(
  repoRef: string
): Promise<{ workflows: WorkflowInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { workflows: await listWorkflows(parsed.owner, parsed.repo) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list workflows." };
  }
}

export async function dispatchWorkflowAction(
  repoRef: string,
  workflowRef: string,
  ref: string,
  inputs?: Record<string, string>
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    if (!workflowRef || !ref) return { error: "Choose a workflow and a branch to run." };
    await dispatchWorkflow(parsed.owner, parsed.repo, workflowRef, ref, inputs);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not dispatch the workflow." };
  }
}

/**
 * Trigger a repo's unit-test workflow (workflow_dispatch). `workflowRef` is a
 * workflow file name; when blank, the repo's first active workflow is used.
 * Returns the dispatch time so the caller can poll {@link getTestRunStatusAction}.
 */
export async function dispatchTestsAction(
  repoRef: string,
  branch?: string,
  workflowRef?: string
): Promise<{ since: string; ref: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const ref = branch?.trim() || (await getRepo(parsed.owner, parsed.repo)).defaultBranch;
    let wf = workflowRef?.trim();
    if (!wf) {
      const workflows = await listWorkflows(parsed.owner, parsed.repo);
      const chosen = workflows.find((w) => w.state === "active") ?? workflows[0];
      if (!chosen) return { error: "This repository has no Actions workflows to run." };
      wf = chosen.path.split("/").pop() || String(chosen.id);
    }
    const since = new Date().toISOString();
    await dispatchWorkflow(parsed.owner, parsed.repo, wf, ref);
    return { since, ref };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the test run." };
  }
}

/** Aggregate pass/fail counts parsed from a run's JUnit report. */

// Sum the suite counters out of one JUnit XML document (prefers a top-level
// <testsuites> aggregate to avoid double-counting nested suites).
function parseJUnit(xml: string): TestSummary | null {
  const num = (tag: string, attr: string): number => Number(tag.match(new RegExp(`\\b${attr}="(\\d+)"`))?.[1] ?? 0);
  const aggregate = xml.match(/<testsuites\b[^>]*>/)?.[0];
  let tests = 0;
  let failures = 0;
  let errors = 0;
  let skipped = 0;
  if (aggregate && /\btests="/.test(aggregate)) {
    tests = num(aggregate, "tests");
    failures = num(aggregate, "failures");
    errors = num(aggregate, "errors");
    skipped = num(aggregate, "skipped");
  } else {
    const suites = xml.match(/<testsuite\b[^>]*>/g);
    if (!suites) return null;
    for (const s of suites) {
      tests += num(s, "tests");
      failures += num(s, "failures");
      errors += num(s, "errors");
      skipped += num(s, "skipped") + num(s, "disabled");
    }
  }
  if (tests === 0 && failures === 0 && errors === 0) return null;
  return { tests, failures, errors, skipped, passed: Math.max(0, tests - failures - errors - skipped) };
}

// Find a JUnit artifact on a completed run, unzip it, and sum its counts.
async function fetchJUnitSummary(owner: string, repo: string, runId: number): Promise<TestSummary | null> {
  const artifacts = await listRunArtifacts(owner, repo, runId);
  if (artifacts.length === 0) return null;
  const chosen = artifacts.find((a) => /test|result|junit|report/i.test(a.name)) ?? artifacts[0];
  const buffer = await downloadArtifactZip(owner, repo, chosen.id);
  const JSZipMod = (await import("jszip")).default;
  const zip = await JSZipMod.loadAsync(buffer);
  const xmlPaths: string[] = [];
  zip.forEach((path, entry) => {
    if (!entry.dir && /\.xml$/i.test(path)) xmlPaths.push(path);
  });
  let combined: TestSummary | null = null;
  for (const path of xmlPaths) {
    const xml = await zip.file(path)?.async("string");
    const summary = xml ? parseJUnit(xml) : null;
    if (!summary) continue;
    combined = combined
      ? {
          tests: combined.tests + summary.tests,
          failures: combined.failures + summary.failures,
          errors: combined.errors + summary.errors,
          skipped: combined.skipped + summary.skipped,
          passed: combined.passed + summary.passed,
        }
      : summary;
  }
  return combined;
}

/**
 * Poll the status of a dispatched test run (newest workflow_dispatch run since
 * `sinceIso`). Once the run is completed, also parse a JUnit artifact (if the
 * workflow uploaded one) into pass/fail counts.
 */
export async function getTestRunStatusAction(
  repoRef: string,
  ref: string,
  sinceIso: string
): Promise<{ run: WorkflowRunInfo | null; summary: TestSummary | null } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const run = await findWorkflowRunSince(parsed.owner, parsed.repo, ref, sinceIso);
    let summary: TestSummary | null = null;
    if (run && run.status === "completed") {
      try {
        summary = await fetchJUnitSummary(parsed.owner, parsed.repo, run.id);
      } catch {
        summary = null; // no readable JUnit report — fall back to the conclusion
      }
    }
    return { run, summary };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the test run status." };
  }
}

// A test workflow per language/runtime: runs the tests and uploads a JUnit
// report as the "test-results" artifact, triggerable via the UI (workflow_dispatch).
function testWorkflowYaml(template: string, customCommand: string): string {
  const head = "name: Tests\non:\n  workflow_dispatch:\n  push:\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n";
  const upload = (path: string) =>
    `      - uses: actions/upload-artifact@v4\n        if: always()\n        with:\n          name: test-results\n          path: ${path}\n          if-no-files-found: ignore\n`;
  if (template === "python") {
    return (
      head +
      "      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.x'\n" +
      "      - run: pip install -r requirements.txt || true\n" +
      "      - run: pip install pytest\n" +
      "      - run: pytest --junitxml=test-results/results.xml\n" +
      upload("test-results/")
    );
  }
  if (template === "node") {
    return (
      head +
      "      - uses: actions/setup-node@v4\n        with:\n          node-version: '20'\n" +
      "      - run: npm ci || npm install\n" +
      "      - run: npm test\n" +
      upload("'**/junit*.xml'")
    );
  }
  if (template === "java") {
    return (
      head +
      "      - uses: actions/setup-java@v4\n        with:\n          distribution: temurin\n          java-version: '17'\n" +
      "      - run: mvn -B test\n" +
      upload("'**/surefire-reports/*.xml'")
    );
  }
  // custom command
  const cmd = customCommand.trim() || "echo 'set a test command'";
  return head + `      - run: ${cmd}\n` + upload("'**/*.xml'");
}

/**
 * Write a standard unit-test workflow (.github/workflows/tests.yml) into a repo,
 * so repos without one become runnable from the UI. Needs the token's `workflow`
 * scope. `template` is "node" | "python" | "java" | "custom".
 */
export async function setupTestsWorkflowAction(
  repoRef: string,
  branch: string | undefined,
  template: string,
  customCommand = ""
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const yaml = testWorkflowYaml(template, customCommand);
    await putFile(parsed.owner, parsed.repo, ".github/workflows/tests.yml", yaml, "Add unit-test workflow", branch || undefined);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the test workflow." };
  }
}

// ── Organization + Repo Management ──────────────────────────────────────────

export async function listOrgMembersAction(org: string): Promise<{ members: OrgMember[] } | { error: string }> {
  try {
    await requireOwner();
    const trimmed = org.trim();
    if (!trimmed) return { error: "Choose an organization." };
    return { members: await listOrgMembers(trimmed) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list organization members." };
  }
}

export async function inviteOrgMemberAction(
  org: string,
  invitee: string,
  role: "admin" | "member"
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const trimmed = org.trim();
    if (!trimmed) return { error: "Choose an organization." };
    if (!invitee.trim()) return { error: "Enter a GitHub username or email to invite." };
    await inviteOrgMember(trimmed, invitee, role);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not invite the member." };
  }
}

export async function setOrgMemberRoleAction(
  org: string,
  username: string,
  role: "admin" | "member"
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const trimmed = org.trim();
    if (!trimmed) return { error: "Choose an organization." };
    await setOrgMemberRole(trimmed, username, role);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the member role." };
  }
}

export async function listRepoCollaboratorsAction(repoRef: string): Promise<{ collaborators: RepoCollaborator[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { collaborators: await listRepoCollaborators(parsed.owner, parsed.repo) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list collaborators." };
  }
}

export async function setRepoCollaboratorAction(
  repoRef: string,
  username: string,
  permission: RepoPermission
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await setRepoCollaborator(parsed.owner, parsed.repo, username, permission);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the collaborator." };
  }
}

export async function createPullRequestAction(
  repoRef: string,
  title: string,
  head: string,
  base: string,
  body: string
): Promise<{ number: number; htmlUrl: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    if (!title.trim()) return { error: "Enter a pull request title." };
    if (!head.trim()) return { error: "Enter the head branch." };
    if (!base.trim()) return { error: "Enter the base branch." };
    return await createPullRequest(parsed.owner, parsed.repo, { title, head, base, body });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the pull request." };
  }
}

export async function setBranchProtectionAction(
  repoRef: string,
  branch: string,
  opts: BranchProtectionOptions
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await setBranchProtection(parsed.owner, parsed.repo, branch, opts);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not set branch protection." };
  }
}


export async function updateRepoAction(
  repoRef: string,
  patch: UpdateRepoPatch
): Promise<{ repo: GithubRepo } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const repo = await updateRepo(parsed.owner, parsed.repo, patch);
    return { repo };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the repository." };
  }
}

/** Grade a student's GitHub repo against a rubric (generating one if not given). */
export async function gradeRepoAction(
  repoRef: string,
  assignmentInstructions: string,
  rubric: string,
  provider: LlmProvider = "gemini",
  branch?: string
): Promise<{ run: GradingRun; rubric: string; fullName: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const digest = await ingestRepo(parsed.owner, parsed.repo, {}, branch);
    const instructions = assignmentInstructions.trim() || `Evaluate the repository "${digest.fullName}".`;

    // Embedded Deterministic Engine: grade the repo in-process against the
    // supplied rubric, or one generated from the instructions. No model call.
    if (provider === "embedded") {
      const builtRubric = buildEmbeddedRubric({ rubricText: rubric, instructions });
      if (builtRubric.checks.length === 0) {
        return { error: builtRubric.warnings[0] ?? "Provide a rubric or assignment instructions." };
      }
      // Grow the rubric bank from human-authored rubrics (fire-and-forget).
      if (rubric.trim()) void rememberRubric(instructions, rubric);
      const run = gradeEntriesEmbedded([repoDigestToEmbeddedEntry(digest)], builtRubric);
      return { run, rubric: renderRubricText(builtRubric), fullName: digest.fullName };
    }

    const effectiveRubric = rubric.trim() || (await generateRubric(`${instructions}\n\n${digest.text}`, provider));
    const entry: StudentSubmissionEntry = {
      student: digest.fullName,
      content: digest.text,
      mergedFileCount: digest.fileCount,
      submittedFiles: [],
    };
    const run = await gradeEntries([entry], instructions, effectiveRubric, provider);
    return { run, rubric: effectiveRubric, fullName: digest.fullName };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not grade the repository." };
  }
}

/**
 * Download a repo as a zip whose entries sit at the root (GitHub wraps everything
 * in a "<repo>-<sha>/" folder; we strip it) so the result is a drop-in for the
 * uploaded-zip flows in lecture and syllabus planning.
 */
export async function getRepoZipAction(
  repoRef: string,
  branch?: string
): Promise<{ base64: string; name: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const buffer = await downloadRepoZipball(parsed.owner, parsed.repo, branch);
    const JSZipMod = (await import("jszip")).default;
    const src = await JSZipMod.loadAsync(buffer);
    // The wrapper folder is the common first path segment of every entry.
    let wrapper = "";
    src.forEach((path) => {
      if (!wrapper) wrapper = path.split("/")[0];
    });
    const out = new JSZipMod();
    const entries: Array<{ path: string; file: import("jszip").JSZipObject }> = [];
    src.forEach((path, file) => {
      if (!file.dir) entries.push({ path, file });
    });
    for (const { path, file } of entries) {
      const stripped = wrapper && path.startsWith(`${wrapper}/`) ? path.slice(wrapper.length + 1) : path;
      if (stripped) out.file(stripped, await file.async("uint8array"));
    }
    const base64 = await out.generateAsync({ type: "base64" });
    return { base64, name: `${parsed.repo}.zip` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not download the repository." };
  }
}


/**
 * Generate a course schedule from a repository's actual assignment structure,
 * deriving week plan and test distribution from the found assignment folders.
 * Returns a courseTitle and the structured week plan used by workflows.
 */
export async function generateSchedulePlanFromRepoAction(
  repoRef: string,
  weeks: number | null,
  tests: number | null,
  provider: LlmProvider = "gemini",
  courseDescription?: string
): Promise<{ courseTitle: string; schedule: ScheduleWeekPlan[] } | { error: string }> {
  try {
    await requireOwner();

    // Parse and validate repo reference
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const { owner, repo } = parsed;

    // Download and load the repo zipball
    const buffer = await downloadRepoZipball(owner, repo);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    const allPaths = Object.keys(zip.files);

    // Find assignment folders
    const prefix = findAssignmentsPrefix(allPaths);
    if (!prefix) {
      return { error: "No assignment folders found in the repository." };
    }

    const folders = listAssignmentFolders(allPaths, prefix);
    if (folders.length === 0) {
      return { error: "No assignment folders found in the repository." };
    }

    // Extract content bundles for each folder
    const bundles: (AssignmentContentBundle | null)[] = [];
    for (const folder of folders) {
      const bundle = await extractAssignmentContentBundle(zip, allPaths, prefix, folder);
      bundles.push(bundle);
    }

    // Filter out null bundles
    const validBundles = bundles.filter((b) => b !== null) as AssignmentContentBundle[];
    if (validBundles.length === 0) {
      return { error: "No assignment folders found in the repository." };
    }

    // Read README.md if present (under the prefix wrapper)
    let readmeContent = "";
    const readmeFiles = allPaths.filter(
      (p) => p.startsWith(prefix) && p.toLowerCase().endsWith("readme.md")
    );
    if (readmeFiles.length > 0) {
      try {
        const readmeFile = readmeFiles[0];
        let content = await zip.files[readmeFile].async("string");
        if (content.length > 4000) {
          content = content.slice(0, 4000) + "\n... (truncated)";
        }
        readmeContent = content;
      } catch {
        // skip unreadable README
      }
    }

    // Derive week and test counts
    const folderCount = validBundles.length;
    const weekCount = Number.isInteger(weeks) && weeks !== null && weeks > 0 && weeks <= 52
      ? Math.min(weeks, 52)
      : folderCount;
    const testCount = Number.isInteger(tests) && tests !== null && tests >= 0 && tests <= weekCount
      ? tests
      : 0;

    // Build per-folder digest strings (truncated to ~2000 chars each)
    const folderDigests: string[] = [];
    for (const bundle of validBundles) {
      let digest = `Folder: ${bundle.name}\n`;
      let contentSlice = bundle.content;
      if (contentSlice.length > 2000) {
        contentSlice = contentSlice.slice(0, 2000) + "\n... (truncated)";
      }
      digest += contentSlice;
      folderDigests.push(digest);
    }

    // Build the prompt
    const prompt = `You are an expert curriculum designer. Given a repository's assignment folders with their content, plus the README, produce a JSON object ONLY (no markdown fences) with:
- "courseTitle": a clear, concise title for the course
- "weeks": an array with exactly ${weekCount} week objects, each with:
  - "week": 1-based week number
  - "topic": short topic name
  - "summary": 1-2 sentence description
  - "assignmentTitle": string or null (null only for review/test weeks)
  - "assignmentSlug": kebab-case slug matching the folder name exactly, or null
  - "testName": string like "Test 1" or null

Requirements:
- Each of the ${folderCount} assignment folders must appear as exactly ONE week's assignment IN ORDER, with assignmentSlug set to its folder name.
- Distribute exactly ${testCount} tests evenly (place final test in week ${weekCount} if testCount > 0).
- Weeks beyond folder count should have review/consolidation topics with null assignment and null test.
- Every non-test week must have an assignment.
- Topics should progress from foundational to advanced.
${courseDescription ? `- Topics and summaries should align with the course description provided below.` : ""}

${courseDescription ? `COURSE DESCRIPTION (context from the instructor):
${courseDescription.length > 2000 ? courseDescription.slice(0, 2000) + "\n... (truncated)" : courseDescription}

` : ""}Repository README:
${readmeContent}

Assignment folders and their content:
${folderDigests.join("\n\n---\n\n")}`;

    const r = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!r.ok) return { error: "The model returned no schedule." };

    const parsedPlan = extractJsonObject(r.text);
    if (!parsedPlan || typeof parsedPlan !== "object") {
      return { error: "Could not parse the generated schedule. Try again." };
    }

    // Extract and validate weeks array
    const weeksArray = parsedPlan.weeks;
    if (!Array.isArray(weeksArray)) {
      return { error: "Could not parse the generated schedule. Try again." };
    }

    if (weeksArray.length < weekCount) {
      return { error: "The model returned the wrong number of weeks. Try again." };
    }

    // Trim to exact count if extras exist
    const schedule: ScheduleWeekPlan[] = weeksArray.slice(0, weekCount).map((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) {
        return {
          week: 0,
          topic: "",
          summary: "",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        };
      }
      const e = entry as Record<string, unknown>;
      return {
        week: Number(e.week) || 0,
        topic: typeof e.topic === "string" ? e.topic.trim() : "",
        summary: typeof e.summary === "string" ? e.summary.trim() : "",
        assignmentTitle: typeof e.assignmentTitle === "string" ? e.assignmentTitle.trim() : null,
        assignmentSlug: typeof e.assignmentSlug === "string" ? e.assignmentSlug.trim() : null,
        testName: typeof e.testName === "string" ? e.testName.trim() : null,
      };
    });

    // Derive courseTitle with fallback (repo name)
    let courseTitle = "";
    if (typeof parsedPlan.courseTitle === "string") {
      courseTitle = parsedPlan.courseTitle.trim();
    }
    if (!courseTitle) {
      courseTitle = repo.charAt(0).toUpperCase() + repo.slice(1);
    }

    return { courseTitle, schedule };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the schedule from the repository." };
  }
}

/**
 * Generate and write assignment README.md files based on a course schedule.
 * Creates one README per assignment in the course, with objectives, directions, deliverables, and submission instructions.
 */
export async function fillAssignmentReadmesAction(
  repoRef: string,
  schedule: ScheduleWeekPlan[],
  courseDescription: string,
  provider: LlmProvider = "gemini"
): Promise<{ written: string[]; repoUrl: string } | { error: string }> {
  try {
    await requireOwner();

    // Parse and validate repo reference
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const { owner, repo } = parsed;

    // Collect assignments (non-null assignmentTitle, sorted by week)
    const assignments = schedule
      .filter((w) => w.assignmentTitle !== null)
      .sort((a, b) => a.week - b.week);

    if (assignments.length === 0) {
      return { error: "The schedule contains no assignments to document." };
    }

    // Fetch repo tree
    let allPaths: string[] = [];
    try {
      const tree = await getRepoTree(owner, repo);
      allPaths = tree.map((e: RepoTreeEntry) => e.path);
    } catch {
      allPaths = [];
    }

    // Determine assignments folder prefix using the same logic as findAssignmentsPrefix
    const candidatePattern = /^(assignments?|homeworks?|hw|labs?|projects?|exercises?|problems?)$/i;
    let prefix = "";
    const topFolders = new Set<string>();
    for (const path of allPaths) {
      const m = path.match(/^([^/]+)\//);
      if (m) topFolders.add(m[1]);
    }
    for (const folder of topFolders) {
      if (candidatePattern.test(folder)) {
        prefix = folder + "/";
        break;
      }
    }
    if (!prefix) {
      for (const path of allPaths) {
        const m = path.match(/^[^/]+\/([^/]+)\//);
        if (m && candidatePattern.test(m[1])) {
          const firstSlash = path.indexOf("/");
          const secondSlash = path.indexOf("/", firstSlash + 1);
          if (firstSlash !== -1 && secondSlash !== -1) {
            prefix = path.slice(0, secondSlash + 1);
            break;
          }
        }
      }
    }
    if (!prefix) prefix = "assignments/";

    // Extract existing assignment folders (unique sorted second-level folder names)
    const existingFolders = new Set<string>();
    for (const path of allPaths) {
      if (path.startsWith(prefix)) {
        const parts = path.slice(prefix.length).split("/");
        if (parts.length >= 2 && parts[0]) existingFolders.add(parts[0]);
      }
    }
    const existingList = Array.from(existingFolders).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );

    // Helper to sanitize slug
    const sanitizeSlug = (slug: string): string => {
      return slug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
    };

    // Build target folder for each assignment
    const assignmentFolders: Array<{ week: number; folder: string; title: string; topic: string; summary: string }> = [];
    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      let folder: string;
      if (i < existingList.length) {
        folder = existingList[i];
      } else {
        const slug = a.assignmentSlug ? sanitizeSlug(a.assignmentSlug) : "assignment";
        folder = `week-${String(a.week).padStart(2, "0")}-${slug}`;
      }
      assignmentFolders.push({
        week: a.week,
        folder,
        title: a.assignmentTitle || "",
        topic: a.topic,
        summary: a.summary,
      });
    }

    // Call LLM once to generate all READMEs
    const assignmentsList = assignmentFolders
      .map((a) => `Week ${a.week}: "${a.title}" (${a.topic}) - ${a.summary}`)
      .join("\n");

    const llmPrompt = `You are an instructor creating assignment documentation. Generate GitHub-flavored markdown README.md files for these assignments.

Course description: ${courseDescription}

Assignments:
${assignmentsList}

Return ONLY a JSON array with one object per assignment, in the same order:
[
  {
    "week": number,
    "readme": "complete markdown with H1 title, overview paragraph, ## Objectives (bullets), ## Directions (numbered steps), ## Deliverables (bullets), ## Submission (paragraph). 200-400 words. No emojis."
  },
  ...
]`;

    const llmRes = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: llmPrompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!llmRes.ok) return { error: "The model returned no directions." };

    const readmesRaw = parseLenientJsonArray(llmRes.text);
    if (!readmesRaw || !Array.isArray(readmesRaw)) {
      return { error: "Could not parse the generated directions. Try again." };
    }

    // Map by array order, skip extras
    const readmesMap = new Map<number, string>();
    readmesRaw.forEach((item: unknown, idx: number) => {
      if (idx < assignmentFolders.length && typeof item === "object" && item !== null) {
        const i = item as Record<string, unknown>;
        if (typeof i.readme === "string") {
          readmesMap.set(idx, i.readme);
        }
      }
    });

    // Write each assignment README
    const written: string[] = [];
    for (let i = 0; i < assignmentFolders.length; i++) {
      const a = assignmentFolders[i];
      const readme = readmesMap.get(i);
      if (!readme) continue;

      const filePath = `${prefix}${a.folder}/README.md`;
      try {
        await putFile(owner, repo, filePath, readme, `Add assignment directions: ${a.title}`);
        written.push(filePath);
      } catch {
        // Continue on individual write failures
      }
    }

    if (written.length === 0) {
      return { error: "No README files could be written to the repository." };
    }

    return { written, repoUrl: `https://github.com/${owner}/${repo}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not fill assignment directions." };
  }
}

function parseAssignmentRef(
  assignmentUrl: string,
  repoRef: string
): { assignmentId: string; owner: string; repo: string } | { error: string } {
  const assignmentId = assignmentUrl.match(/\/assignments\/(\d+)/)?.[1];
  if (!assignmentId) return { error: "Paste a Canvas assignment URL (…/courses/<id>/assignments/<id>)." };
  const parsed = parseRepoRef(repoRef);
  if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
  return { assignmentId, owner: parsed.owner, repo: parsed.repo };
}

/** Load both sides of an assignment's instructions (Canvas + repo file) for review. */
export async function getAssignmentSyncStateAction(
  assignmentUrl: string,
  repoRef: string,
  path: string,
  acronym?: string,
  branch?: string
): Promise<
  { title: string; canvasMarkdown: string; repoMarkdown: string | null; path: string } | { error: string }
> {
  try {
    await requireOwner();
    const ref = parseAssignmentRef(assignmentUrl, repoRef);
    if ("error" in ref) return ref;
    const item = await getAccessibilityItem(assignmentUrl, "assignment", ref.assignmentId, acronym);
    if (!item) return { error: "Could not load that Canvas assignment." };
    const resolvedPath = path.trim() || `assignments/${assignmentSlug(item.title)}/README.md`;
    let repoMarkdown: string | null = null;
    try {
      repoMarkdown = await getFileText(ref.owner, ref.repo, resolvedPath, branch);
    } catch {
      repoMarkdown = null; // file not there yet
    }
    return { title: item.title, canvasMarkdown: htmlToMarkdown(item.html), repoMarkdown, path: resolvedPath };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the assignment." };
  }
}

/** Push Canvas assignment instructions into the repo file (as Markdown). */
export async function syncAssignmentToRepoAction(
  assignmentUrl: string,
  repoRef: string,
  path: string,
  acronym?: string,
  branch?: string
): Promise<{ ok: true; path: string } | { error: string }> {
  try {
    await requireOwner();
    const ref = parseAssignmentRef(assignmentUrl, repoRef);
    if ("error" in ref) return ref;
    const item = await getAccessibilityItem(assignmentUrl, "assignment", ref.assignmentId, acronym);
    if (!item) return { error: "Could not load that Canvas assignment." };
    const resolvedPath = path.trim() || `assignments/${assignmentSlug(item.title)}/README.md`;
    const markdown = `# ${item.title}\n\n${htmlToMarkdown(item.html)}\n`;
    await putFile(ref.owner, ref.repo, resolvedPath, markdown, `Sync "${item.title}" instructions from Canvas`, branch);
    return { ok: true, path: resolvedPath };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not write to the repository." };
  }
}

/** Pull the repo file (Markdown) into the Canvas assignment description (as HTML). */
export async function syncAssignmentFromRepoAction(
  assignmentUrl: string,
  repoRef: string,
  path: string,
  acronym?: string,
  branch?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const ref = parseAssignmentRef(assignmentUrl, repoRef);
    if ("error" in ref) return ref;
    if (!path.trim()) return { error: "Specify the repo file path to pull from." };
    let markdown: string;
    try {
      markdown = await getFileText(ref.owner, ref.repo, path.trim(), branch);
    } catch {
      return { error: "That file wasn't found in the repository." };
    }
    await saveAccessibilityItemHtml(assignmentUrl, "assignment", ref.assignmentId, markdownToHtml(markdown), acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the Canvas assignment." };
  }
}

/** Generate a teachable course outline (weekly schedule + assignments) from a repo. */

// ── Repository operations (fork, branches, commits, PRs, Actions) ───────────

export async function forkRepoAction(repoRef: string, org?: string): Promise<{ repo: GithubRepo } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const repo = await forkRepo(parsed.owner, parsed.repo, org?.trim());
    return { repo };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not fork the repository." };
  }
}

export async function copyRepoAction(
  repoRef: string,
  opts: CopyRepoOptions
): Promise<{ result: CopyRepoResult } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const result = await copyRepo(parsed.owner, parsed.repo, opts);
    return { result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not copy the repository." };
  }
}

export async function copyPathsToRepoAction(
  repoRef: string,
  opts: CopyPathsOptions
): Promise<{ result: CopyPathsResult } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const result = await copyPathsToRepo(parsed.owner, parsed.repo, opts);
    return { result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not copy files to the repository." };
  }
}

export async function detectRepoFrontendAction(fullName: string): Promise<{ frontend: { framework: string; devCommand: string } | null; backend: BackendInfo | null } | { error: string }> {
  try {
    await requireOwner();
    const parts = fullName.split("/");
    if (parts.length !== 2) {
      return { frontend: null, backend: null };
    }
    const [owner, repo] = parts;

    // Fetch files in parallel with individual catches
    const [packageJsonResult, requirementsTxtResult, pyprojectTomlResult, pipfileResult] = await Promise.all([
      getFileText(owner, repo, "package.json").catch(() => undefined),
      getFileText(owner, repo, "requirements.txt").catch(() => undefined),
      getFileText(owner, repo, "pyproject.toml").catch(() => undefined),
      getFileText(owner, repo, "Pipfile").catch(() => undefined),
    ]);

    const frontend = classifyFrontend(packageJsonResult ?? "");
    const backend = classifyBackend({
      packageJson: packageJsonResult,
      requirementsTxt: requirementsTxtResult,
      pyprojectToml: pyprojectTomlResult,
      pipfile: pipfileResult,
    });

    return { frontend, backend };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not detect frontend/backend framework." };
  }
}

export async function createBranchAction(repoRef: string, newBranch: string, fromBranch: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    if (!newBranch.trim()) return { error: "Enter a new branch name." };
    if (!fromBranch.trim()) return { error: "Select a source branch." };
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await createBranch(parsed.owner, parsed.repo, newBranch.trim(), fromBranch.trim());
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the branch." };
  }
}

export async function deleteBranchAction(repoRef: string, branch: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    if (!branch.trim()) return { error: "Select a branch to delete." };
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await deleteBranch(parsed.owner, parsed.repo, branch.trim());
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the branch." };
  }
}


export async function listPullRequestsAction(repoRef: string, state: "open" | "closed" | "all" = "open"): Promise<{ pulls: PullRequestInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const pulls = await listPullRequests(parsed.owner, parsed.repo, state);
    return { pulls };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list pull requests." };
  }
}

export async function mergePullRequestAction(repoRef: string, prNumber: number, method: "merge" | "squash" | "rebase" = "merge"): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await mergePullRequest(parsed.owner, parsed.repo, prNumber, method);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not merge the pull request." };
  }
}

export async function markPullRequestReadyAction(repoRef: string, prNumber: number): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await markPullRequestReady(parsed.owner, parsed.repo, prNumber);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not mark the pull request as ready." };
  }
}

/**
 * Attention counts for a repo's badges: open non-draft pull requests (agent or
 * human, awaiting review/merge) and workflow runs blocked on approval
 * (waiting = deployment review, action_required = fork approval).
 */
export async function getRepoAttentionAction(
  repoRef: string
): Promise<{ openPrs: number; agentPrs: number; runsNeedingApproval: number } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const [pulls, waiting, actionRequired] = await Promise.all([
      listPullRequests(parsed.owner, parsed.repo, "open"),
      listWorkflowRuns(parsed.owner, parsed.repo, { status: "waiting", perPage: 50 }),
      listWorkflowRuns(parsed.owner, parsed.repo, { status: "action_required", perPage: 50 }),
    ]);
    const ready = pulls.filter((p) => !p.draft);
    return {
      openPrs: ready.length,
      // Copilot coding-agent PRs work on copilot/* branches; a ready (non-draft)
      // one means the agent finished and is waiting on review.
      agentPrs: ready.filter((p) => p.head.startsWith("copilot/")).length,
      runsNeedingApproval: waiting.length + actionRequired.length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load attention counts." };
  }
}

/** List the reviews submitted on a pull request. */
export async function listPullRequestReviewsAction(
  repoRef: string,
  prNumber: number
): Promise<{ reviews: PullRequestReviewInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { reviews: await listPullRequestReviews(parsed.owner, parsed.repo, prNumber) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load reviews." };
  }
}

/** List the files a pull request changes, with their diffs. */
export async function listPullRequestFilesAction(
  repoRef: string,
  prNumber: number
): Promise<{ files: PullRequestFileInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { files: await listPullRequestFiles(parsed.owner, parsed.repo, prNumber) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the pull request's files." };
  }
}

/** Submit a review on a pull request (approve or request changes). */
export async function reviewPullRequestAction(
  repoRef: string,
  prNumber: number,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  body?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    if (event !== "APPROVE" && !body?.trim()) {
      return { error: "Add a comment explaining the requested changes." };
    }
    await reviewPullRequest(parsed.owner, parsed.repo, prNumber, event, body);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not submit the review." };
  }
}

export async function listWorkflowRunsAction(
  repoRef: string,
  branch?: string,
  opts?: { status?: string; workflowId?: number }
): Promise<{ runs: WorkflowRunInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const runs = await listWorkflowRuns(parsed.owner, parsed.repo, {
      branch: branch?.trim() || undefined,
      status: opts?.status,
      workflowId: opts?.workflowId,
    });
    return { runs };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list workflow runs." };
  }
}

export async function listRunJobsAction(repoRef: string, runId: number): Promise<{ jobs: WorkflowJobInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const jobs = await listRunJobs(parsed.owner, parsed.repo, runId);
    return { jobs };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list workflow jobs." };
  }
}

export async function rerunWorkflowRunAction(repoRef: string, runId: number): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await rerunWorkflowRun(parsed.owner, parsed.repo, runId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not rerun the workflow." };
  }
}

export async function cancelWorkflowRunAction(repoRef: string, runId: number): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await cancelWorkflowRun(parsed.owner, parsed.repo, runId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not cancel the workflow." };
  }
}

export async function rerunFailedJobsAction(repoRef: string, runId: number): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await rerunFailedJobs(parsed.owner, parsed.repo, runId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not re-run the failed jobs." };
  }
}

export async function setWorkflowEnabledAction(repoRef: string, workflowId: number, enabled: boolean): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await setWorkflowEnabled(parsed.owner, parsed.repo, workflowId, enabled);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the workflow." };
  }
}

export async function listRunArtifactsAction(repoRef: string, runId: number): Promise<{ artifacts: ArtifactInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { artifacts: await listRunArtifacts(parsed.owner, parsed.repo, runId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list artifacts." };
  }
}

export async function getArtifactDownloadUrlAction(repoRef: string, artifactId: number): Promise<{ url: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { url: await getArtifactDownloadUrl(parsed.owner, parsed.repo, artifactId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not get the artifact download link." };
  }
}

export async function getRunLogsDownloadUrlAction(repoRef: string, runId: number): Promise<{ url: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { url: await getRunLogsDownloadUrl(parsed.owner, parsed.repo, runId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not get the logs download link." };
  }
}

export async function listPendingDeploymentsAction(repoRef: string, runId: number): Promise<{ deployments: PendingDeployment[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { deployments: await listPendingDeployments(parsed.owner, parsed.repo, runId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list pending deployments." };
  }
}

export async function reviewPendingDeploymentsAction(
  repoRef: string,
  runId: number,
  environmentIds: number[],
  state: "approved" | "rejected",
  comment: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await reviewPendingDeployments(parsed.owner, parsed.repo, runId, environmentIds, state, comment);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not submit the deployment review." };
  }
}

export async function getRepoTreeAction(repoRef: string, ref?: string): Promise<{ tree: RepoTreeEntry[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const tree = await getRepoTree(parsed.owner, parsed.repo, ref?.trim());
    return { tree };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the repository tree." };
  }
}

export async function getFileTextAction(repoRef: string, path: string, ref?: string): Promise<{ content: string } | { error: string }> {
  try {
    await requireOwner();
    if (!path.trim()) return { error: "Enter a file path." };
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const content = await getFileText(parsed.owner, parsed.repo, path.trim(), ref?.trim());
    return { content };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the file." };
  }
}

export async function commitFileAction(repoRef: string, path: string, content: string, message: string, branch: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    if (!path.trim()) return { error: "Enter a file path." };
    if (!message.trim()) return { error: "Enter a commit message." };
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await putFile(parsed.owner, parsed.repo, path.trim(), content, message.trim(), branch.trim() || undefined);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not commit the file." };
  }
}
