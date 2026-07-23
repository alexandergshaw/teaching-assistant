// Repository metadata: topics (labels) and issue labels.

import { ghFetch, ghJson } from "./github.repos";

/** Get a repo's topics (labels). */
export async function getRepoTopics(owner: string, repo: string): Promise<string[]> {
  const data = await ghJson<{ names?: string[] }>(`/repos/${owner}/${repo}/topics`);
  return data.names ?? [];
}

/** Set a repo's topics. */
export async function setRepoTopics(owner: string, repo: string, names: string[]): Promise<void> {
  if (names.length === 0) return;
  await ghFetch(`/repos/${owner}/${repo}/topics`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names }),
  });
}

/** List labels in a repo. */
export async function listRepoLabels(owner: string, repo: string): Promise<Array<{ name: string; color: string; description: string }>> {
  const data = await ghJson<Array<{ name?: string; color?: string; description?: string }>>(
    `/repos/${owner}/${repo}/labels?per_page=100`
  );
  return data
    .filter((l) => l.name)
    .map((l) => ({
      name: l.name ?? "",
      color: l.color ?? "",
      description: l.description ?? "",
    }));
}

/** Create a label in a repo. Returns true if created, false if 422 (already exists). */
export async function createRepoLabel(
  owner: string,
  repo: string,
  name: string,
  color: string,
  description: string
): Promise<boolean> {
  try {
    await ghFetch(`/repos/${owner}/${repo}/labels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color, description }),
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("422")) return false;
    throw err;
  }
}
