/**
 * Client for the dedicated Grading API (a separate service from the Course
 * Engine). It grades a student-submissions zip deterministically against a
 * check-based rubric and returns per-student, per-criterion pass/points.
 *
 * This is invoked only when the provider toggle is "other" (see gradeAction in
 * src/app/actions.ts). It runs server-side; the API key never reaches the client.
 *
 * Note: this service uses a different error envelope from the Course Engine —
 * `{ "error": "<code>", "messages": [...] }` rather than `{error:{code,message}}`.
 */

const ZIP_MIME = "application/zip";

/**
 * Resolve the grading service URL. When an institution acronym is given and
 * `<CODE>_LLM_URL` is set, that school's endpoint is used; otherwise it falls
 * back to the global `GRADING_ENGINE_URL`. Lets each school point Auto Grade at
 * its own grader.
 */
export function getGradingEngineUrl(code?: string): string {
  const perInstitution = code ? process.env[`${code.trim().toUpperCase()}_LLM_URL`] : undefined;
  const url = perInstitution || process.env.GRADING_ENGINE_URL;
  if (!url) {
    throw new Error(
      code
        ? `Missing grading service URL: set ${code.trim().toUpperCase()}_LLM_URL or GRADING_ENGINE_URL.`
        : "Missing environment variable: GRADING_ENGINE_URL"
    );
  }
  return url.replace(/\/+$/, "");
}

export function getGradingEngineApiKey(code?: string): string | undefined {
  const perInstitution = code ? process.env[`${code.trim().toUpperCase()}_LLM_API`] : undefined;
  return perInstitution || process.env.GRADING_API_KEY || undefined;
}

/** Auth header, only attached when the project has configured a key. */
function authHeaders(code?: string): Record<string, string> {
  const key = getGradingEngineApiKey(code);
  return key ? { "X-API-Key": key } : {};
}

export interface GradingApiCriterion {
  criterion: string;
  passed: boolean;
  points_earned: number;
  points_possible: number;
  detail: string;
}

export interface GradingApiStudent {
  student: string;
  total: number;
  possible: number;
  criteria: GradingApiCriterion[];
}

export interface GradingApiResponse {
  result_id: string;
  criteria: string[];
  students: GradingApiStudent[];
  warnings: string[];
  unmapped_criteria?: string[];
  csv: string;
}

/** Which rubric field the grading API should receive. */
export type RubricSource = { kind: "csv" | "json" | "text"; value: string };

/**
 * Decide which rubric field to send. Prefer the file extension when a filename
 * is given, otherwise sniff the content: a JSON array -> json; a comma in the
 * first non-empty line -> csv; anything else -> text (the API's forgiving mode).
 */
export function detectRubricSource(value: string, fileName?: string): RubricSource {
  const lower = (fileName ?? "").toLowerCase();
  if (lower.endsWith(".json")) return { kind: "json", value };
  if (lower.endsWith(".csv")) return { kind: "csv", value };

  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      if (Array.isArray(JSON.parse(trimmed))) return { kind: "json", value };
    } catch {
      // not valid JSON; fall through
    }
  }

  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.includes(",")) return { kind: "csv", value };

  return { kind: "text", value };
}

/** Turn a non-2xx grading response into a readable Error. */
async function toGradingError(response: Response): Promise<Error> {
  let code = "";
  let messages: string[] = [];
  try {
    const body = (await response.json()) as { error?: string; messages?: string[] };
    code = body.error ?? "";
    messages = Array.isArray(body.messages) ? body.messages : [];
  } catch {
    // Non-JSON body; fall through to status-based defaults.
  }

  if (messages.length > 0) {
    return new Error(messages.join("; "));
  }

  switch (code || String(response.status)) {
    case "unauthorized":
    case "401":
      return new Error(
        "The grading service rejected the request: missing or invalid API key (GRADING_API_KEY)."
      );
    case "payload_too_large":
    case "413":
      return new Error(
        "The submissions zip is too large for the grading service (limit is about 4.5 MB on the hosted service)."
      );
    case "missing_rubric":
      return new Error("No rubric was provided to the grading service.");
    case "missing_submissions":
      return new Error("No submissions zip was provided to the grading service.");
    case "rubric_invalid":
      return new Error("The rubric failed validation (check_type/target/params).");
    case "unparseable_rubric":
      return new Error("The grading service could not parse any criteria from the rubric.");
    case "unmapped_rubric":
      return new Error(
        "None of the rubric criteria could be mapped to automated checks. Supply a check-based rubric (CSV/JSON), for example the rubric.csv produced by Course materials."
      );
    case "invalid_zip":
      return new Error("The submissions zip was invalid or contained no student folders.");
    default:
      return new Error(`Grading service request failed (HTTP ${response.status}).`);
  }
}

/**
 * Grade a submissions zip against a rubric via POST /api/v1/grade. When `code`
 * is given, routes to that institution's grading service (see getGradingEngineUrl).
 */
export async function gradeViaGradingEngine(
  zipBase64: string,
  rubric: RubricSource,
  code?: string
): Promise<GradingApiResponse> {
  const bytes = Buffer.from(zipBase64, "base64");
  const form = new FormData();
  form.append("submissions", new Blob([bytes], { type: ZIP_MIME }), "submissions.zip");
  const field =
    rubric.kind === "csv" ? "rubric_csv" : rubric.kind === "json" ? "rubric_json" : "rubric_text";
  form.append(field, rubric.value);

  const response = await fetch(`${getGradingEngineUrl(code)}/api/v1/grade`, {
    method: "POST",
    headers: { ...authHeaders(code) }, // let fetch set the multipart boundary
    body: form,
  });

  if (!response.ok) {
    throw await toGradingError(response);
  }

  return (await response.json()) as GradingApiResponse;
}
