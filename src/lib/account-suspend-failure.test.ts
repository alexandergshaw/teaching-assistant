// Couples `classifySuspendFailure` (./account-suspend-failure.ts) to the
// messages `setAppUserStatus` (./supabase/app-users.ts) ACTUALLY throws.
//
// WHY THIS FILE DRIVES THE REAL FUNCTION INSTEAD OF USING FIXTURES.
//
// The classification is a substring match, because `setAppUserStatus` reports
// all three suspend failures as a thrown `Error` and nothing else - no code,
// no cause, no structured field (its own doc comment calls the message "the
// only mechanism available today"). That makes the coupling real and SILENT:
// reword the throw and the classifier quietly degrades to the generic
// failure, and the operator stops being told that an account may be locked
// out at the provider with no automatic recovery.
//
// A test that hands the classifier a string the TEST wrote cannot catch that.
// It proves only that the function can read its own constants back - it stays
// green forever, including on the day the coupling breaks. So every case here
// runs the REAL `setAppUserStatus`, captures the REAL error, and classifies
// that. If app-users.ts is reworded, these go red, which is the entire point.
//
// A source-text scan would not work either: the locked-out sentence is SPLIT
// ACROSS A STRING CONCATENATION in app-users.ts ("...at the " + "auth
// provider..."), so it exists in the runtime string but never as a contiguous
// run in the file. Only running the function sees the real message.
//
// Deliberately duplicates its own fake-client builder rather than importing
// one from another *.test.ts - importing across test files re-runs that
// file's own describe blocks (repo rule).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "./supabase/server";
import { setAppUserStatus } from "./supabase/app-users";
import {
  classifySuspendFailure,
  SUSPEND_LOCKED_OUT_MARKER,
  SUSPEND_REVERSED_MARKER,
  SUSPEND_PROVIDER_FAILED_PREFIX,
} from "./account-suspend-failure";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

const TARGET_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";

interface FakeConfig {
  /** One entry per `auth.admin.updateUserById` call, in order: the ban, then any lift. */
  updateUserByIdSequence: Array<{ error: { message: string } | null }>;
  /** The result of the `app_users` row write. */
  updateSingle: { data: unknown; error: { message: string } | null };
}

function makeFakeServiceClient(config: FakeConfig) {
  const banCalls: Array<Record<string, unknown>> = [];
  const remaining = [...config.updateUserByIdSequence];

  const client = {
    auth: {
      admin: {
        updateUserById: (_id: string, attrs: Record<string, unknown>) => {
          banCalls.push(attrs);
          const next = remaining.shift();
          if (!next) {
            throw new Error("fake client: updateUserById called more times than the sequence allows");
          }
          return Promise.resolve(next);
        },
      },
    },
    from: (table: string) => {
      if (table !== "app_users") {
        throw new Error(`unexpected table in fake client: ${table}`);
      }
      return {
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve(config.updateSingle),
            }),
          }),
        }),
      };
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, banCalls };
}

/** Runs a real suspend that is set up to fail, and returns what it threw. */
async function captureSuspendFailure(config: FakeConfig): Promise<unknown> {
  const fake = makeFakeServiceClient(config);
  vi.mocked(createServiceClient).mockReturnValue(fake.client);
  try {
    await setAppUserStatus(TARGET_ID, "suspended", ACTOR_ID);
  } catch (error) {
    return error;
  }
  throw new Error("setAppUserStatus was expected to throw and did not");
}

const WRITE_FAILED = { data: null, error: { message: "row write blew up" } };

describe("classifySuspendFailure against the REAL setAppUserStatus errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies a failed provider ban - nothing was banned and nothing was written", async () => {
    const error = await captureSuspendFailure({
      updateUserByIdSequence: [{ error: { message: "provider said no" } }],
      updateSingle: { data: null, error: null },
    });

    expect(classifySuspendFailure(error)).toBe("suspend_provider_failed");
    // The prefix constant must still match the real message's opening.
    expect((error as Error).message.startsWith(SUSPEND_PROVIDER_FAILED_PREFIX)).toBe(true);
  });

  it("classifies a reversed ban - the write failed but the account is NOT locked out", async () => {
    const error = await captureSuspendFailure({
      // The ban lands, the row write fails, the compensating lift succeeds.
      updateUserByIdSequence: [{ error: null }, { error: null }],
      updateSingle: WRITE_FAILED,
    });

    expect(classifySuspendFailure(error)).toBe("suspend_reversed");
    expect((error as Error).message).toContain(SUSPEND_REVERSED_MARKER);
  });

  it("classifies the locked-out case - the ban landed, the write failed, and the reversal ALSO failed", async () => {
    const error = await captureSuspendFailure({
      updateUserByIdSequence: [{ error: null }, { error: { message: "lift failed too" } }],
      updateSingle: WRITE_FAILED,
    });

    expect(classifySuspendFailure(error)).toBe("suspend_locked_out");
    expect((error as Error).message).toContain(SUSPEND_LOCKED_OUT_MARKER);
  });

  it("does NOT mistake the locked-out case for the milder reversed one", async () => {
    // Both messages open with the same "Could not set status..." text and both
    // go on to describe the ban's fate, so a classifier that checked for the
    // milder state first would swallow the catastrophic one. This is the
    // ordering assertion; it is why the checks in classifySuspendFailure are
    // most-severe-first.
    const error = await captureSuspendFailure({
      updateUserByIdSequence: [{ error: null }, { error: { message: "lift failed too" } }],
      updateSingle: WRITE_FAILED,
    });

    expect(classifySuspendFailure(error)).not.toBe("suspend_reversed");
    expect(classifySuspendFailure(error)).not.toBe("failed");
  });

  it("reverses the ban in the recoverable case and not in the locked-out-only case", async () => {
    // Guards the fixture itself: if setAppUserStatus stopped compensating,
    // the reversed case above would silently become unreachable and its test
    // would start passing for the wrong reason.
    const fake = makeFakeServiceClient({
      updateUserByIdSequence: [{ error: null }, { error: null }],
      updateSingle: WRITE_FAILED,
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);
    await expect(setAppUserStatus(TARGET_ID, "suspended", ACTOR_ID)).rejects.toThrow();

    expect(fake.banCalls).toHaveLength(2);
    expect(fake.banCalls[0]).not.toEqual(fake.banCalls[1]);
  });
});

describe("classifySuspendFailure is total", () => {
  it("returns the generic failure for anything it does not recognise", () => {
    for (const value of [
      new Error("Could not set status for app_users x: something else entirely"),
      new Error(""),
      null,
      undefined,
      "a bare string",
      42,
      {},
    ]) {
      expect(classifySuspendFailure(value)).toBe("failed");
    }
  });

  it("never throws, because it runs inside a catch block", () => {
    expect(() => classifySuspendFailure(Object.create(null))).not.toThrow();
  });
});
