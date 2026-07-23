"use client";

import { useState } from "react";
import type { CourseScheduleRow } from "../../actions";
import { generateCourseScheduleAction } from "../../actions";
import { getStoredProvider } from "@/lib/llm-provider";

export function useSchedule() {
  const [courseDescription, setCourseDescription] = useState("");
  const [scheduleTerm, setScheduleTerm] = useState("");
  const [scheduleStartDate, setScheduleStartDate] = useState("");
  const [scheduleWeeks, setScheduleWeeks] = useState("");
  const [scheduleTests, setScheduleTests] = useState("");
  const [scheduleRows, setScheduleRows] = useState<CourseScheduleRow[]>([]);
  const [scheduleTopics, setScheduleTopics] = useState<string[] | null>(null);
  const [isGeneratingSchedule, setIsGeneratingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleGenerated, setScheduleGenerated] = useState(false);

  const handleGenerateSchedule = async () => {
    if (!courseDescription.trim()) {
      setScheduleError("Please enter a course description.");
      return;
    }

    let weeksOrNull: number | null = null;
    if (scheduleWeeks.trim()) {
      const weeks = parseInt(scheduleWeeks, 10);
      if (!weeks || weeks < 1 || weeks > 52) {
        setScheduleError("Please enter a valid number of weeks (1–52).");
        return;
      }
      weeksOrNull = weeks;
    }

    let testsOrNull: number | null = null;
    if (scheduleTests.trim()) {
      const tests = parseInt(scheduleTests, 10);
      if (isNaN(tests) || tests < 0) {
        setScheduleError("Please enter a valid number of tests (0 or more).");
        return;
      }
      testsOrNull = tests;
    }

    setIsGeneratingSchedule(true);
    setScheduleError(null);
    try {
      const result = await generateCourseScheduleAction(
        courseDescription.trim(),
        scheduleTerm.trim(),
        scheduleStartDate,
        weeksOrNull,
        testsOrNull,
        getStoredProvider()
      );
      if ("error" in result) {
        setScheduleError(result.error);
        return;
      }
      setScheduleRows(result.rows);
      if ("topics" in result && result.topics) {
        setScheduleTopics(result.topics);
      } else {
        setScheduleTopics(null);
      }
      setScheduleGenerated(true);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Failed to generate schedule.");
    } finally {
      setIsGeneratingSchedule(false);
    }
  };

  const resetSchedule = () => {
    setScheduleGenerated(false);
    setScheduleRows([]);
    setScheduleTopics(null);
    setScheduleError(null);
  };

  const buildScheduleCsv = (): { content: string; fileName: string } => {
    const header = ["Week", "Dates", "Topics", "Assignment"];
    const escapeCell = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const rows = [
      header.join(","),
      ...scheduleRows.map((r) =>
        [String(r.week), escapeCell(r.dates), escapeCell(r.topics), escapeCell(r.assignment)].join(",")
      ),
    ];
    const courseName = courseDescription.split("\n")[0].trim().slice(0, 60);
    const sanitized = courseName.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "course";
    return { content: rows.join("\r\n"), fileName: `${sanitized}_schedule.csv` };
  };

  return {
    courseDescription,
    setCourseDescription,
    scheduleTerm,
    setScheduleTerm,
    scheduleStartDate,
    setScheduleStartDate,
    scheduleWeeks,
    setScheduleWeeks,
    scheduleTests,
    setScheduleTests,
    scheduleRows,
    scheduleTopics,
    isGeneratingSchedule,
    scheduleError,
    scheduleGenerated,
    handleGenerateSchedule,
    resetSchedule,
    buildScheduleCsv,
  };
}
