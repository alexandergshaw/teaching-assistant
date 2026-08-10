"use server";

import { OfficeParser } from "officeparser";
import { requireOwner } from "@/lib/supabase/auth";
import { createSyllabus } from "@/lib/supabase/course-syllabi";
import { getCourse, updateCourse } from "@/lib/supabase/courses";
import { courseToInputPayload } from "@/lib/workflows/registry-helpers";
import { parseOfficeParagraphs } from "@/lib/office-edit";
import { buildDocxFromPlainText } from "@/lib/docx";
import { validateFileUpload } from "@/lib/syllabus-upload-validation";
import { downloadFile, removeFiles } from "@/lib/supabase/storage";
import {
  withUploadedSyllabusFile,
  SYLLABUS_UPLOAD_BUCKET,
  type SyllabusUploadStorageClient,
} from "@/lib/syllabus-upload-source";

/** Metadata describing a file the browser has already uploaded straight to
 * the "course-files" Storage bucket (docs/upload-body-limit-acceptance-
 * criteria.md AC2) - never a base64 payload. `storagePath` is what
 * withUploadedSyllabusFile downloads and, either way, removes afterwards. */
interface UploadedSyllabusFile {
  name: string;
  storagePath: string;
  mimeType: string;
}

/** The server-side Storage client withUploadedSyllabusFile is fed - this
 * repo's first server-side Storage download (downloadFile/removeFiles,
 * src/lib/supabase/storage.ts, previously unused). Resolves to a `Blob`,
 * matching what a real Supabase client's storage.download() returns. */
function syllabusStorage(): SyllabusUploadStorageClient<Blob> {
  return {
    download: (path) => downloadFile(SYLLABUS_UPLOAD_BUCKET, path),
    remove: (paths) => removeFiles(SYLLABUS_UPLOAD_BUCKET, paths),
  };
}

/** Extract plain text from an uploaded file's raw bytes. */
async function extractTextFromFile(
  buffer: Buffer,
  extension: string
): Promise<string> {
  if (extension === ".txt" || extension === ".md") {
    return buffer.toString("utf-8").trim();
  }

  if (extension === ".docx") {
    // Parse Office paragraphs and join as text
    const paragraphs = await parseOfficeParagraphs("docx", buffer);
    return paragraphs.map((p) => p.text).join("\n");
  }

  if (extension === ".pdf") {
    // Use officeparser to extract text from PDF
    try {
      const ast = await OfficeParser.parseOffice(buffer, { fileType: "pdf" });
      const conversion = await ast.to("text");
      const value = typeof conversion.value === "string" ? conversion.value : "";
      return value
        .replace(/\0/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
    } catch {
      // If PDF extraction fails, use a placeholder note
      return "(Text extraction from this PDF file is unavailable. Please review the original file.)";
    }
  }

  throw new Error(`Unsupported file extension: ${extension}`);
}

/**
 * Validates and extracts the text of one downloaded syllabus file - the
 * ONE place uploadSyllabusAction and extractSyllabusTextAction both run
 * validateFileUpload/extractTextFromFile, so the two paths literally cannot
 * drift on which file types/sizes are accepted (AC2 item 10's claim, made
 * true by construction rather than by two call sites happening to agree).
 * The size check runs against the DOWNLOADED blob's real byte count - the
 * server's own second gate behind the browser's pre-upload check
 * (validateFileUpload is the same pure function both run).
 */
async function validateAndExtractSyllabusText(
  file: UploadedSyllabusFile,
  blob: Blob
): Promise<string> {
  const buffer = Buffer.from(await blob.arrayBuffer());
  const validation = validateFileUpload(file.name, file.mimeType, buffer.byteLength);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const text = await extractTextFromFile(buffer, validation.extension);
  if (!text.trim()) {
    throw new Error("No text found in that file. Upload a file with readable content.");
  }
  return text;
}

/**
 * Upload a syllabus file directly to a course's syllabus slot.
 *
 * Accepts .docx, .pdf, .txt, .md files up to 25 MB. The browser has already
 * uploaded the file straight to the private "course-files" Storage bucket
 * (docs/upload-body-limit-acceptance-criteria.md AC2) - `file` carries only
 * the small metadata describing that upload (name, storagePath, mimeType),
 * never the bytes themselves. This downloads the object, extracts text,
 * creates a syllabus record in the finalized syllabi library, and sets the
 * course's syllabus_id - then ALWAYS removes the temporary object, on
 * success or failure (withUploadedSyllabusFile), because nothing else in the
 * app ever reads the original upload again.
 *
 * Returns { syllabusId, syllabusName } on success, or { error } on failure.
 *
 * Record creation is ordered to avoid half-state: the syllabus record is
 * created first, then the course pointer is updated. If the pointer update
 * fails, the record persists (acceptable fallback).
 */
export async function uploadSyllabusAction(
  courseId: string,
  file: UploadedSyllabusFile
): Promise<{ syllabusId: string; syllabusName: string } | { error: string }> {
  try {
    const user = await requireOwner();

    const extraction = await withUploadedSyllabusFile(syllabusStorage(), user.id, file.storagePath, (blob) =>
      validateAndExtractSyllabusText(file, blob)
    );
    if (!extraction.ok) {
      return { error: extraction.error };
    }
    const syllabusText = extraction.value;

    // Convert extracted text to .docx for consistent storage
    const docxBuffer = await buildDocxFromPlainText(syllabusText, [], undefined);
    const docxBase64 = Buffer.from(docxBuffer).toString("base64");

    // Derive syllabus name from file name (without extension)
    const syllabusName = file.name.replace(/\.[^.]*$/, "");

    // Create syllabus record FIRST (before updating course pointer).
    // If the pointer update fails, the record existing is acceptable.
    const syllabusRecord = await createSyllabus(
      user.id,
      syllabusName,
      "uploaded-syllabus.docx",
      docxBase64,
      undefined
    );

    // Update course to point to the new syllabus record.
    //
    // updateCourse takes a FULL CourseInput, not a patch: toRow maps every
    // plain scalar column through clean(), and clean(undefined) is null, so
    // any column the payload fails to mention is actively WIPED rather than
    // left alone (see the hazard comment on courses.ts's course_kind field).
    //
    // This used to build that payload by hand, and the hand-written list had
    // fallen 15 columns behind the Course type - so uploading a syllabus
    // silently cleared the course's assigned syllabus template, its end date,
    // breaks, due rule, email settings, class length, modality, topic
    // outline, course kind, and all four instructor fields.
    //
    // courseToInputPayload is the shared mapping that exists precisely to
    // stop that, and unlike a hand-written list it is guarded by an
    // exhaustiveness test (registry-helpers.courseToInputPayload.test.ts)
    // that fails when a new Course field is added without being carried
    // here. Reusing it is what makes this fix durable rather than a
    // one-time catch-up that would drift again on the next column.
    try {
      const course = await getCourse(user.id, courseId);
      if (!course) {
        return {
          error: "Course not found. Syllabus was created but not linked to any course.",
        };
      }

      await updateCourse(user.id, courseId, {
        ...courseToInputPayload(course),
        syllabusId: syllabusRecord.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update the course.";
      return {
        error: `${msg} Syllabus was created but not linked to the course.`,
      };
    }

    return {
      syllabusId: syllabusRecord.id,
      syllabusName: syllabusRecord.name,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not upload the syllabus.",
    };
  }
}

/**
 * Extract plain text from an uploaded syllabus file (.docx, .pdf, .txt, .md)
 * with NO persistence side effect - unlike uploadSyllabusAction above, this
 * never creates a syllabus-library record or touches a course. It exists for
 * callers that just need the syllabus's TEXT (e.g. the course-schedule-from-
 * source workflow step, which derives a schedule from it the same way the
 * "course description" source does), where creating a durable syllabus
 * record would be an unwanted side effect of a schedule-preview step.
 *
 * Like uploadSyllabusAction, `file` is metadata describing an object the
 * browser already wrote to the "course-files" bucket - never a base64
 * payload - and the object is downloaded then always removed afterwards
 * (withUploadedSyllabusFile), success or failure.
 *
 * Calls the exact same validateAndExtractSyllabusText uploadSyllabusAction
 * calls, so the two paths literally cannot drift on which file types/sizes
 * are accepted.
 */
export async function extractSyllabusTextAction(
  file: UploadedSyllabusFile
): Promise<{ text: string } | { error: string }> {
  try {
    const user = await requireOwner();

    const extraction = await withUploadedSyllabusFile(syllabusStorage(), user.id, file.storagePath, (blob) =>
      validateAndExtractSyllabusText(file, blob)
    );
    if (!extraction.ok) {
      return { error: extraction.error };
    }

    return { text: extraction.value };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not read the syllabus file.",
    };
  }
}
