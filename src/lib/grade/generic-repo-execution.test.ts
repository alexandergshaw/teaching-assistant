import { createHash } from "node:crypto";
import { expect,it,vi } from "vitest";
vi.mock("./generic-repo-sandbox",()=>({runGenericRepoSandbox:vi.fn()}));
import { runGenericRepoSandbox } from "./generic-repo-sandbox";
import { executeGenericPinnedInventory } from "./generic-repo-execution";
const file={path:"lab/main.py",bytes:new TextEncoder().encode(`if __name__ == '__main__': pass`)};
const input={folder:"lab",files:[file],repoCommit:"a".repeat(40),signal:new AbortController().signal,beforeDispatch:async()=>{}};
it("rejects a receipt with a forged inventory",async()=>{vi.mocked(runGenericRepoSandbox).mockResolvedValueOnce({repoCommit:input.repoCommit,inputManifest:[{path:file.path,sha256:"b".repeat(64)}],runs:[{language:"python",entryPoint:file.path}],artifacts:[]} as never);await expect(executeGenericPinnedInventory(input)).rejects.toThrow("does not match");});
it("retains unknown unsupported files even if no runnable program exists",async()=>{const b={path:"lab/main.go",bytes:new TextEncoder().encode("package main")};const result=await executeGenericPinnedInventory({...input,files:[b]});expect(result.runs).toEqual([]);expect(result.artifacts).toEqual([{path:b.path,sha256:createHash("sha256").update(b.bytes).digest("hex"),kind:"unsupported-source",status:"unsupported"}]);});
it("keeps SQL as reviewable text without claiming execution",async()=>{const b={path:"lab/" + "query.sql",bytes:new TextEncoder().encode("select 1")};const result=await executeGenericPinnedInventory({...input,files:[b]});expect(result.runs).toEqual([]);expect(result.artifacts).toEqual([]);expect(result.coverage.status).toBe("unverified");});
it("does not hide an unsupported language alongside a supported program",async()=>{
  const extra={path:"lab/other.go",bytes:new TextEncoder().encode("package main")};
  const manifest=[file,extra].map(f=>({path:f.path,sha256:createHash("sha256").update(f.bytes).digest("hex")}));
  const artifacts=[{path:extra.path,sha256:manifest[1].sha256,kind:"unsupported-source",status:"unsupported"}];
  vi.mocked(runGenericRepoSandbox).mockResolvedValueOnce({repoCommit:input.repoCommit,inputManifest:manifest,runs:[{language:"python",entryPoint:file.path}],artifacts} as never);
  const result=await executeGenericPinnedInventory({...input,files:[file,extra]});
  expect(result.artifacts).toEqual(artifacts);
});
