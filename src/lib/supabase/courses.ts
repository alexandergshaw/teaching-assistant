import { createServiceClient } from "./server";
import type { Database } from "./types";

/**
 * Server-side persistence helpers for courses and their associated files.
 *
 * The application does not yet expose an authentication flow, so these helpers
 * use the service-role client (which bypasses row level security) — the same
 * pattern used by the chat logging helpers. Files are stored in the private
 * "course-files" Storage bucket under `{owner}/{course_id}/...` paths, where
 * `owner` is the authenticated user id when available or `anonymous` otherwise.
 */

const BUCKET = "course-files";

type GeneratedFileKind =
  | "lecture"
  | "module_introduction"
  | "assignment_instructions";

const KIND_TO_TABLE: Record<GeneratedFileKind, string> = {
  lecture: "lectures",
  module_introduction: "module_introductions",
  assignment_instructions: "assignment_instructions",
};

const KIND_TO_FOLDER: Record<GeneratedFileKind, string> = {
  lecture: "lectures",
  module_introduction: "module-introductions",
  assignment_instructions: "assignment-instructions",
};

export interface CourseFileRef {
  id: string;
  title: string;
  fileName: string | null;
  filePath: string | null;
}

export interface CourseLibraryEntry {
  id: string;
  title: string;
  description: string | null;
  term: string | null;
  createdAt: string;
  scheduleFile: { fileName: string; filePath: string } | null;
  codebaseFile: { fileName: string; filePath: string } | null;
  lectures: CourseFileRef[];
  assignmentInstructions: CourseFileRef[];
  moduleIntroductions: CourseFileRef[];
}

export interface SaveEndToEndCourseInput {
  title: string;
  description?: string | null;
  term?: string | null;
  scheduleCsv?: string | null;
  scheduleFileName?: string | null;
  geminiPrompt?: string | null;
  userId?: string | null;
}

export interface GeneratedFileInput {
  kind: GeneratedFileKind;
  title: string;
  fileName: string;
  /** File content encoded as base64 (without any data URL prefix). */
  base64: string;
}

export interface SaveLecturePlanFilesInput {
  courseId: string;
  codebaseZipBase64?: string | null;
  codebaseZipFileName?: string | null;
  files: GeneratedFileInput[];
  userId?: string | null;
}

function contentTypeForFile(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".csv")) return "text/csv";
  return "application/octet-stream";
}

function sanitizeFileName(fileName: string): string {
  const cleaned = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return cleaned.replace(/^_+|_+$/g, "") || "file";
}

function storagePath(
  owner: string,
  courseId: string,
  folder: string,
  fileName: string
): string {
  const unique = crypto.randomUUID();
  return `${owner}/${courseId}/${folder}/${unique}-${sanitizeFileName(fileName)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table(supabase: any, name: string) {
  return supabase.from(name);
}

/**
 * Guarantees the private "course-files" Storage bucket exists before any
 * upload is attempted.
 *
 * The bucket is normally provisioned by the SQL migration, but that step is
 * easy to miss (e.g. when only the table migrations are applied) and a missing
 * bucket makes every upload fail with "Bucket not found" — which surfaces to
 * the user as a save error on the End to End subtab. Creating it here, with the
 * service-role client, makes the save path self-healing and idempotent.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureBucket(supabase: any): Promise<void> {
  const { data: existing, error: getError } = await supabase.storage.getBucket(
    BUCKET
  );
  if (existing && !getError) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: false,
  });

  // A concurrent request may have created the bucket between our check and the
  // create call; treat an "already exists" response as success.
  if (createError) {
    const message = createError.message?.toLowerCase() ?? "";
    if (!message.includes("already exists")) {
      throw new Error(`Failed to prepare file storage: ${createError.message}`);
    }
  }
}

/**
 * Creates a course row from the End to End subtab, uploads the generated
 * schedule CSV, and links it to the course. Returns the new course id.
 */
export async function saveEndToEndCourse(
  input: SaveEndToEndCourseInput
): Promise<string> {
  const supabase = createServiceClient();
  const owner = input.userId ?? "anonymous";

  const courseInsert: Database["public"]["Tables"]["courses"]["Insert"] = {
    user_id: input.userId ?? null,
    title: input.title,
    description: input.description ?? null,
    term: input.term ?? null,
    gemini_prompt: input.geminiPrompt ?? null,
  };

  const { data: course, error: insertError } = await table(supabase, "courses")
    .insert(courseInsert)
    .select("id")
    .single();

  if (insertError || !course) {
    throw new Error(insertError?.message ?? "Failed to create course.");
  }

  const courseId = course.id as string;

  if (input.scheduleCsv) {
    try {
      await ensureBucket(supabase);

      const fileName = input.scheduleFileName ?? "schedule.csv";
      const path = storagePath(owner, courseId, "schedule", fileName);
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, Buffer.from(input.scheduleCsv, "utf-8"), {
          contentType: "text/csv",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const update: Database["public"]["Tables"]["courses"]["Update"] = {
        schedule_file_path: path,
        schedule_file_name: fileName,
      };
      const { error: updateError } = await table(supabase, "courses")
        .update(update)
        .eq("id", courseId);

      if (updateError) {
        throw new Error(updateError.message);
      }
    } catch (err) {
      // The course row was already inserted; remove it so a failed save does
      // not leave an orphaned, file-less course behind (and so retries do not
      // accumulate duplicates).
      await table(supabase, "courses").delete().eq("id", courseId);
      throw err instanceof Error
        ? err
        : new Error("Failed to save course schedule.");
    }
  }

  return courseId;
}

/**
 * Persists the files produced by the Lecture Planning tab for a course: the
 * submitted course repository zip is stored as the course codebase, and each
 * generated lecture / instructions / module introduction file is uploaded and
 * recorded in its respective table.
 */
export async function saveLecturePlanFiles(
  input: SaveLecturePlanFilesInput
): Promise<void> {
  const supabase = createServiceClient();

  const { data: course, error: courseError } = await table(supabase, "courses")
    .select("id, user_id")
    .eq("id", input.courseId)
    .single();

  if (courseError || !course) {
    throw new Error(courseError?.message ?? "Course not found.");
  }

  const owner = (course.user_id as string | null) ?? input.userId ?? "anonymous";

  const hasUploads = Boolean(input.codebaseZipBase64) || input.files.length > 0;
  if (hasUploads) {
    await ensureBucket(supabase);
  }

  if (input.codebaseZipBase64) {
    const fileName = input.codebaseZipFileName ?? "course-repository.zip";
    const path = storagePath(owner, input.courseId, "codebase", fileName);
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, Buffer.from(input.codebaseZipBase64, "base64"), {
        contentType: "application/zip",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const update: Database["public"]["Tables"]["courses"]["Update"] = {
      codebase_file_path: path,
      codebase_file_name: fileName,
    };
    const { error: updateError } = await table(supabase, "courses")
      .update(update)
      .eq("id", input.courseId);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  for (const file of input.files) {
    const folder = KIND_TO_FOLDER[file.kind];
    const path = storagePath(owner, input.courseId, folder, file.fileName);
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, Buffer.from(file.base64, "base64"), {
        contentType: contentTypeForFile(file.fileName),
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { error: rowError } = await table(supabase, KIND_TO_TABLE[file.kind]).insert({
      course_id: input.courseId,
      title: file.title,
      file_path: path,
      file_name: file.fileName,
    });

    if (rowError) {
      throw new Error(rowError.message);
    }
  }
}

/** Returns id + title for every course, ordered by title (for autocomplete). */
export async function listCourseNames(): Promise<
  Array<{ id: string; title: string }>
> {
  const supabase = createServiceClient();
  const { data, error } = await table(supabase, "courses")
    .select("id, title")
    .order("title", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Array<{ id: string; title: string }>;
}

type FileRow = { id: string; title: string; file_name: string | null; file_path: string | null };

function toFileRefs(rows: FileRow[] | null | undefined): CourseFileRef[] {
  return (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    fileName: r.file_name,
    filePath: r.file_path,
  }));
}

/** Returns all courses with their associated files for the Course Library tab. */
export async function listCourses(): Promise<CourseLibraryEntry[]> {
  const supabase = createServiceClient();
  const { data, error } = await table(supabase, "courses")
    .select(
      `id, title, description, term, created_at,
       schedule_file_path, schedule_file_name,
       codebase_file_path, codebase_file_name,
       lectures ( id, title, file_name, file_path ),
       assignment_instructions ( id, title, file_name, file_path ),
       module_introductions ( id, title, file_name, file_path )`
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    term: c.term,
    createdAt: c.created_at,
    scheduleFile:
      c.schedule_file_path && c.schedule_file_name
        ? { fileName: c.schedule_file_name, filePath: c.schedule_file_path }
        : null,
    codebaseFile:
      c.codebase_file_path && c.codebase_file_name
        ? { fileName: c.codebase_file_name, filePath: c.codebase_file_path }
        : null,
    lectures: toFileRefs(c.lectures),
    assignmentInstructions: toFileRefs(c.assignment_instructions),
    moduleIntroductions: toFileRefs(c.module_introductions),
  }));
}

/** Creates a short-lived signed URL for downloading a stored course file. */
export async function getCourseFileSignedUrl(
  filePath: string,
  expiresInSeconds = 300
): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, expiresInSeconds);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create download link.");
  }

  return data.signedUrl;
}
