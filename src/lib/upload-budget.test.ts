// Guards the unit confusion that caused every wrong upload cap in this repo:
// comparing a file's size ON DISK against a limit that applies to its size ON
// THE WIRE. base64 inflates by 4/3, so a cap of "file.size > 4.5MB" permits a
// ~6MB request and does not protect the request it guards.
//
// These tests are arithmetic, not description: each one states a size a user
// could actually pick and asserts whether it is refused. Several are written
// as the specific defect they catch rather than as a property, so a future
// change that "simplifies" the conversion away fails with a readable reason.
import { describe, it, expect } from "vitest";
import {
  BASE64_INFLATION,
  UPLOAD_WIRE_BUDGET_BYTES,
  VERCEL_BODY_LIMIT_BYTES,
  checkFileWireBudget,
  checkWireBudget,
  formatMB,
  maxFileBytesForWireBudget,
  sumBase64WireBytes,
  wireBytesForFile,
} from "./upload-budget";

const MB = 1024 * 1024;

describe("the platform facts this module encodes", () => {
  it("budgets BELOW Vercel's body cap, leaving headroom for the rest of the JSON body", () => {
    // If these ever become equal, a request carrying a just-under-budget file
    // plus any other field would fail at the platform with no useful message.
    expect(UPLOAD_WIRE_BUDGET_BYTES).toBeLessThan(VERCEL_BODY_LIMIT_BYTES);
  });

  it("inflation is 4/3, the actual base64 ratio", () => {
    expect(BASE64_INFLATION).toBeCloseTo(4 / 3, 10);
  });
});

describe("wireBytesForFile - the conversion that was missing everywhere", () => {
  it("a 3MB file occupies 4MB on the wire", () => {
    expect(wireBytesForFile(3 * MB)).toBe(Math.ceil(4 * MB));
  });

  it("THE BUG: a 4.5MB file does NOT fit a 4.5MB body cap, because it rides at 6MB", () => {
    // This is the Course Engine defect exactly: a cap written against the raw
    // file at the platform's own number permits a request half again too big.
    const fileBytes = 4.5 * MB;
    expect(wireBytesForFile(fileBytes)).toBeGreaterThan(VERCEL_BODY_LIMIT_BYTES);
    expect(wireBytesForFile(fileBytes)).toBe(Math.ceil(6 * MB));
  });

  it("round-trips with maxFileBytesForWireBudget to within a byte", () => {
    const maxFile = maxFileBytesForWireBudget(UPLOAD_WIRE_BUDGET_BYTES);
    expect(wireBytesForFile(maxFile)).toBeLessThanOrEqual(UPLOAD_WIRE_BUDGET_BYTES);
    // And one byte more must not fit, so the boundary is not slack.
    expect(wireBytesForFile(maxFile + 1)).toBeGreaterThan(UPLOAD_WIRE_BUDGET_BYTES);
  });
});

describe("checkFileWireBudget - refuses in the unit the platform cares about", () => {
  it("accepts a file comfortably under the budget", () => {
    expect(checkFileWireBudget(1 * MB, "This file").ok).toBe(true);
  });

  it("refuses a file whose ENCODED size crosses the budget even though its disk size does not", () => {
    // 3MB on disk is under the 3.5MB wire budget as a number, and a naive
    // check would accept it. Encoded it is 4MB, which is over.
    const fileBytes = 3 * MB;
    expect(fileBytes).toBeLessThan(UPLOAD_WIRE_BUDGET_BYTES);
    const result = checkFileWireBudget(fileBytes, "This PowerPoint");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("This PowerPoint");
  });

  it("names the thing being refused, so the message is usable where it is shown", () => {
    const result = checkFileWireBudget(50 * MB, "That syllabus");
    expect(result.error?.startsWith("That syllabus")).toBe(true);
  });

  it("quotes the limit in FILE bytes, the number a user can check against their own file", () => {
    // Quoting the wire limit (3.5MB) would tell the user to shrink a file
    // below a number that is not the one their file manager shows.
    const result = checkFileWireBudget(50 * MB, "This file");
    expect(result.error).toContain(formatMB(maxFileBytesForWireBudget()));
    expect(result.error).not.toContain(formatMB(UPLOAD_WIRE_BUDGET_BYTES));
  });

  it("honours an explicitly tighter budget", () => {
    expect(checkFileWireBudget(1 * MB, "x", 512 * 1024).ok).toBe(false);
  });
});

describe("checkWireBudget - for payloads already encoded", () => {
  it("takes base64 length directly, since that string IS the body", () => {
    const b64 = "a".repeat(1000);
    expect(checkWireBudget(b64.length, "This file", 999).ok).toBe(false);
    expect(checkWireBudget(b64.length, "This file", 1000).ok).toBe(true);
  });

  it("is inclusive at the boundary - exactly the budget is allowed", () => {
    expect(checkWireBudget(UPLOAD_WIRE_BUDGET_BYTES, "x").ok).toBe(true);
    expect(checkWireBudget(UPLOAD_WIRE_BUDGET_BYTES + 1, "x").ok).toBe(false);
  });
});

describe("sumBase64WireBytes - several files in one request share one budget", () => {
  it("sums the encoded lengths", () => {
    expect(sumBase64WireBytes(["aaaa", "bb", ""])).toBe(6);
  });

  it("an empty list costs nothing", () => {
    expect(sumBase64WireBytes([])).toBe(0);
  });

  it("catches the multi-file case a per-file check misses", () => {
    // Four files each individually fine, together over budget. Any cap applied
    // per-file rather than per-request lets this through.
    const each = "x".repeat(Math.ceil(UPLOAD_WIRE_BUDGET_BYTES / 3));
    const total = sumBase64WireBytes([each, each, each, each]);
    expect(checkWireBudget(Math.ceil(UPLOAD_WIRE_BUDGET_BYTES / 3), "one").ok).toBe(true);
    expect(checkWireBudget(total, "these files").ok).toBe(false);
  });
});

describe("formatMB", () => {
  it("renders one decimal place with a unit", () => {
    expect(formatMB(3.5 * MB)).toBe("3.5MB");
    expect(formatMB(0)).toBe("0.0MB");
  });
});
