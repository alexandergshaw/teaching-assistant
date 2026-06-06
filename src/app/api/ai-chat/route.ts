import { NextRequest, NextResponse } from "next/server";
import { getGeminiApiKey, getGeminiModel } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";
import { logChatExchange } from "@/lib/supabase/chat-logs";
import type { AttachedFile, ChatMessage } from "@/lib/chat/types";

interface RequestBody {
  messages: ChatMessage[];
  sessionId: string;
  fileAttachments?: AttachedFile[];
}

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

function buildFileParts(files: AttachedFile[]): GeminiPart[] {
  return files.map((f) => {
    if (f.isText) {
      return { text: `\n\n[Attached file: ${f.name}]\n${f.data}` };
    }
    return { inline_data: { mime_type: f.mimeType, data: f.data } };
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const { messages, sessionId, fileAttachments = [] } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages is required" }, { status: 400 });
    }

    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();

    const contents = messages.map((m, i) => {
      const isLastUser = m.role === "user" && i === messages.length - 1;
      const textPart: GeminiPart = { text: m.text };
      const parts: GeminiPart[] =
        isLastUser && fileAttachments.length > 0
          ? [textPart, ...buildFileParts(fileAttachments)]
          : [textPart];
      return {
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts,
      };
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are a helpful teaching assistant. Write in professional, natural human speech — not AI-sounding. Avoid filler phrases like 'Certainly!', 'Great question!', 'Of course!', 'Absolutely!', or 'It's worth noting that'. If your response uses headers, follow this hierarchy only: document title, then H1, then H2, then bold text for sub-points. Never go deeper than bold text. All headers must be in normal sentence case — never all caps.",
              },
            ],
          },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return NextResponse.json(
        { error: `Gemini API error: HTTP ${response.status} — ${body.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const reply =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ||
      "No response from the model.";

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
