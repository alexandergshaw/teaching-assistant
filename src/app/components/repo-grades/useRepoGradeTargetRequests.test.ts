import { afterEach, expect, it, vi } from "vitest";
import { useRepoGradeTargetRequests, type TargetRequest } from "./useRepoGradeTargetRequests";

const mock = vi.hoisted(() => {
  const slots: unknown[] = [];
  const effects = new Map<number, { dependencies: readonly unknown[]; cleanup: (() => void) | undefined }>();
  let cursor = 0;
  const same = (previous: readonly unknown[], next: readonly unknown[]) => next.every((value, i) => value === previous[i]);
  return {
    read: vi.fn(),
    control: vi.fn(),
    render: () => { cursor = 0; },
    reset: () => {
      for (const effect of effects.values()) effect.cleanup?.();
      effects.clear();
      slots.length = 0;
    },
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
    useCallback: (callback: unknown, dependencies: readonly unknown[]) => {
      const slot = cursor++;
      const existing = slots[slot] as { callback: unknown; dependencies: readonly unknown[] } | undefined;
      if (existing && same(existing.dependencies, dependencies)) return existing.callback;
      slots[slot] = { callback, dependencies };
      return callback;
    },
    useEffect: (effect: () => (() => void) | undefined, dependencies: readonly unknown[]) => {
      const slot = cursor++;
      const existing = effects.get(slot);
      if (existing && same(existing.dependencies, dependencies)) return;
      existing?.cleanup?.();
      effects.set(slot, { dependencies, cleanup: effect() });
    },
  };
});

vi.mock("react", () => ({ useCallback: mock.useCallback, useState: mock.useState, useRef: mock.useRef, useEffect: mock.useEffect }));
vi.mock("@/app/actions/repo-grade-target-request", () => ({
  readRepoGradeTargetRequestsAction: mock.read,
  controlRepoGradeTargetRequestAction: mock.control,
}));

const sampleRequest: TargetRequest = {
  id: 1, courseId: "course", folder: "Module 14", repo: null, state: "queued", runId: null,
  inFlight: false, bulk: false, folders: null, repos: null,
};

function render(accountId: string | null) {
  mock.render();
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Node harness supplies the hook storage and effect lifecycle.
  return useRepoGradeTargetRequests(accountId);
}

function loaded(requests: TargetRequest[]) { return { status: "loaded", requests } as const; }

afterEach(() => {
  mock.reset();
  vi.resetAllMocks();
  vi.useRealTimers();
});

it("lets a queue read longer than the polling interval finish and enable grading", async () => {
  vi.useFakeTimers();
  mock.read.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(loaded([sampleRequest])), 8_000)));
  expect(render("owner").ready).toBe(false);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(mock.read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3_000);
  expect(render("owner")).toMatchObject({ ready: true, unavailable: false, requests: [sampleRequest] });
  await vi.advanceTimersByTimeAsync(7_000);
  expect(mock.read.mock.calls).toEqual([["owner"], ["owner"]]);
  expect(render("owner").ready).toBe(true);
});

it("cannot replace the current owner's status with a slow prior owner's response", async () => {
  vi.useFakeTimers();
  const prior = Promise.withResolvers<ReturnType<typeof loaded>>();
  mock.read.mockReturnValueOnce(prior.promise).mockResolvedValue(loaded([]));
  expect(render("owner-1").ready).toBe(false);
  expect(render("owner-2").ready).toBe(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(render("owner-2")).toMatchObject({ ready: true, requests: [] });
  prior.resolve(loaded([sampleRequest]));
  await vi.advanceTimersByTimeAsync(0);
  expect(render("owner-2")).toMatchObject({ ready: true, requests: [] });
  render(null);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(mock.read.mock.calls).toEqual([["owner-1"], ["owner-2"]]);
});

it("allows an explicit refresh to supersede an older read within the same owner", async () => {
  vi.useFakeTimers();
  const prior = Promise.withResolvers<ReturnType<typeof loaded>>();
  mock.read.mockReturnValueOnce(prior.promise).mockResolvedValue(loaded([sampleRequest]));
  const view = render("owner");
  await view.refresh();
  prior.resolve(loaded([]));
  await vi.advanceTimersByTimeAsync(0);
  expect(render("owner")).toMatchObject({ ready: true, requests: [sampleRequest] });
});

it("does not refresh an old account after its queue control finishes", async () => {
  vi.useFakeTimers();
  const prior = Promise.withResolvers<{ status: "loaded"; changed: boolean }>();
  mock.control.mockReturnValue(prior.promise);
  mock.read.mockResolvedValue(loaded([]));
  const control = render("owner-1").control(1, "pause");
  render("owner-2");
  prior.resolve({ status: "loaded", changed: true });
  expect(await control).toBe(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(render("owner-2").ready).toBe(true);
  expect(mock.read.mock.calls).toEqual([["owner-1"], ["owner-2"]]);
});
