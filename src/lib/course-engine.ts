/**
 * Client for the Course Engine API (the "other" LLM provider).
 *
 * Base URL: https://testing-knowledge-engine.vercel.app
 *
 * Unlike the generic Gemini text interface (`callLlm`), these are coarse,
 * feature-level endpoints — two of them return finished binaries (a .pptx deck,
 * a materials .zip). So callers branch into this client per-feature rather than
 * routing through `callLlm`. The API key (if the project sets one) stays
 * server-side; everything here runs in server actions.
 */

const DEFAULT_BASE_URL = "https://testing-knowledge-engine.vercel.app";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const ZIP_MIME = "application/zip";

export function getCourseEngineUrl(): string {
  return (process.env.COURSE_ENGINE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function getCourseEngineApiKey(): string | undefined {
  return process.env.COURSE_ENGINE_API_KEY || undefined;
}

/** Auth header, only attached when the project has configured a key. */
function authHeaders(): Record<string, string> {
  const key = getCourseEngineApiKey();
  return key ? { "X-API-Key": key } : {};
}

/** Binary result returned to the client for direct download. */
export interface CourseEngineFile {
  base64: string;
  fileName: string;
  mimeType: string;
}

export interface ScheduleTopic {
  name: string;
  citations: number[];
  position: number;
}

export interface ScheduleCitation {
  title: string;
  url: string;
  source: string;
}

export interface ScheduleResponse {
  subject: string;
  confidence: "high" | "medium" | "low";
  weeks: Array<{ week: number; topics: string[] }>;
  topics: ScheduleTopic[];
  citations: ScheduleCitation[];
}

/**
 * Turn a non-2xx Course Engine response into a readable Error. The API uses a
 * `{ error: { code, message } }` envelope; we prefer its message but fall back
 * to a code-specific default.
 */
async function toFriendlyError(response: Response): Promise<Error> {
  let code = "";
  let message = "";
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    code = body.error?.code ?? "";
    message = body.error?.message ?? "";
  } catch {
    // Non-JSON body; fall through to status-based defaults.
  }

  if (message) {
    return new Error(message);
  }

  switch (code || String(response.status)) {
    case "unauthorized":
    case "401":
      return new Error(
        "Course Engine rejected the request: missing or invalid API key (COURSE_ENGINE_API_KEY)."
      );
    case "no_curriculum":
      return new Error(
        "Course Engine could not find a published curriculum for that description. Try a more specific or common subject."
      );
    case "invalid_project":
      return new Error(
        "Course Engine did not recognize the uploaded project. Expected a Copilot-generated project zip."
      );
    case "payload_too_large":
    case "413":
      return new Error(
        "The uploaded project is too large for Course Engine (limit is about 4.5 MB on the hosted service)."
      );
    case "invalid_request":
    case "400":
    case "422":
      return new Error("Course Engine rejected the request as invalid.");
    default:
      return new Error(`Course Engine request failed (HTTP ${response.status}).`);
  }
}

/** Endpoint 3 — plain description + week count to a cited weekly topic plan. */
export async function courseEngineSchedule(
  description: string,
  weeks: number
): Promise<ScheduleResponse> {
  const response = await fetch(`${getCourseEngineUrl()}/api/v1/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ description, weeks }),
  });

  if (!response.ok) {
    throw await toFriendlyError(response);
  }

  return (await response.json()) as ScheduleResponse;
}

export interface CopilotPromptResponse {
  prompt: string;
  language?: string;
  weeks?: number;
}

/** Endpoint 6 — schedule text to a ready-to-paste GitHub Copilot prompt (deterministic). */
export async function courseEngineCopilotPrompt(
  schedule: string,
  fileName?: string
): Promise<CopilotPromptResponse> {
  const response = await fetch(`${getCourseEngineUrl()}/api/v1/copilot-prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ schedule, ...(fileName ? { fileName } : {}) }),
  });

  if (!response.ok) {
    throw await toFriendlyError(response);
  }

  return (await response.json()) as CopilotPromptResponse;
}

/** A file the caller uploads to an endpoint (matches the app's file shape). */
export interface CourseEngineUploadFile {
  name: string;
  base64: string;
  mimeType: string;
}

/** Optional homework assignment the deck should prepare students for. */
export interface CourseEngineHomework {
  text?: string;
  file?: CourseEngineUploadFile;
}

/**
 * Endpoint 4 — learning objectives to a ready-to-teach .pptx (binary).
 *
 * When `file` is supplied (e.g. an existing class deck), the request is sent as
 * multipart/form-data so the Course Engine can derive objectives/topics from the
 * uploaded artifact in addition to the typed objectives.
 *
 * An optional `homework` (text and/or file) makes the deck cover the
 * prerequisite skills the assignment needs, without restating its questions or
 * revealing answers. Homework is supplemental — it never substitutes for
 * objectives/file and is never rendered in the deck.
 */
export async function courseEngineLecture(
  objectives: string,
  title?: string,
  file?: CourseEngineUploadFile,
  homework?: CourseEngineHomework
): Promise<CourseEngineFile> {
  const url = `${getCourseEngineUrl()}/api/v1/lecture`;

  const homeworkText = homework?.text?.trim();
  const homeworkFile = homework?.file;
  const usesFiles = Boolean(file || homeworkFile);

  let response: Response;
  if (usesFiles) {
    const form = new FormData();
    // Only send objectives when non-empty; with a file present the engine can
    // derive them from the upload, and an empty field can trip length validation.
    if (objectives.trim()) {
      form.append("objectives", objectives);
    }
    if (title) {
      form.append("title", title);
    }
    if (file) {
      const bytes = Buffer.from(file.base64, "base64");
      form.append("file", new Blob([bytes], { type: file.mimeType }), file.name);
    }
    if (homeworkText) {
      form.append("homework", homeworkText);
    }
    if (homeworkFile) {
      const bytes = Buffer.from(homeworkFile.base64, "base64");
      form.append("homeworkFile", new Blob([bytes], { type: homeworkFile.mimeType }), homeworkFile.name);
    }
    response = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders() }, // let fetch set the multipart boundary
      body: form,
    });
  } else {
    const payload: { objectives: string; title?: string; homework?: string } = { objectives };
    if (title) {
      payload.title = title;
    }
    if (homeworkText) {
      payload.homework = homeworkText;
    }
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
  }

  if (!response.ok) {
    throw await toFriendlyError(response);
  }

  const buffer = await response.arrayBuffer();
  return {
    base64: Buffer.from(buffer).toString("base64"),
    fileName: "module-lecture.pptx",
    mimeType: PPTX_MIME,
  };
}

/** Endpoint 5 — a project zip to an instructor-materials zip (binary). */
export async function courseEngineMaterials(
  zipBase64: string,
  fileName = "project.zip"
): Promise<CourseEngineFile> {
  const bytes = Buffer.from(zipBase64, "base64");
  const form = new FormData();
  form.append("project", new Blob([bytes], { type: ZIP_MIME }), fileName);

  const response = await fetch(`${getCourseEngineUrl()}/api/v1/materials`, {
    method: "POST",
    headers: { ...authHeaders() }, // let fetch set the multipart boundary
    body: form,
  });

  if (!response.ok) {
    throw await toFriendlyError(response);
  }

  const buffer = await response.arrayBuffer();
  return {
    base64: Buffer.from(buffer).toString("base64"),
    fileName: "course-materials.zip",
    mimeType: ZIP_MIME,
  };
}

/** Endpoint 1 — cheap liveness probe. */
export async function courseEngineHealth(): Promise<{ ok: boolean; version?: string }> {
  const response = await fetch(`${getCourseEngineUrl()}/api/v1/health`, {
    method: "GET",
    headers: { ...authHeaders() },
  });

  if (!response.ok) {
    return { ok: false };
  }

  const body = (await response.json()) as { ok?: boolean; version?: string };
  return { ok: body.ok ?? true, version: body.version };
}
