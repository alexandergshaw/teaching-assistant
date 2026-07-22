import { describe, it, expect } from "vitest";
import { validateFileUpload } from "@/lib/syllabus-upload-validation";

describe("validateFileUpload", () => {
  describe("file extension validation", () => {
    it("accepts .docx files with correct MIME type", () => {
      const result = validateFileUpload(
        "syllabus.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        1000
      );
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.extension).toBe(".docx");
      }
    });

    it("accepts .pdf files with correct MIME type", () => {
      const result = validateFileUpload("syllabus.pdf", "application/pdf", 1000);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.extension).toBe(".pdf");
      }
    });

    it("accepts .txt files with text/plain MIME type", () => {
      const result = validateFileUpload("syllabus.txt", "text/plain", 1000);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.extension).toBe(".txt");
      }
    });

    it("accepts .md files with text/markdown MIME type", () => {
      const result = validateFileUpload(
        "syllabus.md",
        "text/markdown",
        1000
      );
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.extension).toBe(".md");
      }
    });

    it("accepts .md files with text/plain MIME type (common fallback)", () => {
      const result = validateFileUpload("syllabus.md", "text/plain", 1000);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.extension).toBe(".md");
      }
    });

    it("rejects .docx with MIME type mismatch but still validates (extension is primary gate)", () => {
      const result = validateFileUpload("syllabus.docx", "text/plain", 1000);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.extension).toBe(".docx");
      }
    });

    it("rejects unsupported file types like .xls", () => {
      const result = validateFileUpload("schedule.xls", "application/vnd.ms-excel", 1000);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("not supported");
      }
    });

    it("rejects unsupported file types like .pptx", () => {
      const result = validateFileUpload(
        "presentation.pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        1000
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("not supported");
      }
    });

    it("rejects unsupported file types like .zip", () => {
      const result = validateFileUpload(
        "archive.zip",
        "application/zip",
        1000
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("not supported");
      }
    });

    it("is case-insensitive for extensions", () => {
      const result = validateFileUpload(
        "SYLLABUS.DOCX",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        1000
      );
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.extension).toBe(".docx");
      }
    });

    it("is case-insensitive for mixed-case extensions", () => {
      const result = validateFileUpload("Syllabus.Pdf", "application/pdf", 1000);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.extension).toBe(".pdf");
      }
    });

    it("handles files without extensions", () => {
      const result = validateFileUpload("syllabus", "text/plain", 1000);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("not supported");
      }
    });
  });

  describe("file size validation", () => {
    it("accepts files at or below 6 MB", () => {
      const sixMbInBytes = 6 * 1024 * 1024;
      const result = validateFileUpload("syllabus.pdf", "application/pdf", sixMbInBytes);
      expect(result.valid).toBe(true);
    });

    it("accepts files smaller than 6 MB", () => {
      const result = validateFileUpload("syllabus.pdf", "application/pdf", 1024 * 1024); // 1 MB
      expect(result.valid).toBe(true);
    });

    it("rejects files exceeding 6 MB", () => {
      const sixMbPlusOne = 6 * 1024 * 1024 + 1;
      const result = validateFileUpload("large.pdf", "application/pdf", sixMbPlusOne);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("too large");
        expect(result.error).toContain("6 MB");
      }
    });

    it("rejects files significantly larger than 6 MB", () => {
      const tenMbInBytes = 10 * 1024 * 1024;
      const result = validateFileUpload("verylarge.pdf", "application/pdf", tenMbInBytes);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("too large");
      }
    });

    it("accepts empty files (size = 0)", () => {
      const result = validateFileUpload("empty.txt", "text/plain", 0);
      expect(result.valid).toBe(true);
    });
  });

  describe("combined validation", () => {
    it("rejects invalid extension even if size is acceptable", () => {
      const result = validateFileUpload("schedule.xls", "application/vnd.ms-excel", 1000);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("not supported");
      }
    });

    it("rejects oversized file even if extension is valid", () => {
      const sixMbPlusOne = 6 * 1024 * 1024 + 1;
      const result = validateFileUpload("large.pdf", "application/pdf", sixMbPlusOne);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("too large");
      }
    });

    it("checks size before extension in error reporting (size error takes precedence)", () => {
      const sixMbPlusOne = 6 * 1024 * 1024 + 1;
      const result = validateFileUpload("invalid.xls", "application/vnd.ms-excel", sixMbPlusOne);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("too large");
      }
    });
  });
});
