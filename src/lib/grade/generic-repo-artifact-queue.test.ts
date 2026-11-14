import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({run:vi.fn(), native:vi.fn(), checkpoint:vi.fn(), sourceCheckpoint:vi.fn(), resume:vi.fn(), unavailable:class extends Error {}, deferred:class extends Error {}}));
vi.mock("./generic-windows-sandbox",()=>({isSupportedWindowsPe:()=>true,runGenericWindowsArtifact:mocks.run}));
vi.mock("./generic-repo-sandbox",()=>({runGenericRepoSandbox:vi.fn()}));
vi.mock("./generic-native-artifact",()=>({isSupportedNativeArtifact:()=>true,runGenericNativeArtifact:mocks.native,ArtifactRuntimeUnavailableError:mocks.unavailable}));
vi.mock("@/lib/repo-grades-dashboard/artifact-checkpoint",()=>({runCheckpointedArtifact:mocks.checkpoint,ArtifactBudgetDeferredError:mocks.deferred}));
vi.mock("@/lib/repo-grades-dashboard/source-checkpoint",()=>({runCheckpointedSource:mocks.sourceCheckpoint,sourcePlanDigest:()=>"c".repeat(64)}));
vi.mock("@/lib/repo-grades-dashboard/artifact-dispatch",()=>({artifactManifestDigest:()=>"f".repeat(64),findArtifactResume:mocks.resume}));
import { executeGenericPinnedInventory } from "./generic-repo-execution";
it("refuses an evidence envelope that cannot fit before dispatching any sandbox",async()=>{
  mocks.run.mockClear();
  const bytes=new Uint8Array([0x4d,0x5a,0,0]);
  const files=Array.from({length:40},(_,index)=>({path:`lab/${"界".repeat(500)}${index}.exe`,bytes}));
  const beforeDispatch=vi.fn();
  await expect(executeGenericPinnedInventory({folder:"lab",files,repoCommit:"a".repeat(40),signal:new AbortController().signal,beforeDispatch})).rejects.toThrow("evidence exceeds");
  expect(beforeDispatch).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
});
it("attempts all supported artifacts with bounded concurrency rather than dropping after two",async()=>{
  let active=0, peak=0;
  const bytes=new Uint8Array([0x4d,0x5a,0,0]);
  const files=["a.exe","b.exe","c.exe"].map(name=>({path:`lab/${name}`,bytes}));
  mocks.run.mockImplementation(async input=>{
    active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;
    const sha=(b:Uint8Array)=>createHash("sha256").update(b).digest("hex");
    return {path:input.path,repoCommit:input.repoCommit,sha256:sha(input.bytes),inputManifest:input.files.map((f:{path:string;bytes:Uint8Array})=>({path:f.path,sha256:sha(f.bytes)})),kind:"pe",status:"observed",runtime:"wine"};
  });
  const result=await executeGenericPinnedInventory({folder:"lab",files,repoCommit:"a".repeat(40),signal:new AbortController().signal,beforeDispatch:async()=>{}});
  expect(mocks.run).toHaveBeenCalledTimes(3);expect(peak).toBeLessThanOrEqual(2);
  expect(result.artifacts.map(item=>item.status)).toEqual(["observed","observed","observed"]);
});
it("retains an artifact as unexamined when its runtime is conclusively unavailable",async()=>{
  const bytes=Uint8Array.from([0x7f,0x45,0x4c,0x46,2,1,...new Array(10).fill(0),2,0,62,0]);
  mocks.native.mockRejectedValueOnce(new mocks.unavailable("runtime unavailable"));
  const result=await executeGenericPinnedInventory({folder:"lab",files:[{path:"lab/app",bytes}],repoCommit:"a".repeat(40),signal:new AbortController().signal,beforeDispatch:async()=>{}});
  expect(result.artifacts).toMatchObject([{path:"lab/app",kind:"elf",status:"unexamined"}]);
});
it("does not start an artifact when its VM cannot fit in the remaining budget",async()=>{
  mocks.run.mockClear();
  const bytes=new Uint8Array([0x4d,0x5a,0,0]);
  const result=await executeGenericPinnedInventory({folder:"lab",files:[{path:"lab/a.exe",bytes}],repoCommit:"a".repeat(40),signal:new AbortController().signal,beforeDispatch:async()=>{},deadlineMs:Date.now()+100_000});
  expect(mocks.run).not.toHaveBeenCalled();
  expect(result.artifacts).toMatchObject([{path:"lab/a.exe",status:"unexamined"}]);
});
it("checks and records artifact dispatch against its admitted claim and run",async()=>{
  const bytes=new Uint8Array([0x4d,0x5a,0,0]),files=[{path:"lab/a.exe",bytes}],manifest=files.map(f=>({path:f.path,sha256:createHash("sha256").update(f.bytes).digest("hex")}));
  const claim={generation:12,token:"token"} as never,run={runId:"run",lease:"lease"};
  mocks.checkpoint.mockImplementationOnce(async input=>input.execute(async()=>{}));
  mocks.run.mockImplementationOnce(async input=>{await input.onSandboxCreated("session");return {path:input.path,repoCommit:input.repoCommit,sha256:manifest[0].sha256,inputManifest:manifest,kind:"pe",status:"observed",runtime:"wine"};});
  const result=await executeGenericPinnedInventory({folder:"lab",files,repoCommit:"a".repeat(40),signal:new AbortController().signal,beforeDispatch:async()=>{},artifactExecutionContext:{claim,run,recovery:false}});
  expect(result.artifacts[0].status).toBe("observed");
  expect(mocks.checkpoint).toHaveBeenCalledWith(expect.objectContaining({identity:expect.objectContaining({claim,run,path:"lab/a.exe",artifactSha256:manifest[0].sha256})}));
  expect(mocks.resume).not.toHaveBeenCalled();
});
it("does not begin or execute an artifact when recovery authorization is missing",async()=>{
  mocks.run.mockClear();mocks.checkpoint.mockClear();mocks.resume.mockResolvedValueOnce(null);
  const bytes=new Uint8Array([0x4d,0x5a,0,0]),files=[{path:"lab/a.exe",bytes}];
  await expect(executeGenericPinnedInventory({folder:"lab",files,repoCommit:"a".repeat(40),signal:new AbortController().signal,beforeDispatch:async()=>{},artifactExecutionContext:{claim:{generation:12} as never,run:{runId:"run",lease:"lease"},recovery:true}})).rejects.toThrow("could not be authorized");
  expect(mocks.checkpoint).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
});
it("reuses completed artifacts and carries remaining paths when a recovery has too little time to start work",async()=>{
  mocks.run.mockClear();mocks.checkpoint.mockReset();mocks.resume.mockResolvedValueOnce(11);
  const bytes=new Uint8Array([0x4d,0x5a,0,0]),files=[{path:"lab/a.exe",bytes},{path:"lab/b.exe",bytes}],digest=createHash("sha256").update(bytes).digest("hex");
  mocks.checkpoint.mockImplementation(async input=>{
    expect(input.identity.allowStart).toBe(false);expect(input.identity.resumeGeneration).toBe(11);
    if(input.identity.path==="lab/b.exe")throw new mocks.deferred();
    return {path:"lab/a.exe",sha256:digest,kind:"pe",status:"observed",runtime:"wine"};
  });
  const result=await executeGenericPinnedInventory({folder:"lab",files,repoCommit:"a".repeat(40),signal:new AbortController().signal,beforeDispatch:async()=>{},deadlineMs:Date.now()+100_000,artifactExecutionContext:{claim:{generation:12} as never,run:{runId:"run",lease:"lease"},recovery:true}});
  expect(mocks.run).not.toHaveBeenCalled();expect(result.continuation).toEqual({manifestSha256:"f".repeat(64),paths:["lab/b.exe"],sources:[]});
});

it("reuses a source receipt on artifact continuation without re-running source",async()=>{
  mocks.resume.mockResolvedValueOnce(11);mocks.checkpoint.mockReset();mocks.sourceCheckpoint.mockReset();
  const files=[{path:"lab/main.py",bytes:new TextEncoder().encode("if __name__ == '__main__': print(1)")},{path:"lab/a.exe",bytes:new Uint8Array([0x4d,0x5a,0,0])}];
  mocks.sourceCheckpoint.mockImplementationOnce(async input=>{expect(input.identity.resumeGeneration).toBe(11);return {language:"python",entryPoint:"lab/main.py",selection:"heuristic",status:"observed"};});
  mocks.checkpoint.mockRejectedValueOnce(new mocks.deferred());
  const result=await executeGenericPinnedInventory({folder:"lab",files,repoCommit:"a".repeat(40),signal:new AbortController().signal,beforeDispatch:async()=>{},deadlineMs:Date.now()+100_000,artifactExecutionContext:{claim:{generation:12} as never,run:{runId:"run",lease:"lease"},recovery:true}});
  expect(result.runs).toHaveLength(1);expect(result.continuation?.paths).toEqual(["lab/a.exe"]);
});
it("carries a deferred source-only plan after another plan completes",async()=>{
  mocks.sourceCheckpoint.mockReset();
  const files=[{path:"lab/main.py",bytes:new TextEncoder().encode("if __name__ == '__main__': print(1)")},{path:"lab/main.js",bytes:new TextEncoder().encode("console.log(1)")}];
  mocks.sourceCheckpoint.mockImplementation(async input=>{
    if(input.identity.plan.language==="javascript")throw new mocks.deferred();
    return {language:"python",entryPoint:"lab/main.py",selection:"heuristic",status:"observed"};
  });
  const result=await executeGenericPinnedInventory({folder:"lab",files,repoCommit:"a".repeat(40),signal:new AbortController().signal,beforeDispatch:async()=>{},artifactExecutionContext:{claim:{generation:12} as never,run:{runId:"run",lease:"lease"},recovery:false}});
  expect(result.continuation).toMatchObject({paths:[],sources:[{entryPoint:"lab/main.js",language:"javascript",planSha256:"c".repeat(64)}]});
});
it("retains a bounded continuation when the first tick cannot start any source",async()=>{
  mocks.sourceCheckpoint.mockReset();mocks.sourceCheckpoint.mockRejectedValueOnce(new mocks.deferred());
  const files=[{path:"lab/main.py",bytes:new TextEncoder().encode("if __name__ == '__main__': print(1)")}];
  const result=await executeGenericPinnedInventory({folder:"lab",files,repoCommit:"a".repeat(40),signal:new AbortController().signal,beforeDispatch:async()=>{},deadlineMs:Date.now()+100_000,artifactExecutionContext:{claim:{generation:12} as never,run:{runId:"run",lease:"lease"},recovery:false}});
  expect(result.continuation).toMatchObject({paths:[],sources:[{entryPoint:"lab/main.py",language:"python"}]});
});
