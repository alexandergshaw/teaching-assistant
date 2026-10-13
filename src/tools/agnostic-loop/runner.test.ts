import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LoopStore } from './store';
import { runGate } from './runner';
import type { Policy } from './types';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, {recursive:true,force:true}); delete process.env.AGNOSTIC_RUN_SECRET; });
async function fixture(script: string) {
  const root = await mkdtemp(path.join(os.tmpdir(),'agnostic-runner-')); roots.push(root); const workspace = path.join(root,'workspace'); await mkdir(workspace);
  const store = new LoopStore(path.join(root,'state'));
  const policy: Policy = { owner:'owner',workspace,allowedActions:['run'],candidateExclusions:[],environmentKeys:['AGNOSTIC_RUN_SECRET'],externalFiles:[],gates:{test:{executable:process.execPath,args:['-e',script],resources:['workspace']}},concurrency:3,deadline:Date.now()+60_000,maxAssignments:10,commandTimeout:20000 };
  await store.init(policy);
  async function event(type:string,payload:Record<string,unknown>) { const state=await store.load(); return store.transact({id:`event-${state.revision}`,expectedRevision:state.revision,actor:'owner',type,payload}); }
  await event('item.create',{id:'item',objective:'Verify fixture',owner:'owner',affectedPaths:['fixture.txt'],dependencies:[],criteria:['works'],requiredArtifacts:{},requiredGates:['test'],triage:{}});
  await event('activity.create',{id:'activity',item:'item',kind:'verification',requirements:['works'],dependencies:[]});
  await event('assignment.start',{id:'assignment',item:'item',activity:'activity',role:'verifier',worker:{instance:'verifier',context:'fresh',provider:'manual',model:'fixture',settings:{},tools:['node']},inputs:{},writePaths:[],affectedPaths:['fixture.txt'],resources:['workspace'],allowedActions:['run'],deadline:Date.now()+30_000,deliverables:[]});
  return {store,event};
}
describe('real allowlisted process runner',()=>{
  it('records real exit and sanitized immutable output',async()=>{
    process.env.AGNOSTIC_RUN_SECRET='secret-sentinel-never-store';
    const {store}=await fixture('console.log(process.env.AGNOSTIC_RUN_SECRET)');
    const evidence=await runGate(store,'assignment','test','owner');
    expect(evidence.exitCode).toBe(0);
    expect(await readFile(evidence.outputPath,'utf8')).toContain('[redacted]');
    expect(await readFile(evidence.outputPath,'utf8')).not.toContain('secret-sentinel-never-store');
    expect(Object.values((await store.load()).operations)[0].status).toBe('terminated');
  },20000);
  it('rejects unknown gates and quarantines cancelled live operations',async()=>{
    const {store,event}=await fixture('setTimeout(()=>console.log("late"),10000)');
    await expect(runGate(store,'assignment','arbitrary','owner')).rejects.toThrow('Unknown');
    const running=runGate(store,'assignment','test','owner');
    const outcome=running.then(()=>null,error=>error);
    for(let i=0;i<80;i++){ const state=await store.load(); if(Object.values(state.operations).some(op=>op.status==='running')) break; await new Promise(resolve=>setTimeout(resolve,25)); }
    await expect(runGate(store,'assignment','test','owner')).rejects.toThrow('outstanding operation');
    await event('assignment.cancel',{assignment:'assignment',reason:'cancel fixture'});
    expect(await outcome).toBeInstanceOf(Error);
    const state=await store.load(); expect(state.assignments.assignment.reconciled).toBe(false);
    expect(Object.values(state.operations)[0].status).toBe('unknown');
    expect(Object.values(state.evidence)[0].exitCode).toBeNull();
    await expect(event('assignment.reconcile',{assignment:'assignment',resolution:'premature'})).rejects.toThrow('operations');
  },20000);
  it('retains unusable audit when an exit-zero gate changes the candidate',async()=>{
    const {store}=await fixture('require("node:fs").writeFileSync("fixture.txt","changed")');
    const evidence=await runGate(store,'assignment','test','owner');
    expect(evidence.exitCode).toBeNull(); expect(evidence.limitations).toContain('Candidate changed during command');
    expect((await store.load()).evidence[evidence.id]).toEqual(evidence);
  },20000);
  it('rejects launch over a persisted pending operation after reload',async()=>{
    const {store}=await fixture('process.exit(0)');
    const state=await store.load();
    const operation={id:'pending-before-restart',assignment:'assignment',resource:'workspace',status:'pending' as const,publicationToken:state.assignments.assignment.publicationToken,pid:null,reconciled:false};
    await store.transact({id:'pending-event',expectedRevision:state.revision,actor:'owner',type:'operation.start',payload:{operation}},{operations:{[operation.id]:operation}});
    await expect(runGate(new LoopStore(store.directory),'assignment','test','owner')).rejects.toThrow('outstanding operation');
    expect(Object.keys((await store.load()).operations)).toEqual(['pending-before-restart']);
  },20000);
});
