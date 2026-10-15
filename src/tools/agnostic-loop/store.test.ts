import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LoopStore } from './store';
import type { Policy } from './types';
import { digest } from './json';
import { captureCandidate } from './candidate';
vi.mock('./candidate', async importOriginal => {
  const actual = await importOriginal<typeof import('./candidate')>();
  return {...actual,captureCandidate:vi.fn(actual.captureCandidate)};
});
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); vi.mocked(captureCandidate).mockClear(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(),'agnostic-store-')); roots.push(root);
  const workspace = path.join(root,'workspace'); await mkdir(workspace);
  const store = new LoopStore(path.join(root,'state'));
  const policy: Policy = { owner:'owner',workspace,allowedActions:['write'],candidateExclusions:[],environmentKeys:[],externalFiles:[],gates:{},concurrency:3,deadline:Date.now()+60_000,maxAssignments:10,commandTimeout:5000 };
  await store.init(policy); return { root, store, policy };
}
describe('durable atomic store', () => {
  it('captures the whole candidate once per transaction and still captures for public context', async () => {
    const {store,policy} = await fixture();
    await writeFile(path.join(policy.workspace,'source.txt'),'actual source');
    const state = await store.load(); vi.mocked(captureCandidate).mockClear();
    const observed = await store.context(state);
    expect(captureCandidate).toHaveBeenCalledTimes(1);
    expect(observed.candidate.files['source.txt']).toBe(digest('actual source'));
    vi.mocked(captureCandidate).mockClear();
    await store.transact({id:'pause',expectedRevision:0,actor:'owner',type:'run.pause',payload:{reason:'inspection'}});
    expect(captureCandidate).toHaveBeenCalledTimes(1);
  });
  it('ignores caller candidate and clock while capturing after imported blob verification', async () => {
    const {store,policy} = await fixture();
    await writeFile(path.join(policy.workspace,'source.txt'),'before');
    await store.transact({id:'item',expectedRevision:0,actor:'owner',type:'item.create',payload:{id:'item',objective:'Build',owner:'owner',affectedPaths:['output.txt'],dependencies:[],criteria:['works'],requiredArtifacts:{},requiredGates:[],triage:{}}});
    await store.transact({id:'activity',expectedRevision:1,actor:'owner',type:'activity.create',payload:{id:'activity',item:'item',kind:'criteria',requirements:['works'],dependencies:[]}});
    const prior = await store.context(await store.load());
    await writeFile(path.join(policy.workspace,'import.txt'),'import');
    const blob = await store.blob(Buffer.from('import'));
    const verify = store.verifiedBlob.bind(store);
    vi.spyOn(store,'verifiedBlob').mockImplementation(async (filename,hash) => {
      const bytes = await verify(filename,hash);
      await writeFile(path.join(policy.workspace,'source.txt'),'after-verification');
      return bytes;
    });
    const worker = {instance:'author',context:'context',provider:'manual',model:'fixture',settings:{},tools:[]};
    const artifact = {id:'observed',activity:'activity',version:1,hash:blob.hash,path:'import.txt',author:worker,inputs:[]};
    vi.mocked(captureCandidate).mockClear();
    const next = await store.transact({id:'start',expectedRevision:2,actor:'owner',type:'assignment.start',payload:{id:'author',item:'item',activity:'activity',role:'criteria',worker,inputs:{},writePaths:['output.txt'],affectedPaths:['output.txt'],resources:[],allowedActions:['write'],deadline:policy.deadline,deliverables:[]}}, {now:Number.MAX_SAFE_INTEGER,candidate:{...prior.candidate,policyHash:digest('forged policy'),digest:digest('forged candidate')},artifacts:{observed:artifact}});
    expect(captureCandidate).toHaveBeenCalledTimes(1);
    expect(next.assignments.author.baseline.files['source.txt']).toBe(digest('after-verification'));
    expect(next.assignments.author.policyHash).toBe(prior.candidate.policyHash);
    expect(next.assignments.author.baseline.digest).not.toBe(digest('forged candidate'));
  });
  it('persists CAS winner and rejects loser with no extra event', async () => {
    const { store } = await fixture();
    const event = { id:'pause',expectedRevision:0,actor:'owner',type:'run.pause',payload:{reason:'inspection'} };
    await store.transact(event);
    const reloaded = new LoopStore(store.directory); expect((await reloaded.load()).revision).toBe(1);
    await reloaded.transact(event); expect((await reloaded.load()).revision).toBe(1);
    await expect(reloaded.transact({ ...event,id:'loser' })).rejects.toThrow('revision conflict');
    expect((await reloaded.load()).events).toHaveLength(1);
  });
  it('requires explicit matching lock recovery and rejects malformed snapshots', async () => {
    const { store } = await fixture();
    await writeFile(path.join(store.directory,'lock.json'),JSON.stringify({token:'orphan'}));
    await expect(store.locked(async () => 1)).rejects.toThrow('Store locked');
    await expect(store.recoverLock('other','operations-stopped-and-side-effects-reconciled')).rejects.toThrow('ownership');
    expect(JSON.parse(await readFile(path.join(store.directory,'lock.json'),'utf8')).token).toBe('orphan');
    await store.recoverLock('orphan','operations-stopped-and-side-effects-reconciled');
    await writeFile(path.join(store.directory,'state.json'),'{');
    await expect(store.load()).rejects.toThrow('Invalid');
  });
  it('rejects imported metadata whose real source changed before locked commit', async () => {
    const { store, policy } = await fixture();
    await writeFile(path.join(policy.workspace,'artifact.txt'),'original'); await store.blob(Buffer.from('original'));
    const artifact = { id:'artifact',activity:'activity',version:1,hash:digest('original'),path:'artifact.txt',author:{instance:'author',context:'fresh',provider:'manual',model:'fixture',settings:{},tools:[]},inputs:[] };
    await writeFile(path.join(policy.workspace,'artifact.txt'),'changed-before-commit');
    await expect(store.transact({id:'pause',expectedRevision:0,actor:'owner',type:'run.pause',payload:{reason:'inspection'}},{artifacts:{artifact}})).rejects.toThrow('changed before commit');
    expect((await store.load()).revision).toBe(0);
  });
});
