"use server";

import { requireAppOwner } from "@/lib/supabase/auth";
import { buildDeckSnapshot } from "@/lib/presentations/repository-snapshot";
import { publisherLogin, publishSnapshot, type RepositoryReceipt } from "@/lib/presentations/repository-publish";

export async function getPresentationPublisherAction(): Promise<{ login: string } | { error: string }> {
  try { await requireAppOwner(); return { login: await publisherLogin() }; }
  catch { return { error: "Owner access and a configured GitHub token with private-repository access are required." }; }
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
