"use server";

// Repo Grades view - SERVER LAYER wave (docs/repo-grades-view-acceptance-criteria.md).
// This file is the client/server boundary the view's later UI wave must go
// through: src/lib/github*.ts reads process.env.GITHUB_TOKEN and is
// server-only, so nothing client-side may import it directly (AC6 item 33) -
// every action below is the only door in. Every action is owner-gated
// (`requireOwner()`, first line, before anything else runs) and returns a
// discriminated `{...} | { error: string }` rather than throwing, matching
// every other action module in this codebase (see src/app/actions/github-repos.ts,
// src/app/actions/course-tasks.ts).
//
// A "use server" module may export ONLY async functions - no types, no
// consts, no re-exports (src/lib/use-server-exports.test.ts guards this at
// the vitest layer; `next build` is the only gate that actually enforces it
// for real - see AC6 item 34). That is why the two actions below are thin:
// listCourseAssignmentsAction is a direct pass-through to an existing lib
// function, and loadOrgRepoTreesAction's entire decision logic (bounded
// concurrency, per-repo isolation, the truncation check, rate-limit
// classification) lives in the pure, independently-tested
// src/lib/repo-grade-tree-scan.ts, which this file only wires real fetchers
// into.

import { requireOwner } from "@/lib/supabase/auth";
import { listOrgRepos, getRepoTree } from "@/lib/github";
import { listAssignments, type CanvasAssignmentBrief } from "@/lib/canvas";
import { scanOrgRepoTrees, type OrgRepoTreesResult } from "@/lib/repo-grade-tree-scan";

/** List a course's Canvas assignments, for the Repo Grades column-to-assignment
 * mapping picker (AC5 item 26). listAssignments (src/lib/canvas/listings.ts:171)
 * already exists and has zero UI consumers today - this is its first
 * server-action wrapper; the lib function itself is untouched. */
export async function listCourseAssignmentsAction(
  institution: string,
  courseId: string
): Promise<{ assignments: CanvasAssignmentBrief[] } | { error: string }> {
  try {
    await requireOwner();
    if (!institution.trim()) return { error: "Choose an institution." };
    if (!courseId.trim()) return { error: "Choose a course." };
    const assignments = await listAssignments(institution.trim().toUpperCase(), courseId.trim());
    return { assignments };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the course's assignments." };
  }
}

/**
 * Enumerates every repo in a GitHub org (optionally name-prefix filtered) and
 * derives each repo's assignment folders from ONE tree fetch per repo (AC3
 * items 12, 17, 18). `repoLimit`, when a positive number, caps how many of
 * the LISTED repos actually get a tree fetch - a safety valve against a very
 * large org's worth of tree fetches overrunning this deployment's 60-second
 * function duration cap (Vercel Hobby), independent of and computed BEFORE
 * the truncation check, which always reflects the full listOrgRepos count.
 * All the actual decision logic lives in scanOrgRepoTrees
 * (src/lib/repo-grade-tree-scan.ts); this action only supplies the real
 * GitHub fetchers.
 */
export async function loadOrgRepoTreesAction(
  org: string,
  prefix: string | undefined,
  repoLimit: number | undefined
): Promise<OrgRepoTreesResult | { error: string }> {
  try {
    await requireOwner();
    if (!org.trim()) return { error: "Provide a GitHub organization." };
    return await scanOrgRepoTrees(org.trim(), prefix?.trim() || undefined, repoLimit, {
      listRepos: (o, p) => listOrgRepos(o, p),
      fetchTreePaths: async (fullName) => {
        const [owner, repo] = fullName.split("/");
        const tree = await getRepoTree(owner, repo);
        return tree.map((entry) => entry.path);
      },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not scan the organization's repositories." };
  }
}
