"use client";

import { useRef, useState, useEffect } from "react";
import {
  analyzeSyllabusInputsAction,
  regenerateSyllabusFieldAction,
  buildAdaptedSyllabusAction,
  getRepoZipAction,
  type SyllabusCourseInfo,
} from "../../actions";
import { takeCourseHandoff } from "@/lib/course-handoff";
import { getStoredProvider } from "@/lib/llm-provider";
import type { RunSpan } from "@/lib/office-edit";
import { spansToPlainText } from "../RichTextEditor";
import { boldLabelSpans, readFileBase64 } from "./utils";
import { LS_KEYS, type AdaptSection } from "./types";

export function useSyllabusAdaptation() {
  const adaptSyllabusRef = useRef<HTMLInputElement>(null);
  const adaptZipRef = useRef<HTMLInputElement>(null);
  const textbookImagesRef = useRef<HTMLInputElement>(null);

  const [adaptSyllabusBase64, setAdaptSyllabusBase64] = useState<string | null>(null);
  const [pickedTemplate, setPickedTemplate] = useState<{ id: string; name: string; fileName: string; base64: string } | null>(null);
  const [extractedTextbookInfo, setExtractedTextbookInfo] = useState("");
  const [adaptTextbookText, setAdaptTextbookText] = useState("");
  const [adaptSyllabusName, setAdaptSyllabusName] = useState("");
  const [adaptSections, setAdaptSections] = useState<AdaptSection[] | null>(null);
  const adaptKeySeq = useRef(0);
  const [adaptStatus, setAdaptStatus] = useState<"idle" | "analyzing" | "building">("idle");
  const [adaptError, setAdaptError] = useState<string | null>(null);

  const [adaptCourseName, setAdaptCourseName] = useState("");
  const [adaptCourseCode, setAdaptCourseCode] = useState("");
  const [adaptInstructorName, setAdaptInstructorName] = useState("");
  const [adaptInstructorEmail, setAdaptInstructorEmail] = useState("");
  const [adaptDescription, setAdaptDescription] = useState("");
  const [adaptStartDate, setAdaptStartDate] = useState("");
  const [adaptMeetingDays, setAdaptMeetingDays] = useState("");
  const [adaptMeetingTimes, setAdaptMeetingTimes] = useState("");
  const [adaptLocation, setAdaptLocation] = useState("");

  const [adaptCodebaseSummary, setAdaptCodebaseSummary] = useState("");
  const [adaptRegenKey, setAdaptRegenKey] = useState<string | null>(null);
  const fieldCursorRef = useRef(0);

  const [adaptRepo, setAdaptRepo] = useState("");
  const [adaptBranch, setAdaptBranch] = useState("");

  // Hydrate syllabus adaptation fields from localStorage
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setAdaptCourseName(localStorage.getItem(LS_KEYS.adaptCourseName) || "");
    setAdaptCourseCode(localStorage.getItem(LS_KEYS.adaptCourseCode) || "");
    setAdaptInstructorName(localStorage.getItem(LS_KEYS.adaptInstructorName) || "");
    setAdaptInstructorEmail(localStorage.getItem(LS_KEYS.adaptInstructorEmail) || "");
    setAdaptDescription(localStorage.getItem(LS_KEYS.adaptDescription) || "");
    setAdaptTextbookText(localStorage.getItem(LS_KEYS.adaptTextbookText) || "");
    setAdaptStartDate(localStorage.getItem(LS_KEYS.adaptStartDate) || "");
    setAdaptMeetingDays(localStorage.getItem(LS_KEYS.adaptMeetingDays) || "");
    setAdaptMeetingTimes(localStorage.getItem(LS_KEYS.adaptMeetingTimes) || "");
    setAdaptLocation(localStorage.getItem(LS_KEYS.adaptLocation) || "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Arriving from a course in the Courses hub: open in Syllabus mode with the
  // course's fields prefilled. Runs after the hydration effects, so it wins.
  useEffect(() => {
    const h = takeCourseHandoff("syllabus");
    if (!h) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (h.name) { setAdaptCourseName(h.name); localStorage.setItem(LS_KEYS.adaptCourseName, h.name); }
    if (h.courseCode) { setAdaptCourseCode(h.courseCode); localStorage.setItem(LS_KEYS.adaptCourseCode, h.courseCode); }
    if (h.textbook) { setAdaptTextbookText(h.textbook); localStorage.setItem(LS_KEYS.adaptTextbookText, h.textbook); }
    if (h.repo) setAdaptRepo(h.repo);
    if (h.branch) setAdaptBranch(h.branch);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const jumpToNextField = () => {
    const keys = (adaptSections ?? []).filter((s) => s.isField).map((s) => s.key);
    if (keys.length === 0) return;
    const idx = fieldCursorRef.current % keys.length;
    fieldCursorRef.current = idx + 1;
    document.getElementById(`syllabus-field-${keys[idx]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const adaptCourseInfo = (): SyllabusCourseInfo => ({
    courseName: adaptCourseName.trim() || undefined,
    courseCode: adaptCourseCode.trim() || undefined,
    instructorName: adaptInstructorName.trim() || undefined,
    instructorEmail: adaptInstructorEmail.trim() || undefined,
    courseDescription: adaptDescription.trim() || undefined,
    startDate: adaptStartDate.trim() || undefined,
    meetingDays: adaptMeetingDays.trim() || undefined,
    meetingTimes: adaptMeetingTimes.trim() || undefined,
    location: adaptLocation.trim() || undefined,
    textbookInfo: [adaptTextbookText.trim(), extractedTextbookInfo.trim()].filter(Boolean).join("\n\n") || undefined,
  });

  const updateSection = (key: string, patch: Partial<AdaptSection>) =>
    setAdaptSections((prev) => (prev ? prev.map((s) => (s.key === key ? { ...s, ...patch } : s)) : prev));

  const deleteSection = (key: string) =>
    setAdaptSections((prev) => (prev ? prev.filter((s) => s.key !== key) : prev));

  const addSectionAfter = (key: string) =>
    setAdaptSections((prev) => {
      if (!prev) return prev;
      const idx = prev.findIndex((s) => s.key === key);
      if (idx === -1) return prev;
      const fresh: AdaptSection = {
        key: `new-${adaptKeySeq.current++}`,
        sourceId: prev[idx].sourceId,
        original: "",
        spans: [{ text: "" }],
        label: "New section",
        isField: false,
      };
      return [...prev.slice(0, idx + 1), fresh, ...prev.slice(idx + 1)];
    });

  const handleAnalyzeSyllabus = async () => {
    const syllabusFile = adaptSyllabusRef.current?.files?.[0];
    if (!syllabusFile && !pickedTemplate) {
      setAdaptError("Upload a former syllabus (.docx) or pick a saved template first.");
      return;
    }
    if (syllabusFile && !/\.docx$/i.test(syllabusFile.name)) {
      setAdaptError("The former syllabus must be a Word .docx file.");
      return;
    }
    const zipFile = adaptZipRef.current?.files?.[0] ?? null;
    setAdaptStatus("analyzing");
    setAdaptError(null);
    setAdaptSections(null);
    try {
      const syllabusName = syllabusFile ? syllabusFile.name : pickedTemplate ? pickedTemplate.fileName : "";
      const syllabusBase64 = syllabusFile ? await readFileBase64(syllabusFile) : pickedTemplate ? pickedTemplate.base64 : "";
      let zipBase64: string | null = null;
      if (adaptRepo.trim()) {
        const z = await getRepoZipAction(adaptRepo.trim(), adaptBranch || undefined);
        if ("error" in z) {
          setAdaptError(z.error);
          return;
        }
        zipBase64 = z.base64;
      } else if (zipFile) {
        zipBase64 = await readFileBase64(zipFile);
      }
      setAdaptSyllabusBase64(syllabusBase64);
      setAdaptSyllabusName(syllabusName);
      const imageFiles = Array.from(textbookImagesRef.current?.files ?? []);
      const textbookImages = imageFiles.length
        ? await Promise.all(
            imageFiles.map(async (f) => ({ base64: await readFileBase64(f), mimeType: f.type || "image/png" }))
          )
        : null;
      const result = await analyzeSyllabusInputsAction(
        { name: syllabusName, base64: syllabusBase64 },
        zipBase64,
        { ...adaptCourseInfo(), textbookInfo: adaptTextbookText.trim() || undefined },
        getStoredProvider(),
        textbookImages
      );
      if ("error" in result) {
        setAdaptError(result.error);
        return;
      }
      if (result.textbookInfo) setExtractedTextbookInfo(result.textbookInfo);
      const fieldById = new Map(result.fields.map((f: { paragraphId: string; suggestedText: string; label: string }) => [f.paragraphId, f]));
      const sections: AdaptSection[] = result.paragraphs.map((p: { id: string; text: string; runs: RunSpan[] }) => {
        const field = fieldById.get(p.id);
        const sched = result.scheduleReplacements[p.id];
        const replacement = field ? field.suggestedText : sched;
        const spans = replacement !== undefined ? boldLabelSpans(p.runs, replacement) : p.runs.length > 0 ? p.runs : [{ text: p.text }];
        return {
          key: p.id,
          sourceId: p.id,
          original: p.text,
          spans,
          label: field?.label ?? "Section",
          isField: !!field,
        };
      });
      setAdaptSections(sections);
      setAdaptCodebaseSummary(result.codebaseSummary);
    } catch (err) {
      setAdaptError(err instanceof Error ? err.message : "Failed to analyze the syllabus.");
    } finally {
      setAdaptStatus("idle");
    }
  };

  const handleRegenerateAdaptSection = async (section: AdaptSection) => {
    setAdaptRegenKey(section.key);
    setAdaptError(null);
    try {
      const result = await regenerateSyllabusFieldAction(
        { label: section.label, currentText: section.original || spansToPlainText(section.spans) },
        adaptCodebaseSummary,
        adaptCourseInfo(),
        getStoredProvider()
      );
      if ("error" in result) {
        setAdaptError(result.error);
        return;
      }
      updateSection(section.key, { spans: [{ text: result.text }] });
    } catch (err) {
      setAdaptError(err instanceof Error ? err.message : "Failed to regenerate the section.");
    } finally {
      setAdaptRegenKey(null);
    }
  };

  const buildSyllabusBase64 = async (): Promise<string | null> => {
    if (!adaptSyllabusBase64 || !adaptSections) return null;
    const payload = adaptSections.map((s) => ({ sourceId: s.sourceId, spans: s.spans }));
    const result = await buildAdaptedSyllabusAction(adaptSyllabusBase64, payload);
    if ("error" in result) {
      setAdaptError(result.error);
      return null;
    }
    return result.base64;
  };

  const adaptedFileName = () => `${adaptSyllabusName.replace(/\.docx$/i, "") || "syllabus"}_adapted.docx`;

  return {
    adaptSyllabusRef,
    adaptZipRef,
    textbookImagesRef,
    adaptSyllabusBase64,
    pickedTemplate,
    setPickedTemplate,
    extractedTextbookInfo,
    adaptTextbookText,
    setAdaptTextbookText,
    adaptSyllabusName,
    adaptSections,
    setAdaptSections,
    adaptStatus,
    adaptError,
    setAdaptError,
    adaptCourseName,
    setAdaptCourseName,
    adaptCourseCode,
    setAdaptCourseCode,
    adaptInstructorName,
    setAdaptInstructorName,
    adaptInstructorEmail,
    setAdaptInstructorEmail,
    adaptDescription,
    setAdaptDescription,
    adaptStartDate,
    setAdaptStartDate,
    adaptMeetingDays,
    setAdaptMeetingDays,
    adaptMeetingTimes,
    setAdaptMeetingTimes,
    adaptLocation,
    setAdaptLocation,
    adaptCodebaseSummary,
    adaptRegenKey,
    fieldCursorRef,
    adaptRepo,
    setAdaptRepo,
    adaptBranch,
    setAdaptBranch,
    jumpToNextField,
    adaptCourseInfo,
    updateSection,
    deleteSection,
    addSectionAfter,
    handleAnalyzeSyllabus,
    handleRegenerateAdaptSection,
    buildSyllabusBase64,
    adaptedFileName,
  };
}
