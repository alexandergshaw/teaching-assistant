import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * DAT2 (docs/lms-credentials-acceptance-criteria.md) - checkInstitutionsAction
 * and listConfiguredInstitutionsAction used to scan process.env directly,
 * behind requireOwner() - which is a deprecated alias for requireUser() ("any
 * active account", see auth.ts's own comment), so BEFORE this wave every
 * signed-in member could already call these and read the owner's environment
 * back one bit at a time. This file proves the repointed bodies: an identity
 * whose role is literally "owner" sees env-derived state PLUS their own
 * stored rows; anyone else sees ONLY their own stored rows, never the owner's
 * env, regardless of what is actually set in process.env.
 *
 * Only the two Canvas/Live-Feed actions this wave touched get real coverage
 * here. The remaining exports (Google Calendar, ICS feed, institution
 * fields, course notifications, cartridge export) are untouched by this
 * wave and are exercised by the two guard-passthrough tests at the bottom,
 * which pin that requireOwner() failures still map to `{ error }` uniformly -
 * the one property a mechanical migration must not disturb anywhere in this
 * file.
 */
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));
vi.mock("@/lib/lms-credentials", () => ({
  listLmsCredentials: vi.fn(),
}));
vi.mock("@/lib/canvas", () => ({
  getCourseNotifications: vi.fn(),
  exportCourseCartridge: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));
vi.mock("@/lib/google-credentials", () => ({
  getCredentials: vi.fn(),
  deleteCredentials: vi.fn(),
}));
vi.mock("@/lib/institution-fields", () => ({
  loadInstitutionFields: vi.fn(),
  saveInstitutionFields: vi.fn(),
  listAllInstitutionFields: vi.fn(),
}));

import { checkInstitutionsAction, listConfiguredInstitutionsAction } from "./course-hub-integrations";
import { requireOwner } from "@/lib/supabase/auth";
import { listLmsCredentials } from "@/lib/lms-credentials";

const mockRequireOwner = vi.mocked(requireOwner);
const mockListLmsCredentials = vi.mocked(listLmsCredentials);

const OWNER = { id: "owner-1", email: "owner@example.edu", role: "owner" as const, status: "active" as const };
const MEMBER = { id: "member-1", email: "member@example.edu", role: "instructor" as const, status: "active" as const };

function credentialRow(institution: string) {
  return {
    institution,
    baseUrl: `https://canvas.${institution.toLowerCase()}.edu`,
    tokenLastFour: "1a2b",
    canvasUserId: "1",
    canvasUserName: null,
    lastVerifiedAt: null,
    lastUsedAt: null,
    lastFailureAt: null,
    lastFailureKind: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

// Cleared (not merely unstubbed) before AND after every test so a real
// `.env`-style value the owner's own dev machine happens to have exported
// for `MCC_CANVAS_API_TOKEN` (a genuine deployment var this repo uses) can
// never leak a false "configured" result into these tests - the same
// defensive clearing canvas-credentials.test.ts uses for the same reason.
const ENV_KEYS = [
  "ABC_CANVAS_URL",
  "ABC_CANVAS_API_TOKEN",
  "ABC_LLM_URL",
  "ABC_LLM_API",
  "MCC_CANVAS_API_TOKEN",
];

function clearInstitutionEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

beforeEach(() => {
  vi.clearAllMocks();
  clearInstitutionEnv();
  mockListLmsCredentials.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearInstitutionEnv();
});

describe("checkInstitutionsAction - DAT2 repoint", () => {
  it("an owner sees env-derived canvasConfigured/llmConfigured status", async () => {
    mockRequireOwner.mockResolvedValue(OWNER);
    vi.stubEnv("ABC_CANVAS_URL", "https://canvas.abc.edu");
    vi.stubEnv("ABC_CANVAS_API_TOKEN", "tok");
    vi.stubEnv("ABC_LLM_URL", "https://llm.abc.edu");
    vi.stubEnv("ABC_LLM_API", "key");

    const result = await checkInstitutionsAction(["abc"]);

    expect(result).toEqual({
      statuses: [{ acronym: "ABC", canvasConfigured: true, llmConfigured: true }],
    });
  });

  it("a non-owner NEVER sees the owner's env as configured, even when it is fully set", async () => {
    mockRequireOwner.mockResolvedValue(MEMBER);
    vi.stubEnv("ABC_CANVAS_URL", "https://canvas.abc.edu");
    vi.stubEnv("ABC_CANVAS_API_TOKEN", "tok");
    vi.stubEnv("ABC_LLM_URL", "https://llm.abc.edu");
    vi.stubEnv("ABC_LLM_API", "key");

    const result = await checkInstitutionsAction(["abc"]);

    expect(result).toEqual({
      statuses: [{ acronym: "ABC", canvasConfigured: false, llmConfigured: false }],
    });
  });

  it("a non-owner with their OWN stored credential for an institution sees canvasConfigured true for it, regardless of env", async () => {
    mockRequireOwner.mockResolvedValue(MEMBER);
    mockListLmsCredentials.mockResolvedValue([credentialRow("XYZ")]);

    const result = await checkInstitutionsAction(["xyz", "abc"]);

    expect(result).toEqual({
      statuses: [
        { acronym: "XYZ", canvasConfigured: true, llmConfigured: false },
        { acronym: "ABC", canvasConfigured: false, llmConfigured: false },
      ],
    });
  });

  it("an owner's own stored row still counts even when the env pair for that code is absent", async () => {
    mockRequireOwner.mockResolvedValue(OWNER);
    mockListLmsCredentials.mockResolvedValue([credentialRow("XYZ")]);

    const result = await checkInstitutionsAction(["xyz"]);

    expect(result).toEqual({
      statuses: [{ acronym: "XYZ", canvasConfigured: true, llmConfigured: false }],
    });
  });

  it("resolves the caller's own stored rows via listLmsCredentials(identity.id), never a different id", async () => {
    mockRequireOwner.mockResolvedValue(MEMBER);

    await checkInstitutionsAction(["abc"]);

    expect(mockListLmsCredentials).toHaveBeenCalledWith(MEMBER.id);
  });

  it("maps a requireOwner() rejection to { error }, unchanged by this wave", async () => {
    mockRequireOwner.mockRejectedValue(new Error("not signed in"));

    const result = await checkInstitutionsAction(["abc"]);

    expect(result).toEqual({ error: "not signed in" });
    expect(mockListLmsCredentials).not.toHaveBeenCalled();
  });
});

describe("listConfiguredInstitutionsAction - DAT2 repoint", () => {
  it("an owner sees env-scanned acronyms plus their own stored rows, sorted and deduplicated", async () => {
    mockRequireOwner.mockResolvedValue(OWNER);
    vi.stubEnv("ABC_CANVAS_URL", "https://canvas.abc.edu");
    vi.stubEnv("ABC_CANVAS_API_TOKEN", "tok");
    mockListLmsCredentials.mockResolvedValue([credentialRow("ABC"), credentialRow("ZZZ")]);

    const result = await listConfiguredInstitutionsAction();

    expect(result).toEqual({ acronyms: ["ABC", "ZZZ"] });
  });

  it("includes a hardcoded institution (MCC) for the owner when only its token env var is set, no <CODE>_CANVAS_URL required", async () => {
    mockRequireOwner.mockResolvedValue(OWNER);
    vi.stubEnv("MCC_CANVAS_API_TOKEN", "owner-mcc-token");

    const result = await listConfiguredInstitutionsAction();

    expect(result).toEqual({ acronyms: ["MCC"] });
  });

  it("a non-owner sees ONLY their own stored rows - the owner's fully-configured env is invisible to them", async () => {
    mockRequireOwner.mockResolvedValue(MEMBER);
    vi.stubEnv("ABC_CANVAS_URL", "https://canvas.abc.edu");
    vi.stubEnv("ABC_CANVAS_API_TOKEN", "tok");
    mockListLmsCredentials.mockResolvedValue([credentialRow("XYZ")]);

    const result = await listConfiguredInstitutionsAction();

    expect(result).toEqual({ acronyms: ["XYZ"] });
  });

  it("a non-owner with no stored credential at all gets an empty list, never the owner's institutions", async () => {
    mockRequireOwner.mockResolvedValue(MEMBER);
    vi.stubEnv("ABC_CANVAS_URL", "https://canvas.abc.edu");
    vi.stubEnv("ABC_CANVAS_API_TOKEN", "tok");

    const result = await listConfiguredInstitutionsAction();

    expect(result).toEqual({ acronyms: [] });
  });

  it("maps a requireOwner() rejection to { error }, unchanged by this wave", async () => {
    mockRequireOwner.mockRejectedValue(new Error("not signed in"));

    const result = await listConfiguredInstitutionsAction();

    expect(result).toEqual({ error: "not signed in" });
    expect(mockListLmsCredentials).not.toHaveBeenCalled();
  });
});
