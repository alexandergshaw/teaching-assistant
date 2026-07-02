import { NextRequest, NextResponse } from "next/server";
import { callLlm, normalizeProvider, type LlmProvider } from "@/lib/llm";
import { routeRequest, GUIDANCE_REPLY } from "@/lib/embedded/router";
import { createClient } from "@/lib/supabase/server";
import { logChatExchange } from "@/lib/supabase/chat-logs";
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

    let reply: string;
    if (provider === "embedded") {
      // Embedded Deterministic Engine: the ask-anything router classifies the
      // request (announcement, rubric, quiz, practice problems, case study,
      // define, summarize, or Q&A over pasted material) and dispatches it to
      // the engine's deterministic capabilities. No model call, no external web.
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      reply = lastUser
        ? (await routeRequest(lastUser.text, messages.slice(0, -1))).reply
        : GUIDANCE_REPLY;
    } else {
      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.text }],
      }));

      const result = await callLlm(
        {
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
          systemInstruction:
            "Respond in plain text only. Never use markdown or any rich formatting: no asterisks, bold, italics, headings, bullet points, numbered lists, tables, code fences, or backticks. Write in plain sentences and paragraphs.",
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

    // Identify the authenticated user for logging (may be null for anonymous sessions).
    let userId: string | undefined;
    try {
      const supabase = await createClient();
      const { data: session } = await supabase.auth.getUser();
      userId = session.user?.id;
    } catch {
      // Non-fatal — continue without a user ID.
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
