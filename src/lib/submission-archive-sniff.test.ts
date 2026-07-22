import { describe, it, expect } from "vitest";
import { sniffEntries, mergeSniffedValues, type ArchiveEntry } from "./submission-archive-sniff";

describe("sniffEntries", () => {
  // Canvas bulk export pattern: <name>_<digits>_<digits>_<rest>
  describe("Canvas pattern detection", () => {
    it("detects Canvas from majority of entries matching pattern", async () => {
      const entries = [
        { name: "student1_123456_456789_submission.pdf", dir: false },
        { name: "student2_123457_456790_submission.pdf", dir: false },
        { name: "student3_123458_456791_submission.pdf", dir: false },
        { name: "README.txt", dir: false },
      ];
      const result = await sniffEntries(entries, "submissions.zip");
      expect(result.lms).toBe("canvas");
      expect(result.notes).toContain("LMS detected: canvas");
    });

    it("does not detect Canvas when pattern is minority", async () => {
      const entries = [
        { name: "student1_123456_456789_submission.pdf", dir: false },
        { name: "student2.pdf", dir: false },
        { name: "student3.pdf", dir: false },
        { name: "student4.pdf", dir: false },
      ];
      const result = await sniffEntries(entries, "submissions.zip");
      expect(result.lms).not.toBe("canvas");
    });

    it("requires directories to be excluded from Canvas pattern count", async () => {
      const entries = [
        { name: "student1_123456_456789_submission/", dir: true },
        { name: "student1_123456_456789_submission.pdf", dir: false },
        { name: "student2_123457_456790_submission.pdf", dir: false },
        { name: "student3.pdf", dir: false },
      ];
      const result = await sniffEntries(entries, "submissions.zip");
      // 2/3 files match = 66% > 50%
      expect(result.lms).toBe("canvas");
    });
  });

  // Moodle pattern: entries containing "_assignsubmission_"
  describe("Moodle detection", () => {
    it("detects Moodle from _assignsubmission_ in entry names", async () => {
      const entries = [
        { name: "user1/assignment1_assignsubmission_file/submission.pdf", dir: false },
        { name: "user2/assignment1_assignsubmission_file/submission.pdf", dir: false },
      ];
      const result = await sniffEntries(entries, "moodle_export.zip");
      expect(result.lms).toBe("moodle");
      expect(result.notes).toContain("LMS detected: moodle");
    });

    it("detects even single _assignsubmission_ entry", async () => {
      const entries = [
        { name: "user1/assignment1_assignsubmission_file/submission.pdf", dir: false },
      ];
      const result = await sniffEntries(entries, "moodle_export.zip");
      expect(result.lms).toBe("moodle");
    });
  });

  // Brightspace pattern: <digits>-<digits> - <name> - <date> folders
  describe("Brightspace detection", () => {
    it("detects Brightspace from folder naming pattern", async () => {
      const entries = [
        { name: "123456-1 - John Doe - 2024-01-15/", dir: true },
        { name: "123456-1 - John Doe - 2024-01-15/submission.pdf", dir: false },
        { name: "123456-2 - Jane Smith - 2024-01-15/", dir: true },
        { name: "123456-2 - Jane Smith - 2024-01-15/submission.pdf", dir: false },
      ];
      const result = await sniffEntries(entries, "brightspace_export.zip");
      expect(result.lms).toBe("brightspace");
      expect(result.notes).toContain("LMS detected: brightspace");
    });

    it("requires exact Brightspace folder format", async () => {
      const entries = [
        { name: "123456 - John Doe - 2024-01-15/", dir: true },
        { name: "123456 - John Doe - 2024-01-15/submission.pdf", dir: false },
      ];
      const result = await sniffEntries(entries, "archive.zip");
      // Missing hyphen in first part
      expect(result.lms).not.toBe("brightspace");
    });
  });

  // Blackboard pattern: gradebook_ prefix with label extraction
  describe("Blackboard detection and label extraction", () => {
    it("detects Blackboard from gradebook_ prefix", async () => {
      const entries = [
        { name: "gradebook_CSCI101_Assignment1_grades.txt", dir: false },
        { name: "submission_001.pdf", dir: false },
      ];
      const result = await sniffEntries(entries, "blackboard_export.zip");
      expect(result.lms).toBe("blackboard");
      expect(result.notes).toContain("LMS detected: blackboard");
    });

    it("extracts course and assignment from gradebook filename", async () => {
      const entries = [
        { name: "gradebook_CSCI101_Assignment1_grades.txt", dir: false },
      ];
      const result = await sniffEntries(entries, "export.zip");
      expect(result.lms).toBe("blackboard");
      expect(result.courseLabel).toBe("CSCI101");
      expect(result.assignmentLabel).toBe("Assignment1");
      expect(result.notes).toContain(
        "Blackboard course extracted from filename: CSCI101"
      );
      expect(result.notes).toContain(
        "Blackboard assignment extracted from filename: Assignment1"
      );
    });

    it("extracts course and assignment from varied gradebook filenames", async () => {
      const entries = [
        {
          name: "gradebook_CS101_Midterm_grades.txt",
          dir: false,
        },
      ];
      const result = await sniffEntries(entries, "export.zip");
      expect(result.courseLabel).toBe("CS101");
      expect(result.assignmentLabel).toBe("Midterm");
    });

    it("reads Blackboard points from companion txt via textOf", async () => {
      const entries = [
        { name: "gradebook_CSCI101_Assignment1_grades.txt", dir: false },
        { name: "gradebook_CSCI101_Assignment1_info.txt", dir: false },
      ];
      const textOf = async (name: string): Promise<string | null> => {
        if (name === "gradebook_CSCI101_Assignment1_info.txt") {
          return "Assignment Info\nPoints: 100\nDue Date: 2024-02-01";
        }
        return null;
      };
      const result = await sniffEntries(entries, "export.zip", textOf);
      expect(result.pointsPossible).toBe(100);
      expect(result.notes).toContain(
        "Blackboard points extracted from companion file: 100"
      );
    });

    it("handles Blackboard points with decimal values", async () => {
      const entries = [
        { name: "gradebook_CSCI101_Assignment1_grades.txt", dir: false },
        { name: "gradebook_CSCI101_Assignment1_info.txt", dir: false },
      ];
      const textOf = async (name: string): Promise<string | null> => {
        if (name === "gradebook_CSCI101_Assignment1_info.txt") {
          return "Points: 99.5";
        }
        return null;
      };
      const result = await sniffEntries(entries, "export.zip", textOf);
      expect(result.pointsPossible).toBe(99.5);
    });

    it("ignores missing companion file gracefully", async () => {
      const entries = [
        { name: "gradebook_CSCI101_Assignment1_grades.txt", dir: false },
      ];
      const textOf = async (): Promise<string | null> => null;
      const result = await sniffEntries(entries, "export.zip", textOf);
      expect(result.pointsPossible).toBeUndefined();
      expect(result.courseLabel).toBe("CSCI101");
    });
  });

  // Assignment label fallback from upload filename
  describe("Assignment label fallback", () => {
    it("uses upload filename as fallback when not generic", async () => {
      const entries = [{ name: "some_submission.pdf", dir: false }];
      const result = await sniffEntries(entries, "Project1.zip");
      expect(result.assignmentLabel).toBe("Project1");
      expect(result.notes).toContain("Assignment label fallback: upload filename Project1");
    });

    it("suppresses fallback for generic names", async () => {
      const entries = [{ name: "some_submission.pdf", dir: false }];
      const result = await sniffEntries(entries, "submissions.zip");
      expect(result.assignmentLabel).toBeUndefined();
    });

    it("suppresses fallback for 'archive' filename", async () => {
      const entries = [{ name: "some_submission.pdf", dir: false }];
      const result = await sniffEntries(entries, "archive.zip");
      expect(result.assignmentLabel).toBeUndefined();
    });

    it("suppresses fallback for 'download' filename", async () => {
      const entries = [{ name: "some_submission.pdf", dir: false }];
      const result = await sniffEntries(entries, "download.zip");
      expect(result.assignmentLabel).toBeUndefined();
    });

    it("suppresses fallback for 'export' filename", async () => {
      const entries = [{ name: "some_submission.pdf", dir: false }];
      const result = await sniffEntries(entries, "export.zip");
      expect(result.assignmentLabel).toBeUndefined();
    });

    it("ignores case when checking generic names", async () => {
      const entries = [{ name: "file.pdf", dir: false }];
      const result = await sniffEntries(entries, "SUBMISSIONS.zip");
      expect(result.assignmentLabel).toBeUndefined();
    });

    it("does not override extracted labels with fallback", async () => {
      const entries = [
        { name: "gradebook_CSCI101_HW3_grades.txt", dir: false },
      ];
      const result = await sniffEntries(entries, "MyFile.zip");
      // Blackboard extracted "HW3", should not be overridden
      expect(result.assignmentLabel).toBe("HW3");
    });
  });

  // Cartridge detection
  describe("Cartridge detection", () => {
    it("detects imsmanifest.xml as cartridge", async () => {
      const entries = [{ name: "imsmanifest.xml", dir: false }];
      const result = await sniffEntries(entries, "course.imscc");
      expect(result.lms).toBe("canvas");
      expect(result.notes).toContain("Cartridge archive detected");
    });

    it("detects course_settings/ folder as cartridge", async () => {
      const entries = [
        { name: "course_settings/", dir: true },
        { name: "course_settings/course_settings.xml", dir: false },
      ];
      const result = await sniffEntries(entries, "course.imscc");
      expect(result.lms).toBe("canvas");
      expect(result.notes).toContain("Cartridge archive detected");
    });

    it("returns early for cartridge without parsing", async () => {
      const entries = [
        { name: "imsmanifest.xml", dir: false },
        { name: "course_settings/", dir: true },
      ];
      const result = await sniffEntries(entries, "course.imscc");
      // When cartridge is detected, only basic fields are set
      expect(result.lms).toBe("canvas");
      expect(result.courseLabel).toBeUndefined();
      expect(result.assignmentLabel).toBeUndefined();
      expect(result.pointsPossible).toBeUndefined();
    });
  });

  // Empty/unknown archives
  describe("Empty or unknown archives", () => {
    it("returns empty result for empty archive", async () => {
      const entries: ArchiveEntry[] = [];
      const result = await sniffEntries(entries, "empty.zip");
      expect(result.lms).toBeUndefined();
      expect(result.notes).toContain("No metadata extracted");
    });

    it("returns empty result for unknown pattern", async () => {
      const entries = [
        { name: "file1.pdf", dir: false },
        { name: "file2.pdf", dir: false },
      ];
      const result = await sniffEntries(entries, "unknown.zip");
      expect(result.lms).toBeUndefined();
      expect(result.notes.length).toBeGreaterThan(0);
    });
  });

  // Multiple pattern precedence - majority rule
  describe("Multiple pattern precedence - majority rule", () => {
    it("uses first matching pattern when multiple detected (single match each)", async () => {
      // This would be unusual, but test precedence: Moodle first
      const entries = [
        // Moodle pattern
        { name: "user1_assignsubmission_file/submission.pdf", dir: false },
        // Canvas pattern (but not majority)
        { name: "student1_123456_456789_submission.pdf", dir: false },
        { name: "other.pdf", dir: false },
      ];
      const result = await sniffEntries(entries, "export.zip");
      // Moodle detected, so should be first
      expect(result.lms).toBe("moodle");
    });

    it("uses majority pattern when multiple patterns detected with different counts", async () => {
      // Canvas pattern appears 4 times, Brightspace only once
      // Canvas should win even though Brightspace appears first in order
      const entries = [
        // Brightspace (1 match)
        { name: "123456-1 - John Doe - 2024-01-15/", dir: true },
        // Canvas (4 matches)
        { name: "student1_123456_456789_submission.pdf", dir: false },
        { name: "student2_123457_456790_submission.pdf", dir: false },
        { name: "student3_123458_456791_submission.pdf", dir: false },
        { name: "student4_123459_456792_submission.pdf", dir: false },
      ];
      const result = await sniffEntries(entries, "export.zip");
      expect(result.lms).toBe("canvas");
      expect(result.notes).toContain("Multiple patterns detected; using majority: canvas");
    });

    it("breaks ties by pattern order when both meet thresholds", async () => {
      // Both Moodle and Brightspace match exactly once, both meet their thresholds
      // Moodle comes first in the pattern list, so should win on tie
      const entries = [
        { name: "user1_assignsubmission_file/submission.pdf", dir: false },
        { name: "123456-1 - John Doe - 2024-01-15/", dir: true },
      ];
      const result = await sniffEntries(entries, "export.zip");
      expect(result.lms).toBe("moodle");
      expect(result.notes).toContain("Multiple patterns detected; using majority: moodle");
    });

    it("correctly identifies Blackboard as majority over Canvas", async () => {
      // Blackboard has 5 matches, Canvas has 3 (need >50% of 8 files = >4)
      // Canvas doesn't meet threshold but Blackboard does
      const entries = [
        { name: "gradebook_CSCI101_HW1_grades.txt", dir: false },
        { name: "gradebook_CSCI101_HW2_grades.txt", dir: false },
        { name: "gradebook_CSCI101_HW3_grades.txt", dir: false },
        { name: "gradebook_CSCI101_HW4_grades.txt", dir: false },
        { name: "gradebook_CSCI101_HW5_grades.txt", dir: false },
        { name: "student1_123456_456789_submission.pdf", dir: false },
        { name: "student2_123457_456790_submission.pdf", dir: false },
        { name: "student3_123458_456791_submission.pdf", dir: false },
      ];
      const result = await sniffEntries(entries, "export.zip");
      expect(result.lms).toBe("blackboard");
    });

    it("uses majority over pattern priority (Blackboard beats Moodle)", async () => {
      // Blackboard (lowest priority, 3 matches) beats Moodle (higher priority, 1 match) on count
      const entries = [
        { name: "u1_assignsubmission_file/s.pdf", dir: false },
        { name: "gradebook_CSCI101_Assignment1_grades.txt", dir: false },
        { name: "gradebook_CSCI101_Assignment2_grades.txt", dir: false },
        { name: "gradebook_CSCI101_Assignment3_grades.txt", dir: false },
      ];
      const result = await sniffEntries(entries, "export.zip");
      expect(result.lms).toBe("blackboard");
      expect(result.notes).toContain("Multiple patterns detected; using majority: blackboard");
    });
  });

  // Notes accumulation
  describe("Notes generation", () => {
    it("accumulates notes from detection and extraction", async () => {
      const entries = [
        { name: "gradebook_CSCI101_HW1_grades.txt", dir: false },
      ];
      const result = await sniffEntries(entries, "export.zip");
      expect(result.notes.length).toBeGreaterThan(0);
      expect(result.notes).toContain("LMS detected: blackboard");
      expect(result.notes).toContain("Blackboard course extracted from filename: CSCI101");
    });

    it("includes fallback assignment label in notes", async () => {
      const entries = [{ name: "file.pdf", dir: false }];
      const result = await sniffEntries(entries, "MyAssignment.zip");
      expect(result.notes).toContain("Assignment label fallback: upload filename MyAssignment");
    });
  });
});

describe("mergeSniffedValues", () => {
  it("adopts all sniff values when current is empty", () => {
    const current = {
      courseLabel: "",
      assignmentLabel: "",
      pointsPossible: "",
      rubricText: "",
      lms: "canvas" as const,
      lmsChosen: false,
    };
    const sniff = {
      courseLabel: "CS 101",
      assignmentLabel: "Midterm Exam",
      pointsPossible: 100,
      rubricText: "Grading criteria...",
      lms: "canvas" as const,
      notes: [],
    };

    const result = mergeSniffedValues(current, sniff);
    expect(result.courseLabel).toBe("CS 101");
    expect(result.assignmentLabel).toBe("Midterm Exam");
    expect(result.pointsPossible).toBe(100);
    expect(result.rubricText).toBe("Grading criteria...");
  });

  it("keeps user-typed courseLabel over sniff value", () => {
    const current = {
      courseLabel: "User's Course",
      assignmentLabel: "",
      pointsPossible: "",
      rubricText: "",
      lms: "canvas" as const,
      lmsChosen: false,
    };
    const sniff = {
      courseLabel: "Sniffed Course",
      notes: [],
    };

    const result = mergeSniffedValues(current, sniff);
    expect(result.courseLabel).toBe("User's Course");
  });

  it("prefers current pointsPossible over sniff when both present", () => {
    const current = {
      courseLabel: "",
      assignmentLabel: "",
      pointsPossible: "85",
      rubricText: "",
      lms: "canvas" as const,
      lmsChosen: false,
    };
    const sniff = {
      pointsPossible: 100,
      notes: [],
    };

    const result = mergeSniffedValues(current, sniff);
    expect(result.pointsPossible).toBe(85);
  });

  it("adopts sniff pointsPossible when current is empty", () => {
    const current = {
      courseLabel: "",
      assignmentLabel: "",
      pointsPossible: "",
      rubricText: "",
      lms: "canvas" as const,
      lmsChosen: false,
    };
    const sniff = {
      pointsPossible: 100,
      notes: [],
    };

    const result = mergeSniffedValues(current, sniff);
    expect(result.pointsPossible).toBe(100);
  });

  it("ignores sniff lms when lmsChosen is true", () => {
    const current = {
      courseLabel: "",
      assignmentLabel: "",
      pointsPossible: "",
      rubricText: "",
      lms: "brightspace" as const,
      lmsChosen: true,
    };
    const sniff = {
      lms: "canvas" as const,
      notes: [],
    };

    const result = mergeSniffedValues(current, sniff);
    expect(result.lms).toBe("brightspace");
  });

  it("adopts sniff lms when lmsChosen is false and sniff has lms", () => {
    const current = {
      courseLabel: "",
      assignmentLabel: "",
      pointsPossible: "",
      rubricText: "",
      lms: "canvas" as const,
      lmsChosen: false,
    };
    const sniff = {
      lms: "blackboard" as const,
      notes: [],
    };

    const result = mergeSniffedValues(current, sniff);
    expect(result.lms).toBe("blackboard");
  });

  it("preserves current lms when sniff has no lms and lmsChosen is false", () => {
    const current = {
      courseLabel: "",
      assignmentLabel: "",
      pointsPossible: "",
      rubricText: "",
      lms: "moodle" as const,
      lmsChosen: false,
    };
    const sniff = {
      notes: [],
    };

    const result = mergeSniffedValues(current, sniff);
    expect(result.lms).toBe("moodle");
  });

  it("keeps user-typed rubricText over sniff value", () => {
    const current = {
      courseLabel: "",
      assignmentLabel: "",
      pointsPossible: "",
      rubricText: "User's rubric",
      lms: "canvas" as const,
      lmsChosen: false,
    };
    const sniff = {
      rubricText: "Sniffed rubric",
      notes: [],
    };

    const result = mergeSniffedValues(current, sniff);
    expect(result.rubricText).toBe("User's rubric");
  });

  it("adopts sniff rubricText when current is empty", () => {
    const current = {
      courseLabel: "",
      assignmentLabel: "",
      pointsPossible: "",
      rubricText: "",
      lms: "canvas" as const,
      lmsChosen: false,
    };
    const sniff = {
      rubricText: "Sniffed rubric",
      notes: [],
    };

    const result = mergeSniffedValues(current, sniff);
    expect(result.rubricText).toBe("Sniffed rubric");
  });

  it("preserves current values when sniff is empty", () => {
    const current = {
      courseLabel: "My Course",
      assignmentLabel: "My Assignment",
      pointsPossible: "50",
      rubricText: "My rubric",
      lms: "canvas" as const,
      lmsChosen: false,
    };
    const sniff = {
      notes: [],
    };

    const result = mergeSniffedValues(current, sniff);
    expect(result.courseLabel).toBe("My Course");
    expect(result.assignmentLabel).toBe("My Assignment");
    expect(result.pointsPossible).toBe(50);
    expect(result.rubricText).toBe("My rubric");
  });
});
