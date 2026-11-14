import { beforeEach, expect, it, vi } from "vitest";
const api=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),mkDir:vi.fn(),writeFiles:vi.fn(),runCommand:vi.fn(),stop:vi.fn(),currentSession:vi.fn()}));
vi.mock("@vercel/sandbox",()=>({Sandbox:{create:api.create}}));
import { isSupportedNativeArtifact, resolveJavaClass, runGenericNativeArtifact } from "./generic-native-artifact";
const sha="a".repeat(40), signal=new AbortController().signal;
const elf=Uint8Array.from([0x7f,0x45,0x4c,0x46,2,1,...new Array(10).fill(0),2,0,62,0]);
const classBytes=(name:string)=>Uint8Array.from([0xca,0xfe,0xba,0xbe,0,0,0,65,0,3,1,0,name.length,...new TextEncoder().encode(name),7,0,1,0,0,0,2,0,0]);
beforeEach(()=>{vi.clearAllMocks();api.create.mockResolvedValue(api);api.currentSession.mockReturnValue({sessionId:"session-1"});api.update.mockResolvedValue(undefined);api.mkDir.mockResolvedValue(undefined);api.writeFiles.mockResolvedValue(undefined);api.stop.mockResolvedValue(undefined);api.runCommand.mockResolvedValue({exitCode:0,stdout:async()=>"runtime version",stderr:async()=>""});});
it.each([
  ["elf", "bin/app", elf, "./app", "native"],
  ["java-class", "bin/Hello.class", classBytes("Hello"), "java", "java"],
  ["python-bytecode", "bin/test.pyc", new Uint8Array([0,0,13,10,...new Array(12).fill(0)]), "python3", "python"],
] as const)("executes %s only after isolation while retaining pinned manifest",async(kind,path,bytes,cmd,runtime)=>{
  const beforeDispatch=vi.fn().mockResolvedValue(undefined),file={path:`lab/${path}`,bytes};
  const result=await runGenericNativeArtifact({path:file.path,bytes,folder:"lab",files:[file],kind,repoCommit:sha,signal,beforeDispatch});
  expect(api.update.mock.invocationCallOrder[0]).toBeLessThan(api.writeFiles.mock.invocationCallOrder[0]);
  expect(api.runCommand.mock.calls.at(-1)?.[0]).toMatchObject(kind === "java-class" ? {cmd,args:["-ea","-cp","bin","Hello"]} : {cmd,cwd:"/vercel/bin"});
  expect(result).toMatchObject({kind,runtime,coverage:"unverified",sourceEquivalence:"unverified",networkPolicy:"deny-all"});
  expect(result.inputManifest[0].path).toBe(file.path);expect(api.stop).toHaveBeenCalledOnce();
});
it("uses a class's package metadata and refuses path mismatches",()=>{
  const bytes=classBytes("example/course/Hello");
  expect(resolveJavaClass(bytes,"out/example/course/Hello.class")).toEqual({className:"example.course.Hello",classpath:"out"});
  expect(resolveJavaClass(bytes,"out/Hello.class")).toBeNull();
  expect(resolveJavaClass(bytes.subarray(0,15),"out/example/course/Hello.class")).toBeNull();
});
it("runs a packaged Java class with the correct classpath",async()=>{
  const bytes=classBytes("example/course/Hello"),file={path:"lab/out/example/course/Hello.class",bytes};
  await runGenericNativeArtifact({path:file.path,bytes,folder:"lab",files:[file],kind:"java-class",repoCommit:sha,signal,beforeDispatch:async()=>{}});
  expect(api.runCommand.mock.calls.at(-1)?.[0]).toMatchObject({cmd:"java",args:["-ea","-cp","out","example.course.Hello"]});
});
it("does not upload an artifact when deny-all fails",async()=>{
  const bytes=elf,file={path:"lab/a",bytes};
  api.update.mockRejectedValueOnce(new Error("denied"));
  await expect(runGenericNativeArtifact({path:file.path,bytes,folder:"lab",files:[file],kind:"elf",repoCommit:sha,signal,beforeDispatch:async()=>{}})).rejects.toThrow("denied");
  expect(api.writeFiles).not.toHaveBeenCalled();
});
it("stops before setup if the created session cannot be recorded",async()=>{
  const file={path:"lab/a",bytes:elf},record=vi.fn().mockRejectedValue(new Error("ledger unavailable"));
  await expect(runGenericNativeArtifact({path:file.path,bytes:elf,folder:"lab",files:[file],kind:"elf",repoCommit:sha,signal,beforeDispatch:async()=>{},onSandboxCreated:record})).rejects.toThrow("ledger unavailable");
  expect(record).toHaveBeenCalledWith("session-1");expect(api.runCommand).not.toHaveBeenCalled();expect(api.stop).toHaveBeenCalledOnce();
});
it("distinguishes a position-independent ELF executable from a shared library",()=>{
  const bytes=new Uint8Array(120), view=new DataView(bytes.buffer);
  bytes.set([0x7f,0x45,0x4c,0x46,2,1]);view.setUint16(16,3,true);view.setUint16(18,62,true);
  view.setBigUint64(32,BigInt(64),true);view.setUint16(54,56,true);view.setUint16(56,1,true);
  expect(isSupportedNativeArtifact("elf",bytes)).toBe(false);
  view.setUint32(64,3,true);
  expect(isSupportedNativeArtifact("elf",bytes)).toBe(true);
  view.setBigUint64(32,BigInt(Number.MAX_SAFE_INTEGER),true);
  expect(isSupportedNativeArtifact("elf",bytes)).toBe(false);
});
