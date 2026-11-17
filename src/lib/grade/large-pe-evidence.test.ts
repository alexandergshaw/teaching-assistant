import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';

const api=vi.hoisted(()=>({tree:vi.fn(),bytes:vi.fn(),run:vi.fn(),begin:vi.fn(),record:vi.fn(),finish:vi.fn()}));
vi.mock('@/lib/github.repos',()=>({getRepoCommitTree:api.tree}));
vi.mock('@/lib/github-grade-archive',()=>({makePinnedArchiveBytesReader:()=>api.bytes}));
vi.mock('./generic-windows-sandbox',()=>({isSupportedWindowsPe:()=>true,runGenericWindowsArtifact:api.run}));
vi.mock('@/lib/repo-grades-dashboard/artifact-dispatch',async original=>({...await original<typeof import('@/lib/repo-grades-dashboard/artifact-dispatch')>(),beginArtifactDispatch:api.begin,recordArtifactSandbox:api.record,finishArtifactDispatch:api.finish}));
import { readGenericPinnedInventory } from './generic-repo-pinned-inventory';
import { executeGenericPinnedInventory } from './generic-repo-execution';

it('carries a larger pinned PE through the inventory and a durable unexamined receipt without rerunning',async()=>{
  const bytes=Buffer.alloc(941_568);bytes[0]=0x4d;bytes[1]=0x5a;
  const pe={path:'lab/app.exe',type:'blob',mode:'100644',size:bytes.length,sha:'d'.repeat(40)};
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const signal=new AbortController().signal,repoCommit='a'.repeat(40),beforeDispatch=async()=>{};
  api.tree.mockResolvedValue({entries:[pe],truncated:false});api.bytes.mockResolvedValue(new Map([[pe.path,bytes]]));
  const files=await readGenericPinnedInventory({owner:'org',repo:'repo',accountId:'owner',sourceCommit:repoCommit,folder:'lab',signal,inventory:{source:'pinned',scope:{kind:'tree',path:'lab'},enumerationComplete:true,files:[{path:pe.path,content:'budget'}]}});
  const receipt={path:pe.path,repoCommit,sha256,kind:'pe' as const,status:'unexamined' as const,reason:'runtime-dependency-unavailable'};
  api.begin.mockResolvedValueOnce({status:'started'}).mockResolvedValueOnce({status:'completed',receipt});api.record.mockResolvedValue(true);api.finish.mockResolvedValue(true);
  api.run.mockImplementationOnce(async input=>{await input.onSandboxCreated('sbx');return {...receipt,inputManifest:[{path:pe.path,sha256}]};});
  const context={claim:{mode:'retry',generation:7,token:'token'} as never,run:{runId:'run',lease:'lease'},recovery:false};
  const input={folder:'lab',files,repoCommit,signal,beforeDispatch,artifactExecutionContext:context};
  expect((await executeGenericPinnedInventory(input)).artifacts).toMatchObject([receipt]);
  expect((await executeGenericPinnedInventory(input)).artifacts).toMatchObject([receipt]);
  expect(api.run).toHaveBeenCalledOnce();expect(api.finish).toHaveBeenCalledOnce();
});
