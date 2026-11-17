import { beforeEach, expect, it, vi } from "vitest";
const api=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),mkDir:vi.fn(),writeFiles:vi.fn(),runCommand:vi.fn(),stop:vi.fn(),currentSession:vi.fn()}));
vi.mock("@vercel/sandbox",()=>({Sandbox:{create:api.create}}));
import { runGenericWindowsArtifact } from "./generic-windows-sandbox";
const bytes=new Uint8Array(100);bytes.set([0x4d,0x5a]);bytes[60]=64;bytes.set([0x50,0x45,0,0,0x64,0x86],64);bytes.set([0x0b,0x02],88);
const input={path:"lab/student.exe",bytes,folder:"lab",files:[{path:"lab/student.exe",bytes}],repoCommit:"a".repeat(40),signal:new AbortController().signal,beforeDispatch:vi.fn().mockResolvedValue(undefined)};
beforeEach(()=>{vi.clearAllMocks();api.create.mockResolvedValue(api);api.currentSession.mockReturnValue({sessionId:"session-1"});api.update.mockResolvedValue(undefined);api.mkDir.mockResolvedValue(undefined);api.writeFiles.mockResolvedValue(undefined);api.stop.mockResolvedValue(undefined);api.runCommand.mockResolvedValue({exitCode:0,stdout:async()=>"wine-10",stderr:async()=>""});});
it("runs an x64 PE only after Wine setup and network isolation",async()=>{const result=await runGenericWindowsArtifact(input);expect(api.update.mock.invocationCallOrder[0]).toBeLessThan(api.writeFiles.mock.invocationCallOrder[0]);expect(api.runCommand.mock.calls.at(-1)?.[0]).toMatchObject({cmd:"wine",args:["./student.exe"],env:{WINEDEBUG:"-all,err+module",WINEPREFIX:"/vercel/wineprobe"}});expect(result).toMatchObject({kind:"pe",architecture:"x86_64",sourceEquivalence:"unverified",coverage:"unverified"});expect(api.stop).toHaveBeenCalledOnce();});
it("does not report missing Windows debug DLLs as observed student behavior",async()=>{
  api.runCommand.mockImplementation(async (options:{cmd:string;args?:string[];stderr?:{write:(s:string)=>void}})=>{
    if(options.cmd==='wine' && options.args?.[0]==='./student.exe'){
      options.stderr?.write('0024:err:module:import_dll Library MSVCP140D.dll (which is needed by L"student.exe") not found\n');
      return {exitCode:53};
    }
    return {exitCode:0,stdout:async()=>"wine-10",stderr:async()=>""};
  });
  await expect(runGenericWindowsArtifact(input)).resolves.toMatchObject({kind:'pe',status:'unexamined',reason:'runtime-dependency-unavailable'});
  expect(api.stop).toHaveBeenCalledOnce();
});
it("retains a nonzero program exit as an observation when no loader failure is reported",async()=>{
  api.runCommand.mockImplementation(async (options:{cmd:string;args?:string[];stderr?:{write:(s:string)=>void}})=>{
    if(options.cmd==='wine' && options.args?.[0]==='./student.exe'){options.stderr?.write('invalid input\n');return {exitCode:2};}
    return {exitCode:0,stdout:async()=>"wine-10",stderr:async()=>""};
  });
  const result=await runGenericWindowsArtifact(input);expect(result.status).toBe('observed');if(result.status!=='observed')throw new Error('unexpected result');expect(result.execution.exitCode).toBe(2);expect(result.execution.stderr).toContain('invalid input');
});
it("does not score a failed run when loader diagnostics were truncated",async()=>{
  api.runCommand.mockImplementation(async (options:{cmd:string;args?:string[];stderr?:{write:(s:string)=>void}})=>{
    if(options.cmd==='wine' && options.args?.[0]==='./student.exe'){options.stderr?.write('x'.repeat(100_000));return {exitCode:1};}
    return {exitCode:0,stdout:async()=>"wine-10",stderr:async()=>""};
  });
  await expect(runGenericWindowsArtifact(input)).resolves.toMatchObject({kind:'pe',status:'unexamined',reason:'diagnostics-truncated'});
});
it("holds unsupported architecture before creating a VM",async()=>{const x=bytes.slice();x[68]=0x4c;x[69]=0x01;await expect(runGenericWindowsArtifact({...input,bytes:x})).rejects.toThrow("Unsupported Windows architecture");expect(api.create).not.toHaveBeenCalled();});
it("does not send student bytes if isolation fails",async()=>{api.update.mockRejectedValue(new Error("denied"));await expect(runGenericWindowsArtifact(input)).rejects.toThrow("denied");expect(api.writeFiles).not.toHaveBeenCalled();expect(api.stop).toHaveBeenCalledOnce();});
it("records the created session before setup and stops if recording fails",async()=>{
  const record=vi.fn().mockRejectedValue(new Error("ledger unavailable"));
  await expect(runGenericWindowsArtifact({...input,onSandboxCreated:record})).rejects.toThrow("ledger unavailable");
  expect(record).toHaveBeenCalledWith("session-1");expect(api.runCommand).not.toHaveBeenCalled();expect(api.writeFiles).not.toHaveBeenCalled();expect(api.stop).toHaveBeenCalledOnce();
});
it("preserves pinned companion paths and hashes",async()=>{
  const companion={path:"lab/data/config.txt",bytes:new TextEncoder().encode("fixture")};
  const result=await runGenericWindowsArtifact({...input,files:[...input.files,companion]});
  expect(api.writeFiles.mock.calls[0][0].map((file:{path:string})=>file.path)).toEqual(["student.exe","data/config.txt"]);
  expect(result.inputManifest.map(file=>file.path)).toEqual(["lab/student.exe",companion.path]);
  expect(result.inputManifest[1].sha256).toMatch(/^[a-f0-9]{64}$/);
});
it("runs a nested executable from its own directory",async()=>{
  const result=await runGenericWindowsArtifact({...input,path:"lab/bin/student.exe",files:[{path:"lab/bin/student.exe",bytes}]});
  if(result.status!=='observed')throw new Error('unexpected result');
  expect(api.runCommand.mock.calls.at(-1)?.[0]).toMatchObject({cmd:"wine",args:["./student.exe"],cwd:"/vercel/bin"});
  expect(result.execution.command).toBe("cwd=/vercel/bin; wine ./student.exe");
});
