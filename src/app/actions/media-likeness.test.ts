import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// These two defects were found in verification of Avatar Studio training
// (src/app/actions/media-likeness.ts):
//
//   1. sampleInUseAction failed OPEN on any error (auth blip, transient DB
//      error, network hiccup), reporting a sample "not in use" - the ONLY
//      guard standing between the user and deleting webcam footage a Tavus
//      training job is still reading a signed URL from. It must fail
//      CLOSED instead.
//
//   2. startAvatarTrainingAction retired (provider-deleted + marked
//      superseded) every prior likeness at the START of a retrain, before
//      the new training was even created. Training runs 3-4 hours; this
//      meant a user's working "ready" likeness was destroyed the instant
//      they clicked retrain, with no likeness usable for the whole run, and
//      PERMANENTLY if the new attempt then failed. Retirement must happen
//      only once the new likeness actually reaches "ready".
//
// requireOwner (auth), createServiceClient (db handle), every DB accessor in
// @/lib/avatar-likeness, every network call in @/lib/tavus, and the
// recording-files / storage seams are all mocked so this pipeline logic runs
// for real without a Supabase session, a live database, or the Tavus API.
// isTavusTerminalSuccess / isTavusTerminalFailure / isTavusTerminal /
// describeTavusTrainingError are pure and are exercised for real via
// vi.importActual, exactly like case-study-research.test.ts does for its own
// pure helpers.

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ __fake: "supabase" })),
}));

vi.mock("@/lib/supabase/storage", () => ({
  createSignedUrl: vi.fn(),
}));

vi.mock("@/lib/recording-files", () => ({
  getRecordingFileById: vi.fn(),
  saveRecordingFile: vi.fn(),
}));

vi.mock("@/lib/tavus", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tavus")>("@/lib/tavus");
  return {
    ...actual,
    createTavusFace: vi.fn(),
    getTavusFace: vi.fn(),
    createTavusVideo: vi.fn(),
    getTavusVideo: vi.fn(),
    deleteTavusFace: vi.fn(),
  };
});

vi.mock("@/lib/avatar-likeness", async () => {
  const actual = await vi.importActual<typeof import("@/lib/avatar-likeness")>("@/lib/avatar-likeness");
  return {
    ...actual,
    listAvatarLikenesses: vi.fn(),
    getAvatarLikenessById: vi.fn(),
    findNonTerminalAvatarLikeness: vi.fn(),
    findDefaultReadyAvatarLikeness: vi.fn(),
    listSupersedableAvatarLikenesses: vi.fn(),
    isSampleFileInUseByLikeness: vi.fn(),
    findNextReadyAvatarLikeness: vi.fn(),
    createAvatarLikeness: vi.fn(),
    updateAvatarLikeness: vi.fn(),
    markAvatarLikenessSuperseded: vi.fn(),
    setDefaultAvatarLikeness: vi.fn(),
    deleteAvatarLikenessRow: vi.fn(),
    createAvatarVideo: vi.fn(),
    getAvatarVideoById: vi.fn(),
    updateAvatarVideo: vi.fn(),
  };
});

// generateAvatarScriptAction (F4: course + purpose picker) calls getCourse
// (a DB read, scoped by owner), callLlm (network), and getWritingStyleBlock
// (a DB read via "./shared") - all three are mocked below, following the
// same pattern already used for the DB accessors and provider calls above.
// composeAvatarScriptBrief and renderCourseFacts are both pure and are
// deliberately left UNMOCKED so the wiring under test - the course and the
// purpose actually reaching the prompt text, not just decorating a dropdown
// - runs for real.
vi.mock("@/lib/supabase/courses", () => ({
  getCourse: vi.fn(),
  listCourses: vi.fn(),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

vi.mock("./shared", async () => {
  const actual = await vi.importActual<typeof import("./shared")>("./shared");
  return {
    ...actual,
    getWritingStyleBlock: vi.fn(),
  };
});

import { requireOwner } from "@/lib/supabase/auth";
import { createSignedUrl } from "@/lib/supabase/storage";
import { getRecordingFileById } from "@/lib/recording-files";
import { createTavusFace, getTavusFace, deleteTavusFace } from "@/lib/tavus";
import { getCourse, listCourses } from "@/lib/supabase/courses";
import type { Course } from "@/lib/supabase/courses";
import { emptyCourseProject } from "@/lib/course-project";
import { AVATAR_VIDEO_PURPOSES } from "@/lib/avatar-video-purpose";
import { callLlm } from "@/lib/llm";
import { getWritingStyleBlock } from "./shared";
import {
  type AvatarLikeness,
  findNonTerminalAvatarLikeness,
  listSupersedableAvatarLikenesses,
  isSampleFileInUseByLikeness,
  createAvatarLikeness,
  updateAvatarLikeness,
  markAvatarLikenessSuperseded,
  setDefaultAvatarLikeness,
  getAvatarLikenessById,
} from "@/lib/avatar-likeness";
import {
  sampleInUseAction,
  startAvatarTrainingAction,
  refreshAvatarLikenessAction,
  generateAvatarScriptAction,
  listAvatarCourseOptionsAction,
} from "./media-likeness";

const OWNER = { id: "owner-1", email: "owner@example.com" };

function likeness(overrides: Partial<AvatarLikeness> = {}): AvatarLikeness {
  return {
    id: "likeness-new",
    provider: "tavus",
    externalId: "face-new",
    name: "My Likeness",
    status: "training",
    errorMessage: null,
    sampleFileId: "sample-1",
    isDefault: false,
    acknowledgement: "I consent",
    acknowledgedAt: "2026-08-01T00:00:00.000Z",
    trainingProgress: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER);
  // Default happy-path plumbing for startAvatarTrainingAction, overridden per test.
  vi.mocked(findNonTerminalAvatarLikeness).mockResolvedValue(null);
  vi.mocked(getRecordingFileById).mockResolvedValue({
    id: "sample-1",
    kind: "sample",
    storagePath: "owner-1/sample-1.mp4",
  } as never);
  vi.mocked(createSignedUrl).mockResolvedValue({ data: { signedUrl: "https://signed.test/sample.mp4" }, error: null } as never);
  vi.mocked(createAvatarLikeness).mockResolvedValue(likeness({ id: "likeness-new", status: "pending", externalId: null }));
  vi.mocked(updateAvatarLikeness).mockImplementation(async (_supabase, id, patch) =>
    likeness({
      id,
      externalId: patch.externalId ?? "face-new",
      status: patch.status ?? "training",
      errorMessage: patch.errorMessage ?? null,
      trainingProgress: patch.trainingProgress ?? null,
    })
  );
  vi.mocked(listSupersedableAvatarLikenesses).mockResolvedValue([]);
  vi.mocked(markAvatarLikenessSuperseded).mockResolvedValue(undefined);
  vi.mocked(setDefaultAvatarLikeness).mockResolvedValue(undefined);
  vi.mocked(deleteTavusFace).mockResolvedValue({ ok: true });
  // Default happy-path plumbing for generateAvatarScriptAction, overridden per test.
  vi.mocked(getWritingStyleBlock).mockResolvedValue("");
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, body: "", text: "Generated script." } as never);
  vi.mocked(getCourse).mockResolvedValue(null);
});

/** A minimal Course fixture. Cast through `unknown` (matching this file's
 * existing `as never` convention for hand-built fixtures) rather than
 * spelling out the ~40 fields of the real Course interface - only the
 * fields renderCourseFacts actually reads without a null-guard (repos,
 * integrations, courseProject) need real values to avoid a runtime crash,
 * plus the fields these tests assert reach the brief. */
function fakeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "Intro to Databases",
    courseCode: "CS-220",
    term: "Fall 2026",
    repos: [],
    integrations: [],
    courseProject: emptyCourseProject(),
    csvData: null,
    ...overrides,
  } as unknown as Course;
}

/** The plain-text prompt sent in the Nth (default: most recent) call to the
 * mocked callLlm - LlmPart is a { text } | { inlineData } union, so the cast
 * is needed to read .text back out of what this action always sends as a
 * single text part. */
function promptTextFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  return (call.contents[0].parts[0] as { text: string }).text;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── DEFECT 1: sampleInUseAction must fail CLOSED ────────────────────────────

describe("sampleInUseAction - fail-closed guard", () => {
  it("reports { inUse: false } on the normal, successful path when no likeness references the sample", async () => {
    vi.mocked(isSampleFileInUseByLikeness).mockResolvedValue(false);
    const result = await sampleInUseAction("sample-1");
    expect(result).toEqual({ inUse: false });
  });

  it("reports { inUse: true } on the normal, successful path when a likeness is training from the sample", async () => {
    vi.mocked(isSampleFileInUseByLikeness).mockResolvedValue(true);
    const result = await sampleInUseAction("sample-1");
    expect(result).toEqual({ inUse: true });
  });

  it("FAILS CLOSED (inUse: true) when requireOwner throws (e.g. an auth blip)", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("auth blip"));
    const result = await sampleInUseAction("sample-1");
    expect(result).toEqual({ inUse: true });
  });

  it("FAILS CLOSED (inUse: true) when the DB lookup throws (e.g. a transient DB error)", async () => {
    vi.mocked(isSampleFileInUseByLikeness).mockRejectedValue(new Error("connection reset"));
    const result = await sampleInUseAction("sample-1");
    expect(result).toEqual({ inUse: true });
  });
});

// ── DEFECT 2: retirement moves from "training start" to "new likeness ready" ─

describe("startAvatarTrainingAction - does not retire at start", () => {
  it("never queries or touches prior likenesses when the new training merely starts (non-terminal status)", async () => {
    vi.stubEnv("TAVUS_API_KEY", "test-key");
    vi.mocked(createTavusFace).mockResolvedValue({ faceId: "face-new", status: "started" });

    const result = await startAvatarTrainingAction("sample-1", "My Likeness", "I consent");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.likeness.status).toBe("training");

    // The core of defect 2: nothing about prior likenesses is touched before
    // (or during) a training that has only just started.
    expect(listSupersedableAvatarLikenesses).not.toHaveBeenCalled();
    expect(markAvatarLikenessSuperseded).not.toHaveBeenCalled();
    expect(deleteTavusFace).not.toHaveBeenCalled();
    expect(setDefaultAvatarLikeness).not.toHaveBeenCalled();
  });

  it("a failed retrain (createTavusFace itself errors) leaves every prior likeness untouched", async () => {
    vi.stubEnv("TAVUS_API_KEY", "test-key");
    vi.mocked(createTavusFace).mockResolvedValue({ error: "Tavus rejected the request" });

    const result = await startAvatarTrainingAction("sample-1", "My Likeness", "I consent");

    expect("error" in result).toBe(true);
    expect(listSupersedableAvatarLikenesses).not.toHaveBeenCalled();
    expect(markAvatarLikenessSuperseded).not.toHaveBeenCalled();
    expect(deleteTavusFace).not.toHaveBeenCalled();
    // Only the brand-new (now-failed) row is touched, never a prior one.
    expect(updateAvatarLikeness).toHaveBeenCalledWith(expect.anything(), "likeness-new", expect.objectContaining({ status: "failed" }));
  });

  it("a retrain that comes back immediately terminal-failed (status: 'error') leaves every prior likeness untouched", async () => {
    vi.stubEnv("TAVUS_API_KEY", "test-key");
    vi.mocked(createTavusFace).mockResolvedValue({ faceId: "face-new", status: "error" });

    const result = await startAvatarTrainingAction("sample-1", "My Likeness", "I consent");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.likeness.status).toBe("failed");
    expect(listSupersedableAvatarLikenesses).not.toHaveBeenCalled();
    expect(markAvatarLikenessSuperseded).not.toHaveBeenCalled();
    expect(deleteTavusFace).not.toHaveBeenCalled();
  });
});

describe("retirement happens once the new likeness becomes ready (both call sites)", () => {
  it("startAvatarTrainingAction: retires prior likenesses when createTavusFace itself returns an immediately-terminal success", async () => {
    vi.stubEnv("TAVUS_API_KEY", "test-key");
    const prior = likeness({ id: "likeness-prior", externalId: "face-prior", status: "ready", isDefault: false });
    vi.mocked(listSupersedableAvatarLikenesses).mockResolvedValue([prior]);
    vi.mocked(createTavusFace).mockResolvedValue({ faceId: "face-new", status: "completed" });

    const result = await startAvatarTrainingAction("sample-1", "My Likeness", "I consent");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.likeness.status).toBe("ready");

    expect(listSupersedableAvatarLikenesses).toHaveBeenCalledWith(expect.anything(), OWNER.id, "likeness-new");
    expect(deleteTavusFace).toHaveBeenCalledWith("test-key", "face-prior");
    expect(markAvatarLikenessSuperseded).toHaveBeenCalledWith(expect.anything(), "likeness-prior");
    // The only prior likeness in this fixture was never the default either -
    // i.e. the owner has no default at all right now (BUG 1) - so the newly
    // ready likeness must be promoted, not left defaultless.
    expect(setDefaultAvatarLikeness).toHaveBeenCalledWith(expect.anything(), OWNER.id, "likeness-new");
  });

  it("refreshAvatarLikenessAction: retires prior likenesses the moment the poll observes the new likeness turn ready", async () => {
    vi.stubEnv("TAVUS_API_KEY", "test-key");
    const training = likeness({ id: "likeness-new", externalId: "face-new", status: "training" });
    vi.mocked(getAvatarLikenessById).mockResolvedValue(training);
    vi.mocked(getTavusFace).mockResolvedValue({
      faceId: "face-new",
      faceName: "My Likeness",
      status: "completed",
      trainingProgress: "100",
      errorMessage: null,
    });
    const prior = likeness({ id: "likeness-prior", externalId: "face-prior", status: "ready", isDefault: false });
    vi.mocked(listSupersedableAvatarLikenesses).mockResolvedValue([prior]);

    const result = await refreshAvatarLikenessAction("likeness-new");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.likeness.status).toBe("ready");

    expect(listSupersedableAvatarLikenesses).toHaveBeenCalledWith(expect.anything(), OWNER.id, "likeness-new");
    expect(deleteTavusFace).toHaveBeenCalledWith("test-key", "face-prior");
    expect(markAvatarLikenessSuperseded).toHaveBeenCalledWith(expect.anything(), "likeness-prior");
  });

  it("promotes the newly-ready likeness to default when the retired likeness it replaces was the default", async () => {
    vi.stubEnv("TAVUS_API_KEY", "test-key");
    const training = likeness({ id: "likeness-new", externalId: "face-new", status: "training" });
    vi.mocked(getAvatarLikenessById).mockResolvedValue(training);
    vi.mocked(getTavusFace).mockResolvedValue({
      faceId: "face-new",
      faceName: "My Likeness",
      status: "completed",
      trainingProgress: "100",
      errorMessage: null,
    });
    const priorDefault = likeness({ id: "likeness-prior", externalId: "face-prior", status: "ready", isDefault: true });
    vi.mocked(listSupersedableAvatarLikenesses).mockResolvedValue([priorDefault]);

    await refreshAvatarLikenessAction("likeness-new");

    expect(setDefaultAvatarLikeness).toHaveBeenCalledWith(expect.anything(), OWNER.id, "likeness-new");
  });

  it("refreshAvatarLikenessAction: also promotes a default when no retired likeness was the default either - BUG 1's 'no default at all' case", async () => {
    // Pre-fix, this asserted the OPPOSITE (that setDefaultAvatarLikeness was
    // never called here) - that assertion WAS the bug: a prior likeness
    // existed and was retired, but since it was never the default either,
    // nothing about the user's account was currently default, and the old
    // code only promoted keepId when a RETIRED likeness had held the
    // default. The fix promotes keepId whenever the owner has no default at
    // all, which this scenario is (see media-likeness.ts's
    // retireSupersededAvatarLikenesses).
    vi.stubEnv("TAVUS_API_KEY", "test-key");
    const training = likeness({ id: "likeness-new", externalId: "face-new", status: "training" });
    vi.mocked(getAvatarLikenessById).mockResolvedValue(training);
    vi.mocked(getTavusFace).mockResolvedValue({
      faceId: "face-new",
      faceName: "My Likeness",
      status: "completed",
      trainingProgress: "100",
      errorMessage: null,
    });
    const priorNonDefault = likeness({ id: "likeness-prior", externalId: "face-prior", status: "ready", isDefault: false });
    vi.mocked(listSupersedableAvatarLikenesses).mockResolvedValue([priorNonDefault]);

    await refreshAvatarLikenessAction("likeness-new");

    expect(setDefaultAvatarLikeness).toHaveBeenCalledWith(expect.anything(), OWNER.id, "likeness-new");
  });

  // ── BUG 1: the first-ever likeness never became the default ────────────────
  //
  // On a brand-new account there is nothing to retire (others = []) and
  // nothing was ever default, so the old code's promotion never ran at all -
  // a freshly "ready" likeness sat there with is_default = false forever,
  // generation stayed disabled, and "No likeness is ready yet" kept showing
  // even though one plainly was.

  it("BUG 1: the very first likeness a user ever trains becomes the default the moment it turns ready (no prior rows at all)", async () => {
    vi.stubEnv("TAVUS_API_KEY", "test-key");
    const training = likeness({ id: "likeness-new", externalId: "face-new", status: "training", isDefault: false });
    vi.mocked(getAvatarLikenessById).mockResolvedValue(training);
    vi.mocked(getTavusFace).mockResolvedValue({
      faceId: "face-new",
      faceName: "My Likeness",
      status: "completed",
      trainingProgress: "100",
      errorMessage: null,
    });
    // Brand-new account: nothing to retire at all.
    vi.mocked(listSupersedableAvatarLikenesses).mockResolvedValue([]);

    const result = await refreshAvatarLikenessAction("likeness-new");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.likeness.status).toBe("ready");
    // Nothing was retired...
    expect(markAvatarLikenessSuperseded).not.toHaveBeenCalled();
    expect(deleteTavusFace).not.toHaveBeenCalled();
    // ...yet the brand-new likeness still becomes the default.
    expect(setDefaultAvatarLikeness).toHaveBeenCalledWith(expect.anything(), OWNER.id, "likeness-new");
  });

  it("BUG 1: an already-chosen default is left alone by a redundant poll, since nothing is retired or promoted once a likeness is already ready", async () => {
    // A likeness that is already "ready" short-circuits at the top of
    // refreshAvatarLikenessAction (see the early return there) before
    // retireSupersededAvatarLikenesses is ever reached. This is the guard
    // that keeps the BUG 1 fix scoped to the single moment a likeness first
    // turns ready: an idempotent re-poll (e.g. the user's tab reloads, or a
    // second poll lands after the first already resolved) must never re-run
    // the promotion logic and so can never disturb whatever default the
    // owner has deliberately chosen. There is deliberately no "existing
    // default" object constructed here - the whole point is that this path
    // never even looks at defaults, so there is nothing for it to steal.
    const alreadyReady = likeness({ id: "likeness-already-ready", status: "ready", isDefault: true });
    vi.mocked(getAvatarLikenessById).mockResolvedValue(alreadyReady);

    const result = await refreshAvatarLikenessAction("likeness-already-ready");

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.likeness).toEqual(alreadyReady);
    }
    expect(listSupersedableAvatarLikenesses).not.toHaveBeenCalled();
    expect(markAvatarLikenessSuperseded).not.toHaveBeenCalled();
    expect(setDefaultAvatarLikeness).not.toHaveBeenCalled();
  });

  // ── BUG 2: a throwing provider delete must not disable generation forever ──
  //
  // deleteTavusFace makes a real fetch() call and CAN reject on a network
  // error (src/lib/tavus.ts around :166) - the old comment here claimed it
  // "never throws," which is false. Because refreshAvatarLikenessAction
  // persists status "ready" BEFORE calling retirement, and the likeness's
  // early-return guard means a later poll never retries retirement, a thrown
  // rejection here used to be unrecoverable: prior likenesses stayed
  // non-superseded (leaking a paid slot) and, if one of them held the
  // default, the promotion never ran and generation stayed disabled forever.

  it("BUG 2: a throwing provider delete during retirement still supersedes prior rows, still promotes the default, and does not throw out of the action", async () => {
    vi.stubEnv("TAVUS_API_KEY", "test-key");
    const training = likeness({ id: "likeness-new", externalId: "face-new", status: "training" });
    vi.mocked(getAvatarLikenessById).mockResolvedValue(training);
    vi.mocked(getTavusFace).mockResolvedValue({
      faceId: "face-new",
      faceName: "My Likeness",
      status: "completed",
      trainingProgress: "100",
      errorMessage: null,
    });
    const priorDefault = likeness({ id: "likeness-prior", externalId: "face-prior", status: "ready", isDefault: true });
    vi.mocked(listSupersedableAvatarLikenesses).mockResolvedValue([priorDefault]);
    // Simulate the network blip: a rejected fetch(), not a resolved
    // { error } - exactly what the false comment claimed could never happen.
    vi.mocked(deleteTavusFace).mockRejectedValue(new Error("network blip"));

    const result = await refreshAvatarLikenessAction("likeness-new");

    // The action itself must not throw or surface this as a failure - the
    // likeness genuinely did finish training and is ready.
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.likeness.status).toBe("ready");
    }
    // Local bookkeeping still completes despite the provider-side failure.
    expect(markAvatarLikenessSuperseded).toHaveBeenCalledWith(expect.anything(), "likeness-prior");
    expect(setDefaultAvatarLikeness).toHaveBeenCalledWith(expect.anything(), OWNER.id, "likeness-new");
  });

  it("BUG 2: a throwing provider delete does not stop OTHER prior likenesses in the same batch from being superseded", async () => {
    vi.stubEnv("TAVUS_API_KEY", "test-key");
    const training = likeness({ id: "likeness-new", externalId: "face-new", status: "training" });
    vi.mocked(getAvatarLikenessById).mockResolvedValue(training);
    vi.mocked(getTavusFace).mockResolvedValue({
      faceId: "face-new",
      faceName: "My Likeness",
      status: "completed",
      trainingProgress: "100",
      errorMessage: null,
    });
    const failsToDelete = likeness({ id: "likeness-prior-a", externalId: "face-prior-a", status: "ready", isDefault: false });
    const deletesFine = likeness({ id: "likeness-prior-b", externalId: "face-prior-b", status: "ready", isDefault: false });
    vi.mocked(listSupersedableAvatarLikenesses).mockResolvedValue([failsToDelete, deletesFine]);
    vi.mocked(deleteTavusFace).mockImplementation(async (_key, faceId) => {
      if (faceId === "face-prior-a") throw new Error("network blip");
      return { ok: true };
    });

    const result = await refreshAvatarLikenessAction("likeness-new");

    expect("error" in result).toBe(false);
    expect(markAvatarLikenessSuperseded).toHaveBeenCalledWith(expect.anything(), "likeness-prior-a");
    expect(markAvatarLikenessSuperseded).toHaveBeenCalledWith(expect.anything(), "likeness-prior-b");
  });

  // ── THE OFF-BY-ONE GUARD ───────────────────────────────────────────────────
  it("NEVER retires the likeness that just became ready, even if it comes back in the supersedable list", async () => {
    vi.stubEnv("TAVUS_API_KEY", "test-key");
    const training = likeness({ id: "likeness-new", externalId: "face-new", status: "training" });
    vi.mocked(getAvatarLikenessById).mockResolvedValue(training);
    vi.mocked(getTavusFace).mockResolvedValue({
      faceId: "face-new",
      faceName: "My Likeness",
      status: "completed",
      trainingProgress: "100",
      errorMessage: null,
    });
    // Simulate the exclusion query somehow failing to exclude keepId - the
    // in-process guard must still catch it. This is exactly the off-by-one
    // the bug report warned would delete the avatar the user just waited
    // hours for.
    const self = likeness({ id: "likeness-new", externalId: "face-new", status: "ready" });
    const prior = likeness({ id: "likeness-prior", externalId: "face-prior", status: "ready" });
    vi.mocked(listSupersedableAvatarLikenesses).mockResolvedValue([self, prior]);

    await refreshAvatarLikenessAction("likeness-new");

    expect(markAvatarLikenessSuperseded).not.toHaveBeenCalledWith(expect.anything(), "likeness-new");
    expect(markAvatarLikenessSuperseded).toHaveBeenCalledWith(expect.anything(), "likeness-prior");
    expect(deleteTavusFace).not.toHaveBeenCalledWith("test-key", "face-new");
    expect(deleteTavusFace).toHaveBeenCalledWith("test-key", "face-prior");
  });
});

// ── F4: generateAvatarScriptAction takes a course + a purpose ──────────────
//
// composeAvatarScriptBrief (src/lib/avatar-video-purpose.ts) already has its
// own exhaustive unit tests for the pure brief-composition logic. What is
// under test here is the WIRING around it: does a courseId actually reach
// renderCourseFacts through an owner-scoped lookup, does a foreign courseId
// fail to leak another user's course, and does the composed brief actually
// reach callLlm's prompt text.

describe("generateAvatarScriptAction - course + purpose wiring", () => {
  it("loads the course by (ownerId, courseId) and its facts reach the LLM prompt", async () => {
    vi.mocked(getCourse).mockResolvedValue(fakeCourse());

    const result = await generateAvatarScriptAction({
      prompt: "Keep it brief.",
      courseId: "course-1",
      purpose: "welcome",
    });

    expect("error" in result).toBe(false);
    expect(getCourse).toHaveBeenCalledWith(OWNER.id, "course-1");

    const promptSent = promptTextFromCall();
    expect(promptSent).toContain("Intro to Databases");
    expect(promptSent).toContain("CS-220");
  });

  it("a courseId that does not belong to the caller does not leak into the brief", async () => {
    // getCourse itself is owner-scoped (it queries .eq("user_id", userId)
    // AND .eq("id", id)) - a course belonging to someone else comes back
    // null exactly like a nonexistent id, never an error and never another
    // user's row. This test fixes that contract at the call site: whatever
    // getCourse resolves to is what generateAvatarScriptAction must treat
    // as "no course," not surface as an error.
    vi.mocked(getCourse).mockResolvedValue(null);

    const result = await generateAvatarScriptAction({
      prompt: "Keep it brief.",
      courseId: "someone-elses-course",
      purpose: null,
    });

    expect("error" in result).toBe(false);
    expect(getCourse).toHaveBeenCalledWith(OWNER.id, "someone-elses-course");

    const promptSent = promptTextFromCall();
    expect(promptSent).not.toContain("Intro to Databases");
    expect(promptSent).not.toContain("CS-220");
  });

  it("the purpose's actual guidance text reaches the LLM prompt when a purpose is chosen - BUG 3: not just the raw enum value", async () => {
    // Asserting only `toContain("midterm")` would also pass against a
    // composeAvatarScriptBrief that merely emits the raw enum value (e.g.
    // "Purpose: midterm") - exactly the decorative-dropdown outcome this
    // picker exists to avoid (see avatar-video-purpose.ts's own header
    // comment: guidance "must stay SUBSTANTIVE and DISTINCT per purpose").
    // Look the guidance up from the real catalogue and require the actual
    // steering text in the prompt, not merely the label/value.
    const midterm = AVATAR_VIDEO_PURPOSES.find((p) => p.value === "midterm");
    if (!midterm) throw new Error("Test fixture assumption broken: 'midterm' is no longer in AVATAR_VIDEO_PURPOSES.");

    await generateAvatarScriptAction({ prompt: "Keep it brief.", courseId: null, purpose: "midterm" });

    const promptSent = promptTextFromCall();
    expect(promptSent).toContain(midterm.guidance);
  });

  it("works with no course and no purpose (both omitted)", async () => {
    const result = await generateAvatarScriptAction({ prompt: "Keep it brief." });

    expect("error" in result).toBe(false);
    expect(getCourse).not.toHaveBeenCalled();
  });

  it("works with no course and no purpose (both explicitly null)", async () => {
    const result = await generateAvatarScriptAction({ prompt: "Keep it brief.", courseId: null, purpose: null });

    expect("error" in result).toBe(false);
    expect(getCourse).not.toHaveBeenCalled();
  });
});

describe("listAvatarCourseOptionsAction", () => {
  it("returns the owner's courses as {id, label} with the course code paired to the name", async () => {
    vi.mocked(listCourses).mockResolvedValue([
      fakeCourse({ id: "course-1", name: "Intro to Databases", courseCode: "CS-220" }),
      fakeCourse({ id: "course-2", name: "Capstone", courseCode: null }),
    ]);

    const result = await listAvatarCourseOptionsAction();

    expect(result).toEqual({
      courses: [
        { id: "course-1", label: "CS-220 - Intro to Databases" },
        { id: "course-2", label: "Capstone" },
      ],
    });
  });
});

// ── F4 unmet AC: training_progress is persisted (display only) on poll ─────

describe("refreshAvatarLikenessAction - training_progress persistence", () => {
  it("persists Tavus's training_progress on a non-terminal poll", async () => {
    vi.stubEnv("TAVUS_API_KEY", "test-key");
    const training = likeness({ id: "likeness-new", externalId: "face-new", status: "training" });
    vi.mocked(getAvatarLikenessById).mockResolvedValue(training);
    vi.mocked(getTavusFace).mockResolvedValue({
      faceId: "face-new",
      faceName: "My Likeness",
      status: "started",
      trainingProgress: "42/100",
      errorMessage: null,
    });

    const result = await refreshAvatarLikenessAction("likeness-new");

    expect("error" in result).toBe(false);
    expect(updateAvatarLikeness).toHaveBeenCalledWith(
      expect.anything(),
      "likeness-new",
      expect.objectContaining({ trainingProgress: "42/100" })
    );
    if (!("error" in result)) {
      expect(result.likeness.trainingProgress).toBe("42/100");
    }
  });

  it("does not use training_progress to decide success/failure - only face.status matters", async () => {
    vi.stubEnv("TAVUS_API_KEY", "test-key");
    // The row already stored "42/100" from a PRIOR poll, and this poll's
    // face.trainingProgress comes back as the exact same "42/100" -
    // legitimately unchanged while a step processes, per the Tavus FAQ. The
    // status is still non-terminal, so this must stay "training," never be
    // read as a stall just because the progress figure did not move.
    const training = likeness({
      id: "likeness-new",
      externalId: "face-new",
      status: "training",
      trainingProgress: "42/100",
    });
    vi.mocked(getAvatarLikenessById).mockResolvedValue(training);
    vi.mocked(getTavusFace).mockResolvedValue({
      faceId: "face-new",
      faceName: "My Likeness",
      status: "started",
      trainingProgress: "42/100",
      errorMessage: null,
    });

    const result = await refreshAvatarLikenessAction("likeness-new");

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.likeness.status).toBe("training");
    }
  });
});
