import { NextRequest, NextResponse } from "next/server";
import { toProse } from "@/lib/prose";

/**
 * Prose API: converts an input into natural language. The input's shape (JSON,
 * table, key-value lines, markdown, list, or prose) is detected and realized as
 * plain sentences, deterministically and with no model call — the output only
 * restates what the input contains.
 *
 * POST { input: string } -> { prose: string, format: DetectedFormat }
 */

// Hard cap on input length to keep responses predictable.
const MAX_INPUT_CHARS = 100_000;

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { error: "Expected application/json with an 'input' field." },
        { status: 400 }
      );
    }

    const body = (await req.json()) as { input?: unknown };
    const input = typeof body.input === "string" ? body.input : "";
    if (!input.trim()) {
      return NextResponse.json(
        { error: "Expected a non-empty 'input' field in the JSON body." },
        { status: 400 }
      );
    }
    if (input.length > MAX_INPUT_CHARS) {
      return NextResponse.json(
        { error: `Input too long. Maximum is ${MAX_INPUT_CHARS.toLocaleString()} characters.` },
        { status: 413 }
      );
    }

    const result = toProse(input);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[prose] Error:", err);
    const message = err instanceof Error ? err.message : "Prose conversion failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
