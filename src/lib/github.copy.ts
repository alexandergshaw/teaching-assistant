// Repository copying with fine-grained file selection and metadata transfer.

import { getRepo, createRepo, createOrgRepo, ghJson, type GithubRepo } from "./github.repos";
import { ghFetch } from "./github.repos";
import { downloadRepoZipball } from "./github.digest";
import { getRepoTopics, setRepoTopics, listRepoLabels, createRepoLabel } from "./github.metadata";
import { updateRepo } from "./github.repos";

export interface CopyRepoOptions {
  sourceBranch?: string;
  destOrg?: string;
  destName: string;
  description?: string;
  visibility: "private" | "public";
  markTemplate?: boolean;
  paths?: string[] | null;
  includeWorkflows: boolean;
  copyTopics: boolean;
  copyLabels: boolean;
  commitMessage?: string;
}

export interface CopyRepoResult {
  repo: GithubRepo;
  copiedFiles: number;
  skippedFiles: number;
  warnings: string[];
}

/**
 * Copy a repository with fine-grained selection of files, metadata, and options.
 * Follows the Git Data API pattern: create blobs, tree, commit, update refs.
 */
export async function copyRepo(owner: string, repo: string, opts: CopyRepoOptions): Promise<CopyRepoResult> {
  const warnings: string[] = [];
  let copiedFiles = 0;
  let skippedFiles = 0;

  try {
    // a. Resolve source repo and branch
    const sourceRepo = await getRepo(owner, repo);
    const sourceBranch = opts.sourceBranch || sourceRepo.defaultBranch;

    // b. Get tree, filter by paths and workflows, identify submodules
    const branch = opts.sourceBranch || sourceRepo.defaultBranch;
    const rawTreeData = await ghJson<{ tree?: Array<{ path?: string; type?: string; size?: number; sha?: string; mode?: string }> }>(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
    );
    const rawEntries = rawTreeData.tree ?? [];
    const pathsSet = opts.paths ? new Set(opts.paths) : null;

    let selectedBlobs = rawEntries
      .filter((e): e is { path: string; type: "blob"; size?: number; sha?: string; mode?: string } => !!e.path && e.type === "blob")
      .map((t) => ({ path: t.path, type: "blob" as const, size: t.size ?? 0, sha: t.sha ?? "", mode: t.mode }));

    if (pathsSet) {
      selectedBlobs = selectedBlobs.filter((e) => pathsSet.has(e.path));
    }
    if (!opts.includeWorkflows) {
      selectedBlobs = selectedBlobs.filter((e) => !e.path.match(/^\.github\/workflows\//));
    }

    // Track submodules (type "commit" in raw response)
    const submodules = rawEntries.filter((e) => e.type === "commit");
    for (const sub of submodules) {
      const subPath = sub.path ?? "";
      if (!pathsSet || pathsSet.has(subPath)) {
        warnings.push(`Skipped submodule: ${subPath}`);
        skippedFiles += 1;
      }
    }

    // c. Guard: zero selected files and >2000 files
    if (selectedBlobs.length === 0) {
      throw new Error("Nothing selected to copy.");
    }
    if (selectedBlobs.length > 2000) {
      throw new Error(
        `Too many files selected (${selectedBlobs.length} > 2000). Please narrow your selection.`
      );
    }

    // e. Create destination repo with auto-init (before creating blobs)
    const isPrivate = opts.visibility === "private";
    const destRepo =
      opts.destOrg && opts.destOrg.trim()
        ? await createOrgRepo(opts.destOrg, opts.destName, {
            description: opts.description || sourceRepo.description,
            private: isPrivate,
            autoInit: true,
          })
        : await createRepo(opts.destName, {
            description: opts.description || sourceRepo.description,
            private: isPrivate,
            autoInit: true,
          });

    const destOwner = destRepo.owner;

    // d. Download zipball and read file contents as base64
    const zipBuffer = await downloadRepoZipball(owner, repo, sourceBranch);
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    await zip.loadAsync(zipBuffer);

    const blobShaMap = new Map<string, string>();
    const missingFiles: string[] = [];

    for (const blob of selectedBlobs) {
      const zipPaths = Object.keys(zip.files);
      const firstFolder = zipPaths[0]?.split("/")[0];
      const zipPath = firstFolder ? `${firstFolder}/${blob.path}` : blob.path;
      const zipFile = zip.files[zipPath];

      if (!zipFile || zipFile.dir) {
        missingFiles.push(blob.path);
        skippedFiles += 1;
        continue;
      }

      // Create blob
      const content = await zipFile.async("uint8array");
      const base64 = Buffer.from(content).toString("base64");
      const blobRes = await ghJson<{ sha?: string }>(`/repos/${destOwner}/${destRepo.name}/git/blobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: base64, encoding: "base64" }),
      });
      const blobSha = blobRes.sha;
      if (!blobSha) throw new Error(`GitHub did not return a blob SHA for ${blob.path}`);
      blobShaMap.set(blob.path, blobSha);
      copiedFiles += 1;
    }

    if (missingFiles.length > 0) {
      warnings.push(
        `Missing from archive: ${missingFiles.join(", ")}`
      );
    }

    // f. Write contents via Git Data API
    const treeEntries = selectedBlobs.map((blob) => ({
      path: blob.path,
      mode: blob.mode || "100644",
      type: "blob" as const,
      sha: blobShaMap.get(blob.path),
    }));

    const treeRes = await ghJson<{ sha?: string }>(`/repos/${destOwner}/${destRepo.name}/git/trees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tree: treeEntries }),
    });
    const treeSha = treeRes.sha;
    if (!treeSha) throw new Error("GitHub did not return a tree SHA");

    // Get parent commit SHA
    const refRes = await ghJson<{ object?: { sha?: string } }>(
      `/repos/${destOwner}/${destRepo.name}/git/ref/heads/${encodeURIComponent(destRepo.defaultBranch)}`
    );
    const parentSha = refRes.object?.sha;
    if (!parentSha) throw new Error("Could not read the destination branch head");

    const commitMessage = opts.commitMessage || `Copy of ${owner}/${repo}@${sourceBranch}`;
    const commitRes = await ghJson<{ sha?: string }>(`/repos/${destOwner}/${destRepo.name}/git/commits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: commitMessage,
        tree: treeSha,
        parents: [parentSha],
      }),
    });
    const commitSha = commitRes.sha;
    if (!commitSha) throw new Error("GitHub did not return a commit SHA");

    await ghFetch(`/repos/${destOwner}/${destRepo.name}/git/refs/heads/${encodeURIComponent(destRepo.defaultBranch)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: commitSha, force: true }),
    });

    // g. Mark as template if requested
    if (opts.markTemplate) {
      await updateRepo(destOwner, destRepo.name, { isTemplate: true });
    }

    // h. Copy topics
    if (opts.copyTopics) {
      try {
        const topics = await getRepoTopics(owner, repo);
        if (topics.length > 0) {
          await setRepoTopics(destOwner, destRepo.name, topics);
        }
      } catch (err) {
        warnings.push(`Could not copy topics: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    // i. Copy labels
    if (opts.copyLabels) {
      try {
        const srcLabels = await listRepoLabels(owner, repo);
        for (const label of srcLabels) {
          const created = await createRepoLabel(destOwner, destRepo.name, label.name, label.color, label.description);
          if (!created) {
            /* Label already exists (422); silently tolerated */
          }
        }
      } catch (err) {
        warnings.push(`Could not copy all labels: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    // j. Return result
    return {
      repo: destRepo,
      copiedFiles,
      skippedFiles,
      warnings,
    };
  } catch (err) {
    throw err;
  }
}

export interface CopyPathsOptions {
  sourceBranch?: string;
  destOwner: string;
  destRepo: string;
  destBranch?: string;
  destPrefix?: string;
  paths: string[];
  commitMessage?: string;
}

export interface CopyPathsResult {
  copiedFiles: number;
  skippedFiles: number;
  warnings: string[];
  commitSha: string;
  commitUrl: string;
}

/**
 * Copy selected paths from one existing repository to another.
 * Reuses copyRepo's building blocks: zipball download, blob creation, tree/commit creation.
 * The destination must already exist.
 */
export async function copyPathsToRepo(owner: string, repo: string, opts: CopyPathsOptions): Promise<CopyPathsResult> {
  const warnings: string[] = [];
  let copiedFiles = 0;
  let skippedFiles = 0;

  try {
    // 1. Resolve source repo and branch
    const sourceRepo = await getRepo(owner, repo);
    const sourceBranch = opts.sourceBranch || sourceRepo.defaultBranch;

    // 2. Get tree, filter by paths
    const rawTreeData = await ghJson<{ tree?: Array<{ path?: string; type?: string; size?: number; sha?: string; mode?: string }> }>(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(sourceBranch)}?recursive=1`
    );
    const rawEntries = rawTreeData.tree ?? [];
    const pathsSet = new Set(opts.paths);

    const selectedBlobs = rawEntries
      .filter((e): e is { path: string; type: "blob"; size?: number; sha?: string; mode?: string } => !!e.path && e.type === "blob")
      .filter((e) => pathsSet.has(e.path) || opts.paths.some((p) => e.path.startsWith(p + "/")))
      .map((t) => ({ path: t.path, type: "blob" as const, size: t.size ?? 0, sha: t.sha ?? "", mode: t.mode }));

    // Track submodules (type "commit" in raw response)
    const submodules = rawEntries.filter((e) => e.type === "commit");
    for (const sub of submodules) {
      const subPath = sub.path ?? "";
      if (pathsSet.has(subPath) || opts.paths.some((p) => subPath.startsWith(p + "/"))) {
        warnings.push(`Skipped submodule: ${subPath}`);
        skippedFiles += 1;
      }
    }

    // Guard: zero selected files and >2000 files
    if (selectedBlobs.length === 0) {
      throw new Error("Nothing selected to copy.");
    }
    if (selectedBlobs.length > 2000) {
      throw new Error(
        `Too many files selected (${selectedBlobs.length} > 2000). Please narrow your selection.`
      );
    }

    // 3. Get destination repo info
    const destRepoInfo = await getRepo(opts.destOwner, opts.destRepo);
    const destBranch = opts.destBranch || destRepoInfo.defaultBranch;

    // 4. Download zipball and read file contents as base64
    const zipBuffer = await downloadRepoZipball(owner, repo, sourceBranch);
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    await zip.loadAsync(zipBuffer);

    const blobShaMap = new Map<string, string>();
    const missingFiles: string[] = [];

    for (const blob of selectedBlobs) {
      const zipPaths = Object.keys(zip.files);
      const firstFolder = zipPaths[0]?.split("/")[0];
      const zipPath = firstFolder ? `${firstFolder}/${blob.path}` : blob.path;
      const zipFile = zip.files[zipPath];

      if (!zipFile || zipFile.dir) {
        missingFiles.push(blob.path);
        skippedFiles += 1;
        continue;
      }

      // Create blob
      const content = await zipFile.async("uint8array");
      const base64 = Buffer.from(content).toString("base64");
      const blobRes = await ghJson<{ sha?: string }>(`/repos/${opts.destOwner}/${opts.destRepo}/git/blobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: base64, encoding: "base64" }),
      });
      const blobSha = blobRes.sha;
      if (!blobSha) throw new Error(`GitHub did not return a blob SHA for ${blob.path}`);
      blobShaMap.set(blob.path, blobSha);
      copiedFiles += 1;
    }

    if (missingFiles.length > 0) {
      warnings.push(`Missing from archive: ${missingFiles.join(", ")}`);
    }

    // 5. Get destination branch head commit and tree
    const destRefRes = await ghJson<{ object?: { sha?: string } }>(
      `/repos/${opts.destOwner}/${opts.destRepo}/git/ref/heads/${encodeURIComponent(destBranch)}`
    );
    const headSha = destRefRes.object?.sha;
    if (!headSha) throw new Error("Could not read the destination branch head");

    const headCommitRes = await ghJson<{ tree?: { sha?: string } }>(
      `/repos/${opts.destOwner}/${opts.destRepo}/git/commits/${encodeURIComponent(headSha)}`
    );
    const baseTreeSha = headCommitRes.tree?.sha;
    if (!baseTreeSha) throw new Error("Could not read the destination tree");

    // 6. Create tree entries with optional prefix
    const treeEntries = selectedBlobs.map((blob) => {
      const path = opts.destPrefix
        ? opts.destPrefix.replace(/^\/+|\/+$/g, "") + "/" + blob.path
        : blob.path;
      return {
        path,
        mode: blob.mode || "100644",
        type: "blob" as const,
        sha: blobShaMap.get(blob.path),
      };
    });

    // 7. POST tree with base_tree (additive commit)
    const treeRes = await ghJson<{ sha?: string }>(`/repos/${opts.destOwner}/${opts.destRepo}/git/trees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    });
    const treeSha = treeRes.sha;
    if (!treeSha) throw new Error("GitHub did not return a tree SHA");

    // 8. Create commit
    const commitMessage = opts.commitMessage || `Copy ${copiedFiles} file(s) from ${owner}/${repo}`;
    const commitRes = await ghJson<{ sha?: string }>(`/repos/${opts.destOwner}/${opts.destRepo}/git/commits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: commitMessage,
        tree: treeSha,
        parents: [headSha],
      }),
    });
    const commitSha = commitRes.sha;
    if (!commitSha) throw new Error("GitHub did not return a commit SHA");

    // 9. Update ref
    await ghFetch(`/repos/${opts.destOwner}/${opts.destRepo}/git/refs/heads/${encodeURIComponent(destBranch)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: commitSha }),
    });

    // 10. Return result
    const commitUrl = `https://github.com/${opts.destOwner}/${opts.destRepo}/commit/${commitSha}`;
    return {
      copiedFiles,
      skippedFiles,
      warnings,
      commitSha,
      commitUrl,
    };
  } catch (err) {
    throw err;
  }
}
