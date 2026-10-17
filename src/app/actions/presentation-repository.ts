"use server";

import { requireAppOwner } from "@/lib/supabase/auth";
import { buildDeckSnapshot, validateSnapshotInput } from "@/lib/presentations/repository-snapshot";
import { loadRepositoryTemplate } from "@/lib/presentations/repository-template-source";
import { publisherLogin, publishSnapshot, type RepositoryReceipt } from "@/lib/presentations/repository-publish";
import { copilotTasksEnabled, describeCopilotTaskError, getPresentationCopilotTaskStatus, startPresentationCopilotTask, type CopilotTaskReceipt } from "@/lib/presentations/copilot-tasks";

export async function getPresentationPublisherAction(): Promise<{ login: string; copilotTasksEnabled: boolean } | { error: string }> {
  try { await requireAppOwner(); return { login: await publisherLogin(), copilotTasksEnabled: copilotTasksEnabled() }; }
  catch { return { error: "Owner access and a configured GitHub token with private-repository access are required." }; }
}

export async function startPresentationCopilotTaskAction(input: unknown): Promise<{ task: CopilotTaskReceipt } | { error: string }> {
  try {
    const user = await requireAppOwner();
    if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Select a verified repository snapshot and enter task instructions." };
    const value = input as { owner?: unknown; repo?: unknown; snapshotId?: unknown; snapshotCommit?: unknown; prompt?: unknown; kind?: unknown; previousTaskId?: unknown };
    if (typeof value.owner !== "string" || typeof value.repo !== "string" || typeof value.snapshotId !== "string" || typeof value.snapshotCommit !== "string" || typeof value.prompt !== "string" || (value.kind !== "initial" && value.kind !== "followup") || value.previousTaskId !== undefined && typeof value.previousTaskId !== "string") return { error: "Select a verified repository snapshot and enter task instructions." };
    const task = await startPresentationCopilotTask(user.id, await publisherLogin(), {
      owner: value.owner,
      repo: value.repo,
      snapshotId: value.snapshotId,
      snapshotCommit: value.snapshotCommit,
      prompt: value.prompt,
      kind: value.kind,
      ...(value.previousTaskId === undefined ? {} : { previousTaskId: value.previousTaskId }),
    });
    return { task };
  } catch (error) {
    return { error: describeCopilotTaskError(error) };
  }
}

export async function refreshPresentationCopilotTaskAction(input: unknown): Promise<{ task: CopilotTaskReceipt } | { error: string }> {
  try {
    const user = await requireAppOwner();
    if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Select a task from a verified repository snapshot." };
    const value = input as { owner?: unknown; repo?: unknown; snapshotId?: unknown; snapshotCommit?: unknown; taskId?: unknown };
    if (typeof value.owner !== "string" || typeof value.repo !== "string" || typeof value.snapshotId !== "string" || typeof value.snapshotCommit !== "string" || typeof value.taskId !== "string") return { error: "Select a task from a verified repository snapshot." };
    return { task: await getPresentationCopilotTaskStatus(user.id, await publisherLogin(), { owner: value.owner, repo: value.repo, snapshotId: value.snapshotId, snapshotCommit: value.snapshotCommit, taskId: value.taskId }) };
  } catch (error) { return { error: describeCopilotTaskError(error) }; }
}

/** Resolve and render with owner access before offering the explicit egress confirmation. */
export async function reviewPresentationRepositoryAction(input: unknown): Promise<{ login: string; copilotTasksEnabled: boolean; snapshotId: string; templateDigest: string | null; bytes: number } | { error: string }> {
  try {
    const user = await requireAppOwner();
    validateSnapshotInput(input);
    const original = await loadRepositoryTemplate(user.id, input.templateChoice ?? { kind: "own" });
    const snapshot = await buildDeckSnapshot(input, original);
    const manifest = JSON.parse(snapshot.files.find(file => file.path === "manifest.json")!.bytes.toString());
    return { login: await publisherLogin(), copilotTasksEnabled: copilotTasksEnabled(), snapshotId: snapshot.id, templateDigest: manifest.template?.sha256 ?? null, bytes: snapshot.bytes };
  } catch { return { error: "Package review refused. Verify access to the selected template, its available slide/bullet paragraphs, and the package size. No files were sent to GitHub." }; }
}

export async function publishPresentationRepositoryAction(input: unknown, name: string, expectedLogin: string, expectedSnapshotId?: string): Promise<{ receipt: RepositoryReceipt; slides: number; bytes: number } | { error: string }> {
  try {
    const user = await requireAppOwner();
    if (typeof name !== "string" || typeof expectedLogin !== "string") return { error: "Choose a repository name and review the GitHub account first." };
    validateSnapshotInput(input);
    const original = await loadRepositoryTemplate(user.id, input.templateChoice ?? { kind: "own" });
    const snapshot = await buildDeckSnapshot(input, original);
    if ((input.templateSelected || expectedSnapshotId !== undefined) && snapshot.id !== expectedSnapshotId) return { error: "The reviewed deck or original template changed. Review the current package again before publishing. No files were sent to GitHub." };
    const receipt = await publishSnapshot(snapshot, name, user.id, expectedLogin);
    return { receipt, slides: snapshot.slides, bytes: snapshot.bytes };
  } catch {
    return { error: "Publication was refused. Confirm owner access, authorized template selection and fit, valid deck/context within limits, and an unused repository name. An unrelated or public repository is never overwritten." };
  }
}
