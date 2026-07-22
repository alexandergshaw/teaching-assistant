"use server";

import { OfficeParser } from "officeparser";
import { requireOwner } from "@/lib/supabase/auth";
import { createSyllabus } from "@/lib/supabase/course-syllabi";
import { getCourse, updateCourse } from "@/lib/supabase/courses";
import { parseOfficeParagraphs } from "@/lib/office-edit";
import { buildDocxFromPlainText } from "@/lib/docx";
import { validateFileUpload } from "@/lib/syllabus-upload-validation";

/** Extract plain text from an uploaded file. */
async function extractTextFromFile(
  fileBase64: string,
  extension: string
): Promise<string> {
  if (extension === ".txt" || extension === ".md") {
    // Decode base64 to string
    const buffer = Buffer.from(fileBase64, "base64");
    return buffer.toString("utf-8").trim();
  }

  if (extension === ".docx") {
    // Parse Office paragraphs and join as text
    const buffer = Buffer.from(fileBase64, "base64");
    const paragraphs = await parseOfficeParagraphs("docx", buffer);
    return paragraphs.map((p) => p.text).join("\n");
  }

  if (extension === ".pdf") {
    // Use officeparser to extract text from PDF
    const buffer = Buffer.from(fileBase64, "base64");
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
 * Upload a syllabus file directly to a course's syllabus slot.
 *
 * Accepts .docx, .pdf, .txt, .md files up to 6 MB. Extracts text, creates
 * a syllabus record in the finalized syllabi library, and sets the course's
 * syllabus_id.
 *
 * Returns { syllabusId, syllabusName } on success, or { error } on failure.
 *
 * Record creation is ordered to avoid half-state: the syllabus record is
 * created first, then the course pointer is updated. If the pointer update
 * fails, the record persists (acceptable fallback).
 */
export async function uploadSyllabusAction(
  courseId: string,
  file: { name: string; base64: string; mimeType: string }
): Promise<{ syllabusId: string; syllabusName: string } | { error: string }> {
  try {
    const user = await requireOwner();

    // Validate file
    const fileSize = Buffer.byteLength(file.base64, "base64");
    const validation = validateFileUpload(file.name, file.mimeType, fileSize);
    if (!validation.valid) {
      return { error: validation.error };
    }

    // Extract text from file
    let syllabusText: string;
    try {
      syllabusText = await extractTextFromFile(file.base64, validation.extension);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not extract text from the file.";
      return { error: msg };
    }

    if (!syllabusText.trim()) {
      return {
        error: "No text found in that file. Upload a file with readable content.",
      };
    }

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
    // Fetch the course first to get all existing fields, then update with syllabusId.
    try {
      const course = await getCourse(user.id, courseId);
      if (!course) {
        return {
          error: "Course not found. Syllabus was created but not linked to any course.",
        };
      }

      await updateCourse(user.id, courseId, {
        name: course.name,
        courseCode: course.courseCode ?? undefined,
        term: course.term ?? undefined,
        canvasUrl: course.canvasUrl ?? undefined,
        repos: course.repos,
        githubOrg: course.githubOrg ?? undefined,
        textbook: course.textbook ?? undefined,
        syllabusId: syllabusRecord.id,
        institution: course.institution ?? undefined,
        integrations: course.integrations,
        roster: course.roster ?? undefined,
        notes: course.notes ?? undefined,
        topics: course.topics ?? undefined,
        csvName: course.csvName ?? undefined,
        csvData: course.csvData ?? undefined,
        rubricName: course.rubricName ?? undefined,
        rubricData: course.rubricData ?? undefined,
        startDate: course.startDate ?? undefined,
        description: course.description ?? undefined,
        weeks: course.weeks ?? undefined,
        tests: course.tests ?? undefined,
        lms: course.lms ?? undefined,
        dayTime: course.dayTime ?? undefined,
        customTiles: course.customTiles,
        hiddenTiles: course.hiddenTiles,
        studentRepos: course.studentRepos,
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
