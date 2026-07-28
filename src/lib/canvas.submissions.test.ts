import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchAssignment } from "./canvas/submissions";
import type { CanvasInstitution } from "./canvas-core";

global.fetch = vi.fn();
const mockFetch = fetch as ReturnType<typeof vi.fn>;

const INSTITUTION: CanvasInstitution = { code: "TEST", name: "Test School", host: "test.instructure.com" };
const BASE_URL = "https://test.instructure.com";
const TOKEN = "test-token";

const page = (submissions: unknown[]) =>
  new Response(JSON.stringify(submissions), { headers: { "content-type": "application/json" } });

beforeEach(() => {
  mockFetch.mockClear();
});

describe("fetchAssignment - URL-only submissions", () => {
  it("keeps a submission that has only a submitted URL (no body, no attachments)", async () => {
    mockFetch.mockResolvedValueOnce(
      page([
        {
          user_id: 1,
          workflow_state: "submitted",
          body: null,
          attachments: [],
          url: "https://github.com/student/hw1",
          submission_type: "online_url",
          user: { name: "Ada Lovelace" },
        },
      ])
    );

    const students = await fetchAssignment(BASE_URL, TOKEN, INSTITUTION, "1", "1");

    expect(students).toHaveLength(1);
    expect(students[0].student).toBe("Ada Lovelace");
    expect(students[0].text).toBe("");
    expect(students[0].files).toHaveLength(0);
    expect(students[0].submissionUrl).toBe("https://github.com/student/hw1");
  });

  it("still drops a submission with nothing at all (no text, no files, no url)", async () => {
    mockFetch.mockResolvedValueOnce(
      page([
        {
          user_id: 2,
          workflow_state: "submitted",
          body: null,
          attachments: [],
          url: null,
          user: { name: "Bo Nothing" },
        },
      ])
    );

    const students = await fetchAssignment(BASE_URL, TOKEN, INSTITUTION, "1", "1");

    expect(students).toHaveLength(0);
  });

  it("leaves an existing text submission unaffected (submissionUrl is null)", async () => {
    mockFetch.mockResolvedValueOnce(
      page([
        {
          user_id: 3,
          workflow_state: "submitted",
          body: "<p>My essay.</p>",
          attachments: [],
          url: null,
          user: { name: "Cy Text" },
        },
      ])
    );

    const students = await fetchAssignment(BASE_URL, TOKEN, INSTITUTION, "1", "1");

    expect(students).toHaveLength(1);
    expect(students[0].text).toBe("My essay.");
    expect(students[0].submissionUrl).toBeNull();
  });

  it("does not treat an on_paper submission's stray url as a real submission", async () => {
    mockFetch.mockResolvedValueOnce(
      page([
        {
          user_id: 4,
          workflow_state: "submitted",
          body: null,
          attachments: [],
          url: "https://example.com/irrelevant",
          submission_type: "on_paper",
          user: { name: "Di Paper" },
        },
      ])
    );

    const students = await fetchAssignment(BASE_URL, TOKEN, INSTITUTION, "1", "1");

    expect(students).toHaveLength(0);
  });
});
