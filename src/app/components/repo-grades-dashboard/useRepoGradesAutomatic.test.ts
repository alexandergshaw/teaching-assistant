import { afterEach, expect, it, vi } from "vitest";
import type { AutomaticRepoGradeStatus } from "@/lib/repo-grades-dashboard/automatic-status";
import { useRepoGradesAutomatic } from "./useRepoGradesAutomatic";

const mock = vi.hoisted(() => {
  const slots: unknown[] = [];
  let cursor = 0;
  let owner: string | null | undefined;
  let cleanup: (() => void) | undefined;
  return {
    enqueue: vi.fn(),
    read: vi.fn(),
    render: () => { cursor = 0; },
    reset: () => { cleanup?.(); cleanup = undefined; owner = undefined; slots.length = 0; },
    useState: (initial: unknown) => {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], (value: unknown) => {
        slots[slot] = typeof value === "function" ? value(slots[slot]) : value;
      }];
    },
    useRef: (initial: unknown) => {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useEffect: (effect: () => (() => void) | undefined, [accountId]: [string | null]) => {
      if (accountId === owner) return;
      cleanup?.();
      owner = accountId;
      cleanup = effect();
    },
  };
});
vi.mock("react", () => ({ useState: mock.useState, useRef: mock.useRef, useEffect: mock.useEffect }));
vi.mock("@/app/actions/repo-grade-automatic", () => ({
  enqueueRepoGradeAutomaticRunAction: mock.enqueue,
  readRepoGradeAutomaticStatusAction: mock.read,
}));
vi.mock("./startup-diagnostics", () => ({ recordRepoGradesStartup: vi.fn() }));

function render(accountId: string) {
  mock.render();
  // eslint-disable-next-line react-hooks/rules-of-hooks -- The Node harness mocks React hook storage and effects.
  return useRepoGradesAutomatic(accountId);
}

afterEach(() => {
  mock.reset();
  vi.resetAllMocks();
  vi.useRealTimers();
});

it("keeps a loaded owner's class queue mounted on poll failure and clears stale state after recovery", async () => {
  vi.useFakeTimers();
  const first: AutomaticRepoGradeStatus = {
    status: "loaded", enabled: true, githubRetryEnabled: false, githubRetryAt: null, schedule: null,
    preparations: [], recoveries: [],
    classQueue: { customized: false, courses: [{ courseId: "a", label: "Class A", included: true }] },
    run: { id: "run", phase: "discovering", settling: false, waitingForBrowserStartup: false, courses: [] },
  };
  const refreshed = { ...first, classQueue: { customized: true, courses: [] } };
  mock.enqueue.mockResolvedValueOnce(first).mockResolvedValueOnce({ status: "unavailable" });
  mock.read.mockRejectedValueOnce(new Error("temporary outage")).mockResolvedValueOnce(refreshed);
  render("first");
  await vi.advanceTimersByTimeAsync(0);
  expect(render("first")).toMatchObject({ status: first, stale: false });
  await vi.advanceTimersToNextTimerAsync();
  expect(render("first")).toMatchObject({ status: first, stale: true });
  await vi.advanceTimersToNextTimerAsync();
  expect(render("first")).toMatchObject({ status: refreshed, stale: false });
  expect(render("second")).toMatchObject({ status: undefined, stale: false });
  await vi.advanceTimersByTimeAsync(0);
  expect(render("second")).toMatchObject({ status: { status: "unavailable" }, stale: false });
  expect(mock.read.mock.calls).toEqual([["first"], ["first"]]);
});
