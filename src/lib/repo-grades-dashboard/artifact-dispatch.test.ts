import { beforeEach, expect, it, vi } from "vitest";
import { artifactManifestDigest, beginArtifactDispatch, findArtifactResume, finishArtifactDispatch, recordArtifactSandbox } from "./artifact-dispatch";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), retry: vi.fn(), owner: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: mocks.owner }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc: mocks.rpc }) }));
const input = { claim: { mode: "automatic" as const, generation: 5, token: "token" }, run: {runId:"run",lease:"lease"},
  sourceSha:"a".repeat(40),path:"lab/app.exe",artifactSha256:"b".repeat(64),manifestSha256:"c".repeat(64) };

beforeEach(() => { vi.resetAllMocks(); mocks.owner.mockResolvedValue({id:"owner"}); mocks.rpc.mockReturnValue({retry:mocks.retry}); });

it("hashes a canonical manifest and rejects collisions and traversal", () => {
  const a = {path:"lab/a",sha256:"a".repeat(64)}, b = {path:"lab/b",sha256:"b".repeat(64)};
  expect(artifactManifestDigest([a,b])).toBe(artifactManifestDigest([b,a]));
  expect(artifactManifestDigest([a,b])).not.toBe(artifactManifestDigest([a,{...b,sha256:"c".repeat(64)}]));
  expect(() => artifactManifestDigest([a,{...a,path:"LAB/A"}])).toThrow();
  expect(() => artifactManifestDigest([{...a,path:"lab/../a"}])).toThrow();
});

it("supports the pinned reader's 200-file bound and rejects more", () => {
  const files = Array.from({ length: 200 }, (_, index) => ({ path: `lab/file${index}.txt`, sha256: "a".repeat(64) }));
  expect(artifactManifestDigest(files)).toMatch(/^[a-f0-9]{64}$/);
  expect(() => artifactManifestDigest([...files, { path: "lab/extra.txt", sha256: "b".repeat(64) }])).toThrow();
});

it("does not retry an ambiguous dispatch admission", async () => {
  mocks.retry.mockRejectedValue(new Error("lost response"));
  await expect(beginArtifactDispatch(input)).rejects.toThrow("lost response");
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.retry).toHaveBeenCalledWith(false);
});

it("exposes uncertain prior dispatch without treating it as a new start", async () => {
  mocks.retry.mockResolvedValue({data:{status:"unknown"},error:null});
  await expect(beginArtifactDispatch(input)).resolves.toEqual({status:"unknown"});
  expect(mocks.rpc).toHaveBeenCalledWith("repo_grade_begin_artifact_dispatch", expect.objectContaining({
    p_user_id:"owner",p_generation:5,p_run_id:"run",p_lease:"lease",p_path:"lab/app.exe",
  }));
});

it("only asks to reuse a previous generation when recovery explicitly supplies it", async () => {
  mocks.retry.mockResolvedValue({data:{status:"completed",receipt:{path:input.path}},error:null});
  await expect(beginArtifactDispatch({...input,resumeGeneration:3})).resolves.toEqual({status:"completed",receipt:{path:input.path}});
  expect(mocks.rpc).toHaveBeenCalledWith("repo_grade_begin_artifact_dispatch",expect.objectContaining({p_resume_generation:3}));
  mocks.retry.mockResolvedValue({data:{status:"started"},error:null});
  await beginArtifactDispatch(input);
  expect(mocks.rpc).toHaveBeenLastCalledWith("repo_grade_begin_artifact_dispatch",expect.objectContaining({p_resume_generation:null}));
});

it("records provider identity and completion with one non-retrying write each", async () => {
  mocks.retry.mockResolvedValue({data:true,error:null});
  await expect(recordArtifactSandbox(input,"sbx_1")).resolves.toBe(true);
  await expect(finishArtifactDispatch(input,{path:input.path})).resolves.toBe(true);
  expect(mocks.retry).toHaveBeenCalledTimes(2);
  expect(mocks.retry).toHaveBeenNthCalledWith(1,false);
  expect(mocks.retry).toHaveBeenNthCalledWith(2,false);
});

it("rejects resume generations that are not older than the active claim", async () => {
  mocks.retry.mockResolvedValue({data:5,error:null});
  await expect(findArtifactResume(input)).rejects.toThrow("Invalid artifact resume response");
  mocks.retry.mockResolvedValue({data:3,error:null});
  await expect(findArtifactResume(input)).resolves.toBe(3);
});
