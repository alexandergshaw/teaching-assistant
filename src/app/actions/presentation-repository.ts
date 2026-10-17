"use server";

import { requireAppOwner } from "@/lib/supabase/auth";
import { buildDeckSnapshot } from "@/lib/presentations/repository-snapshot";
import { publisherLogin, publishSnapshot, type RepositoryReceipt } from "@/lib/presentations/repository-publish";
import { copilotTasksEnabled, describeCopilotTaskError, startPresentationCopilotTask, type CopilotTaskReceipt } from "@/lib/presentations/copilot-tasks";

export async function getPresentationPublisherAction(): Promise<{ login: string; copilotTasksEnabled: boolean } | { error: string }> {
  try { await requireAppOwner(); return { login: await publisherLogin(), copilotTasksEnabled: copilotTasksEnabled() }; }
  catch { return { error: "Owner access and a configured GitHub token with private-repository access are required." }; }
}

export async function startPresentationCopilotTaskAction(input: unknown): Promise<{ task: CopilotTaskReceipt } | { error: string }> {
  try {
    const user = await requireAppOwner();
    if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Select a verified repository snapshot and enter task instructions." };
    const value = input as { owner?: unknown; repo?: unknown; snapshotId?: unknown; snapshotCommit?: unknown; prompt?: unknown; kind?: unknown };
    if (typeof value.owner !== "string" || typeof value.repo !== "string" || typeof value.snapshotId !== "string" || typeof value.snapshotCommit !== "string" || typeof value.prompt !== "string" || (value.kind !== "initial" && value.kind !== "followup")) return { error: "Select a verified repository snapshot and enter task instructions." };
    const task = await startPresentationCopilotTask(user.id, value.owner, {
      owner: value.owner,
      repo: value.repo,
      snapshotId: value.snapshotId,
      snapshotCommit: value.snapshotCommit,
      prompt: value.prompt,
      kind: value.kind,
    });
    return { task };
  } catch (error) {
    return { error: describeCopilotTaskError(error) };
  }
}

export async function publishPresentationRepositoryAction(input: unknown, name: string, expectedLogin: string): Promise<{ receipt: RepositoryReceipt; slides: number; bytes: number } | { error: string }> {
  try {
    const user = await requireAppOwner();
    if (typeof name !== "string" || typeof expectedLogin !== "string") return { error: "Choose a repository name and review the GitHub account first." };
    const snapshot = await buildDeckSnapshot(input);
    const receipt = await publishSnapshot(snapshot, name, user.id, expectedLogin);
    return { receipt, slides: snapshot.slides, bytes: snapshot.bytes };
  } catch {
    return { error: "Publication was refused. Confirm owner access, own-layout selection, valid deck/context within limits, and an unused repository name. An unrelated or public repository is never overwritten." };
  }
}
