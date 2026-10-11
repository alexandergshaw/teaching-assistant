// LIVE-LMS-STUDENT-MESSAGING W4: sendStudentConversation, the typed per-student
// sender (docs/live-lms-student-messaging-ops.md R5, pins P2, P4, P5, P6, P7, P8).
// Mocks canvasFetch at the module boundary, never fetch (tests are network-blocked).
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../supabase/effective-identity", () => ({
  getEffectiveIdentity: vi.fn().mockResolvedValue({
    id: "test-owner",
    email: "owner@example.edu",
    role: "owner",
    status: "active",
  }),
}));
vi.mock("../lms-credentials", () => ({
  getLmsCredentialSecret: vi.fn().mockResolvedValue(null),
  recordLmsCredentialFailure: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import {
  classifyConversationPostStatus,
  createConversation,
  createCourseConversation,
  sendStudentConversation,
  STUDENT_RECIPIENT_PATTERN,
} from "./inbox";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";

const mockCanvasFetch = vi.mocked(canvasFetch);
const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

function okResult(status: number): CanvasFetchResult {
  return { ok: true, status, headers: {}, body: Buffer.from("{}") };
}

function postedParams(callIndex = 0): URLSearchParams {
  const init = mockCanvasFetch.mock.calls[callIndex][1] as { body?: string };
  return new URLSearchParams(String(init.body));
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  mockCanvasFetch.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("classifyConversationPostStatus - P6 totality over 100..599", () => {
  it("returns exactly one class for every status; accepted is {200,201}; refused is the six", () => {
    const accepted: number[] = [];
    const refused: number[] = [];
    const unknown: number[] = [];
    for (let status = 100; status <= 599; status += 1) {
      const result = classifyConversationPostStatus(status);
      if (result.status === "accepted") accepted.push(status);
      else if (result.status === "refused") refused.push(status);
      else unknown.push(status);
    }
    expect(accepted).toEqual([200, 201]);
    expect(refused).toEqual([400, 401, 403, 404, 422, 429]);
    expect(accepted.length + refused.length + unknown.length).toBe(500);
    expect(unknown).toContain(202);
    expect(unknown).toContain(204);
    expect(unknown).toContain(503);
  });

  it("maps 429 to the retryable refused code and the others to enumerated codes", () => {
    expect(classifyConversationPostStatus(429)).toEqual({ status: "refused", code: "refused-rate-limited", httpStatus: 429 });
    expect(classifyConversationPostStatus(403)).toEqual({ status: "refused", code: "refused-http", httpStatus: 403 });
    expect(classifyConversationPostStatus(503)).toEqual({ status: "unknown", code: "unknown-http", httpStatus: 503 });
    expect(classifyConversationPostStatus(201)).toEqual({ status: "accepted", code: "ok", httpStatus: 201 });
  });
});

describe("sendStudentConversation - P7 differential against the broadcast builder", () => {
  it("the statuses where its class differs from createCourseConversation are exactly {429}", async () => {
    const differing: number[] = [];
    for (let status = 100; status <= 599; status += 1) {
      mockCanvasFetch.mockReset();
      mockCanvasFetch.mockResolvedValue(okResult(status));
      const student = await sendStudentConversation(COURSE_URL, "777", "Hello");
      mockCanvasFetch.mockReset();
      mockCanvasFetch.mockResolvedValue(okResult(status));
      const broadcast = await createCourseConversation(COURSE_URL, "Hello");
      if (student.status !== broadcast.status) differing.push(status);
    }
    expect(differing).toEqual([429]);
  });
});

describe("sendStudentConversation - P8 phase boundary", () => {
  it("a pre-send input failure is refused-pre-send with ZERO requests", async () => {
    expect((await sendStudentConversation(COURSE_URL, "777", "   ")).status).toBe("refused");
    expect((await sendStudentConversation("https://canvas.mccneb.edu/", "777", "Hi")).code).toBe("refused-pre-send");
    expect((await sendStudentConversation("https://elsewhere.example/courses/1", "777", "Hi")).status).toBe("refused");
    expect(mockCanvasFetch).not.toHaveBeenCalled();
  });

  it("a transport throw after the request is unknown, never refused", async () => {
    mockCanvasFetch.mockRejectedValue(new Error("socket hang up"));
    expect(await sendStudentConversation(COURSE_URL, "777", "Hi")).toEqual({
      status: "unknown",
      code: "unknown-no-response",
    });
    mockCanvasFetch.mockReset();
    mockCanvasFetch.mockResolvedValue({ ok: false, kind: "unreachable" });
    expect((await sendStudentConversation(COURSE_URL, "777", "Hi")).status).toBe("unknown");
  });

  it("never throws", async () => {
    mockCanvasFetch.mockRejectedValue(new Error("boom"));
    await expect(sendStudentConversation(COURSE_URL, "777", "Hi")).resolves.toBeDefined();
  });
});

describe("sendStudentConversation - P2 the broadcast hole is closed", () => {
  it.each(["course_5", "course_123", "1,2", "12abc", "", "99999999999999", " 5", "5 ", "-5", "5.5"])(
    "refuses recipient %j before any request leaves",
    async (recipient) => {
      mockCanvasFetch.mockResolvedValue(okResult(201));
      const result = await sendStudentConversation(COURSE_URL, recipient, "Hello");
      expect(result).toEqual({ status: "refused", code: "refused-pre-send" });
      expect(mockCanvasFetch).not.toHaveBeenCalled();
    }
  );

  it("accepts a bare numeric id and emits exactly that one recipient", async () => {
    mockCanvasFetch.mockResolvedValue(okResult(201));
    expect((await sendStudentConversation(COURSE_URL, "777", "Hello")).status).toBe("accepted");
    expect(postedParams().getAll("recipients[]")).toEqual(["777"]);
    expect(STUDENT_RECIPIENT_PATTERN.test("777")).toBe(true);
    expect(STUDENT_RECIPIENT_PATTERN.test("course_777")).toBe(false);
  });
});

describe("sendStudentConversation - P4/P5 request shape", () => {
  it("the POST body is string-equal to createConversation's for the same inputs", async () => {
    mockCanvasFetch.mockResolvedValue(okResult(201));
    await createConversation(COURSE_URL, "777", "Hello", "Subj");
    const legacy = mockCanvasFetch.mock.calls[0][1] as { body?: string; method?: string };
    mockCanvasFetch.mockReset();
    mockCanvasFetch.mockResolvedValue(okResult(201));
    await sendStudentConversation(COURSE_URL, "777", "Hello", "Subj");
    const typed = mockCanvasFetch.mock.calls[0][1] as { body?: string; method?: string };
    expect(typed.body).toBe(legacy.body);
    expect(typed.method).toBe(legacy.method);
  });

  it("the AST body appends exactly the five keys and never a course_ recipient", () => {
    const file = path.join(process.cwd(), "src", "lib", "canvas", "inbox.ts");
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    let fn: ts.FunctionDeclaration | undefined;
    source.forEachChild((node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === "sendStudentConversation") fn = node;
    });
    expect(fn).toBeDefined();
    const keys = new Set<string>();
    const recipientAppends: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "append" &&
        node.arguments.length >= 2 &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        keys.add(node.arguments[0].text);
        if (node.arguments[0].text === "recipients[]") recipientAppends.push(node.arguments[1].getText());
      }
      ts.forEachChild(node, visit);
    };
    visit(fn as unknown as ts.Node);
    expect([...keys].sort()).toEqual(["body", "context_code", "force_new", "recipients[]", "subject"]);
    expect(recipientAppends).toEqual(["recipientUserId"]);
  });
});
