import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { digest } from './json';
import { assessMainDelivery, PendingMainDelivery } from './main-delivery';
import type { Item } from './types';

const hash = 'a'.repeat(40);
const head = 'b'.repeat(40);
const bytes = Buffer.from('final source');
const item: Item = { id: 'feature', objective: 'Ship feature', owner: 'owner', affectedPaths: ['src/feature.ts'], dependencies: [], criteria: [], requiredArtifacts: {}, requiredGates: [], triage: {}, status: 'shipped', needs: [], escalation: null };
const delivery = { item, baselineFiles: { 'src/feature.ts': digest(Buffer.from('before')) }, finalFiles: { 'src/feature.ts': digest(bytes) } };
let workspace: string;
beforeEach(() => {
  workspace = mkdtempSync(path.join(os.tmpdir(), 'main-delivery-'));
  mkdirSync(path.join(workspace, 'src'));
  writeFileSync(path.join(workspace, 'src', 'feature.ts'), bytes);
});
afterEach(() => rmSync(workspace, { recursive: true, force: true }));

function runner(overrides: Partial<Record<string, { status: number; stdout?: string | Buffer; stderr?: string }>> = {}) {
  return (args: string[], cwd: string) => {
    const key = args[0] === 'rev-parse' && args[1] === '--show-toplevel' ? 'root'
      : args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}' ? 'head-ref'
        : args[0] === 'rev-parse' ? 'local-ref'
        : args[0] === 'ls-remote' ? 'remote-ref'
          : args[0] === 'status' ? 'status'
            : args[0] === 'ls-tree' && args[4] === head ? 'candidate-tree'
              : args[0] === 'ls-tree' && args[4] === hash ? 'tree'
                : args[0] === 'show' && args[1].startsWith(`${head}:`) ? 'head-blob'
                  : args[0] === 'show' && args[1].startsWith(`${hash}:`) ? 'blob' : args[0];
    const value = overrides[key] ?? (key === 'root' ? { status: 0, stdout: cwd }
      : key === 'local-ref' ? { status: 0, stdout: `${hash}\n` }
        : key === 'head-ref' ? { status: 0, stdout: `${head}\n` }
          : key === 'remote-ref' ? { status: 0, stdout: `${hash}\trefs/heads/main\n` }
            : key === 'remote' ? { status: 0, stdout: 'origin\n' }
        : key === 'tree' || key === 'candidate-tree' ? { status: 0, stdout: treeEntry('100644', 'src/feature.ts') }
          : key === 'blob' || key === 'head-blob' ? { status: 0, stdout: bytes }
            : ['ls-files', 'status'].includes(key) ? { status: 0, stdout: '' } : { status: 1, stdout: '' });
    return { ...value, stdout: value.stdout ?? '', stderr: value.stderr ?? '' };
  };
}
function treeEntry(mode: string, file: string) {
  return `${mode} blob ${hash}\t${file}\0`;
}

describe('main delivery guard', () => {
  it('requires a clean owned path matching a fresh remote main ref', () => {
    expect(assessMainDelivery([delivery], workspace, 'origin/main', runner())).toEqual({ target: 'origin/main', remoteCommit: hash, paths: ['src/feature.ts'], candidateFiles: ['src/feature.ts'], deletions: [], complete: true });
  });
  it('fails closed when the remote main ref differs from the fetched ref', () => {
    expect(() => assessMainDelivery([delivery], workspace, 'origin/main', runner({ 'remote-ref': { status: 0, stdout: `${'c'.repeat(40)}\trefs/heads/main\n` } }))).toThrow('stale');
  });
  it('fails when an owned path remains dirty or its remote content differs', () => {
    expect(() => assessMainDelivery([delivery], workspace, 'origin/main', runner({ status: { status: 0, stdout: ' M src/feature.ts\n' } }))).toThrow('uncommitted');
    expect(() => assessMainDelivery([delivery], workspace, 'origin/main', runner({ blob: { status: 0, stdout: Buffer.from('different') } }))).toThrow('does not match');
  });
  it('rejects paths absent from both snapshots and ignored new files missing from main', () => {
    expect(() => assessMainDelivery([{ item, baselineFiles: {}, finalFiles: {} }], workspace, 'origin/main', runner())).toThrow('no matching file');
    expect(() => assessMainDelivery([{ ...delivery, baselineFiles: {}, finalFiles: { 'src/feature.ts': digest(bytes) } }], workspace, 'origin/main', runner({ tree: { status: 0, stdout: '' } }))).toThrow('absent from origin/main');
  });
  it('rejects extra target files inside an owned directory', () => {
    const directory = { ...delivery, item: { ...item, affectedPaths: ['src'] } };
    expect(() => assessMainDelivery([directory], workspace, 'origin/main', runner({ tree: { status: 0, stdout: treeEntry('100644', 'src/feature.ts') + treeEntry('100644', 'src/stray.ts') } }))).toThrow('file set does not match');
  });
  it('accepts a deletion only when baseline evidence proves the file existed and main removed it', () => {
    const deletion = { item, baselineFiles: { 'src/feature.ts': digest(Buffer.from('before')) }, finalFiles: {} };
    rmSync(path.join(workspace, 'src', 'feature.ts'));
    expect(assessMainDelivery([deletion], workspace, 'origin/main', runner({ tree: { status: 0, stdout: '' }, 'candidate-tree': { status: 0, stdout: '' } }))).toMatchObject({ complete: true, candidateFiles: [], deletions: ['src/feature.ts'] });
    expect(() => assessMainDelivery([deletion], workspace, 'origin/main', runner({ 'candidate-tree': { status: 0, stdout: '' } }))).toThrow('deletion is absent');
  });
  it('rejects a remote symlink even when its blob text matches the candidate bytes', () => {
    expect(() => assessMainDelivery([delivery], workspace, 'origin/main', runner({ tree: { status: 0, stdout: treeEntry('120000', 'src/feature.ts') } }))).toThrow('Unsupported Git mode');
  });
  it('rejects an executable-bit mismatch between local candidate tree and main', () => {
    expect(() => assessMainDelivery([delivery], workspace, 'origin/main', runner({ tree: { status: 0, stdout: treeEntry('100755', 'src/feature.ts') } }))).toThrow('Git mode');
  });
  it('accepts executable files only when the exact Git mode matches the candidate tree', () => {
    expect(assessMainDelivery([delivery], workspace, 'origin/main', runner({ tree: { status: 0, stdout: treeEntry('100755', 'src/feature.ts') }, 'candidate-tree': { status: 0, stdout: treeEntry('100755', 'src/feature.ts') } }))).toMatchObject({ complete: true, candidateFiles: ['src/feature.ts'] });
  });
  it('fails closed when local mode evidence is missing or the candidate tree contains a symlink', () => {
    expect(() => assessMainDelivery([delivery], workspace, 'origin/main', runner({ 'candidate-tree': { status: 0, stdout: '' } }))).toThrow('mode evidence is missing');
    expect(() => assessMainDelivery([delivery], workspace, 'origin/main', runner({ 'candidate-tree': { status: 0, stdout: treeEntry('120000', 'src/feature.ts') } }))).toThrow('mode evidence is missing or unsupported');
  });
  it('rejects an accepted snapshot whose bytes no longer match HEAD', () => {
    expect(() => assessMainDelivery([delivery], workspace, 'origin/main', runner({ 'head-blob': { status: 0, stdout: Buffer.from('stale head bytes') } }))).toThrow('does not match HEAD');
  });
  it('rejects extra files under an owned path in HEAD even when main matches the final snapshot', () => {
    const directory = { ...delivery, item: { ...item, affectedPaths: ['src'] } };
    expect(() => assessMainDelivery([directory], workspace, 'origin/main', runner({ 'candidate-tree': { status: 0, stdout: treeEntry('100644', 'src/feature.ts') + treeEntry('100644', 'src/extra.ts') } }))).toThrow('file set does not match the final candidate in HEAD');
  });
  it('rejects Git tree paths that are not valid UTF-8', () => {
    const invalidPath = Buffer.concat([Buffer.from(`100644 blob ${hash}\t`, 'ascii'), Buffer.from([0xff]), Buffer.from([0])]);
    expect(() => assessMainDelivery([delivery], workspace, 'origin/main', runner({ tree: { status: 0, stdout: invalidPath } }))).toThrow('not valid UTF-8');
  });
  it('requires a safe, explicit owned path list and a main target', () => {
    expect(() => assessMainDelivery([{ ...delivery, item: { ...item, affectedPaths: [] } }], workspace, 'origin/main', runner())).toThrow('affectedPaths');
    expect(() => assessMainDelivery([delivery, { ...delivery, item: { ...item, id: 'empty', affectedPaths: [] } }], workspace, 'origin/main', runner())).toThrow('affectedPaths');
    expect(() => assessMainDelivery([delivery], workspace, 'origin/develop', runner())).toThrow('remote main');
    expect(() => assessMainDelivery([delivery], workspace, '--upload-pack/main', runner())).toThrow('remote main');
    expect(() => assessMainDelivery([{ ...delivery, item: { ...item, affectedPaths: ['../outside'] } }], workspace, 'origin/main', runner())).toThrow('affectedPaths');
  });
  it('requires the recorded workspace to be the repository root', () => {
    const fake = (args: string[], cwd: string) => args[0] === 'rev-parse' ? { status: 0, stdout: path.dirname(cwd), stderr: '' } : runner()(args, cwd);
    expect(() => assessMainDelivery([delivery], workspace, 'origin/main', fake)).toThrow('repository root');
  });
  it.each(['HEAD^{commit}', 'refs/remotes/origin/main^{commit}', 'refs/heads/main'])('fails closed when %s drifts during proof', ref => {
    let reads = 0;
    const stable = runner();
    const drifting: typeof stable = (args, cwd) => {
      if ((args[0] === 'rev-parse' || args[0] === 'ls-remote') && args.at(-1) === ref && ++reads === 2) {
        return { status: 0, stdout: `${'c'.repeat(40)}${args[0] === 'ls-remote' ? '\trefs/heads/main' : ''}\n`, stderr: '' };
      }
      return stable(args, cwd);
    };
    expect(() => assessMainDelivery([delivery], workspace, 'origin/main', drifting)).toThrow('changed during the delivery check');
  });
  it('rejects raw worktree byte or file type drift even when Git status is clean', () => {
    const file = path.join(workspace, 'src', 'feature.ts');
    writeFileSync(file, 'changed');
    expect(() => assessMainDelivery([delivery], workspace, 'origin/main', runner())).toThrow('working tree file type or bytes');
    rmSync(file);
    mkdirSync(file);
    expect(() => assessMainDelivery([delivery], workspace, 'origin/main', runner())).toThrow('working tree file type or bytes');
  });
  it('rejects a linked ancestor even when its target contains the expected bytes', () => {
    const source = path.join(workspace, 'src');
    const replacement = path.join(workspace, 'replacement');
    rmSync(source, { recursive: true });
    mkdirSync(replacement);
    writeFileSync(path.join(replacement, 'feature.ts'), bytes);
    symlinkSync(replacement, source, 'junction');
    expect(() => assessMainDelivery([delivery], workspace, 'origin/main', runner())).toThrow('Symbolic link');
  });
  it('rejects an extra nested file even when Git status omits it', () => {
    const ownedDirectory = { ...delivery, item: { ...item, affectedPaths: ['src'] } };
    mkdirSync(path.join(workspace, 'src', 'nested'));
    writeFileSync(path.join(workspace, 'src', 'nested', 'extra'), 'extra');
    expect(() => assessMainDelivery([ownedDirectory], workspace, 'origin/main', runner())).toThrow('Unexpected file');
  });
  it('rejects an owned directory that disappears after Git evidence is read', () => {
    const ownedDirectory = { ...delivery, item: { ...item, affectedPaths: ['src'] } };
    const stable = runner();
    let remoteReads = 0;
    const removeDirectory: typeof stable = (args, cwd) => {
      if (args[0] === 'ls-remote' && ++remoteReads === 2) {
        rmSync(path.join(workspace, 'src'), { recursive: true });
      }
      return stable(args, cwd);
    };
    expect(() => assessMainDelivery([ownedDirectory], workspace, 'origin/main', removeDirectory)).toThrow('working tree files are missing');
  });
  it('rejects a linked directory inside an owned scope before walking its target', () => {
    const ownedDirectory = { ...delivery, item: { ...item, affectedPaths: ['src'] } };
    const outside = path.join(workspace, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, path.join(workspace, 'src', 'link'), 'junction');
    expect(() => assessMainDelivery([ownedDirectory], workspace, 'origin/main', runner())).toThrow('Symbolic link');
  });
  it.skipIf(process.platform === 'win32')('rejects a FIFO inside an owned scope', () => {
    const ownedDirectory = { ...delivery, item: { ...item, affectedPaths: ['src'] } };
    const fifo = spawnSync('mkfifo', [path.join(workspace, 'src', 'pipe')], { encoding: 'utf8' });
    expect(fifo.status, fifo.stderr).toBe(0);
    expect(() => assessMainDelivery([ownedDirectory], workspace, 'origin/main', runner())).toThrow('working tree file type');
  });
  it('distinguishes branch-only delivery from a verified main push in a local bare repository', () => {
    const checkout = path.join(workspace, 'checkout');
    mkdirSync(checkout);
    const git = (...args: string[]) => {
      const result = spawnSync('git', args, { cwd: checkout, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
    };
    git('init', '--bare', '../remote.git');
    git('init', '-b', 'main');
    git('config', 'user.name', 'Loop Test');
    git('config', 'user.email', 'loop@example.test');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'core.autocrlf', 'false');
    git('remote', 'add', 'origin', '../remote.git');
    mkdirSync(path.join(checkout, 'src'));
    const file = path.join(checkout, 'src', 'feature.ts');
    writeFileSync(file, 'before');
    writeFileSync(path.join(checkout, '.gitignore'), '*.ignored\n');
    git('add', '.');
    git('commit', '-m', 'Baseline');
    git('push', 'origin', 'main');
    git('switch', '-c', 'task');
    writeFileSync(file, bytes);
    git('add', 'src/feature.ts');
    git('commit', '-m', 'Candidate');
    git('push', 'origin', 'task');
    const ownedDirectory = { ...delivery, item: { ...item, affectedPaths: ['src'] } };
    const prove = () => assessMainDelivery([ownedDirectory], checkout, 'origin/main');
    expect(prove).toThrow(PendingMainDelivery);

    git('push', 'origin', 'task:main');
    writeFileSync(path.join(checkout, 'unrelated'), 'local');
    writeFileSync(path.join(checkout, 'unrelated.ignored'), 'local');
    expect(prove()).toMatchObject({ complete: true });
    for (const flag of ['assume-unchanged', 'skip-worktree']) {
      git('update-index', `--${flag}`, 'src/feature.ts');
      expect(prove).toThrow('unsupported flags');
      git('update-index', `--no-${flag}`, 'src/feature.ts');
    }
    for (const filename of ['extra', 'extra.ignored']) {
      const extra = path.join(checkout, 'src', filename);
      writeFileSync(extra, 'local');
      expect(prove).toThrow('uncommitted or ignored changes');
      rmSync(extra);
    }
    const metadata = path.join(checkout, 'src', 'nested', '.git');
    mkdirSync(metadata, { recursive: true });
    writeFileSync(path.join(metadata, 'extra'), 'hidden from Git status');
    expect(prove).toThrow('Git metadata in owned working tree path');
    rmSync(path.dirname(metadata), { recursive: true });
    expect(prove()).toMatchObject({ complete: true });
  }, 30000);
});
