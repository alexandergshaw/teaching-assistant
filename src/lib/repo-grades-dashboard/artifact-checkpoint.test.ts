import { beforeEach, expect, it, vi } from "vitest";
import { ArtifactBudgetDeferredError, ArtifactDispatchUncertainError, runCheckpointedArtifact } from "./artifact-checkpoint";
import { beginArtifactDispatch, finishArtifactDispatch, recordArtifactSandbox } from "./artifact-dispatch";
import { validGeneralExecutionEvidence } from "@/lib/grade/general-execution-evidence";

vi.mock("./artifact-dispatch", async (load) => ({ ...await load<typeof import("./artifact-dispatch")>(),
  beginArtifactDispatch: vi.fn(), recordArtifactSandbox: vi.fn(), finishArtifactDispatch: vi.fn() }));
const path="lab/app.exe", sha="a".repeat(64), signal=new AbortController().signal;
const identity={claim:{mode:"retry" as const,generation:7,token:"token"},run:{runId:"run",lease:"lease"},sourceSha:"b".repeat(40),path,artifactSha256:sha};
const receipt={path,sha256:sha};
const validateReceipt=(value:unknown):value is typeof receipt => !!value && typeof value==="object" && "path" in value && value.path===path && "sha256" in value && value.sha256===sha;
const base={identity,manifest:[{path,sha256:sha}],signal,validateReceipt,beforeDispatch:async()=>{}};

beforeEach(()=>{vi.resetAllMocks();vi.mocked(recordArtifactSandbox).mockResolvedValue(true);vi.mocked(finishArtifactDispatch).mockResolvedValue(true);});
it("returns a verified cached receipt without launching another sandbox",async()=>{
  vi.mocked(beginArtifactDispatch).mockResolvedValue({status:"completed",receipt});const execute=vi.fn();
  await expect(runCheckpointedArtifact({...base,execute})).resolves.toEqual(receipt);expect(execute).not.toHaveBeenCalled();
});
it("never relaunches an unresolved prior dispatch",async()=>{
  vi.mocked(beginArtifactDispatch).mockResolvedValue({status:"unknown"});const execute=vi.fn();
  await expect(runCheckpointedArtifact({...base,execute})).rejects.toBeInstanceOf(ArtifactDispatchUncertainError);expect(execute).not.toHaveBeenCalled();
});
it("does not launch when the budget gate defers an unstarted artifact",async()=>{
  vi.mocked(beginArtifactDispatch).mockResolvedValue({status:"deferred"});const execute=vi.fn();
  await expect(runCheckpointedArtifact({...base,identity:{...identity,allowStart:false},execute})).rejects.toBeInstanceOf(ArtifactBudgetDeferredError);
  expect(execute).not.toHaveBeenCalled();expect(finishArtifactDispatch).not.toHaveBeenCalled();
});
it("records sandbox identity before retaining its verified result",async()=>{
  vi.mocked(beginArtifactDispatch).mockResolvedValue({status:"started"});
  const execute=vi.fn(async(record:(id:string)=>Promise<void>)=>{await record("sbx_1");return receipt;});
  await expect(runCheckpointedArtifact({...base,execute})).resolves.toEqual(receipt);
  expect(vi.mocked(recordArtifactSandbox).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(finishArtifactDispatch).mock.invocationCallOrder[0]);
});
it("persists and reuses an unexamined PE receipt without rerunning it",async()=>{
  const unavailable={path,sha256:sha,kind:'pe',status:'unexamined',reason:'runtime-dependency-unavailable'} as const;
  const valid=(value:unknown):value is typeof unavailable => validGeneralExecutionEvidence({repoCommit:identity.sourceSha,inputManifest:base.manifest,runs:[],held:[],coverage:{status:'unverified'},artifacts:[value]});
  vi.mocked(beginArtifactDispatch).mockResolvedValueOnce({status:'started'}).mockResolvedValueOnce({status:'completed',receipt:unavailable});
  const execute=vi.fn(async(record:(id:string)=>Promise<void>)=>{await record('sbx_1');return unavailable;});
  await expect(runCheckpointedArtifact({...base,validateReceipt:valid,execute})).resolves.toEqual(unavailable);
  expect(finishArtifactDispatch).toHaveBeenCalledWith(expect.anything(),unavailable);
  await expect(runCheckpointedArtifact({...base,validateReceipt:valid,execute})).resolves.toEqual(unavailable);
  expect(execute).toHaveBeenCalledOnce();
});
it("leaves the dispatch uncertain when provider identity cannot be retained",async()=>{
  vi.mocked(beginArtifactDispatch).mockResolvedValue({status:"started"});vi.mocked(recordArtifactSandbox).mockResolvedValue(false);
  await expect(runCheckpointedArtifact({...base,execute:async(record)=>{await record("sbx_1");return receipt;}})).rejects.toBeInstanceOf(ArtifactDispatchUncertainError);
  expect(finishArtifactDispatch).not.toHaveBeenCalled();
});
it("rejects mismatched pinned manifest before storage or execution",async()=>{
  const execute=vi.fn();await expect(runCheckpointedArtifact({...base,manifest:[{path,sha256:"c".repeat(64)}],execute})).rejects.toThrow("absent");
  expect(beginArtifactDispatch).not.toHaveBeenCalled();expect(execute).not.toHaveBeenCalled();
});
it("retains a conclusive pre-execution unavailable result after recording the sandbox",async()=>{
  vi.mocked(beginArtifactDispatch).mockResolvedValue({status:"started"});
  const unavailable=new Error("known missing runtime");
  const execute=async(record:(id:string)=>Promise<void>)=>{await record("sbx_1");throw unavailable;};
  await expect(runCheckpointedArtifact({...base,execute,unavailableReceipt:error=>error===unavailable?receipt:undefined})).resolves.toEqual(receipt);
  expect(finishArtifactDispatch).toHaveBeenCalledOnce();
});
it("does not mark an unavailable result when the sandbox identity was never recorded",async()=>{
  vi.mocked(beginArtifactDispatch).mockResolvedValue({status:"started"});
  await expect(runCheckpointedArtifact({...base,execute:async()=>{throw new Error("transport");},unavailableReceipt:()=>receipt})).rejects.toThrow("transport");
  expect(finishArtifactDispatch).not.toHaveBeenCalled();
});
