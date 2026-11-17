import { beforeEach, expect, it, vi } from "vitest";
const api=vi.hoisted(()=>({tree:vi.fn(),bytes:vi.fn()}));
vi.mock("@/lib/github.repos",()=>({getRepoCommitTree:api.tree}));
vi.mock("@/lib/github-grade-archive",()=>({makePinnedArchiveBytesReader:()=>api.bytes}));
import { readGenericPinnedInventory } from "./generic-repo-pinned-inventory";
const entries=[{path:"lab/main.py",type:"blob",mode:"100644",size:1,sha:"a".repeat(40)},{path:"lab/helper.dat",type:"blob",mode:"100644",size:1,sha:"b".repeat(40)}];
const input={owner:"org",repo:"repo",accountId:"owner",sourceCommit:"c".repeat(40),folder:"lab",signal:new AbortController().signal,inventory:{source:"pinned",scope:{kind:"tree" as const,path:"lab"},enumerationComplete:true,files:entries.map(e=>({path:e.path,content:"read" as const}))}};
beforeEach(()=>{vi.resetAllMocks();api.tree.mockResolvedValue({entries,truncated:false});api.bytes.mockResolvedValue(new Map(entries.map(e=>[e.path,Buffer.from("x")])));});
it("returns every verified scoped blob under its original path",async()=>{expect((await readGenericPinnedInventory(input)).map(f=>f.path)).toEqual(entries.map(e=>e.path));expect(api.bytes).toHaveBeenCalledWith(entries,input.signal);});
it("refuses incomplete trees and mismatched inventories before reading bytes",async()=>{api.tree.mockResolvedValueOnce({entries,truncated:true});await expect(readGenericPinnedInventory(input)).rejects.toThrow("Incomplete pinned");await expect(readGenericPinnedInventory({...input,inventory:{...input.inventory,files:input.inventory.files.slice(0,1)}})).rejects.toThrow("does not match");expect(api.bytes).not.toHaveBeenCalled();});
it("refuses symlink modes and missing bytes",async()=>{api.tree.mockResolvedValueOnce({entries:[{...entries[0],mode:"120000"},entries[1]],truncated:false});await expect(readGenericPinnedInventory(input)).rejects.toThrow("bounds");api.bytes.mockResolvedValueOnce(new Map());await expect(readGenericPinnedInventory(input)).rejects.toThrow("incomplete");});
it("keeps a larger executable byte-for-byte in the commit-bound inventory",async()=>{
  const large=Buffer.alloc(941_568);large[0]=0x4d;large[1]=0x5a;
  const pe={path:'lab/app.exe',type:'blob',mode:'100644',size:large.length,sha:'d'.repeat(40)};
  api.tree.mockResolvedValueOnce({entries:[pe],truncated:false});api.bytes.mockResolvedValueOnce(new Map([[pe.path,large]]));
  const result=await readGenericPinnedInventory({...input,inventory:{...input.inventory,files:[{path:pe.path,content:'budget'}]}});
  expect(result).toEqual([{path:pe.path,bytes:large}]);expect(api.bytes).toHaveBeenCalledWith([pe],input.signal);
});
it("does not extend the text limit or allow a larger aggregate inventory",async()=>{
  const largeText={path:'lab/main.cpp',type:'blob',mode:'100644',size:400_000,sha:'d'.repeat(40)};
  api.tree.mockResolvedValueOnce({entries:[largeText],truncated:false});
  await expect(readGenericPinnedInventory({...input,inventory:{...input.inventory,files:[{path:largeText.path,content:'budget'}]}})).rejects.toThrow('bounds');
  expect(api.bytes).not.toHaveBeenCalled();
  const one={...largeText,path:'lab/a.exe',size:2_500_000},two={...largeText,path:'lab/b.exe',size:1_500_001};
  api.tree.mockResolvedValueOnce({entries:[one,two],truncated:false});
  await expect(readGenericPinnedInventory({...input,inventory:{...input.inventory,files:[one,two].map(e=>({path:e.path,content:'budget' as const}))}})).rejects.toThrow('bounds');
  expect(api.bytes).not.toHaveBeenCalled();
});
