import { describe, it, expect } from "vitest";
import {
  parseTocChapters,
  validateScheduleAlignment,
  formatBalanceSummary,
  planWeekItems,
  isNonContentWeekText,
  isFrontMatterModuleText,
  describeCoveredChapters,
  shouldDeriveToc,
  buildTocDerivationPrompt,
} from "./source-alignment";
import type { ScheduleWeekPlan } from "@/app/actions-types";

describe("source-alignment", () => {
  describe("parseTocChapters", () => {
    it("parses 'Chapter N: Title' format", () => {
      const toc = `Chapter 1: Introduction
Chapter 2: Fundamentals
Chapter 3: Advanced Topics`;
      const chapters = parseTocChapters(toc);
      expect(chapters).toHaveLength(3);
      expect(chapters[0]).toMatchObject({
        number: "1",
        title: "Introduction",
        depth: 0,
      });
      expect(chapters[2]).toMatchObject({
        number: "3",
        title: "Advanced Topics",
        depth: 0,
      });
    });

    it("parses 'N. Title' format", () => {
      const toc = `1. Introduction
2. Fundamentals
3. Advanced`;
      const chapters = parseTocChapters(toc);
      expect(chapters).toHaveLength(3);
      expect(chapters[0]).toMatchObject({ number: "1", title: "Introduction" });
    });

    it("parses 'Unit N - Title' format", () => {
      const toc = `Unit 1 - Getting Started
Unit 2 - Core Concepts`;
      const chapters = parseTocChapters(toc);
      expect(chapters).toHaveLength(2);
      expect(chapters[0]).toMatchObject({ number: "1", title: "Getting Started" });
    });

    it("handles subsections", () => {
      const toc = `1. Chapter One
  1.1. Section A
  1.2. Section B
2. Chapter Two`;
      const chapters = parseTocChapters(toc);
      expect(chapters).toHaveLength(2);
      expect(chapters[0]).toMatchObject({ subsectionCount: 2 });
      expect(chapters[1]).toMatchObject({ subsectionCount: 0 });
    });

    it("returns empty array for empty TOC", () => {
      expect(parseTocChapters("")).toEqual([]);
      expect(parseTocChapters("   ")).toEqual([]);
    });
  });

  describe("shouldDeriveToc", () => {
    it("is true for a bare URL", () => {
      expect(
        shouldDeriveToc("https://www.ucertify.com/app/?func=load_course&course=CEH-v12.AE1&desk_copy=1")
      ).toBe(true);
    });

    it("is true for a URL embedded in short text", () => {
      expect(shouldDeriveToc("CEH v12 course: https://www.ucertify.com/app/?func=load_course")).toBe(true);
    });

    it("is true for a short citation with no URL", () => {
      expect(shouldDeriveToc("Some Textbook, 3rd Edition")).toBe(true);
    });

    it("is false for a real multi-line TOC", () => {
      const toc = `Chapter 1: Introduction
Chapter 2: Fundamentals
Chapter 3: Advanced Topics`;
      expect(shouldDeriveToc(toc)).toBe(false);
    });

    it("is false for long prose without a URL", () => {
      const prose =
        "This course covers a broad survey of the discipline, starting from first principles and building up through increasingly advanced material across the term, with an emphasis on practical, hands-on application of every concept introduced along the way, including several case studies.";
      expect(prose.length).toBeGreaterThanOrEqual(200);
      expect(shouldDeriveToc(prose)).toBe(false);
    });

    it("is false for empty or blank input", () => {
      expect(shouldDeriveToc("")).toBe(false);
      expect(shouldDeriveToc("   ")).toBe(false);
    });
  });

  describe("buildTocDerivationPrompt", () => {
    it("embeds the trimmed source and asks for a parseable module list", () => {
      const prompt = buildTocDerivationPrompt("  https://www.ucertify.com/app/?func=load_course  ");
      expect(prompt).toContain("SOURCE: https://www.ucertify.com/app/?func=load_course");
      expect(prompt).toContain("Module N: Title");
      expect(prompt).not.toContain("SOURCE:   https://");
    });

    it("round-trips a canned module-list response through parseTocChapters", () => {
      // What a real deriveTocFromSource call expects back, per the prompt
      // built above - confirms the requested shape actually parses.
      const cannedResponse = `Module 1: Introduction to Ethical Hacking
Module 2: Footprinting and Reconnaissance
  Passive footprinting
  Active footprinting
Module 3: Scanning Networks`;
      const chapters = parseTocChapters(cannedResponse);
      expect(chapters).toHaveLength(3);
      expect(chapters[1]).toMatchObject({ number: "2", title: "Footprinting and Reconnaissance" });
    });
  });

  describe("validateScheduleAlignment", () => {
    it("detects covered chapters", () => {
      const chapters = [
        { number: "1", title: "Intro", depth: 0, subsectionCount: 0 },
        { number: "2", title: "Basics", depth: 0, subsectionCount: 0 },
      ];
      const schedule: ScheduleWeekPlan[] = [
        {
          week: 1,
          topic: "Week 1",
          summary: "Chapter 1: Introduction concepts",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
        {
          week: 2,
          topic: "Week 2",
          summary: "Chapter 2: Basics overview",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
      ];

      const balance = validateScheduleAlignment(schedule, chapters);
      expect(balance.chaptersCovered).toBe(2);
      expect(balance.anomalies).toHaveLength(0);
    });

    it("detects unmatched chapters", () => {
      const chapters = [
        { number: "1", title: "Intro", depth: 0, subsectionCount: 0 },
        { number: "2", title: "Basics", depth: 0, subsectionCount: 0 },
      ];
      const schedule: ScheduleWeekPlan[] = [
        {
          week: 1,
          topic: "Week 1",
          summary: "Chapter 1 content",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
      ];

      const balance = validateScheduleAlignment(schedule, chapters);
      expect(balance.chaptersCovered).toBe(1);
      expect(balance.anomalies).toContain("TOC chapter 2 not covered in schedule");
    });

    it("detects non-content weeks", () => {
      const chapters = [
        { number: "1", title: "Intro", depth: 0, subsectionCount: 0 },
      ];
      const schedule: ScheduleWeekPlan[] = [
        {
          week: 1,
          topic: "Content",
          summary: "Chapter 1",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
        {
          week: 2,
          topic: "Review",
          summary: "Midterm review week",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
      ];

      const balance = validateScheduleAlignment(schedule, chapters);
      expect(balance.nonContentWeeks).toBe(1);
      expect(balance.contentWeeks).toBe(1);
    });
  });

  describe("formatBalanceSummary", () => {
    it("formats balance info", () => {
      const balance = {
        chaptersInToc: 10,
        chaptersCovered: 10,
        weeksInSchedule: 15,
        nonContentWeeks: 3,
        contentWeeks: 12,
        spans: 1,
        anomalies: [] as string[],
      };
      const summary = formatBalanceSummary(balance);
      expect(summary).toContain("10/10 covered");
      expect(summary).toContain("12 content weeks");
      expect(summary).toContain("3 non-content week(s)");
    });

    it("includes anomalies in summary", () => {
      const balance = {
        chaptersInToc: 10,
        chaptersCovered: 9,
        weeksInSchedule: 15,
        nonContentWeeks: 2,
        contentWeeks: 13,
        spans: 1,
        anomalies: ["TOC chapter 5 not covered"],
      };
      const summary = formatBalanceSummary(balance);
      expect(summary).toContain("Anomalies:");
      expect(summary).toContain("TOC chapter 5 not covered");
    });
  });

  describe("planWeekItems", () => {
    it("identifies content weeks with chapters", () => {
      const schedule: ScheduleWeekPlan[] = [
        {
          week: 1,
          topic: "Intro",
          summary: "Chapter 1: Basics",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
      ];
      const items = planWeekItems(schedule);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        week: 1,
        chapterRef: "Chapter 1",
        isNonContent: false,
      });
    });

    it("identifies non-content weeks", () => {
      const schedule: ScheduleWeekPlan[] = [
        {
          week: 7,
          topic: "Review",
          summary: "Midterm review and exam preparation",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
      ];
      const items = planWeekItems(schedule);
      expect(items[0]).toMatchObject({
        week: 7,
        isNonContent: true,
        chapterRef: null,
      });
    });
  });

  describe("isNonContentWeekText", () => {
    it("detects review keyword", () => {
      expect(isNonContentWeekText("Review")).toBe(true);
      expect(isNonContentWeekText("Midterm review")).toBe(true);
    });

    it("detects exam keyword", () => {
      expect(isNonContentWeekText("Exam preparation")).toBe(true);
      expect(isNonContentWeekText("Final exam")).toBe(true);
    });

    it("detects test keyword", () => {
      expect(isNonContentWeekText("Test 1")).toBe(true);
      expect(isNonContentWeekText("Midterm test")).toBe(true);
    });

    it("detects project keyword", () => {
      expect(isNonContentWeekText("Project week")).toBe(true);
      expect(isNonContentWeekText("Group project")).toBe(true);
    });

    it("detects presentation keyword", () => {
      expect(isNonContentWeekText("Student presentations")).toBe(true);
      expect(isNonContentWeekText("Final presentation")).toBe(true);
    });

    it("detects final keyword", () => {
      expect(isNonContentWeekText("Final review")).toBe(true);
      expect(isNonContentWeekText("Final week")).toBe(true);
    });

    it("returns false for content weeks", () => {
      expect(isNonContentWeekText("Chapter 1: Basics")).toBe(false);
      expect(isNonContentWeekText("Introduction to JavaScript")).toBe(false);
      expect(isNonContentWeekText("")).toBe(false);
    });

    it("handles multiple text arguments", () => {
      expect(isNonContentWeekText("Week", "Review")).toBe(true);
      expect(isNonContentWeekText("Chapter 1", "Exam")).toBe(true);
      expect(isNonContentWeekText("Introduction", undefined, "Project")).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(isNonContentWeekText("REVIEW")).toBe(true);
      expect(isNonContentWeekText("ReViEw")).toBe(true);
      expect(isNonContentWeekText("EXAM")).toBe(true);
    });
  });

  describe("isFrontMatterModuleText", () => {
    it("recognizes each listed front-matter phrase", () => {
      expect(isFrontMatterModuleText("Start Here")).toBe(true);
      expect(isFrontMatterModuleText("Welcome")).toBe(true);
      expect(isFrontMatterModuleText("Orientation")).toBe(true);
      expect(isFrontMatterModuleText("Getting Started")).toBe(true);
      expect(isFrontMatterModuleText("Syllabus")).toBe(true);
      expect(isFrontMatterModuleText("Course Information")).toBe(true);
      expect(isFrontMatterModuleText("Course Info")).toBe(true);
      expect(isFrontMatterModuleText("Resources")).toBe(true);
      expect(isFrontMatterModuleText("Readme")).toBe(true);
      expect(isFrontMatterModuleText("Announcements")).toBe(true);
    });

    it("returns false for real teaching topics", () => {
      expect(isFrontMatterModuleText("Algorithms and Data Structures")).toBe(false);
      expect(isFrontMatterModuleText("Loops")).toBe(false);
      expect(isFrontMatterModuleText("")).toBe(false);
    });

    it("is case-insensitive and matches as a substring", () => {
      expect(isFrontMatterModuleText("START HERE")).toBe(true);
      expect(isFrontMatterModuleText("Module 0: Start Here and Setup")).toBe(true);
    });
  });

  describe("describeCoveredChapters", () => {
    it("extracts chapters from weeks before the target week", () => {
      const schedule: ScheduleWeekPlan[] = [
        {
          week: 1,
          topic: "Intro",
          summary: "Chapter 1: Basics",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
        {
          week: 2,
          topic: "Core",
          summary: "Chapter 2 and Chapter 3",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
        {
          week: 3,
          topic: "Review",
          summary: "Review chapters 1-2",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
      ];

      const covered = describeCoveredChapters(schedule, 3);
      expect(covered).toBe("Chapter 1, Chapter 2, Chapter 3");
    });

    it("returns empty string when no prior weeks", () => {
      const schedule: ScheduleWeekPlan[] = [
        {
          week: 1,
          topic: "Intro",
          summary: "Chapter 1: Basics",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
      ];

      const covered = describeCoveredChapters(schedule, 1);
      expect(covered).toBe("");
    });

    it("returns empty string when schedule is empty", () => {
      const covered = describeCoveredChapters([], 1);
      expect(covered).toBe("");
    });

    it("deduplicates and sorts chapter numbers", () => {
      const schedule: ScheduleWeekPlan[] = [
        {
          week: 1,
          topic: "Intro",
          summary: "Chapter 3 and Chapter 1",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
        {
          week: 2,
          topic: "Core",
          summary: "Chapter 1 (continued) and Chapter 2",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
      ];

      const covered = describeCoveredChapters(schedule, 3);
      expect(covered).toBe("Chapter 1, Chapter 2, Chapter 3");
    });

    it("handles decimal chapter numbers", () => {
      const schedule: ScheduleWeekPlan[] = [
        {
          week: 1,
          topic: "Intro",
          summary: "Chapter 1.1 and Chapter 1.2",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
        {
          week: 2,
          topic: "Core",
          summary: "Chapter 2.1",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
      ];

      const covered = describeCoveredChapters(schedule, 3);
      expect(covered).toContain("Chapter 1.1");
      expect(covered).toContain("Chapter 1.2");
      expect(covered).toContain("Chapter 2.1");
    });

    it("ignores weeks at or after the target week", () => {
      const schedule: ScheduleWeekPlan[] = [
        {
          week: 1,
          topic: "Intro",
          summary: "Chapter 1",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
        {
          week: 2,
          topic: "Core",
          summary: "Chapter 2",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
        {
          week: 3,
          topic: "Advanced",
          summary: "Chapter 3",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        },
      ];

      const covered = describeCoveredChapters(schedule, 3);
      expect(covered).toBe("Chapter 1, Chapter 2");
      expect(covered).not.toContain("Chapter 3");
    });
  });
});
