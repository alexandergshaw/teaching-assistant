import { spawnSync } from 'node:child_process';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './json';
import type { Item } from './types';

type GitResult = { status: number | null; stdout: string | Buffer; stderr: string | Buffer; error?: Error };
type GitRunner = (args: string[], cwd: string) => GitResult;
type DeliveryEvidence = { item: Item; baselineFiles: Record<string, string>; finalFiles: Record<string, string> };
type TreeEntry = { mode: string; type: string; object: string };

export class MainDeliveryEvidenceError extends Error {
  readonly exitCode = 1;
  constructor(message: string) { super(message); this.name = 'MainDeliveryEvidenceError'; }
}

const runGit: GitRunner = (args, cwd) => {
  const result = spawnSync('git', args, { cwd, windowsHide: true, encoding: 'buffer' });
  return { status: result.status, stdout: result.stdout ?? Buffer.alloc(0), stderr: result.stderr ?? Buffer.alloc(0), ...(result.error ? { error: result.error } : {}) };
};
const asText = (value: string | Buffer) => typeof value === 'string' ? value : value.toString('utf8');
function checkedGit(run: GitRunner, args: string[], cwd: string): GitResult {
  const result = run(args, cwd);
  if (result.error || result.status !== 0) throw new MainDeliveryEvidenceError(asText(result.stderr).trim() || result.error?.message || `git ${args[0]} failed`);
  return result;
}
function oid(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(normalized)) throw new MainDeliveryEvidenceError(`${label} did not produce an immutable commit object ID`);
  return normalized;
}
function pathsUnder(files: Record<string, string>, ownedPath: string): string[] {
  const prefix = ownedPath.replace(/[\\/]$/, '');
  return Object.keys(files).filter(file => file === prefix || file.startsWith(`${prefix}/`));
}
function parseTree(output: string | Buffer): Map<string, TreeEntry> {
  const entries = new Map<string, TreeEntry>();
  const bytes = Buffer.isBuffer(output) ? output : Buffer.from(output, 'utf8');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let cursor = 0;
  while (cursor < bytes.length) {
    const end = bytes.indexOf(0, cursor);
    if (end < 0) throw new MainDeliveryEvidenceError('Git tree evidence is malformed');
    const record = bytes.subarray(cursor, end);
    const separator = record.indexOf(9);
    if (separator < 0) throw new MainDeliveryEvidenceError('Git tree evidence is malformed');
    const header = record.subarray(0, separator).toString('ascii').match(/^(\d{6}) (blob|commit) ([a-f0-9]+)$/);
    const pathBytes = record.subarray(separator + 1);
    let filename: string;
    try { filename = decoder.decode(pathBytes); }
    catch { throw new MainDeliveryEvidenceError('Git tree contains a path that is not valid UTF-8'); }
    if (!Buffer.from(filename, 'utf8').equals(pathBytes) || !header || !filename || entries.has(filename)) throw new MainDeliveryEvidenceError('Git tree evidence is malformed');
    entries.set(filename, { mode: header[1], type: header[2], object: header[3] });
    cursor = end + 1;
  }
  return entries;
}
function validatePath(value: string): void {
  if (!value || path.isAbsolute(value) || value.includes(':') || value.includes('\\') || value.split('/').some(part => part === '' || part === '.' || part === '..')) {
    throw new MainDeliveryEvidenceError(`Unsafe repository-relative affectedPath: ${value}`);
  }
}
function parseIndexFlags(output: string | Buffer): void {
  const bytes = Buffer.isBuffer(output) ? output : Buffer.from(output, 'utf8');
  let cursor = 0;
  while (cursor < bytes.length) {
    const end = bytes.indexOf(0, cursor);
    if (end < 0) throw new MainDeliveryEvidenceError('Git index evidence is malformed');
    const record = bytes.subarray(cursor, end);
    if (record.length < 3 || record[1] !== 32) throw new MainDeliveryEvidenceError('Git index evidence is malformed');
    const tag = String.fromCharCode(record[0]);
    if (tag === 'S' || tag === 's' || tag === 'h') throw new MainDeliveryEvidenceError('Owned path has skip-worktree or assume-unchanged index flags');
    cursor = end + 1;
  }
}
async function inspectWorktreePath(root: string, ownedPath: string): Promise<Map<string, Buffer>> {
  const found = new Map<string, Buffer>();
  const parts = ownedPath.split('/');
  let absolute = root;
  for (const [index, part] of parts.entries()) {
    absolute = path.join(absolute, part);
    try {
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) throw new MainDeliveryEvidenceError(`Owned worktree path contains a symbolic link: ${parts.slice(0, index + 1).join('/')}`);
      if (index < parts.length - 1 && !stat.isDirectory()) throw new MainDeliveryEvidenceError(`Owned worktree parent is not a directory: ${parts.slice(0, index + 1).join('/')}`);
    } catch (error) {
      if (error instanceof MainDeliveryEvidenceError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return found;
      throw new MainDeliveryEvidenceError(`Cannot inspect worktree path ${parts.slice(0, index + 1).join('/')}`);
    }
  }
  const visit = async (filename: string, relative: string): Promise<void> => {
    let stat;
    try { stat = await lstat(filename); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new MainDeliveryEvidenceError(`Cannot inspect worktree path ${relative}`);
    }
    if (stat.isSymbolicLink()) throw new MainDeliveryEvidenceError(`Owned worktree path contains a symbolic link: ${relative}`);
    if (stat.isDirectory()) {
      for (const child of await readdir(filename)) await visit(path.join(filename, child), `${relative}/${child}`);
      return;
    }
    if (!stat.isFile()) throw new MainDeliveryEvidenceError(`Owned worktree path contains a non-regular file: ${relative}`);
    found.set(relative, await readFile(filename));
  };
  await visit(absolute, ownedPath);
  return found;
}

/**
 * Checks whether a clean committed candidate has reached the live remote main.
 * Invalid or unprovable Git/worktree evidence throws (CLI exit 1); valid evidence
 * whose owned candidate is not yet on main returns complete:false (CLI exit 2).
 * This command never fetches, stages, commits, merges, or pushes.
 */
export async function assessMainDelivery(deliveries: DeliveryEvidence[], workspace: string, target: string, run: GitRunner = runGit) {
  const targetMatch = /^([A-Za-z0-9._-]+)\/main$/.exec(target);
  if (!targetMatch) throw new MainDeliveryEvidenceError('Target must name a remote main branch such as origin/main');
  const remote = targetMatch[1];
  if (!Array.isArray(deliveries) || deliveries.some(({ item }) => !item || !Array.isArray(item.affectedPaths))) throw new MainDeliveryEvidenceError('Every requested item must declare affectedPaths before main delivery can be proved');
  const paths = [...new Set(deliveries.flatMap(({ item }) => item.affectedPaths))].sort();
  if (!deliveries.length || !paths.length) throw new MainDeliveryEvidenceError('Every requested item must declare affectedPaths before main delivery can be proved');
  paths.forEach(validatePath);

  const cwd = path.resolve(workspace);
  const root = asText(checkedGit(run, ['rev-parse', '--show-toplevel'], cwd).stdout).trim();
  if (path.resolve(root).toLowerCase() !== cwd.toLowerCase()) throw new MainDeliveryEvidenceError('The loop workspace must be the Git repository root');

  const head = oid(asText(checkedGit(run, ['rev-parse', '--verify', 'HEAD^{commit}'], cwd).stdout), 'HEAD');
  const localRef = asText(checkedGit(run, ['rev-parse', '--verify', `refs/remotes/${remote}/main^{commit}`], cwd).stdout);
  const remoteOids = asText(checkedGit(run, ['ls-remote', '--exit-code', remote, 'refs/heads/main'], cwd).stdout).trim().split(/\s+/);
  const remoteCommit = oid(remoteOids[0] ?? '', `${target} ls-remote`);
  if (oid(localRef, `${target} tracking ref`) !== remoteCommit) throw new MainDeliveryEvidenceError(`${target} is stale; fetch the remote and rerun the delivery check`);

  const ownedPathspecs = paths.map(value => `:(literal)${value}`);
  const status = asText(checkedGit(run, ['status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching', '--', ...ownedPathspecs], cwd).stdout).trim();
  if (status) throw new MainDeliveryEvidenceError(`Owned paths have uncommitted, untracked, or ignored worktree entries: ${status}`);
  parseIndexFlags(checkedGit(run, ['ls-files', '-v', '-z', '--', ...ownedPathspecs], cwd).stdout);

  // Pin both trees and all blobs by their immutable object IDs before comparing.
  const candidateTree = parseTree(checkedGit(run, ['ls-tree', '-r', '-z', '--full-tree', head], cwd).stdout);
  const targetTree = parseTree(checkedGit(run, ['ls-tree', '-r', '-z', '--full-tree', remoteCommit], cwd).stdout);
  const expectedFiles = new Map<string, string>();
  const deletions = new Set<string>();
  const expectedByOwnedPath = new Map<string, Set<string>>();
  for (const { item, baselineFiles, finalFiles } of deliveries) {
    if (!baselineFiles || !finalFiles || typeof baselineFiles !== 'object' || typeof finalFiles !== 'object') throw new MainDeliveryEvidenceError('Candidate file snapshots are missing or malformed');
    for (const [file, hash] of [...Object.entries(baselineFiles), ...Object.entries(finalFiles)]) {
      validatePath(file);
      if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new MainDeliveryEvidenceError(`Snapshot for ${file} does not contain a SHA-256 digest`);
    }
    for (const ownedPath of item.affectedPaths) {
      validatePath(ownedPath);
      const baseline = pathsUnder(baselineFiles, ownedPath);
      const final = pathsUnder(finalFiles, ownedPath);
      if (!baseline.length && !final.length) throw new MainDeliveryEvidenceError(`Owned path has no matching file in the admitted baseline or final candidate: ${ownedPath}`);
      expectedByOwnedPath.set(ownedPath, new Set(final));
      for (const file of final) {
        const previous = expectedFiles.get(file);
        if (previous && previous !== finalFiles[file]) throw new MainDeliveryEvidenceError(`Requested items disagree about final candidate bytes: ${file}`);
        expectedFiles.set(file, finalFiles[file]);
      }
      for (const file of baseline.filter(file => !Object.hasOwn(finalFiles, file))) deletions.add(file);
    }
  }

  // The snapshot, HEAD tree, and actual worktree must agree, including file types.
  for (const [ownedPath, expected] of expectedByOwnedPath) {
    const actualFiles = await inspectWorktreePath(cwd, ownedPath);
    if (actualFiles.size !== expected.size || [...actualFiles.keys()].some(file => !expected.has(file))) {
      throw new MainDeliveryEvidenceError(`Worktree file set contains missing, untracked, ignored, or extra entries under ${ownedPath}`);
    }
  }
  for (const [file, expectedHash] of expectedFiles) {
    const actual = candidateTree.get(file);
    if (!actual || actual.type !== 'blob' || !['100644', '100755'].includes(actual.mode)) throw new MainDeliveryEvidenceError(`Candidate HEAD lacks a regular file at ${file}`);
    const worktreeBytes = await readFile(path.join(cwd, ...file.split('/')));
    if (digest(worktreeBytes) !== expectedHash) throw new MainDeliveryEvidenceError(`Worktree bytes do not match the admitted final candidate: ${file}`);
    const candidateBytes = checkedGit(run, ['cat-file', 'blob', actual.object], cwd).stdout;
    if (digest(candidateBytes) !== expectedHash) throw new MainDeliveryEvidenceError(`Pinned HEAD blob does not match the admitted final candidate: ${file}`);
  }
  for (const file of deletions) {
    if (candidateTree.has(file)) throw new MainDeliveryEvidenceError(`Final candidate deletion is not present in pinned HEAD: ${file}`);
  }
  for (const [ownedPath, expected] of expectedByOwnedPath) {
    const candidate = [...candidateTree.keys()].filter(file => file === ownedPath || file.startsWith(`${ownedPath}/`));
    if (candidate.length !== expected.size || candidate.some(file => !expected.has(file))) throw new MainDeliveryEvidenceError(`Owned path file set does not match the final candidate in HEAD: ${ownedPath}`);
  }

  const mismatches: string[] = [];
  for (const [file] of expectedFiles) {
    const candidate = candidateTree.get(file)!;
    const onMain = targetTree.get(file);
    if (!onMain || onMain.type !== 'blob' || onMain.mode !== candidate.mode) { mismatches.push(file); continue; }
    const mainBytes = checkedGit(run, ['cat-file', 'blob', onMain.object], cwd).stdout;
    if (digest(mainBytes) !== expectedFiles.get(file)) mismatches.push(file);
  }
  for (const file of deletions) if (targetTree.has(file)) mismatches.push(file);
  for (const [ownedPath, expected] of expectedByOwnedPath) {
    const mainFiles = [...targetTree.keys()].filter(file => file === ownedPath || file.startsWith(`${ownedPath}/`));
    if (mainFiles.length !== expected.size || mainFiles.some(file => !expected.has(file))) mismatches.push(ownedPath);
  }

  const finalStatus = asText(checkedGit(run, ['status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching', '--', ...ownedPathspecs], cwd).stdout).trim();
  if (finalStatus) throw new MainDeliveryEvidenceError(`Owned worktree changed during the delivery check: ${finalStatus}`);
  parseIndexFlags(checkedGit(run, ['ls-files', '-v', '-z', '--', ...ownedPathspecs], cwd).stdout);
  for (const [ownedPath, expected] of expectedByOwnedPath) {
    const finalFiles = await inspectWorktreePath(cwd, ownedPath);
    if (finalFiles.size !== expected.size || [...expectedFiles].some(([file, hash]) => (file === ownedPath || file.startsWith(`${ownedPath}/`)) && (!finalFiles.has(file) || digest(finalFiles.get(file)!) !== hash))) {
      throw new MainDeliveryEvidenceError(`Owned worktree changed during the delivery check: ${ownedPath}`);
    }
  }
  const finalHead = oid(asText(checkedGit(run, ['rev-parse', '--verify', 'HEAD^{commit}'], cwd).stdout), 'HEAD');
  const finalRemote = oid(asText(checkedGit(run, ['ls-remote', '--exit-code', remote, 'refs/heads/main'], cwd).stdout).trim().split(/\s+/)[0] ?? '', `${target} ls-remote`);
  if (finalHead !== head || finalRemote !== remoteCommit) throw new MainDeliveryEvidenceError('HEAD or remote main changed during the delivery check; rerun against a quiescent candidate');
  return { target, candidateCommit: head, remoteCommit, paths, candidateFiles: [...expectedFiles.keys()], deletions: [...deletions], complete: mismatches.length === 0, mismatches: [...new Set(mismatches)] };
}

async function readEvidence(filename: string): Promise<DeliveryEvidence[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filename, 'utf8'));
    if (!Array.isArray(parsed) || !parsed.length) throw new Error();
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object' || !('item' in entry) || !('baselineFiles' in entry) || !('finalFiles' in entry)) throw new Error();
      const value = entry as DeliveryEvidence;
      if (!value.item || !Array.isArray(value.item.affectedPaths) || !value.baselineFiles || !value.finalFiles || Object.values(value.baselineFiles).some(v => typeof v !== 'string') || Object.values(value.finalFiles).some(v => typeof v !== 'string')) throw new Error();
    }
    return parsed as DeliveryEvidence[];
  } catch { throw new MainDeliveryEvidenceError('Invalid delivery evidence JSON; provide an array of {item, baselineFiles, finalFiles} snapshots'); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , evidencePath, workspace, target] = process.argv;
  if (!evidencePath || !workspace || !target || process.argv.length !== 5) {
    process.stderr.write('Usage: main-delivery.ts EVIDENCE.json WORKSPACE origin/main\n'); process.exitCode = 1;
  } else {
    readEvidence(evidencePath).then(deliveries => assessMainDelivery(deliveries, workspace, target)).then(report => {
      process.stdout.write(`${JSON.stringify(report)}\n`); process.exitCode = report.complete ? 0 : 2;
    }).catch(error => {
      process.stderr.write(`Main delivery unproven: ${error instanceof Error ? error.message : 'invalid evidence'}. No transition or recovery was performed.\n`); process.exitCode = 1;
    });
  }
}
