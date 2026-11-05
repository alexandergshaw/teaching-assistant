import { liveActivity, liveKind, sourceMatches } from './live-verification';
import type { Context, Envelope, LiveContract, LoopState, Policy } from './types';

export function assertLiveReportDirectory(policy: Policy, path: string, safePath: (path: string) => string): void {
  const directory = safePath(path);
  const within = (root: string) => directory === safePath(root) || directory.startsWith(`${safePath(root)}/`);
  if (directory.split('/').includes('.git')) throw new Error('Live report directory must be separate from Git metadata');
  if (policy.artifactDirectory && !within(policy.artifactDirectory)) throw new Error('Live report directory is outside the fixed manual artifact directory');
  if (!policy.candidateExclusions.some(within)) throw new Error('Live report directory must be within the policy exclusions');
}

export function configureLiveRecovery(state: LoopState, event: Envelope, context: Context, safePath: (path: string) => string): void {
  if (event.actor !== state.policy.owner || !context.manualLiveRecovery) throw new Error('Owner authority and locked manual-store observation required');
  if (state.runStatus !== 'running' || context.now > state.policy.deadline) throw new Error('Live recovery requires an active run and authorized policy window');
  if (Object.values(state.assignments).some(a => a.status !== 'finished' && (a.status === 'running' || !a.reconciled)) ||
      Object.values(state.operations).some(o => o.status !== 'terminated' || !o.reconciled)) {
    throw new Error('Live recovery requires globally quiescent and reconciled assignments and operations');
  }
  const item = state.items[String(event.payload.item)], contract = event.payload.contract as LiveContract;
  if (!item || !sourceMatches(state,item,contract.source)) throw new Error('Live recovery requires the exact accepted historical source final report');
  assertLiveReportDirectory(state.policy,contract.reportDirectory,safePath);
  if (Object.keys(contract.requirements).length !== item.criteria.length || !item.criteria.every(id => Object.hasOwn(contract.requirements,id))) {
    throw new Error('Live observation contract must map every accepted criterion');
  }
  const id = liveActivity(item.id);
  if (state.activities[id] || Object.values(state.activities).some(a => a.item === item.id && a.kind === liveKind)) {
    throw new Error('Canonical live activity already exists; the contract and review budget are fixed');
  }
  state.liveContracts ??= Object.create(null) as NonNullable<LoopState['liveContracts']>;
  state.liveContracts[item.id] = contract;
  state.activities[id] = { id,item:item.id,kind:liveKind,requirements:item.criteria,dependencies:[state.artifacts[contract.source.artifact].activity],status:'open',rounds:0,authors:[],reviews:[] };
}

export function isHistoricalLiveInput(state: LoopState, itemId: string, activityId: string, id: string, hash: string): boolean {
  const item = state.items[itemId], source = state.liveContracts?.[itemId]?.source;
  return Boolean(item && activityId === liveActivity(itemId) && source && source.artifact === id && source.hash === hash && sourceMatches(state,item,source));
}
