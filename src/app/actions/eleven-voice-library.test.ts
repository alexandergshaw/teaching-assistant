import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actionAuthClient, actionAuthUser } from "./action-auth.fixtures";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";
import {
  auditionElevenVoiceAction, cloneElevenVoiceAction, deleteElevenVoiceAction, designElevenVoiceAction,
  listElevenVoiceLibraryAction, saveDesignedElevenVoiceAction, setDefaultElevenVoiceAction, updateElevenVoiceAction,
} from "./eleven-voice-library";

const mocks = vi.hoisted(() => ({
  accountRole: vi.fn<() => "owner" | "instructor">(), from: vi.fn(), read: vi.fn(),
  referenced: vi.fn(), upsert: vi.fn(), synthesize: vi.fn(), fetch: vi.fn<typeof fetch>(),
  clearDefault: vi.fn(), clearFilter: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => actionAuthClient(() => ({ id: "owner" })),
  createServiceClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/supabase/app-users", async (original) => ({
  ...await original<typeof import("@/lib/supabase/app-users")>(),
  getAppUser: async (id: string) => actionAuthUser(id, mocks.accountRole()),
}));
vi.mock("./media-voice", () => ({ synthesizeNarrationAction: mocks.synthesize }));

const voice = { voice_id: "voice_private", name: "My voice", category: "generated", is_owner: true };
const pendingVoice = { ...voice, voice_verification: { requires_verification: true, is_verified: false } };
const description = "A clear, steady speaking tone for software demonstrations.";
function sampleForm(consent = true): FormData {
  const form = new FormData();
  if (consent) form.set("consent", "true");
  form.set("name", " My voice ");
  form.append("files", new File(["audio"], "voice.mp3", { type: "audio/mpeg" }));
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  vi.stubEnv("ELEVENLABS_VOICE_ID", "configured_voice");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.accountRole.mockReturnValue("owner");
  mocks.read.mockResolvedValue({ data: null, error: null });
  mocks.referenced.mockResolvedValue({ data: [], error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.clearFilter.mockResolvedValue({ error: null });
  mocks.clearDefault.mockReturnValue({ eq: (key: string, value: unknown) => ({
    is: (column: string, expected: unknown) => Object.assign(mocks.clearFilter([[key, value], [column, expected]]), {
      eq: (ownerColumn: string, ownerId: string) => mocks.clearFilter([[key, value], [column, expected], [ownerColumn, ownerId]]),
    }),
  }) });
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: mocks.read, limit: mocks.referenced }) }), upsert: mocks.upsert, update: mocks.clearDefault });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ElevenLabs voice library", () => {
  it("does not let a signed-in instructor read, synthesize, create, update, delete, or set defaults", async () => {
    mocks.accountRole.mockReturnValue("instructor");
    const outcomes = await Promise.all([
      listElevenVoiceLibraryAction(), auditionElevenVoiceAction(voice.voice_id), cloneElevenVoiceAction(sampleForm()),
      designElevenVoiceAction(description), saveDesignedElevenVoiceAction("preview", "Voice", description),
      updateElevenVoiceAction(voice.voice_id, "Voice", ""), deleteElevenVoiceAction(voice.voice_id), setDefaultElevenVoiceAction(voice.voice_id),
    ]);
    expect(outcomes).toHaveLength(8);
    for (const outcome of outcomes) expect(outcome).toHaveProperty("error", expect.stringContaining("workspace owner"));
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });

  it("loads all provider pages and exposes verification and ownership without returning private provider metadata", async () => {
    const stock = { voice_id: "stock", name: "Stock", category: "premade", is_owner: true, samples: [{ sample_id: "private-boundary" }] };
    mocks.fetch.mockResolvedValueOnce(Response.json({ voices: [stock], has_more: true, next_page_token: "xyz" }))
      .mockResolvedValueOnce(Response.json({ voices: [pendingVoice], has_more: false }));
    expect(await listElevenVoiceLibraryAction()).toEqual({
      voices: [
        { voiceId: "stock", name: "Stock", category: "premade", description: "", labels: {}, manageable: false, verificationRequired: false },
        { voiceId: voice.voice_id, name: voice.name, category: "generated", description: "", labels: {}, manageable: true, verificationRequired: true },
      ], defaultVoiceId: "configured_voice", hasAccountDefault: false,
    });
    expect(String(mocks.fetch.mock.calls[1][0])).toContain("next_page_token=xyz");
    expect(new Headers(mocks.fetch.mock.calls[0][1]?.headers).get("xi-api-key")).toBe("test-key");
  });

  it("rejects unverified voices and reuses existing synthesis for a limited owner preview", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json(pendingVoice)).mockResolvedValueOnce(Response.json(voice));
    expect(await auditionElevenVoiceAction(voice.voice_id)).toHaveProperty("error", expect.stringContaining("verification"));
    expect(mocks.synthesize).not.toHaveBeenCalled();
    mocks.synthesize.mockResolvedValue({ base64: "AQID", mimeType: "audio/mpeg" });
    expect(await auditionElevenVoiceAction(voice.voice_id, " Hello ")).toEqual({ base64: "AQID", mimeType: "audio/mpeg" });
    expect(mocks.synthesize).toHaveBeenCalledExactlyOnceWith("Hello", voice.voice_id);
  });

  it("rejects missing consent and oversized multipart samples without contacting the provider", async () => {
    expect(await cloneElevenVoiceAction(sampleForm(false))).toHaveProperty("error", expect.stringContaining("permission"));
    const oversized = sampleForm();
    oversized.append("files", new File([new Uint8Array(UPLOAD_WIRE_BUDGET_BYTES)], "extra.wav", { type: "audio/wav" }));
    expect(await cloneElevenVoiceAction(oversized)).toHaveProperty("error", expect.stringContaining("upload limit"));
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("uploads samples directly and reports verification without replacing a voice or a default", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ voice_id: voice.voice_id, requires_verification: true }));
    expect(await cloneElevenVoiceAction(sampleForm())).toEqual({ voiceId: voice.voice_id, verificationRequired: true });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    const [url, request] = mocks.fetch.mock.lastCall!;
    expect(url).toBe("https://api.elevenlabs.io/v1/voices/add");
    expect(request?.method).toBe("POST");
    const body = request?.body as FormData;
    expect(body.get("name")).toBe("My voice");
    expect(body.has("consent")).toBe(false);
    expect((body.get("files") as File).name).toBe("voice.mp3");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("designs previews and saves the specific generated ID selected by the owner", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ previews: [{ generated_voice_id: "preview_2", audio_base_64: "AQID", duration_secs: 1.2 }] }))
      .mockResolvedValueOnce(Response.json(voice));
    expect(await designElevenVoiceAction(description)).toEqual({ previews: [{ generatedVoiceId: "preview_2", base64: "AQID", mimeType: "audio/mpeg", durationSec: 1.2 }] });
    expect(await saveDesignedElevenVoiceAction("preview_2", " My voice ", description)).toEqual({ voiceId: voice.voice_id });
    expect(mocks.fetch.mock.calls[0][0]).toBe("https://api.elevenlabs.io/v1/text-to-voice/design?output_format=mp3_22050_32");
    expect(JSON.parse(String(mocks.fetch.mock.calls[0][1]?.body))).toEqual({ voice_description: description, auto_generate_text: true });
    expect(JSON.parse(String(mocks.fetch.mock.calls[1][1]?.body))).toEqual({ voice_name: "My voice", voice_description: description, generated_voice_id: "preview_2" });
  });

  it("verifies live ownership before applying only name and description updates", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ voices: [{ ...voice, is_owner: false }, { ...voice, voice_id: "different_owned_voice" }] }))
      .mockResolvedValueOnce(Response.json({ voices: [voice] }))
      .mockResolvedValueOnce(Response.json({ status: "ok" }));
    expect(await updateElevenVoiceAction(voice.voice_id, "Name", "Description")).toHaveProperty("error", expect.stringContaining("owned"));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(await updateElevenVoiceAction(voice.voice_id, "Name", "Description")).toEqual({ ok: true });
    const ownershipUrl = new URL(String(mocks.fetch.mock.calls[1][0]));
    expect(ownershipUrl.pathname).toBe("/v2/voices");
    expect(ownershipUrl.searchParams.get("voice_ids")).toBe(voice.voice_id);
    const [url, request] = mocks.fetch.mock.lastCall!;
    expect(url).toBe(`https://api.elevenlabs.io/v1/voices/${voice.voice_id}/edit`);
    expect([...((request?.body as FormData).entries())]).toEqual([["name", "Name"], ["description", "Description"]]);
  });

  it("adds labels and explicitly consented samples only to a manageable instant clone", async () => {
    const noConsent = sampleForm(false);
    expect(await updateElevenVoiceAction(voice.voice_id, "Name", "Description", noConsent)).toHaveProperty("error", expect.stringContaining("permission"));
    expect(mocks.fetch).not.toHaveBeenCalled();
    const extras = sampleForm();
    extras.set("labels", '{"accent":"American"}');
    mocks.fetch.mockResolvedValueOnce(Response.json({ voices: [voice] }));
    expect(await updateElevenVoiceAction(voice.voice_id, "Name", "Description", extras)).toHaveProperty("error", expect.stringContaining("instant voice clones"));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    mocks.fetch.mockResolvedValueOnce(Response.json({ voices: [{ ...voice, category: "cloned" }] })).mockResolvedValueOnce(Response.json({ status: "ok" }));
    expect(await updateElevenVoiceAction(voice.voice_id, "Name", "Description", extras)).toEqual({ ok: true });
    const body = mocks.fetch.mock.lastCall?.[1]?.body as FormData;
    expect(body.get("labels")).toBe('{"accent":"American"}');
    expect((body.get("files") as File).name).toBe("voice.mp3");
    expect(body.has("consent")).toBe(false);
  });

  it("protects configured and stored defaults and fails closed when the default lookup fails", async () => {
    mocks.fetch.mockImplementation(async () => Response.json({ voices: [voice] }));
    expect(await deleteElevenVoiceAction("configured_voice")).toHaveProperty("error", expect.stringContaining("workspace default"));
    mocks.referenced.mockResolvedValueOnce({ data: [{ user_id: "any-user" }], error: null }).mockResolvedValueOnce({ data: null, error: { message: "down" } });
    expect(await deleteElevenVoiceAction(voice.voice_id)).toHaveProperty("error", expect.stringContaining("saved default"));
    expect(await deleteElevenVoiceAction(voice.voice_id)).toHaveProperty("error", expect.stringContaining("No voice was deleted"));
    expect(mocks.fetch.mock.calls.map(([, request]) => request?.method)).not.toContain("DELETE");
    mocks.fetch.mockResolvedValueOnce(Response.json({ voices: [voice] })).mockResolvedValueOnce(Response.json({ status: "ok" }));
    expect(await deleteElevenVoiceAction(voice.voice_id)).toEqual({ ok: true });
    expect(mocks.fetch.mock.lastCall?.[1]?.method).toBe("DELETE");
    expect(mocks.clearFilter).toHaveBeenLastCalledWith([["voice_id", voice.voice_id], ["voice_sample_path", null]]);
  });

  it("reports confirmed provider deletion even when a raced default cannot be reconciled", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ voices: [voice] })).mockResolvedValueOnce(Response.json({ status: "ok" }));
    mocks.clearFilter.mockResolvedValueOnce({ error: { message: "unavailable" } });
    expect(await deleteElevenVoiceAction(voice.voice_id)).toEqual({ ok: true, warning: expect.stringContaining("could not be reconciled") });
  });

  it("writes defaults only after provider validation and does not mark them as legacy sample clones", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json(pendingVoice)).mockResolvedValueOnce(Response.json(voice)).mockResolvedValueOnce(Response.json(voice));
    expect(await setDefaultElevenVoiceAction(voice.voice_id)).toHaveProperty("error", expect.stringContaining("verification"));
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(await setDefaultElevenVoiceAction(voice.voice_id)).toEqual({ ok: true });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "owner", voice_id: voice.voice_id, voice_sample_path: null, voice_sample_name: null }), { onConflict: "user_id" });
    mocks.read.mockResolvedValue({ data: { voice_id: voice.voice_id }, error: null });
    expect(await setDefaultElevenVoiceAction(null)).toEqual({ ok: true });
    expect(mocks.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ user_id: "owner", voice_id: null, voice_sample_path: null, voice_sample_name: null }), { onConflict: "user_id" });
    expect(mocks.fetch.mock.calls.map(([, request]) => request?.method)).not.toContain("DELETE");
  });

  it("compare-clears only the just-selected voice when deletion races the account save", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json(voice)).mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await setDefaultElevenVoiceAction(voice.voice_id)).toHaveProperty("error", expect.stringContaining("deleted while you selected it"));
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.clearFilter).toHaveBeenLastCalledWith([["voice_id", voice.voice_id], ["voice_sample_path", null], ["user_id", "owner"]]);
  });
});
