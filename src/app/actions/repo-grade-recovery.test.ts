import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { requireAppOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { readRepoGradeReservationsAction, recoverUnstartedRepoGradeReservationsAction } from "./repo-grade-recovery";

vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));

const accountId = "owner";
const from = vi.fn();
const rpc = vi.fn();
const writeResponse = vi.fn();

function query() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    retry: vi.fn(),
  };
}

let reservations: ReturnType<typeof query>;
let attempts: ReturnType<typeof query>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-06T13:30:00Z"));
  reservations = query();
  attempts = query();
  from.mockImplementation((table) => table === "repo_grade_reservations" ? reservations : attempts);
  rpc.mockReturnValue({ retry: writeResponse });
  vi.mocked(createServiceClient).mockReturnValue({ from, rpc } as never);
  vi.mocked(requireAppOwner).mockResolvedValue({ id: accountId, email: "owner@example.test" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function held(...generations: number[]) {
  reservations.retry.mockResolvedValue({
    data: generations.map((generation) => ({ generation, user_id: accountId })),
    count: generations.length,
    error: null,
  });
}

function attempt(generation: number, dispatch_state: "prepared" | "started" | null, claimed_at: string, status = "unknown") {
  return { generation, user_id: accountId, repo: "school/repo", folder: "lab", status, claimed_at, dispatch_state };
}

it("checks owner access and the current account before reading or releasing reservations", async () => {
  await expect(readRepoGradeReservationsAction("other-account")).resolves.toEqual({ status: "unavailable" });
  await expect(recoverUnstartedRepoGradeReservationsAction("other-account")).resolves.toEqual({ status: "unavailable" });
  vi.mocked(requireAppOwner).mockRejectedValue(new Error("Owner required"));
  await expect(readRepoGradeReservationsAction(accountId)).rejects.toThrow("Owner required");
  await expect(recoverUnstartedRepoGradeReservationsAction(accountId)).rejects.toThrow("Owner required");
  expect(createServiceClient).not.toHaveBeenCalled();
});

it("displays an account-scoped reservation snapshot with expired, ambiguous and missing attempts separated", async () => {
  held(1, 2, 3, 4, 5, 6);
  const expired = "2026-11-06T13:15:00Z";
  const fresh = "2026-11-06T13:15:01Z";
  const rows = [
    attempt(1, "prepared", expired), attempt(2, "started", expired), attempt(3, null, expired, "claimed"),
    attempt(4, "prepared", fresh), attempt(5, "started", fresh, "claimed"),
  ];
  attempts.retry.mockResolvedValue({ data: rows, count: rows.length, error: null });
  const result = await readRepoGradeReservationsAction(accountId);
  expect(result).toMatchObject({
    status: "loaded", reservations: [
      { generation: 1, repo: "school/repo", folder: "lab", state: "expired-unstarted" },
      { generation: 2, state: "evidence-required" }, { generation: 3, state: "evidence-required" },
      { generation: 4, state: "waiting-for-expiry" }, { generation: 5, state: "active" },
      { generation: 6, repo: null, folder: null, state: "attempt-unavailable" },
    ],
  });
  expect(reservations.eq).toHaveBeenCalledExactlyOnceWith("user_id", accountId);
  expect(attempts.eq).toHaveBeenCalledExactlyOnceWith("user_id", accountId);
  expect(attempts.in).toHaveBeenCalledExactlyOnceWith("generation", [1, 2, 3, 4, 5, 6]);
  expect(rpc).not.toHaveBeenCalled();
});

it("refuses a truncated snapshot or rows from a different account", async () => {
  reservations.retry.mockResolvedValueOnce({ data: [], count: 1, error: null });
  await expect(readRepoGradeReservationsAction(accountId)).resolves.toEqual({ status: "unavailable" });
  expect(attempts.select).not.toHaveBeenCalled();
  held(1);
  attempts.retry.mockResolvedValue({ data: [{ ...attempt(1, "prepared", "2026-11-06T13:00:00Z"), user_id: "other" }],
    count: 1, error: null });
  await expect(readRepoGradeReservationsAction(accountId)).resolves.toEqual({ status: "unavailable" });
});

it("invokes only the locked expiry RPC and refreshes the observed reservations after acknowledgement", async () => {
  writeResponse.mockResolvedValue({ error: null });
  held();
  await expect(recoverUnstartedRepoGradeReservationsAction(accountId)).resolves.toEqual({
    status: "checked", snapshot: { status: "loaded", reservations: [] },
  });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("repo_grade_expire_prepared_attempts", { p_user_id: accountId });
  expect(writeResponse).toHaveBeenCalledExactlyOnceWith(false);
  expect(writeResponse.mock.invocationCallOrder[0]).toBeLessThan(from.mock.invocationCallOrder[0]);
});

it("reports a lost write response as unconfirmed without retrying or claiming release", async () => {
  writeResponse.mockRejectedValue(new Error("Lost response"));
  await expect(recoverUnstartedRepoGradeReservationsAction(accountId)).resolves.toEqual({ status: "outcome-unconfirmed" });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(writeResponse).toHaveBeenCalledExactlyOnceWith(false);
  expect(from).not.toHaveBeenCalled();
});
