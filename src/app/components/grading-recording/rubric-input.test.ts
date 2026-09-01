import { describe, it, expect } from "vitest";
import {
  isRubricTextUsable,
  canSubmitRubric,
  isExtractionSuspiciouslyShort,
  SUSPICIOUS_EXTRACTION_MAX_CHARS,
  describeExtractionErrorMessage,
  describeSuspiciousExtractionMessage,
  describeExtractionSuccessMessage,
  deriveUploadOutcomeNotice,
  describeRubricSourceLabel,
  describeStorageUploadFailureMessage,
  NOT_SIGNED_IN_MESSAGE,
} from "./rubric-input";

describe("isRubricTextUsable - which paste states are valid (R2a: paste works with no upload at all)", () => {
  it("rejects empty and whitespace-only text", () => {
    expect(isRubricTextUsable("")).toBe(false);
    expect(isRubricTextUsable("   ")).toBe(false);
    expect(isRubricTextUsable("\n\t  \n")).toBe(false);
  });

  it("accepts any non-blank text, untrimmed length included", () => {
    expect(isRubricTextUsable("a")).toBe(true);
    expect(isRubricTextUsable("  Grade on clarity (50%)  ")).toBe(true);
  });
});

describe("canSubmitRubric - the modal's submit-button gate", () => {
  it("refuses blank text regardless of upload state", () => {
    expect(canSubmitRubric("", false)).toBe(false);
    expect(canSubmitRubric("   ", false)).toBe(false);
  });

  it("refuses usable text while an upload is still in flight", () => {
    expect(canSubmitRubric("Grade on clarity.", true)).toBe(false);
  });

  it("allows usable text once the upload is not busy", () => {
    expect(canSubmitRubric("Grade on clarity.", false)).toBe(true);
  });
});

describe("isExtractionSuspiciouslyShort - the near-empty extraction R1a/R2b calls out (empty already refused upstream, this catches NEAR-empty)", () => {
  it("pins the threshold constant", () => {
    expect(SUSPICIOUS_EXTRACTION_MAX_CHARS).toBe(25);
  });

  it("is false for an actually-empty string - that case is a hard refusal upstream, not a warning here", () => {
    expect(isExtractionSuspiciouslyShort("")).toBe(false);
    expect(isExtractionSuspiciouslyShort("   ")).toBe(false);
  });

  it("is true at exactly the threshold (boundary is inclusive)", () => {
    const exactlyTwentyFive = "a".repeat(25);
    expect(exactlyTwentyFive.length).toBe(25);
    expect(isExtractionSuspiciouslyShort(exactlyTwentyFive)).toBe(true);
  });

  it("is false one character past the threshold", () => {
    const twentySix = "a".repeat(26);
    expect(isExtractionSuspiciouslyShort(twentySix)).toBe(false);
  });

  it("counts TRIMMED length, so padding whitespace cannot push real short text over the line", () => {
    const paddedShort = `   ${"a".repeat(10)}   `;
    expect(isExtractionSuspiciouslyShort(paddedShort)).toBe(true);
  });

  it("a real rubric's length is comfortably clear of the threshold", () => {
    const realistic =
      "Clarity (25%): the writeup explains the approach in plain language.\nCorrectness (50%): the solution meets every stated requirement.\nStyle (25%): code is organized and readable.";
    expect(isExtractionSuspiciouslyShort(realistic)).toBe(false);
  });
});

describe("describeExtractionErrorMessage - the message for the R2b empty-extraction failure (frozen literal)", () => {
  it("enriches the exact 'No text found' error, PDF case names OCR and scanning explicitly", () => {
    const msg = describeExtractionErrorMessage(
      "scanned-rubric.pdf",
      "pdf",
      "No text found in that file. Upload a file with readable content."
    );
    expect(msg).toBe(
      '"scanned-rubric.pdf" extracted to no readable text. If this is a scanned PDF (a photo or image of a page rather than real text), this app has no OCR and cannot read it that way - paste the rubric text directly instead.'
    );
  });

  it("matches the empty-text error case-insensitively (extractSyllabusTextAction's own wording is a fixed constant, but this must not be fragile to case)", () => {
    const msg = describeExtractionErrorMessage("rubric.docx", "docx", "NO TEXT FOUND in that file.");
    expect(msg.startsWith('"rubric.docx" extracted to no readable text.')).toBe(true);
  });

  it("gives the non-PDF empty case a different, still-actionable note with no OCR/scanning claim", () => {
    const msg = describeExtractionErrorMessage(
      "blank.docx",
      "docx",
      "No text found in that file. Upload a file with readable content."
    );
    expect(msg).toBe(
      '"blank.docx" extracted to no readable text. Paste the rubric text directly instead, or try a different file.'
    );
    expect(msg).not.toMatch(/scan|OCR/i);
  });

  it("passes every OTHER error through completely unchanged - no OCR note bolted onto an unrelated failure", () => {
    expect(describeExtractionErrorMessage("x.pdf", "pdf", "Could not download the uploaded syllabus file.")).toBe(
      "Could not download the uploaded syllabus file."
    );
    expect(describeExtractionErrorMessage("x.pdf", "pdf", "File is too large. Maximum size is 25 MB.")).toBe(
      "File is too large. Maximum size is 25 MB."
    );
  });
});

describe("describeSuspiciousExtractionMessage - the near-empty-but-not-blank warning (frozen literal)", () => {
  it("PDF case names scanning and OCR", () => {
    const msg = describeSuspiciousExtractionMessage("scanned.pdf", "pdf");
    expect(msg).toBe(
      'Only a few characters came back from "scanned.pdf". This usually means the PDF is a scanned image rather than real text - this app has no OCR, so a scanned page cannot be read reliably this way. Review the extracted text below, or paste the rubric text directly instead.'
    );
  });

  it("non-PDF case makes no scanning/OCR claim", () => {
    const msg = describeSuspiciousExtractionMessage("odd.docx", "docx");
    expect(msg).toBe(
      'Only a few characters came back from "odd.docx". The file may be blank, image-only, or in a format this app could not read correctly. Review the extracted text below, or paste the rubric text directly instead.'
    );
    expect(msg).not.toMatch(/scan|OCR/i);
  });
});

describe("describeExtractionSuccessMessage - the neutral confirmation (R2c: shown for review before use)", () => {
  it("pins singular/plural character wording", () => {
    expect(describeExtractionSuccessMessage("rubric.pdf", 1)).toBe(
      'Extracted 1 character from "rubric.pdf". Review the text below before continuing.'
    );
    expect(describeExtractionSuccessMessage("rubric.pdf", 312)).toBe(
      'Extracted 312 characters from "rubric.pdf". Review the text below before continuing.'
    );
  });
});

describe("deriveUploadOutcomeNotice - the one decision RubricInputModal.tsx renders from", () => {
  it("an error result always yields kind 'error', enriched the same way describeExtractionErrorMessage does", () => {
    const notice = deriveUploadOutcomeNotice("scanned.pdf", "pdf", {
      error: "No text found in that file. Upload a file with readable content.",
    });
    expect(notice.kind).toBe("error");
    expect(notice.text).toBe(describeExtractionErrorMessage("scanned.pdf", "pdf", "No text found in that file. Upload a file with readable content."));
  });

  it("a successful but suspiciously-short result yields kind 'warning', never 'success' - R1a's 'illegible must not look like success'", () => {
    const notice = deriveUploadOutcomeNotice("scanned.pdf", "pdf", { text: "  1  " });
    expect(notice.kind).toBe("warning");
    expect(notice.text).toBe(describeSuspiciousExtractionMessage("scanned.pdf", "pdf"));
  });

  it("a normal successful result yields kind 'success' with the trimmed character count", () => {
    const text = "Clarity (25%): explains the approach clearly.";
    const notice = deriveUploadOutcomeNotice("rubric.docx", "docx", { text });
    expect(notice.kind).toBe("success");
    expect(notice.text).toBe(describeExtractionSuccessMessage("rubric.docx", text.trim().length));
  });

  it("the success/warning boundary matches isExtractionSuspiciouslyShort exactly, at the pinned threshold", () => {
    const atThreshold = deriveUploadOutcomeNotice("f.pdf", "pdf", { text: "a".repeat(SUSPICIOUS_EXTRACTION_MAX_CHARS) });
    const pastThreshold = deriveUploadOutcomeNotice("f.pdf", "pdf", { text: "a".repeat(SUSPICIOUS_EXTRACTION_MAX_CHARS + 1) });
    expect(atThreshold.kind).toBe("warning");
    expect(pastThreshold.kind).toBe("success");
  });
});

describe("describeRubricSourceLabel - which path produced the reviewed text (R2b)", () => {
  it("pastes are always labelled the same way, regardless of any stale filename", () => {
    expect(describeRubricSourceLabel("paste", null)).toBe("Source: pasted text");
    expect(describeRubricSourceLabel("paste", "rubric.pdf")).toBe("Source: pasted text");
  });

  it("an upload names the file when known", () => {
    expect(describeRubricSourceLabel("upload", "rubric.pdf")).toBe('Source: extracted from "rubric.pdf"');
  });

  it("an upload with no known filename still says the text was extracted, not pasted", () => {
    expect(describeRubricSourceLabel("upload", null)).toBe("Source: extracted from an uploaded file");
  });
});

describe("fixed-copy messages (frozen literals)", () => {
  it("describeStorageUploadFailureMessage", () => {
    expect(describeStorageUploadFailureMessage("rubric.pdf")).toBe('Could not upload "rubric.pdf" - try again.');
  });

  it("NOT_SIGNED_IN_MESSAGE", () => {
    expect(NOT_SIGNED_IN_MESSAGE).toBe("You must be signed in to upload a rubric file.");
  });
});
