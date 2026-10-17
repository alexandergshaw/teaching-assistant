import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { digest } from './json';
import { assessMainDelivery } from './main-delivery';
import type { Item } from './types';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });
const item: Item = { id: 'feature', objective: 'Deliver feature', owner: 'owner', affectedPaths: ['src'], dependencies: [], criteria: [], requiredArtifacts: {}, requiredGates: [], triage: {}, status: 'shipped', needs: [], escalation: null };
function git(cwd: string, ...args: string[]): Buffer {
  const result = spawnSync('git', args, { cwd, encoding: 'buffer', windowsHide: true });
  if (result.status !== 0) throw new Error(`${args.join(' ')} failed: ${result.stderr.toString()}`);
  return result.stdout;
}
async function fixture() {
  const base = await mkdtemp(path.join(os.tmpdir(), 'main-delivery-')); temporary.push(base);
  const bare = path.join(base, 'remote.git'); const source = path.join(base, 'source'); const work = path.join(base, 'work');
  await mkdir(source); git(source, 'init', '--initial-branch=main'); git(source, 'config', 'user.name', 'Test'); git(source, 'config', 'user.email', 'test@example.invalid');
  await mkdir(path.join(source, 'src')); await writeFile(path.join(source, 'src', 'feature.ts'), 'before');
  git(source, 'add', 'src/feature.ts'); git(source, 'commit', '-m', 'baseline');
  git(base, 'init', '--bare', '--initial-branch=main', bare); git(source, 'remote', 'add', 'origin', bare); git(source, 'push', '-u', 'origin', 'main');
  git(base, 'clone', bare, work); git(work, 'config', 'user.name', 'Test'); git(work, 'config', 'user.email', 'test@example.invalid');
  await writeFile(path.join(work, 'src', 'feature.ts'), 'final'); git(work, 'add', 'src/feature.ts'); git(work, 'commit', '-m', 'feature candidate');
  return { base, bare, work, before: digest(Buffer.from('before')), final: digest(Buffer.from('final')) };
}

describe('main delivery guard', () => {
  it('reports valid branch-only candidate delivery as incomplete, not unproven', async () => {
    const f = await fixture();
    const report = await assessMainDelivery([{ item, baselineFiles: { 'src/feature.ts': f.before }, finalFiles: { 'src/feature.ts': f.final } }], f.work, 'origin/main');
    expect(report).toMatchObject({ complete: false, target: 'origin/main', candidateFiles: ['src/feature.ts'], mismatches: ['src/feature.ts'] });
  });

  it('proves delivery after the candidate commit is pushed to main', async () => {
    const f = await fixture(); git(f.work, 'push', 'origin', 'HEAD:main');
    const report = await assessMainDelivery([{ item, baselineFiles: { 'src/feature.ts': f.before }, finalFiles: { 'src/feature.ts': f.final } }], f.work, 'origin/main');
    expect(report.complete).toBe(true);
  });

  it('rejects a dirty worktree, including ignored and untracked files under an owned directory', async () => {
    const f = await fixture(); await writeFile(path.join(f.work, 'src', 'extra.ts'), 'extra');
    await expect(assessMainDelivery([{ item, baselineFiles: { 'src/feature.ts': f.before }, finalFiles: { 'src/feature.ts': f.final } }], f.work, 'origin/main')).rejects.toThrow(/untracked|extra entries/i);
    await rm(path.join(f.work, 'src', 'extra.ts'));
    await writeFile(path.join(f.work, '.gitignore'), 'src/ignored.ts\n'); git(f.work, 'add', '.gitignore'); git(f.work, 'commit', '-m', 'ignore fixture');
    await writeFile(path.join(f.work, 'src', 'ignored.ts'), 'ignored');
    await expect(assessMainDelivery([{ item, baselineFiles: { 'src/feature.ts': f.before }, finalFiles: { 'src/feature.ts': f.final } }], f.work, 'origin/main')).rejects.toThrow(/ignored|extra entries/i);
  });

  it('rejects accepted candidate bytes that do not match the actual clean worktree', async () => {
    const f = await fixture();
    await expect(assessMainDelivery([{ item, baselineFiles: { 'src/feature.ts': f.before }, finalFiles: { 'src/feature.ts': digest(Buffer.from('different')) } }], f.work, 'origin/main')).rejects.toThrow(/worktree bytes/i);
  });

  it.each(['--assume-unchanged', '--skip-worktree'])('rejects %s on an owned tracked file', async flag => {
    const f = await fixture(); git(f.work, 'update-index', flag, 'src/feature.ts');
    await expect(assessMainDelivery([{ item, baselineFiles: { 'src/feature.ts': f.before }, finalFiles: { 'src/feature.ts': f.final } }], f.work, 'origin/main')).rejects.toThrow(/skip-worktree or assume-unchanged/);
  });

  it('uses pinned commit IDs and immutable blob IDs instead of ref:path expressions', async () => {
    const f = await fixture(); const commands: string[][] = [];
    const run = (args: string[], cwd: string) => { commands.push(args); const result = spawnSync('git', args, { cwd, encoding: 'buffer', windowsHide: true }); return { status: result.status, stdout: result.stdout, stderr: result.stderr, ...(result.error ? { error: result.error } : {}) }; };
    await assessMainDelivery([{ item, baselineFiles: { 'src/feature.ts': f.before }, finalFiles: { 'src/feature.ts': f.final } }], f.work, 'origin/main', run);
    expect(commands.some(args => args[0] === 'ls-tree' && /^[a-f0-9]{40,64}$/.test(args.at(-1) ?? ''))).toBe(true);
    expect(commands.some(args => args[0] === 'cat-file' && args[1] === 'blob' && /^[a-f0-9]{40,64}$/.test(args[2]))).toBe(true);
    expect(commands.some(args => args.some(arg => arg.includes(':src/')))).toBe(false);
  });

  it('CLI distinguishes incomplete delivery (2) from invalid evidence (1)', async () => {
    const f = await fixture(); const evidence = path.join(f.base, 'evidence.json');
    await writeFile(evidence, JSON.stringify([{ item, baselineFiles: { 'src/feature.ts': f.before }, finalFiles: { 'src/feature.ts': f.final } }]));
    const run = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', '--experimental-default-type=module', '--experimental-loader', './src/tools/backlog/resolve-ts-hook.ts', './src/tools/agnostic-loop/main-delivery.ts', ...args], { cwd: process.cwd(), encoding: 'utf8', timeout: 15000 });
    const incomplete = run(evidence, f.work, 'origin/main');
    expect(incomplete.status, incomplete.stderr).toBe(2); expect(JSON.parse(incomplete.stdout).complete).toBe(false);
    expect(run(evidence, f.work, 'origin/develop').status).toBe(1);
  }, 30000);
});
