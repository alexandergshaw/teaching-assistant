import { beforeEach, expect, it, vi } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { readRepoGradeStartupCourses } from "./startup-courses";

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));

const ownerId = "owner";
const unavailable = { status: "unknown", reason: "storage-unavailable" };
const from = vi.fn();
const query = {
  select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), abortSignal: vi.fn(), retry: vi.fn(),
};

function row(number: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `18d742a1-46a5-4b3f-af5d-${number.toString().padStart(12, "0")}`,
    user_id: ownerId,
    name: "Class name",
    github_org: "school",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createServiceClient).mockReturnValue({ from } as never);
  from.mockReturnValue(query);
  for (const method of ["select", "eq", "order", "limit", "abortSignal"] as const) {
    query[method].mockReturnValue(query);
  }
});

it("reads one bounded, ordered owner snapshot and projects only startup fields", async () => {
  const data = [
    row(1, { roster: "private", student_repos: "private" }),
    row(2, { name: null, github_org: null }),
    row(3, { name: "", github_org: "  " }),
  ];
  query.retry.mockResolvedValue({ data, count: data.length, error: null });
  await expect(readRepoGradeStartupCourses(ownerId)).resolves.toEqual({
    status: "complete",
    courses: [
      { accountId: ownerId, courseId: data[0].id, displayName: "Class name", organization: "school" },
      { accountId: ownerId, courseId: data[1].id, organization: null },
      { accountId: ownerId, courseId: data[2].id, displayName: "", organization: "  " },
    ],
  });
  expect(createServiceClient).toHaveBeenCalledTimes(1);
  expect(from).toHaveBeenCalledExactlyOnceWith("course_hub");
  expect(query.select).toHaveBeenCalledExactlyOnceWith("id, user_id, name, github_org", { count: "exact" });
  expect(query.eq).toHaveBeenCalledExactlyOnceWith("user_id", ownerId);
  expect(query.order).toHaveBeenCalledExactlyOnceWith("id", { ascending: true });
  expect(query.limit).toHaveBeenCalledExactlyOnceWith(1_000);
  expect(query.retry).toHaveBeenCalledExactlyOnceWith(false);
});

it("returns an empty inventory only when exact coverage is proven", async () => {
  query.retry.mockResolvedValueOnce({ data: [], count: 0, error: null })
    .mockResolvedValueOnce({ data: [], count: 0, error: { message: "private provider error" } })
    .mockRejectedValueOnce(new Error("private transport failure"));
  await expect(readRepoGradeStartupCourses(ownerId)).resolves.toEqual({ status: "complete", courses: [] });
  await expect(readRepoGradeStartupCourses(ownerId)).resolves.toEqual(unavailable);
  await expect(readRepoGradeStartupCourses(ownerId)).resolves.toEqual(unavailable);
});

it.each([
  { label: "missing count", data: [], count: null },
  { label: "missing body", data: null, count: 0 },
  { label: "nonarray body", data: {}, count: 0 },
  { label: "count above the body size", data: [row(1)], count: 2 },
  { label: "count below the body size", data: [row(1)], count: 0 },
  { label: "foreign owner", data: [row(1), row(2, { user_id: "another-owner" })], count: 2 },
  { label: "duplicate ID", data: [row(1), row(1)], count: 2 },
  { label: "case-variant duplicate ID", data: [row(1), row(2, { id: row(1).id.toUpperCase() })], count: 2 },
  { label: "null row", data: [row(1), null], count: 2 },
  { label: "invalid ID", data: [row(1, { id: "not-a-uuid" })], count: 1 },
  { label: "invalid name", data: [row(1, { name: 42 })], count: 1 },
  { label: "missing organization", data: [row(1, { github_org: undefined })], count: 1 },
])("withholds the entire inventory for $label", async ({ data, count }) => {
  query.retry.mockResolvedValue({ data, count, error: null });
  await expect(readRepoGradeStartupCourses(ownerId)).resolves.toEqual(unavailable);
});

it("accepts exact coverage at the cap and withholds truncated or oversized results", async () => {
  const data = Array.from({ length: 1_000 }, (_, index) => row(index));
  query.retry.mockResolvedValueOnce({ data, count: 1_000, error: null })
    .mockResolvedValueOnce({ data, count: 1_001, error: null })
    .mockResolvedValueOnce({ data: [...data, row(1_000)], count: 1_001, error: null });
  const complete = await readRepoGradeStartupCourses(ownerId);
  expect(complete.status).toBe("complete");
  if (complete.status === "complete") expect(complete.courses).toHaveLength(1_000);
  await expect(readRepoGradeStartupCourses(ownerId)).resolves.toEqual(unavailable);
  await expect(readRepoGradeStartupCourses(ownerId)).resolves.toEqual(unavailable);
});

it("passes a ten-second abort signal and reports an aborted query as unknown without retrying", async () => {
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(controller.signal);
  try {
    query.retry.mockImplementationOnce(() => new Promise((_, reject) => {
      const [[signal]] = query.abortSignal.mock.calls as [[AbortSignal]];
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const pending = readRepoGradeStartupCourses(ownerId);
    expect(timeout).toHaveBeenCalledExactlyOnceWith(10_000);
    expect(query.abortSignal).toHaveBeenCalledExactlyOnceWith(controller.signal);
    controller.abort(new DOMException("private timeout", "TimeoutError"));
    await expect(pending).resolves.toEqual(unavailable);
    expect(query.retry).toHaveBeenCalledExactlyOnceWith(false);
    expect(from).toHaveBeenCalledTimes(1);
  } finally {
    timeout.mockRestore();
  }
});
