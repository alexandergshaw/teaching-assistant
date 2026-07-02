import { NextRequest, NextResponse } from "next/server";
import { research, type KnowledgeKind } from "@/lib/research";

/**
 * Research API: returns the most useful knowledge for a topic area, pulling
 * primarily from external sources (Wikipedia for case studies and background
 * knowledge, Stack Overflow for practice-problem material), with the curated
 * in-repo knowledge base filling remaining slots and serving as the offline
 * fallback. No model call, no fabrication: external results link to their
 * source, curated results carry the full vetted entry.
 *
 * POST { topic: string, kind?: "case_study" | "practice_problem", limit?: number }
 * -> { topic, count, results: ResearchResult[] }
 */

// Hard cap on topic length; retrieval only needs a phrase, not a document.
const MAX_TOPIC_CHARS = 2_000;

export const runtime = "nodejs";

function coerceKind(value: unknown): KnowledgeKind | undefined {
  return value === "case_study" || value === "practice_problem" || value === "reference"
    ? value
    : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { error: "Expected application/json with a 'topic' field." },
        { status: 400 }
      );
    }

    const body = (await req.json()) as { topic?: unknown; kind?: unknown; limit?: unknown };

    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    if (!topic) {
      return NextResponse.json(
        { error: "Expected a non-empty 'topic' field in the JSON body." },
        { status: 400 }
      );
    }
    if (topic.length > MAX_TOPIC_CHARS) {
      return NextResponse.json(
        { error: `Topic too long. Maximum is ${MAX_TOPIC_CHARS.toLocaleString()} characters.` },
        { status: 413 }
      );
    }

    const kind = coerceKind(body.kind);
    if (body.kind !== undefined && !kind) {
      return NextResponse.json(
        { error: "Invalid 'kind'. Use \"case_study\", \"practice_problem\", or \"reference\", or omit it." },
        { status: 400 }
      );
    }

    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? Math.floor(body.limit)
        : undefined;

    const results = await research(topic, { kind, limit });
    return NextResponse.json({ topic, count: results.length, results });
  } catch (err) {
    console.error("[research] Error:", err);
    const message = err instanceof Error ? err.message : "Research lookup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
