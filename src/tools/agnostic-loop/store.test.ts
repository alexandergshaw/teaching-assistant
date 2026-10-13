import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LoopStore } from './store';
import type { Policy } from './types';
import { digest } from './json';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(),'agnostic-store-')); roots.push(root);
  const workspace = path.join(root,'workspace'); await mkdir(workspace);
  const store = new LoopStore(path.join(root,'state'));
  const policy: Policy = { owner:'owner',workspace,allowedActions:['write'],candidateExclusions:[],environmentKeys:[],externalFiles:[],gates:{},concurrency:3,deadline:Date.now()+60_000,maxAssignments:10,commandTimeout:5000 };
  await store.init(policy); return { root, store, policy };
}
describe('durable atomic store', () => {
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
