import { NextRequest, NextResponse } from "next/server";
import { callLlm, normalizeProvider, type LlmProvider } from "@/lib/llm";
import { routeRequest, GUIDANCE_REPLY } from "@/lib/embedded/router";
import { createClient } from "@/lib/supabase/server";
import { logChatExchange } from "@/lib/supabase/chat-logs";
import { getWritingStyleBlock } from "@/app/actions/shared";
import { buildChatSystemInstruction } from "@/lib/chat/system-instruction";
import type { ChatMessage } from "@/lib/chat/types";

interface RequestBody {
  messages: ChatMessage[];
  sessionId: string;
  provider?: LlmProvider;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const { messages, sessionId } = body;
    const provider = normalizeProvider(body.provider);

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages is required" }, { status: 400 });
    }

    // Identify the authenticated user up front (may be undefined for an
    // anonymous session) — used both to feed the instructor's own writing
    // tone into the model call below and, further down, to log the
    // exchange. A single lookup now serves both call sites instead of two
    // round trips. A failed lookup is non-fatal: it degrades to anonymous
    // behaviour rather than failing the request.
    let userId: string | undefined;
    try {
      const supabase = await createClient();
      const { data: session } = await supabase.auth.getUser();
      userId = session.user?.id;
    } catch {
      // Non-fatal — continue without a user ID.
    }

    let reply: string;
    if (provider === "embedded") {
      // Embedded Deterministic Engine: the ask-anything router classifies the
      // request (announcement, rubric, quiz, practice problems, case study,
      // define, summarize, or Q&A over pasted material) and dispatches it to
      // the engine's deterministic capabilities. No model call, no external web,
      // and therefore no writing-tone injection either.
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      reply = lastUser
        ? (await routeRequest(lastUser.text, messages.slice(0, -1))).reply
        : GUIDANCE_REPLY;
    } else {
      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.text }],
      }));

      // getWritingStyleBlock degrades to "" for an anonymous session (no
      // userId), a missing sample, or a failed lookup — it never throws, so
      // this never blocks the reply. buildChatSystemInstruction keeps the
      // plain-text-only rule verbatim and ahead of the tone instruction.
      const styleBlock = userId ? await getWritingStyleBlock(userId) : "";

      const result = await callLlm(
        {
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
          systemInstruction: buildChatSystemInstruction(styleBlock),
        },
        provider
      );

      if (!result.ok) {
        return NextResponse.json(
          { error: `LLM API error: HTTP ${result.status} — ${result.body.slice(0, 200)}` },
          { status: 502 }
        );
      }

      reply = result.text || "No response from the model.";
    }

    // Log the last user message and the assistant reply to the database.
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg && sessionId) {
      void logChatExchange({
        sessionId,
        source: "fab",
        userMessage: lastUserMsg.text,
        assistantReply: reply,
        userId,
      });
    }

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[ai-chat] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
