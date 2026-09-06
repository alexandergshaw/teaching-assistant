import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract tests for signUpAction (docs/multi-user-login-acceptance-criteria.md
 * B0, B1, B3). The Supabase server client is mocked so no real network or
 * database call happens; validateSignup itself is exercised for real (its own
 * contract is pinned separately in src/lib/signup-rules.test.ts), so this
 * file's job is the ACTION's own wiring: does it call signUp with the right
 * (normalised) arguments, does a validation failure short-circuit before
 * signUp is ever called, does signup_disabled get its own outcome while every
 * other provider error collapses to one, and - the property that matters
 * most - does role or status ever reach the call.
 */

const signUp = vi.fn();
const createClient = vi.fn(async () => ({ auth: { signUp } }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));

import { signUpAction } from "./auth-signup";

const SAVED = {
  mode: process.env.SIGNUP_MODE,
  domains: process.env.SIGNUP_ALLOWED_DOMAINS,
  redirect: process.env.SIGNUP_EMAIL_REDIRECT_URL,
};

const VALID_INPUT = {
  fullName: "  Dana   Reyes  ",
  email: "  Dana@Example.EDU  ",
  password: "correct horse battery",
};

beforeEach(() => {
  delete process.env.SIGNUP_MODE;
  delete process.env.SIGNUP_ALLOWED_DOMAINS;
  delete process.env.SIGNUP_EMAIL_REDIRECT_URL;
  signUp.mockReset();
  createClient.mockClear();
});

afterEach(() => {
  for (const [key, value] of [
    ["SIGNUP_MODE", SAVED.mode],
    ["SIGNUP_ALLOWED_DOMAINS", SAVED.domains],
    ["SIGNUP_EMAIL_REDIRECT_URL", SAVED.redirect],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("signUpAction - validation", () => {
  it("refuses a bad submission without ever calling signUp", async () => {
    const result = await signUpAction({ fullName: "Dana", email: "not-an-email", password: "irrelevant" });

    expect(result.outcome).toBe("invalid");
    if (result.outcome === "invalid") {
      expect(result.field).toBe("email");
      expect(result.message.length).toBeGreaterThan(0);
    }
    expect(signUp).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses a short password without ever calling signUp", async () => {
    const result = await signUpAction({
      fullName: "Dana Reyes",
      email: "dana@example.edu",
      password: "short",
    });

    expect(result.outcome).toBe("invalid");
    if (result.outcome === "invalid") {
      expect(result.field).toBe("password");
    }
    expect(signUp).not.toHaveBeenCalled();
  });

  it("refuses when sign-ups are closed, before ever calling signUp", async () => {
    process.env.SIGNUP_MODE = "closed";
    const result = await signUpAction(VALID_INPUT);

    expect(result.outcome).toBe("invalid");
    if (result.outcome === "invalid") {
      expect(result.field).toBe("mode");
    }
    expect(signUp).not.toHaveBeenCalled();
  });
});

describe("signUpAction - a valid submission", () => {
  it("calls signUp with the NORMALISED name and email, and full_name in options.data", async () => {
    signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });

    await signUpAction(VALID_INPUT);

    expect(signUp).toHaveBeenCalledTimes(1);
    const call = signUp.mock.calls[0][0];
    // Normalised, not the raw padded/mixed-case input.
    expect(call.email).toBe("dana@example.edu");
    expect(call.password).toBe(VALID_INPUT.password);
    expect(call.options.data).toEqual({ full_name: "Dana Reyes" });
  });

  it("never passes role or status anywhere in the signUp call", async () => {
    signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });

    await signUpAction(VALID_INPUT);

    const call = signUp.mock.calls[0][0];
    const serialized = JSON.stringify(call);
    expect(serialized).not.toMatch(/"role"/);
    expect(serialized).not.toMatch(/"status"/);
    expect(Object.keys(call)).toEqual(["email", "password", "options"]);
    expect(Object.keys(call.options)).toEqual(["data", "emailRedirectTo"]);
    expect(Object.keys(call.options.data)).toEqual(["full_name"]);
  });

  it("reads emailRedirectTo from the env var, never from a browser origin", async () => {
    process.env.SIGNUP_EMAIL_REDIRECT_URL = "https://app.example.edu/auth/confirm";
    signUp.mockResolvedValue({ data: { user: {}, session: null }, error: null });

    await signUpAction(VALID_INPUT);

    const call = signUp.mock.calls[0][0];
    expect(call.options.emailRedirectTo).toBe("https://app.example.edu/auth/confirm");
  });

  it("omits emailRedirectTo (undefined) when the env var is unset", async () => {
    signUp.mockResolvedValue({ data: { user: {}, session: null }, error: null });

    await signUpAction(VALID_INPUT);

    const call = signUp.mock.calls[0][0];
    expect(call.options.emailRedirectTo).toBeUndefined();
  });
});

describe("signUpAction - the confirmations on/off split (B3)", () => {
  it("returns check_email when the response carries no session (confirmations ON)", async () => {
    signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });

    const result = await signUpAction(VALID_INPUT);

    expect(result.outcome).toBe("check_email");
  });

  it("returns signed_in when the response carries a live session (confirmations OFF)", async () => {
    signUp.mockResolvedValue({
      data: { user: { identities: [] }, session: { access_token: "t", refresh_token: "r" } },
      error: null,
    });

    const result = await signUpAction(VALID_INPUT);

    expect(result.outcome).toBe("signed_in");
  });
});

describe("signUpAction - provider errors", () => {
  it("gives signup_disabled its own distinct outcome", async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Signups not allowed for this instance", code: "signup_disabled" },
    });

    const result = await signUpAction(VALID_INPUT);

    expect(result.outcome).toBe("signup_disabled");
  });

  it("collapses a duplicate-address error to the same generic outcome as a rate limit", async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "User already registered", code: "user_already_exists" },
    });
    const first = await signUpAction(VALID_INPUT);

    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Email rate limit exceeded", code: "over_email_send_rate_limit" },
    });
    const second = await signUpAction(VALID_INPUT);

    expect(first.outcome).toBe("error");
    expect(second.outcome).toBe("error");
  });

  it("collapses an unrecognised error code to the same generic outcome too", async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Something GoTrue has never told us about before", code: "brand_new_code" },
    });

    const result = await signUpAction(VALID_INPUT);

    expect(result.outcome).toBe("error");
  });
});
