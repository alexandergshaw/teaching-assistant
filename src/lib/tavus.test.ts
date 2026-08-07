// TDD - written from the AC BEFORE implementation (avatar-likeness work item).
// These encode the Tavus contract researched against the live docs on
// 2026-08-06. They currently FAIL because src/lib/tavus.ts does not exist yet.
//
// Make them pass without changing what they assert. If you believe one of these
// is wrong, report it rather than editing it - a wrong test here is a planning
// defect that needs to come back to the planner.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TAVUS_BASE,
  TAVUS_TRAIN_URL_TTL_SECONDS,
  TAVUS_TRAINING_ERROR_CODES,
  isTavusTerminalSuccess,
  isTavusTerminalFailure,
  isTavusTerminal,
  describeTavusTrainingError,
  createTavusFace,
  getTavusFace,
  createTavusVideo,
  getTavusVideo,
  deleteTavusFace,
} from "./tavus";

const KEY = "test-key-123";

type Call = { url: string; init: RequestInit };
let calls: Call[];

const mockJson = (body: unknown, ok = true, status = 200) => {
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return {
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const bodyOf = (c: Call): Record<string, unknown> =>
  JSON.parse(String(c.init.body ?? "{}")) as Record<string, unknown>;

// Read headers through the Headers API rather than Object.keys, so the
// implementation stays free to pass an object literal, a Headers instance, or
// a [k,v][] - all three are valid RequestInit.headers and none of them is a
// contract we care about.
const headersOf = (c: Call): Headers => new Headers((c.init.headers ?? {}) as HeadersInit);

const postsTo = (url: string) =>
  calls.filter((c) => c.url === url && String(c.init.method).toUpperCase() === "POST");

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Tavus constants", () => {
  it("targets the documented API host", () => {
    expect(TAVUS_BASE).toBe("https://tavusapi.com");
  });

  it("keeps the training URL alive well past the documented 24h minimum", () => {
    // Tavus documents 24h as the FLOOR; training itself runs 3-4h and the docs
    // never say whether they re-fetch. 48h is the deliberate choice.
    expect(TAVUS_TRAIN_URL_TTL_SECONDS).toBeGreaterThanOrEqual(24 * 3600);
    expect(TAVUS_TRAIN_URL_TTL_SECONDS).toBe(48 * 3600);
  });
});

describe("terminal status handling", () => {
  it("accepts BOTH documented success strings", () => {
    // The GET returns "completed"; the webhook shape returns "ready".
    // Switching on only one of these is a real, documented way to hang forever.
    expect(isTavusTerminalSuccess("completed")).toBe(true);
    expect(isTavusTerminalSuccess("ready")).toBe(true);
  });

  it("does not treat in-flight states as success", () => {
    for (const s of ["started", "queued", "generating", "training"]) {
      expect(isTavusTerminalSuccess(s)).toBe(false);
      expect(isTavusTerminalFailure(s)).toBe(false);
      expect(isTavusTerminal(s), `${s} must keep polling`).toBe(false);
    }
  });

  it("recognises the failure state", () => {
    expect(isTavusTerminalFailure("error")).toBe(true);
    expect(isTavusTerminalSuccess("error")).toBe(false);
  });

  it("stops polling on EVERY terminal state, including 'deleted'", () => {
    // "deleted" is a documented video status. It is neither success nor a
    // failure of ours, but it is terminal - if the poll loop only knows
    // success/error it will poll a deleted video until the tab closes.
    for (const s of ["completed", "ready", "error", "deleted"]) {
      expect(isTavusTerminal(s), `${s} is terminal`).toBe(true);
    }
  });

  it("is case-insensitive and whitespace tolerant", () => {
    expect(isTavusTerminalSuccess(" Completed ")).toBe(true);
    expect(isTavusTerminalFailure("ERROR")).toBe(true);
  });
});

describe("training error messages", () => {
  it("knows every failure code Tavus documents", () => {
    // A 3-4 hour round trip makes a vague error expensive. The full list is
    // exported so this test cannot drift from the implementation's own idea of
    // which codes it handles.
    expect(new Set(TAVUS_TRAINING_ERROR_CODES)).toEqual(
      new Set([
        "video_format",
        "video_codec",
        "file_size",
        "video_duration",
        "video_fps",
        "poor_lighting",
        "teeth_not_visible",
        "improper_camera_angle",
        "face_turned_away",
        "excessive_movement_detected",
        "hands_obstructing_face",
        "second_person_detected",
        "video_editing_detected",
        "background_noise_detected",
        "community_guidelines_violation",
      ])
    );
  });

  it("turns every documented failure code into plain language, not raw codes", () => {
    for (const code of TAVUS_TRAINING_ERROR_CODES) {
      const msg = describeTavusTrainingError(code, null);
      expect(msg, `${code} should map to prose`).toBeTruthy();
      // The user must never just be shown the snake_case code back.
      expect(msg).not.toBe(code);
      expect(msg.toLowerCase()).not.toContain("_");
    }
  });

  it("gives each code a DISTINCT message", () => {
    // Without this, one canned "Training failed, please try again." for every
    // code satisfies every other assertion in this block - which is exactly the
    // collapse the AC exists to prevent.
    const msgs = TAVUS_TRAINING_ERROR_CODES.map((c) => describeTavusTrainingError(c, null));
    expect(new Set(msgs).size).toBe(TAVUS_TRAINING_ERROR_CODES.length);
  });

  it("tells the user what to actually DO about the fixable ones", () => {
    // These are the codes a user can act on by re-recording. A message that
    // only names the problem wastes the 3-4 hour round trip it cost to learn it.
    for (const code of ["poor_lighting", "face_turned_away", "second_person_detected"]) {
      expect(describeTavusTrainingError(code, null).length).toBeGreaterThan(30);
    }
  });

  it("falls back to the provider's raw message for an unknown code", () => {
    const msg = describeTavusTrainingError("some_new_code", "Something specific went wrong");
    expect(msg).toContain("Something specific went wrong");
  });

  it("still says something useful when both code and message are missing", () => {
    expect(describeTavusTrainingError(null, null).trim().length).toBeGreaterThan(0);
  });
});

describe("createTavusFace", () => {
  it("posts to /v2/faces with the x-api-key header", async () => {
    mockJson({ face_id: "r90bbd427f71", status: "started" });
    await createTavusFace(KEY, { trainVideoUrl: "https://signed.example/v.mp4", faceName: "Me" });

    // At least one POST, not exactly one - retry/backoff stays permitted.
    expect(postsTo("https://tavusapi.com/v2/faces").length).toBeGreaterThanOrEqual(1);
    // Lowercase x-api-key is what Tavus documents - not Bearer, not X-Api-Key.
    const h = headersOf(calls[0]);
    expect(h.get("x-api-key")).toBe(KEY);
    expect(h.get("authorization")).toBeNull();
  });

  it("sends the training URL and never sends the legacy consent field", async () => {
    mockJson({ face_id: "f1", status: "started" });
    await createTavusFace(KEY, { trainVideoUrl: "https://signed.example/v.mp4", faceName: "Me" });

    const b = bodyOf(calls[0]);
    expect(b.train_video_url).toBe("https://signed.example/v.mp4");
    expect(b.face_name).toBe("Me");
    // consent_video_url is documented Legacy: "new integrations should not send
    // this field". callback_url is deliberately unused (no signature scheme).
    expect(b).not.toHaveProperty("consent_video_url");
    expect(b).not.toHaveProperty("callback_url");
  });

  it("pins the training model explicitly instead of drifting with their default", async () => {
    mockJson({ face_id: "f1", status: "started" });
    await createTavusFace(KEY, { trainVideoUrl: "https://x/v.mp4", faceName: "Me" });
    expect(bodyOf(calls[0]).model_name).toBe("phoenix-4");
  });

  it("returns the face id and status, and NOT an error", async () => {
    mockJson({ face_id: "r90bbd427f71", status: "started" });
    const r = await createTavusFace(KEY, { trainVideoUrl: "https://x/v.mp4", faceName: "Me" });
    expect(r).toMatchObject({ faceId: "r90bbd427f71", status: "started" });
    // toMatchObject alone would tolerate an error key riding along.
    expect(r).not.toHaveProperty("error");
  });

  it("surfaces an API error instead of throwing", async () => {
    mockJson({ error: "Either train_video_url or train_image_url must be provided." }, false, 400);
    const r = await createTavusFace(KEY, { trainVideoUrl: "", faceName: "Me" });
    expect(r).toHaveProperty("error");
  });
});

describe("getTavusFace", () => {
  it("polls the verbose face endpoint", async () => {
    mockJson({ face_id: "f1", status: "completed", training_progress: "100/100", error_message: null });
    await getTavusFace(KEY, "f1");
    expect(calls[0].url).toContain("https://tavusapi.com/v2/faces/f1");
    expect(calls[0].url).toContain("verbose=true");
  });

  it("maps the response onto camelCase fields", async () => {
    mockJson({
      face_id: "f1",
      face_name: "Me",
      status: "completed",
      training_progress: "100/100",
      error_message: null,
    });
    const r = await getTavusFace(KEY, "f1");
    expect(r).toMatchObject({ faceId: "f1", status: "completed", trainingProgress: "100/100" });
  });

  it("url-encodes the face id", async () => {
    mockJson({ face_id: "a/b", status: "started" });
    await getTavusFace(KEY, "a/b");
    expect(calls[0].url).not.toContain("/faces/a/b?");
    expect(calls[0].url).toContain("a%2Fb");
  });
});

describe("createTavusVideo - THE face_id/replica_id TRAP", () => {
  it("sends the face id under the key replica_id, NOT face_id", async () => {
    mockJson({ video_id: "v1", status: "queued", hosted_url: "https://h" });
    await createTavusVideo(KEY, { faceId: "r90bbd427f71", script: "Hello there.", videoName: "Intro" });

    const b = bodyOf(calls[0]);
    // The OpenAPI spec names ONLY replica_id on this endpoint, even though the
    // value comes back from /v2/faces as face_id. This is the single most
    // likely 400 in the whole integration.
    expect(b.replica_id).toBe("r90bbd427f71");
    expect(b).not.toHaveProperty("face_id");
    expect(b.script).toBe("Hello there.");
  });

  it("posts to /v2/videos", async () => {
    mockJson({ video_id: "v1", status: "queued" });
    await createTavusVideo(KEY, { faceId: "f1", script: "hi", videoName: "n" });
    expect(calls[0].url).toBe("https://tavusapi.com/v2/videos");
    expect(calls[0].init.method).toBe("POST");
  });

  it("refuses an empty script before spending a network call", async () => {
    const f = mockJson({ video_id: "v1", status: "queued" });
    const r = await createTavusVideo(KEY, { faceId: "f1", script: "   ", videoName: "n" });
    expect(r).toHaveProperty("error");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("getTavusVideo", () => {
  it("polls the verbose video endpoint and exposes download_url", async () => {
    mockJson({ video_id: "v1", status: "ready", download_url: "https://dl/v.mp4", hosted_url: "https://h" });
    const r = await getTavusVideo(KEY, "v1");
    expect(calls[0].url).toContain("https://tavusapi.com/v2/videos/v1");
    expect(calls[0].url).toContain("verbose=true");
    expect(r).toMatchObject({ videoId: "v1", status: "ready", downloadUrl: "https://dl/v.mp4" });
  });

  it("leaves downloadUrl null while the render is still queued", async () => {
    mockJson({ video_id: "v1", status: "generating", generation_progress: "40/100" });
    const r = await getTavusVideo(KEY, "v1");
    expect(r).toMatchObject({ status: "generating", downloadUrl: null });
  });
});

describe("deleteTavusFace", () => {
  it("issues a DELETE against the face", async () => {
    mockJson({});
    await deleteTavusFace(KEY, "f1");
    expect(calls[0].url).toContain("https://tavusapi.com/v2/faces/f1");
    expect(calls[0].init.method).toBe("DELETE");
  });

  it("treats an already-gone face as success, not an error", async () => {
    // Deleting a likeness must not fail just because the provider already
    // dropped it - the local row still needs to go.
    mockJson({ error: "Invalid face_id" }, false, 404);
    const r = await deleteTavusFace(KEY, "gone");
    expect(r).not.toHaveProperty("error");
  });

  it("still surfaces a genuine server failure", async () => {
    // Without this, "swallow every non-2xx" passes the 404 test above while
    // hiding real outages.
    mockJson({ message: "boom" }, false, 500);
    const r = await deleteTavusFace(KEY, "f1");
    expect(r).toHaveProperty("error");
  });
});
