// Server-only client for the GitHub Models API (models.github.ai): list the
// models available to the account and run OpenAI-compatible chat completions,
// authenticated with the same GITHUB_TOKEN as the REST client.

import { githubToken } from "./github";

const MODELS_BASE = "https://models.github.ai";

export interface GithubModel {
  id: string;
  name: string;
  publisher: string;
  summary: string;
}

export interface ModelUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  rateLimitRemaining: string | null;
  rateLimitLimit: string | null;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function modelsError(status: number, detail: string): Error {
  let message = "";
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string }; message?: string };
    message = parsed.error?.message ?? parsed.message ?? "";
  } catch {
    /* non-JSON body */
  }
  if (status === 401 || status === 403) {
    return new Error(
      "GitHub Models rejected the token. GITHUB_TOKEN needs the 'models' permission and Models must be enabled for the account."
    );
  }
  return new Error(`GitHub Models request failed (HTTP ${status})${message ? `: ${message}` : ""}.`);
}

/** List the models the account can use (the Models catalog). */
export async function listGithubModels(): Promise<GithubModel[]> {
  const res = await fetch(`${MODELS_BASE}/catalog/models`, {
    headers: { Authorization: `Bearer ${githubToken()}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw modelsError(res.status, await res.text().catch(() => ""));
  const data = (await res.json()) as Array<{ id?: string; name?: string; publisher?: string; summary?: string }>;
  return (Array.isArray(data) ? data : [])
    .filter((m) => typeof m.id === "string")
    .map((m) => ({ id: m.id as string, name: m.name ?? (m.id as string), publisher: m.publisher ?? "", summary: m.summary ?? "" }));
}

/** Run a chat completion against a model; returns the reply and usage info. */
export async function chatWithGithubModel(model: string, messages: ChatMessage[]): Promise<{ content: string; usage: ModelUsage }> {
  const res = await fetch(`${MODELS_BASE}/inference/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken()}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) throw modelsError(res.status, await res.text().catch(() => ""));
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? null,
      completionTokens: data.usage?.completion_tokens ?? null,
      totalTokens: data.usage?.total_tokens ?? null,
      rateLimitRemaining: res.headers.get("x-ratelimit-remaining"),
      rateLimitLimit: res.headers.get("x-ratelimit-limit"),
    },
  };
}
