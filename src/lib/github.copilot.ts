// Copilot coding agent integration: create tasks, monitor PRs.

import { ghJson, ghError, githubToken } from "./github.repos";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";

/** Minimal GitHub GraphQL POST using the same token as the REST client. */
async function ghGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken()}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(ghError(res.status, await res.text().catch(() => "")));
  }
  const body = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (body.errors && body.errors.length > 0) {
    throw new Error(`GitHub GraphQL error: ${body.errors.map((e) => e.message).filter(Boolean).join("; ")}`);
  }
  if (!body.data) throw new Error("GitHub GraphQL returned no data.");
  return body.data;
}

/**
 * The Copilot coding agent's assignable actor id for a repo, or null when it is
 * not available there (coding agent not enabled for the account/org).
 */
async function getCopilotActorId(owner: string, repo: string): Promise<string | null> {
  const data = await ghGraphql<{
    repository?: { suggestedActors?: { nodes?: Array<{ login?: string; id?: string }> } };
  }>(
    `query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        suggestedActors(capabilities: [CAN_BE_ASSIGNED], first: 100) {
          nodes { login __typename ... on Bot { id } ... on User { id } }
        }
      }
    }`,
    { owner, repo }
  );
  const nodes = data.repository?.suggestedActors?.nodes ?? [];
  const copilot = nodes.find(
    (n) => n?.login === "copilot-swe-agent" || n?.login?.toLowerCase() === "copilot"
  );
  return copilot?.id ?? null;
}

/** Create an issue and return its number, GraphQL node id, and URL. */
async function createIssue(
  owner: string,
  repo: string,
  title: string,
  body: string
): Promise<{ number: number; nodeId: string; htmlUrl: string }> {
  const raw = await ghJson<{ number?: number; node_id?: string; html_url?: string }>(
    `/repos/${owner}/${repo}/issues`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body }) }
  );
  return { number: raw.number ?? 0, nodeId: raw.node_id ?? "", htmlUrl: raw.html_url ?? "" };
}

/** Assign a set of actors (e.g. the Copilot coding agent) to an issue by node id. */
async function replaceAssignees(assignableId: string, actorIds: string[]): Promise<void> {
  await ghGraphql(
    `mutation($assignableId: ID!, $actorIds: [ID!]!) {
      replaceActorsForAssignable(input: { assignableId: $assignableId, actorIds: $actorIds }) {
        assignable { __typename }
      }
    }`,
    { assignableId, actorIds }
  );
}

/**
 * Create an issue with the given title/body and assign it to the Copilot coding
 * agent, which works on it and opens a PR. Returns the issue URL/number. Throws a
 * clear error when the Copilot coding agent is not available for the repo.
 */
export async function createCopilotAgentTask(
  owner: string,
  repo: string,
  title: string,
  body: string
): Promise<{ issueUrl: string; issueNumber: number }> {
  const copilotId = await getCopilotActorId(owner, repo);
  if (!copilotId) {
    throw new Error(
      "Copilot coding agent is not available for this repository. Enable Copilot coding agent for the account or organization, then assign the created issue to Copilot."
    );
  }
  const issue = await createIssue(owner, repo, title, body);
  if (!issue.nodeId) {
    throw new Error("Could not read the created issue id from GitHub, so Copilot was not assigned.");
  }
  await replaceAssignees(issue.nodeId, [copilotId]);
  return { issueUrl: issue.htmlUrl, issueNumber: issue.number };
}

/**
 * Open a build issue from the prompt and assign it to Copilot, which builds the
 * repo and opens a PR. Thin wrapper over createCopilotAgentTask for the
 * repo-creation flow.
 */
export async function startCopilotBuild(
  owner: string,
  repo: string,
  prompt: string
): Promise<{ issueUrl: string; issueNumber: number }> {
  return createCopilotAgentTask(
    owner,
    repo,
    "Build this project with Copilot",
    `${prompt}\n\n---\n\nAssigned to the GitHub Copilot coding agent to scaffold this repository.`
  );
}

/** The pull request the Copilot coding agent opened for a task, with live status. */
export interface CopilotTaskPr {
  number: number;
  url: string;
  /** OPEN | CLOSED | MERGED. */
  state: string;
  /** True while Copilot is still working (a draft PR). */
  isDraft: boolean;
  /** CI rollup: SUCCESS | FAILURE | PENDING | ERROR | EXPECTED | null. */
  checks: string | null;
  /** APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | null. */
  reviewDecision: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  updatedAt: string;
}

/** One Copilot coding-agent task (a repo issue assigned to Copilot), with details. */
export interface CopilotTask {
  number: number;
  title: string;
  /** Issue state: OPEN | CLOSED. */
  state: string;
  htmlUrl: string;
  /** Kept for back-compat; task items are issues, so this is false. */
  isPullRequest: boolean;
  createdAt: string;
  updatedAt: string;
  labels: string[];
  /** The pull request Copilot opened for this task, if any. */
  pr: CopilotTaskPr | null;
}

/**
 * List a repo's issues assigned to the Copilot coding agent (its tasks), newest
 * first, each enriched with its linked pull request and that PR's live status
 * (draft/open/merged, CI rollup, review decision, diff size). One GraphQL query.
 */
export async function listCopilotTasks(owner: string, repo: string): Promise<CopilotTask[]> {
  const data = await ghGraphql<{
    repository?: {
      issues?: {
        nodes?: Array<{
          number?: number;
          title?: string;
          url?: string;
          state?: string;
          createdAt?: string;
          updatedAt?: string;
          assignees?: { nodes?: Array<{ login?: string }> };
          labels?: { nodes?: Array<{ name?: string }> };
          timelineItems?: {
            nodes?: Array<{
              source?: {
                __typename?: string;
                number?: number;
                url?: string;
                state?: string;
                isDraft?: boolean;
                reviewDecision?: string | null;
                additions?: number;
                deletions?: number;
                changedFiles?: number;
                updatedAt?: string;
                commits?: { nodes?: Array<{ commit?: { statusCheckRollup?: { state?: string } | null } }> };
              };
            }>;
          };
        }>;
      };
    };
  }>(
    `query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(first: 50, orderBy: { field: UPDATED_AT, direction: DESC }, states: [OPEN, CLOSED]) {
          nodes {
            number
            title
            url
            state
            createdAt
            updatedAt
            assignees(first: 5) { nodes { login } }
            labels(first: 10) { nodes { name } }
            timelineItems(itemTypes: [CROSS_REFERENCED_EVENT], first: 30) {
              nodes {
                ... on CrossReferencedEvent {
                  source {
                    __typename
                    ... on PullRequest {
                      number
                      url
                      state
                      isDraft
                      reviewDecision
                      additions
                      deletions
                      changedFiles
                      updatedAt
                      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { owner, repo }
  );

  const nodes = data.repository?.issues?.nodes ?? [];
  return nodes
    .filter((n) => (n.assignees?.nodes ?? []).some((a) => /copilot/i.test(a?.login ?? "")))
    .map((n) => {
      const prs = (n.timelineItems?.nodes ?? [])
        .map((t) => t?.source)
        .filter((s): s is NonNullable<typeof s> => !!s && s.__typename === "PullRequest" && typeof s.number === "number")
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      const p = prs[0];
      const pr: CopilotTaskPr | null = p
        ? {
            number: p.number ?? 0,
            url: p.url ?? "",
            state: p.state ?? "",
            isDraft: !!p.isDraft,
            checks: p.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null,
            reviewDecision: p.reviewDecision ?? null,
            additions: p.additions ?? 0,
            deletions: p.deletions ?? 0,
            changedFiles: p.changedFiles ?? 0,
            updatedAt: p.updatedAt ?? "",
          }
        : null;
      return {
        number: n.number ?? 0,
        title: n.title ?? `#${n.number ?? 0}`,
        state: n.state ?? "",
        htmlUrl: n.url ?? "",
        isPullRequest: false,
        createdAt: n.createdAt ?? "",
        updatedAt: n.updatedAt ?? "",
        labels: (n.labels?.nodes ?? []).map((l) => l?.name ?? "").filter(Boolean),
        pr,
      };
    });
}
