import { beforeEach,expect,it,vi } from "vitest";
const api=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),mkDir:vi.fn(),writeFiles:vi.fn(),runCommand:vi.fn(),stop:vi.fn(),currentSession:vi.fn()}));
vi.mock("@vercel/sandbox",()=>({Sandbox:{create:api.create}}));
import { runGenericRepoSandbox } from "./generic-repo-sandbox";
const input={plan:{language:"python" as const,entryPoint:"lab/main.py",selection:"heuristic" as const},folder:"lab",files:[{path:"lab/main.py",bytes:new TextEncoder().encode("print(1)")},{path:"lab/data/a.bin",bytes:new Uint8Array([0,1])}],repoCommit:"a".repeat(40),signal:new AbortController().signal,beforeDispatch:vi.fn().mockResolvedValue(undefined)};
beforeEach(()=>{vi.clearAllMocks();api.create.mockResolvedValue(api);api.currentSession.mockReturnValue({sessionId:"session-1"});api.update.mockResolvedValue(undefined);api.mkDir.mockResolvedValue(undefined);api.writeFiles.mockResolvedValue(undefined);api.stop.mockResolvedValue(undefined);api.runCommand.mockResolvedValue({exitCode:0,stdout:async()=>"Python 3",stderr:async()=>""});});
it("denies network before uploading all pinned files, and discloses binary artifacts",async()=>{const result=await runGenericRepoSandbox(input);expect(api.update.mock.invocationCallOrder[0]).toBeLessThan(api.writeFiles.mock.invocationCallOrder[0]);expect(api.writeFiles.mock.calls[0][0].map((f:{path:string})=>f.path)).toEqual(["main.py","data/a.bin"]);expect(result).toMatchObject({coverage:{status:"unverified"},artifacts:[{path:"lab/data/a.bin",kind:"binary",status:"unexamined"}],runs:[{entryPoint:"lab/main.py",status:"observed"}]});expect(input.beforeDispatch).toHaveBeenCalledTimes(3);expect(api.stop).toHaveBeenCalledOnce();});
it("does not transfer input if egress isolation fails",async()=>{api.update.mockRejectedValue(new Error("unavailable"));await expect(runGenericRepoSandbox(input)).rejects.toThrow("unavailable");expect(api.writeFiles).not.toHaveBeenCalled();expect(api.stop).toHaveBeenCalledOnce();});
it.each(["mjs", "cjs"])("executes a .%s Node module with its original path",async extension=>{
  const entry=`lab/main.${extension}`;
  await runGenericRepoSandbox({...input,plan:{language:"javascript",entryPoint:entry,selection:"heuristic"},files:[{path:entry,bytes:new TextEncoder().encode("console.log(1)")}]});
  expect(api.runCommand).toHaveBeenCalledWith(expect.objectContaining({cmd:"node",args:[`./main.${extension}`]}));
});
it("rejects traversal, collisions and files outside scope before dispatch",async()=>{await expect(runGenericRepoSandbox({...input,files:[...input.files,{path:"lab/../escape",bytes:new Uint8Array()}]})).rejects.toThrow("Unsafe");await expect(runGenericRepoSandbox({...input,files:[...input.files,{path:"elsewhere/a",bytes:new Uint8Array()}]})).rejects.toThrow("outside");expect(api.create).not.toHaveBeenCalled();});

it("preserves Unicode directory and file names in the isolated run",async()=>{
  const entry="lab/área/solución.py";
  await runGenericRepoSandbox({...input,plan:{language:"python",entryPoint:entry,selection:"heuristic"},files:[{path:entry,bytes:new TextEncoder().encode("print(1)")}]});
  expect(api.writeFiles.mock.calls[0][0].map((file:{path:string})=>file.path)).toEqual(["área/solución.py"]);
  expect(api.runCommand).toHaveBeenCalledWith(expect.objectContaining({cmd:"python3",args:["./área/solución.py"]}));
});

it("runs a packaged Java entry with its package root and qualified name",async()=>{
  const entry="lab/src/com/example/Main.java";
  const bytes=new TextEncoder().encode("package com.example;\npublic class Main { public static void main(String[] args) {} }");
  await runGenericRepoSandbox({...input,plan:{language:"java",entryPoint:entry,selection:"heuristic"},files:[{path:entry,bytes}]});
  expect(api.runCommand).toHaveBeenCalledWith(expect.objectContaining({cmd:"javac",args:["./src/com/example/Main.java"]}));
  expect(api.runCommand).toHaveBeenCalledWith(expect.objectContaining({cmd:"java",args:["-ea","-cp","src","com.example.Main"]}));
});

it("records sandbox identity before setup and aborts before student input if storage fails",async()=>{const record=vi.fn().mockRejectedValue(new Error("storage unavailable"));await expect(runGenericRepoSandbox({...input,onSandboxCreated:record})).rejects.toThrow("storage unavailable");expect(record).toHaveBeenCalledWith("session-1");expect(api.runCommand).not.toHaveBeenCalled();expect(api.writeFiles).not.toHaveBeenCalled();expect(api.stop).toHaveBeenCalledOnce();});
