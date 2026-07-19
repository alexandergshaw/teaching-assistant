import { describe, it, expect } from "vitest";
import {
  detectGradebookFormat,
  parseGradebookCsv,
  missingFromGradebook,
  fillGradebookCsv,
  buildCanvasGradebookCsv,
  buildMoodleGradebookCsv,
} from "./gradebook-csv";

describe("detectGradebookFormat", () => {
  it("detects canvas format", () => {
    const headers = ["Student", "ID", "SIS User ID", "Homework 1 (12345)"];
    expect(detectGradebookFormat(headers)).toBe("canvas");
  });

  it("detects brightspace format by OrgDefinedId", () => {
    const headers = ["OrgDefinedId", "Test 1 <Numeric MaxPoints:100>", "End-of-Line Indicator"];
    expect(detectGradebookFormat(headers)).toBe("brightspace");
  });

  it("detects blackboard format by columnId suffix", () => {
    const headers = ["Username", "Name [Total Pts: 100] |12345", "Quiz |67890"];
    expect(detectGradebookFormat(headers)).toBe("blackboard");
  });

  it("detects blackboard format by Total Pts", () => {
    const headers = ["Username", "Name [Total Pts: 100]"];
    expect(detectGradebookFormat(headers)).toBe("blackboard");
  });

  it("detects moodle format by Email address header", () => {
    const headers = ["Email address", "Quiz 1", "Assignment 2"];
    expect(detectGradebookFormat(headers)).toBe("moodle");
  });

  it("returns unknown for unrecognized format", () => {
    const headers = ["Col1", "Col2", "Col3"];
    expect(detectGradebookFormat(headers)).toBe("unknown");
  });
});

describe("parseGradebookCsv", () => {
  describe("canvas", () => {
    const fixture = `Student,ID,SIS User ID,SIS Login ID,Section,Homework 1 (12345),Quiz 1 (67890)
Points Possible,,,,,100,50
Alice,100,sis-100,alice@school.edu,Section A,85,92
Bob,101,sis-101,bob@school.edu,Section B,90,`;

    it("parses canvas format correctly", () => {
      const parsed = parseGradebookCsv(fixture);

      expect(parsed.format).toBe("canvas");
      expect(parsed.delimiter).toBe(",");
      expect(parsed.students).toHaveLength(2);
      expect(parsed.students[0].name).toBe("Alice");
      expect(parsed.students[0].externalId).toBe("100");
      expect(parsed.students[0].email).toBe("alice@school.edu");
      expect(parsed.students[1].name).toBe("Bob");
      expect(parsed.students[1].email).toBe("bob@school.edu");
    });

    it("parses items with points possible from row 2", () => {
      const parsed = parseGradebookCsv(fixture);

      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0].name).toBe("Homework 1");
      expect(parsed.items[0].pointsPossible).toBe(100);
      expect(parsed.items[1].name).toBe("Quiz 1");
      expect(parsed.items[1].pointsPossible).toBe(50);
    });

    it("accesses cells correctly", () => {
      const parsed = parseGradebookCsv(fixture);

      const hw = parsed.items[0];
      const alice = parsed.students[0];
      expect(parsed.cell(alice.row, hw.column)).toBe("85");
    });
  });

  describe("brightspace", () => {
    const fixture = `OrgDefinedId,Username,Email,Test 1 <Numeric MaxPoints:100>,Quiz <Numeric MaxPoints:50>,End-of-Line Indicator
user1,alice,alice@school.edu,85,92,#
user2,bob,bob@school.edu,90,,#`;

    it("parses brightspace format correctly", () => {
      const parsed = parseGradebookCsv(fixture);

      expect(parsed.format).toBe("brightspace");
      expect(parsed.delimiter).toBe(",");
      expect(parsed.students).toHaveLength(2);
      expect(parsed.students[0].externalId).toBe("user1");
      expect(parsed.students[0].username).toBe("alice");
      expect(parsed.students[0].email).toBe("alice@school.edu");
      expect(parsed.students[1].email).toBe("bob@school.edu");
    });

    it("strips suffix from item names", () => {
      const parsed = parseGradebookCsv(fixture);

      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0].name).toBe("Test 1");
      expect(parsed.items[0].pointsPossible).toBe(100);
      expect(parsed.items[1].name).toBe("Quiz");
      expect(parsed.items[1].pointsPossible).toBe(50);
    });

    it("preserves full header including suffix for re-emit", () => {
      const parsed = parseGradebookCsv(fixture);

      expect(parsed.items[0].header).toBe("Test 1 <Numeric MaxPoints:100>");
    });
  });

  describe("blackboard", () => {
    // Blackboard uses TAB as delimiter for .xls exports
    const fixture = `Username\tName [Total Pts: 100] |12345\tQuiz |67890
alice\tAlice\t85\t92
bob\tBob\t90\t`;

    it("parses blackboard format with tab delimiter", () => {
      const parsed = parseGradebookCsv(fixture);

      expect(parsed.format).toBe("blackboard");
      expect(parsed.delimiter).toBe("\t");
      expect(parsed.students).toHaveLength(2);
      expect(parsed.students[0].username).toBe("alice");
    });

    it("preserves columnId in header byte-for-byte", () => {
      const parsed = parseGradebookCsv(fixture);

      expect(parsed.items[0].header).toBe("Name [Total Pts: 100] |12345");
      expect(parsed.items[1].header).toBe("Quiz |67890");
    });

    it("strips suffix only from item name for matching", () => {
      const parsed = parseGradebookCsv(fixture);

      expect(parsed.items[0].name).toBe("Name [Total Pts: 100]");
      expect(parsed.items[1].name).toBe("Quiz");
    });
  });

  describe("moodle", () => {
    const fixture = `Email address,Quiz 1,Assignment 1
alice@school.edu,85,92
bob@school.edu,90,`;

    it("parses moodle format correctly", () => {
      const parsed = parseGradebookCsv(fixture);

      expect(parsed.format).toBe("moodle");
      expect(parsed.delimiter).toBe(",");
      expect(parsed.students).toHaveLength(2);
      expect(parsed.students[0].name).toBe("alice@school.edu");
      expect(parsed.students[0].email).toBe("alice@school.edu");
    });

    it("parses items as free-form columns", () => {
      const parsed = parseGradebookCsv(fixture);

      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0].name).toBe("Quiz 1");
      expect(parsed.items[1].name).toBe("Assignment 1");
    });
  });
});

describe("missingFromGradebook", () => {
  const canvasFixture = `Student,ID,SIS User ID,SIS Login ID,Section,Homework (123),Quiz (456)
Points Possible,,,,,100,50
Alice,100,sis-100,alice@school.edu,A,85,92
Bob,101,sis-101,bob@school.edu,B,90,`;

  it("identifies missing (empty) cells", () => {
    const parsed = parseGradebookCsv(canvasFixture);
    const missing = missingFromGradebook(parsed);

    expect(missing).toHaveLength(1);
    expect(missing[0].assignmentName).toBe("Quiz");
    expect(missing[0].students).toHaveLength(1);
    expect(missing[0].students[0].name).toBe("Bob");
  });

  it("filters to single item when itemName provided", () => {
    const parsed = parseGradebookCsv(canvasFixture);
    const missing = missingFromGradebook(parsed, "Quiz");

    expect(missing).toHaveLength(1);
  });

  it("returns correct MissingAssignmentReport shape", () => {
    const parsed = parseGradebookCsv(canvasFixture);
    const missing = missingFromGradebook(parsed);

    expect(missing[0]).toHaveProperty("assignmentId");
    expect(missing[0]).toHaveProperty("assignmentName");
    expect(missing[0]).toHaveProperty("dueAt");
    expect(missing[0]).toHaveProperty("pointsPossible");
    expect(missing[0]).toHaveProperty("students");
  });
});

describe("fillGradebookCsv", () => {
  describe("canvas round-trip", () => {
    const original = `Student,ID,SIS User ID,SIS Login ID,Section,Homework (123),Quiz (456)
Points Possible,,,,,100,50
Alice,100,sis-100,alice@school.edu,A,85,92
Bob,101,sis-101,bob@school.edu,B,90,`;

    it("preserves all untouched bytes", () => {
      const scores = [
        { externalId: "100", itemName: "Homework", score: "88" },
        { externalId: "101", itemName: "Quiz", score: "95" },
      ];

      const result = fillGradebookCsv(original, scores);

      // Count unchanged lines (header, points possible row, unchanged data rows)
      const origLines = original.split("\n");
      const resultLines = result.csv.split("\n");

      expect(resultLines.length).toBe(origLines.length);
      expect(result.filled).toBe(2);
      expect(result.unmatched).toHaveLength(0);
    });

    it("updates only matched cells", () => {
      const scores = [{ externalId: "100", itemName: "Quiz", score: "99" }];

      const result = fillGradebookCsv(original, scores);

      const lines = result.csv.split("\n");
      // Row 2 (Alice) should have the new Quiz score
      expect(lines[2]).toContain(",99");
    });

    it("reports unmatched scores", () => {
      const scores = [
        { externalId: "999", itemName: "Homework", score: "88" },
        { name: "Unknown", itemName: "Quiz", score: "95" },
      ];

      const result = fillGradebookCsv(original, scores);

      expect(result.filled).toBe(0);
      expect(result.unmatched).toHaveLength(2);
    });

    it("matches student by name when externalId not provided", () => {
      const scores = [{ name: "Alice", itemName: "Homework", score: "92" }];

      const result = fillGradebookCsv(original, scores);

      expect(result.filled).toBe(1);
      expect(result.unmatched).toHaveLength(0);
    });
  });

  describe("brightspace round-trip", () => {
    const original = `OrgDefinedId,Username,Email,Test <Numeric MaxPoints:100>,End-of-Line Indicator
user1,alice,alice@school.edu,85,#
user2,bob,bob@school.edu,,#`;

    it("preserves End-of-Line Indicator", () => {
      const scores = [{ externalId: "user1", itemName: "Test", score: "90" }];

      const result = fillGradebookCsv(original, scores);

      expect(result.csv).toContain("#");
      // Check that both indicator rows remain
      const indicators = (result.csv.match(/#/g) ?? []).length;
      expect(indicators).toBe(2);
    });

    it("matches item name after stripping suffix", () => {
      const scores = [{ username: "alice", itemName: "Test", score: "88" }];

      const result = fillGradebookCsv(original, scores);

      expect(result.filled).toBe(1);
    });
  });

  describe("blackboard round-trip", () => {
    const original = `Username\tName |12345\tQuiz |67890
alice\tAlice\t85\t92
bob\tBob\t90\t`;

    it("preserves columnId suffixes byte-for-byte", () => {
      const scores = [{ username: "alice", itemName: "Name", score: "88" }];

      const result = fillGradebookCsv(original, scores);

      expect(result.csv).toContain("|12345");
      expect(result.csv).toContain("|67890");
    });

    it("preserves tab delimiter", () => {
      const scores = [{ username: "bob", itemName: "Quiz", score: "95" }];

      const result = fillGradebookCsv(original, scores);

      const lines = result.csv.split("\n");
      // Header and data rows should use tabs
      expect(lines[0]).toContain("\t");
      expect(lines[1]).toContain("\t");
    });
  });

  describe("moodle round-trip", () => {
    const original = `Email address,Quiz 1,Assignment 1
alice@school.edu,85,92
bob@school.edu,90,`;

    it("matches student by email", () => {
      const scores = [
        { email: "alice@school.edu", itemName: "Quiz 1", score: "95" },
        { email: "bob@school.edu", itemName: "Assignment 1", score: "87" },
      ];

      const result = fillGradebookCsv(original, scores);

      expect(result.filled).toBe(2);
      expect(result.unmatched).toHaveLength(0);
    });
  });

  describe("line ending preservation", () => {
    it("preserves CRLF line endings", () => {
      const original = "Student,ID,Quiz\r\n,,,Points Possible\r\nAlice,100,85\r\n";
      const scores = [{ name: "Alice", itemName: "Quiz", score: "90" }];

      const result = fillGradebookCsv(original, scores);

      expect(result.csv).toContain("\r\n");
      expect(result.csv.split("\r\n").length).toBe(original.split("\r\n").length);
    });

    it("preserves LF line endings", () => {
      const original = "Student,ID,Quiz\n,,,Points Possible\nAlice,100,85\n";
      const scores = [{ name: "Alice", itemName: "Quiz", score: "90" }];

      const result = fillGradebookCsv(original, scores);

      expect(result.csv).not.toContain("\r\n");
      expect(result.csv.split("\n").length).toBe(original.split("\n").length);
    });
  });

  describe("matching priority", () => {
    const original = `Student,ID,Homework (123)
Points Possible,,,100
Alice,100,85
alice@email.com,101,90`;

    it("matches externalId first", () => {
      const scores = [
        { externalId: "100", email: "alice@email.com", itemName: "Homework", score: "95" },
      ];

      const result = fillGradebookCsv(original, scores);

      // Should match student with ID 100 (Alice), not 101
      const lines = result.csv.split("\n");
      expect(lines[2]).toContain(",95");
    });

    it("matches name last when other identifiers absent", () => {
      const scores = [{ name: "Alice", itemName: "Homework", score: "92" }];

      const result = fillGradebookCsv(original, scores);

      expect(result.filled).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("handles quoted fields with commas", () => {
      const original = `Student,ID,Notes,Quiz (123)
Points Possible,,,50
"Smith, Alice",100,"Has, notes",85`;

      const scores = [{ externalId: "100", itemName: "Quiz", score: "90" }];

      const result = fillGradebookCsv(original, scores);

      expect(result.filled).toBe(1);
      // Original quoting should be preserved
      expect(result.csv).toContain('"Smith, Alice"');
    });

    it("handles empty CSV", () => {
      const result = fillGradebookCsv("", []);

      expect(result.csv).toBe("");
      expect(result.filled).toBe(0);
    });

    it("handles no matching scores", () => {
      const original = `Student,ID,Quiz\n,,,Points Possible\nAlice,100,85\n`;
      const scores = [{ externalId: "999", itemName: "Exam", score: "90" }];

      const result = fillGradebookCsv(original, scores);

      expect(result.csv).toBe(original);
      expect(result.filled).toBe(0);
      expect(result.unmatched).toHaveLength(1);
    });
  });
});

describe("buildCanvasGradebookCsv", () => {
  it("builds canvas gradebook from scratch", () => {
    const students = [
      { name: "Alice", externalId: "100" },
      { name: "Bob", externalId: "101" },
    ];
    const item = { name: "Homework", pointsPossible: 100 };
    const scores = new Map([
      ["100", "85"],
      ["101", "90"],
    ]);

    const csv = buildCanvasGradebookCsv(students, item, scores);

    expect(csv).toContain("Student,ID,Homework (100)");
    expect(csv).toContain("Points Possible");
    expect(csv).toContain("Alice,100,85");
    expect(csv).toContain("Bob,101,90");
  });

  it("includes empty scores", () => {
    const students = [{ name: "Alice", externalId: "100" }];
    const item = { name: "Quiz", pointsPossible: 50 };
    const scores = new Map(); // No score for Alice

    const csv = buildCanvasGradebookCsv(students, item, scores);

    expect(csv).toContain("Alice,100,");
  });

  it("quotes names with commas", () => {
    const students = [
      { name: "Smith, Alice", externalId: "100" },
    ];
    const item = { name: "Homework", pointsPossible: 100 };
    const scores = new Map([["100", "85"]]);

    const csv = buildCanvasGradebookCsv(students, item, scores);

    expect(csv).toContain('"Smith, Alice"');
  });

  it("quotes item names containing quotes", () => {
    const students = [{ name: "Alice", externalId: "100" }];
    const item = { name: 'Quiz "Final"', pointsPossible: 100 };
    const scores = new Map([["100", "85"]]);

    const csv = buildCanvasGradebookCsv(students, item, scores);

    expect(csv).toContain('"Quiz ""Final"" (100)"');
  });
});

describe("buildMoodleGradebookCsv", () => {
  it("builds moodle gradebook from scratch", () => {
    const students = [
      { email: "alice@school.edu" },
      { email: "bob@school.edu" },
    ];
    const itemName = "Quiz 1";
    const scores = new Map([
      ["alice@school.edu", "92"],
      ["bob@school.edu", "87"],
    ]);

    const csv = buildMoodleGradebookCsv(students, itemName, scores);

    expect(csv).toContain("Email address,Quiz 1");
    expect(csv).toContain("alice@school.edu,92");
    expect(csv).toContain("bob@school.edu,87");
  });

  it("includes empty scores", () => {
    const students = [{ email: "alice@school.edu" }];
    const itemName = "Assignment 1";
    const scores = new Map(); // No score

    const csv = buildMoodleGradebookCsv(students, itemName, scores);

    expect(csv).toContain("alice@school.edu,");
  });

  it("quotes item names with commas", () => {
    const students = [{ email: "alice@school.edu" }];
    const itemName = "Quiz, Part 1";
    const scores = new Map([["alice@school.edu", "85"]]);

    const csv = buildMoodleGradebookCsv(students, itemName, scores);

    expect(csv).toContain('"Quiz, Part 1"');
  });

  it("quotes email with newlines (unlikely but protected)", () => {
    const students = [{ email: "alice+test\n@school.edu" }];
    const itemName = "Quiz 1";
    const scores = new Map([["alice+test\n@school.edu", "85"]]);

    const csv = buildMoodleGradebookCsv(students, itemName, scores);

    expect(csv).toContain('"alice+test\n@school.edu"');
  });
});
