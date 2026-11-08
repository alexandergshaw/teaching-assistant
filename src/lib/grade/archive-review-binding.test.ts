import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { snapshotReviewArchive } from "./archive-review-snapshot";
import { planOwnedArchiveReview, type ArchiveReviewDependencies, type StoredArchiveReview } from "./archive-review-binding";

const OWNER = "11111111-1111-4111-8111-111111111111";
const AUTH = "22222222-2222-4222-8222-222222222222";
const REVIEW = "33333333-3333-4333-8333-333333333333";
const GRADING = "44444444-4444-4444-8444-444444444444";
const FILE = "55555555-5555-4555-8555-555555555555";
const NOW = 1_000_000;

async function fixture() {
  const bytes = await new JSZip().file("ada.txt", "Ada's work", { createFolders: false }).generateAsync({ type: "uint8array", compression: "STORE" });
  const record: StoredArchiveReview = { reviewId: REVIEW, ownerId: OWNER, authSessionId: AUTH, gradingSessionId: GRADING, storagePath: `${OWNER}/grading-uploads/${FILE}.zip`, snapshot: snapshotReviewArchive(bytes), createdAtMs: NOW - 10, expiresAtMs: NOW + 1000 };
  const deps: ArchiveReviewDependencies = { authenticate: vi.fn().mockResolvedValue({ ownerId: OWNER, authSessionId: AUTH }), readOwnedReview: vi.fn().mockResolvedValue(record), readPrivateSource: vi.fn().mockResolvedValue(bytes), now: () => NOW };
  const input = { reviewId: REVIEW, gradingSessionId: GRADING, assignments: [{ memberId: "0", studentKey: "ada", studentLabel: "Ada" }] };
  return { bytes, record, deps, input };
}

describe("owner-bound archive review", () => {
  it("rechecks the same owner and auth session and returns only a candidate plan", async () => {
    const { deps, input, record } = await fixture();
    expect(await planOwnedArchiveReview(input, deps)).toEqual({ ok: true, plan: { ok: true, admitted: [{ studentKey: "ada", studentLabel: "Ada", memberIds: ["0"] }], blocked: [] } });
    expect(deps.authenticate).toHaveBeenCalledTimes(2);
    expect(deps.readOwnedReview).toHaveBeenCalledWith(OWNER, REVIEW);
    expect(deps.readPrivateSource).toHaveBeenCalledWith(record.storagePath, expect.any(Number));
  });

  it("refuses mismatched owner, auth session, grading session, path and expiry before source download", async () => {
    const { deps, input, record } = await fixture();
    for (const changed of [
      { ownerId: AUTH }, { authSessionId: OWNER }, { gradingSessionId: REVIEW },
      { storagePath: `${AUTH}/grading-uploads/${FILE}.zip` }, { storagePath: `${OWNER}/syllabus-uploads/${FILE}.zip` },
      { storagePath: `${OWNER}/grading-uploads/../${FILE}.zip` }, { expiresAtMs: NOW }, { createdAtMs: NOW + 1 },
    ]) {
      vi.mocked(deps.readOwnedReview).mockResolvedValueOnce({ ...record, ...changed });
      expect((await planOwnedArchiveReview(input, deps)).ok).toBe(false);
    }
    expect(deps.readPrivateSource).not.toHaveBeenCalled();
  });

  it("refuses a replaced source or a session change while reading", async () => {
    const { deps, input, bytes } = await fixture();
    const changed = bytes.slice(); changed[30 + "ada.txt".length] ^= 1;
    vi.mocked(deps.readPrivateSource).mockResolvedValueOnce(changed);
    expect((await planOwnedArchiveReview(input, deps)).ok).toBe(false);
    vi.mocked(deps.authenticate).mockResolvedValueOnce({ ownerId: OWNER, authSessionId: AUTH }).mockResolvedValueOnce({ ownerId: OWNER, authSessionId: REVIEW });
    expect((await planOwnedArchiveReview(input, deps)).ok).toBe(false);
  });

  it("captures assignments before storage awaits and refuses a review that expires while loading", async () => {
    const { deps, input, bytes } = await fixture();
    let release!: (value: Uint8Array) => void;
    vi.mocked(deps.readPrivateSource).mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const pending = planOwnedArchiveReview(input, deps);
    await vi.waitFor(() => expect(deps.readPrivateSource).toHaveBeenCalled());
    input.assignments[0].studentLabel = "Changed after review";
    release(bytes);
    const result = await pending;
    expect(result.ok && result.plan.ok && result.plan.admitted[0].studentLabel).toBe("Ada");
    const clock = vi.fn().mockReturnValueOnce(NOW).mockReturnValueOnce(NOW + 1000);
    expect((await planOwnedArchiveReview(input, { ...deps, now: clock })).ok).toBe(false);
  });

  it("captures the authenticated principal before awaiting the record store", async () => {
    const { deps, input, record } = await fixture();
    const principal = { ownerId: OWNER, authSessionId: AUTH };
    vi.mocked(deps.authenticate).mockResolvedValue(principal);
    let release!: (value: StoredArchiveReview) => void;
    vi.mocked(deps.readOwnedReview).mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const pending = planOwnedArchiveReview(input, deps);
    await vi.waitFor(() => expect(deps.readOwnedReview).toHaveBeenCalled());
    principal.ownerId = AUTH;
    release({ ...record, ownerId: AUTH });
    expect((await pending).ok).toBe(false);
    expect(deps.readPrivateSource).not.toHaveBeenCalled();
  });
});
