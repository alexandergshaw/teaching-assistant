import { getGeminiApiKey, getGeminiModel } from "@/lib/gemini";

export interface ExternalResource {
  title: string;
  url: string;
  type: string;
  description: string;
}

export async function generateExternalResourcesForTopic(
  topic: string,
  context: string
): Promise<ExternalResource[] | { error: string }> {
  const apiKey = getGeminiApiKey();
  const model = getGeminiModel();

  const prompt = `You are an expert educator curating a list of free, publicly available external learning resources for students in a programming course.

TOPIC / ASSIGNMENT: ${topic}

CONTEXT:
${context}

Identify 5–10 high-quality, free-to-use external resources (official documentation, tutorials, guides, or reference pages) that are directly relevant to the topic and context above. Only include resources that are genuinely free and publicly accessible — no paywalled content.

Return ONLY valid JSON as an array:
[
  {
    "title": "Human-readable name of the resource",
    "url": "https://example.com/full-url",
    "type": "documentation" | "tutorial" | "guide" | "reference" | "video",
    "description": "One or two sentences explaining what the resource covers and why it is useful for this topic."
  }
]

Requirements:
- Prefer official documentation (MDN, Python docs, Java SE docs, etc.) and well-known tutorial sites (The Odin Project, freeCodeCamp, W3Schools, GeeksforGeeks, etc.).
- Each resource must be directly relevant to the assignment or module topic.
- Do not invent URLs — only include URLs you are confident exist.
- Do not include any text outside the JSON array.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    return { error: `Gemini API error for external resources "${topic}": HTTP ${response.status} — ${body.slice(0, 200)}` };
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return { error: `Could not parse external resources for "${topic}".` };
  }

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown[];
    const resources: ExternalResource[] = parsed
      .filter(
        (r): r is Record<string, unknown> =>
          typeof r === "object" && r !== null &&
          typeof (r as Record<string, unknown>).title === "string" &&
          typeof (r as Record<string, unknown>).url === "string"
      )
      .map((r) => ({
        title: String(r.title),
        url: String(r.url),
        type: typeof r.type === "string" ? r.type : "reference",
        description: typeof r.description === "string" ? r.description : "",
      }));
    return resources;
  } catch {
    return { error: `Failed to parse external resources JSON for "${topic}".` };
  }
}
