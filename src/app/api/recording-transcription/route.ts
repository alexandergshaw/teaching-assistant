import { transcribeLiveAudioAction } from "@/app/actions/live-class";
import { requireUser } from "@/lib/supabase/auth";
import { checkWireBudget } from "@/lib/upload-budget";
import type { LlmProvider } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try { await requireUser(); } catch { return Response.json({ error: "Sign in to transcribe the recording." }, { status: 401 }); }
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Could not read the audio request." }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return Response.json({ error: "Could not read the audio request." }, { status: 400 });
  const { audio, provider } = payload as Record<string, unknown>;
  if (typeof audio !== "string" || !audio.trim() || !["gemini", "other", "embedded"].includes(String(provider))) {
    return Response.json({ error: "Could not read the audio request." }, { status: 400 });
  }
  const budget = checkWireBudget(audio.length, "Audio chunk");
  if (!budget.ok) return Response.json({ error: budget.error }, { status: 413 });
  try {
    return Response.json(await transcribeLiveAudioAction(audio, { provider: provider as LlmProvider }));
  } catch {
    return Response.json({ error: "The transcription request could not be completed. Retry this chunk." }, { status: 502 });
  }
}
