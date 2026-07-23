"use server";

import type { ClassroomRowResult, RepoQueueItem, TestSummary } from "../actions-types";
import { generateRubric, gradeEntries, type GradingRun, type StudentSubmissionEntry, type SubmittedFileInfo } from "@/lib/grade";
import { parseLenientJsonArray } from "@/lib/lenient-json";
import { buildEmbeddedRubric, gradeEntriesEmbedded, renderRubricText } from "@/lib/embedded-grader";
import { rememberRubric } from "@/lib/research/rubric-bank";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { githubConfigured, githubWebhookSecret, listRepos, listOwnedOrgs, listOrgRepos, listBranches, ingestRepo, parseRepoRef, createRepo, createOrgRepo, startCopilotBuild, createCopilotAgentTask, listCopilotTasks, deletePaths, movePaths, generateFromTemplate, putFile, getFileText, getRepo, listWorkflows, dispatchWorkflow, findWorkflowRunSince, downloadArtifactZip, createOrgPushHook, setRepoCollaborator, updateRepo, deleteRepo, listCommits, getRepoTree, listRunArtifacts, type GithubRepo, type RepoDigest, type WorkflowRunInfo, type WorkflowInfo, type RepoPermission, type CopilotTask, setRepoTopics } from "@/lib/github";
import { listGithubModels, chatWithGithubModel, type GithubModel, type ModelUsage, type ChatMessage } from "@/lib/github-models";
import { requireOwner } from "@/lib/supabase/auth";


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
