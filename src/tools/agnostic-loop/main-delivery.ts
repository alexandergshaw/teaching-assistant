import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, type Stats } from 'node:fs';
import { digest } from './json';
import path from 'node:path';
import { relativePath } from './paths';
import type { Item } from './types';

type GitResult = { status: number | null; stdout: string | Buffer; stderr: string | Buffer; error?: Error };
type GitRunner = (args: string[], cwd: string) => GitResult;

const runGit: GitRunner = (args, cwd) => {
  const result = spawnSync('git', args, {
    cwd, windowsHide: true,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0' },
  });
  return { status: result.status, stdout: result.stdout ?? Buffer.alloc(0), stderr: result.stderr ?? Buffer.alloc(0), ...(result.error ? { error: result.error } : {}) };
};

const asText = (value: string | Buffer) => typeof value === 'string' ? value : value.toString('utf8');
function checkedGit(run: GitRunner, args: string[], cwd: string): GitResult {
  const result = run(args, cwd);
  if (result.error || result.status !== 0) throw new Error(`Unable to obtain Git evidence from git ${args[0]}`);
  return result;
}

type DeliveryEvidence = { item: Item; baselineFiles: Record<string, string>; finalFiles: Record<string, string> };
function isOwned(file: string, scope: string) {
  return file === scope || file.startsWith(`${scope}/`);
}
export class PendingMainDelivery extends Error {}

export function mainDeliveryRemote(target: string): string {
  const match = /^([A-Za-z0-9_][A-Za-z0-9._-]*)\/main$/.exec(target);
  if (!match || match[0] !== target || match[1].includes('..') || match[1].endsWith('.lock')) {
    throw new Error('Target must name a remote main branch such as origin/main');
  }
  return match[1];
}

function deliveryPaths(items: Item[]): string[] {
  if (!items.length || items.some(item => !item.affectedPaths.length)) {
    throw new Error('Every requested item must declare safe, repository-relative affectedPaths before main delivery can be proved');
  }
  const paths = [...new Set(items.flatMap(item => item.affectedPaths))].sort();
  for (const file of paths) {
    try { deliveryPath(file); }
    catch { throw new Error('Every requested item must declare safe, repository-relative affectedPaths before main delivery can be proved'); }
  }
  return paths;
}

function deliveryPath(file: string) {
  relativePath(file);
  if (file.includes(':') || file.includes('\0') || file.split('/').some(part => part.toLowerCase() === '.git')) {
    throw new Error('Invalid delivery evidence path');
  }
  return file;
}

const gitOid = '(?:[a-f0-9]{40}|[a-f0-9]{64})';
function pinnedCommit(run: GitRunner, cwd: string, ref: string) {
  const output = asText(checkedGit(run, ['rev-parse', '--verify', `${ref}^{commit}`], cwd).stdout);
  const match = new RegExp(`^(${gitOid})\\r?\\n?$`).exec(output);
  if (!match) throw new Error(`Invalid Git commit evidence for ${ref}`);
  return match[1];
}

function remoteCommit(run: GitRunner, cwd: string, remote: string) {
  const output = asText(checkedGit(run, ['ls-remote', '--exit-code', '--', remote, 'refs/heads/main'], cwd).stdout);
  const match = new RegExp(`^(${gitOid})\\trefs/heads/main\\r?\\n?$`).exec(output);
  if (!match) throw new Error('Invalid live remote main evidence');
  return match[1];
}

function workingEntry(cwd: string, file: string) {
  const parts = deliveryPath(file).split('/');
  let location = cwd;
  for (const [index, part] of parts.entries()) {
    location = path.join(location, part);
    const info = lstatSync(location, { throwIfNoEntry: false });
    if (!info) return;
    if (info.isSymbolicLink()) throw new Error(`Symbolic link in owned working tree path: ${file}`);
    if (index === parts.length - 1) return { location, info };
    if (!info.isDirectory()) return;
  }
}

function assertWorkingTree(cwd: string, scope: string, expected: Set<string>, hashes: Map<string, string>) {
  const missing = new Set(expected);
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

  function visit(file: string, location: string, before: Stats) {
    if (before.isSymbolicLink()) throw new Error(`Symbolic link in owned working tree path: ${file}`);
    if (before.isDirectory() && !expected.has(file)) {
      for (const entry of readdirSync(location, { encoding: 'buffer' })) {
        const name = decoder.decode(entry);
        const child = `${file}/${name}`;
        if (name.toLowerCase() === '.git') throw new Error(`Git metadata in owned working tree path: ${child}`);
        deliveryPath(child);
        const childLocation = path.join(location, name);
        visit(child, childLocation, lstatSync(childLocation));
      }
    } else {
      if (!before.isFile()) throw new Error(`Owned working tree file type or bytes do not match the final candidate: ${file}`);
      if (!missing.delete(file)) throw new Error(`Unexpected file in owned working tree path: ${file}`);
      if (digest(readFileSync(location)) !== hashes.get(file)) {
        throw new Error(`Owned working tree file type or bytes do not match the final candidate: ${file}`);
      }
    }
    const after = lstatSync(location);
    if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode ||
        before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      throw new Error(`Owned working tree path changed during the delivery check: ${file}`);
    }
  }

  const working = workingEntry(cwd, scope);
  if (working) visit(scope, working.location, working.info);
  if (missing.size) throw new Error(`Owned working tree files are missing from the final candidate's path set: ${scope}`);
}

type TreeEntry = { mode: string; type: string; object: string };
function parseTree(output: string | Buffer): Map<string, TreeEntry> {
  const entries = new Map<string, TreeEntry>();
  const bytes = Buffer.isBuffer(output) ? output : Buffer.from(output, 'utf8');
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let cursor = 0;
  while (cursor < bytes.length) {
    const end = bytes.indexOf(0, cursor);
    if (end < 0) throw new Error('Git tree evidence is malformed');
    const record = bytes.subarray(cursor, end);
    const separator = record.indexOf(9);
    if (separator < 0) throw new Error('Git tree evidence is malformed');
    const header = record.subarray(0, separator).toString('latin1').match(new RegExp(`^(\\d{6}) (blob|commit) (${gitOid})$`));
    const pathBytes = record.subarray(separator + 1);
    let filename: string;
    try { filename = decoder.decode(pathBytes); }
    catch { throw new Error('Git tree contains a path that is not valid UTF-8'); }
    if (!Buffer.from(filename, 'utf8').equals(pathBytes)) throw new Error('Git tree path did not round-trip byte-for-byte');
    if (!header || !filename || entries.has(filename)) throw new Error('Git tree evidence is malformed');
    entries.set(filename, { mode: header[1], type: header[2], object: header[3] });
    cursor = end + 1;
  }
  return entries;
}

/**
 * Proves that the requested paths are clean and match the live remote main ref.
 * It deliberately does not fetch, commit, merge, or push; a stale local ref fails closed.
 */
export function assessMainDelivery(deliveries: DeliveryEvidence[], workspace: string, target: string, run: GitRunner = runGit) {
  const remote = mainDeliveryRemote(target);
  const paths = deliveryPaths(deliveries.map(({ item }) => item));
  const cwd = path.resolve(workspace);
  const root = asText(checkedGit(run, ['rev-parse', '--show-toplevel'], cwd).stdout).replace(/\r?\n$/, '');
  if (!root || path.relative(cwd, path.resolve(root))) throw new Error('The loop workspace must be the Git repository root');
  const configuredRemotes = asText(checkedGit(run, ['remote'], cwd).stdout).split(/\r?\n/);
  if (!configuredRemotes.includes(remote)) throw new Error(`Target remote is not configured: ${remote}`);
  const ref = `refs/remotes/${remote}/main`;
  const local = pinnedCommit(run, cwd, ref);
  const head = pinnedCommit(run, cwd, 'HEAD');
  const live = remoteCommit(run, cwd, remote);
  if (live !== local) throw new Error(`${target} is stale; fetch the remote and rerun the delivery check`);
  const literalPaths = paths.map(file => `:(literal)${file}`);
  const index = asText(checkedGit(run, ['ls-files', '-v', '-z', '--cached', '--', ...literalPaths], cwd).stdout);
  if (index && (!index.endsWith('\0') || index.slice(0, -1).split('\0').some(record => !record.startsWith('H ')))) {
    throw new Error('Owned index entries have unsupported flags or an unmerged state');
  }
  const status = asText(checkedGit(run, ['status', '--porcelain=v1', '--no-renames', '--untracked-files=all', '--ignored=traditional', '--', ...literalPaths], cwd).stdout);
  if (status) throw new Error(`Requested paths still have uncommitted or ignored changes: ${status.trim()}`);
  const targetTree = parseTree(checkedGit(run, ['ls-tree', '-r', '-z', '--full-tree', local], cwd).stdout);
  // Candidate snapshots bind file bytes and reject symlinks, but do not carry
  // Git modes. The clean owned paths, HEAD blob hashes and complete path set
  // bind the admitted candidate; HEAD supplies its mode evidence.
  const candidateTree = parseTree(checkedGit(run, ['ls-tree', '-r', '-z', '--full-tree', head], cwd).stdout);
  const candidateFiles = new Map<string, string>();
  const deletions = new Set<string>();
  const expectedByOwnedPath = new Map<string, Set<string>>();
  for (const { item, baselineFiles, finalFiles } of deliveries) {
    for (const ownedPath of item.affectedPaths) {
      const baseline = Object.keys(baselineFiles).filter(file => isOwned(file, ownedPath));
      const final = Object.keys(finalFiles).filter(file => isOwned(file, ownedPath));
      if (!baseline.length && !final.length) throw new Error(`Owned path has no matching file in the admitted baseline or final candidate: ${ownedPath}`);
      const prior = expectedByOwnedPath.get(ownedPath);
      if (prior && (prior.size !== final.length || final.some(file => !prior.has(file)))) {
        throw new Error(`Requested items disagree about the final candidate file set: ${ownedPath}`);
      }
      expectedByOwnedPath.set(ownedPath, new Set(final));
      for (const file of final) {
        const previous = candidateFiles.get(file);
        if (previous && previous !== finalFiles[file]) throw new Error(`Requested items disagree about final candidate bytes: ${file}`);
        candidateFiles.set(file, finalFiles[file]);
      }
      for (const file of baseline.filter(file => !Object.hasOwn(finalFiles, file))) deletions.add(file);
    }
  }
  for (const [file, expectedHash] of candidateFiles) {
    const expected = candidateTree.get(file);
    if (!expected || expected.type !== 'blob' || !['100644', '100755'].includes(expected.mode)) throw new Error(`Candidate Git mode evidence is missing or unsupported for ${file}`);
    const candidateBytes = checkedGit(run, ['show', `${head}:${file}`], cwd).stdout;
    if (digest(candidateBytes) !== expectedHash) throw new Error(`Final candidate file does not match HEAD: ${file}`);
  }
  for (const file of deletions) {
    if (candidateTree.has(file)) throw new Error(`Final candidate deletion is not present in the local candidate tree: ${file}`);
    const working = workingEntry(cwd, file);
    if (working && (!working.info.isDirectory() || ![...candidateFiles.keys()].some(candidate => candidate.startsWith(`${file}/`)))) {
      throw new Error(`Owned working tree path still exists after the final candidate deletion: ${file}`);
    }
  }
  for (const [ownedPath, expected] of expectedByOwnedPath) {
    const candidate = [...candidateTree.keys()].filter(file => isOwned(file, ownedPath));
    if (candidate.length !== expected.size || candidate.some(file => !expected.has(file))) throw new Error(`Owned path file set does not match the final candidate in HEAD: ${ownedPath}`);
  }
  let pending: string | undefined;
  for (const [file, expectedHash] of candidateFiles) {
    const actual = targetTree.get(file);
    if (!actual) { pending = `Final candidate file is absent from ${target}: ${file}`; break; }
    if (actual.type !== 'blob' || !['100644', '100755'].includes(actual.mode)) {
      pending = `Unsupported Git mode in ${target} for candidate regular file ${file}: ${actual.mode}`; break;
    }
    if (actual.mode !== candidateTree.get(file)?.mode) {
      pending = `Git mode for final candidate file does not match the admitted candidate: ${file}`; break;
    }
    const bytes = checkedGit(run, ['show', `${local}:${file}`], cwd).stdout;
    if (digest(bytes) !== expectedHash) { pending = `Final candidate file does not match ${target}: ${file}`; break; }
  }
  for (const file of deletions) {
    if (targetTree.has(file)) pending ??= `Final candidate deletion is absent from ${target}: ${file}`;
  }
  for (const [ownedPath, expected] of expectedByOwnedPath) {
    const actual = [...targetTree.keys()].filter(file => isOwned(file, ownedPath));
    if (actual.length !== expected.size || actual.some(file => !expected.has(file))) {
      pending ??= `Owned path file set does not match the final candidate in ${target}: ${ownedPath}`;
    }
  }
  if (remoteCommit(run, cwd, remote) !== live) {
    throw new Error('Live main changed during the delivery check; retry with fresh evidence');
  }
  for (const [ownedPath, expected] of expectedByOwnedPath) {
    assertWorkingTree(cwd, ownedPath, expected, candidateFiles);
  }
  if (pinnedCommit(run, cwd, ref) !== local || pinnedCommit(run, cwd, 'HEAD') !== head) {
    throw new Error('HEAD, remote-tracking main, or live main changed during the delivery check; retry with fresh evidence');
  }
  if (pending) throw new PendingMainDelivery(pending);
  return { target, remoteCommit: live, paths, candidateFiles: [...candidateFiles.keys()], deletions: [...deletions], complete: true };
}
