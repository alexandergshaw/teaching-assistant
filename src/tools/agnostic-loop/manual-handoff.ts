import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LoopStore } from './store';
import { assessMainDelivery, mainDeliveryRemote, PendingMainDelivery } from './main-delivery';
import type { LoopState } from './types';
import { isLiveComplete, sourceAccepted } from './live-verification';

/** Delivery assertion for a host-owned manual run; never schedules or mutates. */
export function assessManualHandoff(state: LoopState, requested: string[], now = Date.now()) {
  if (!requested.length || requested.some(id => !Object.hasOwn(state.items, id))) {
    throw new Error('Name every requested item explicitly; empty or unknown selections cannot prove delivery');
  }
  const deadlineExpired = now > state.policy.deadline;
  const items = [...new Set(requested)].map(id => {
    const item = state.items[id];
    const assignments = Object.values(state.assignments).filter(a => a.item === id);
    const retained = assignments.filter(a => a.status !== 'finished' && !a.reconciled);
    const operations = Object.values(state.operations).filter(o => assignments.some(a => a.id === o.assignment) && (o.status !== 'terminated' || !o.reconciled));
    const ownerNeeded = Object.values(state.activities).filter(a => a.item === id && a.status === 'owner-needed').map(a => a.id);
    const liveComplete = isLiveComplete(state,item);
    const sourceComplete = Object.keys(state.finalReports).some(artifact => sourceAccepted(state,item,artifact));
    const pending = !liveComplete;
    return {
      id, status: item.status, pending, sourceComplete, liveComplete,
      handoffState: !pending ? 'complete' : deadlineExpired ? 'pending-expired' : sourceComplete ? 'pending-live' : 'pending',
      retainedAssignments: retained.map(a => ({ id: a.id, role: a.role, status: a.status })),
      outstandingOperations: operations.map(o => ({ id: o.id, status: o.status })),
      ownerNeeded, needs: item.needs,
      action: !pending ? 'Independent live verification recorded' : operations.length
        ? 'Observe termination and reconcile uncertainty before any retry; do not remove locks'
        : deadlineExpired ? 'Run deadline expired. Preserve accepted evidence and history; resolve any retained host-worker ownership, then obtain a terminating owner disposition or explicit authorization for further work. Existing review-round limits still apply. Policy continuation changes the policy hash and stales prior gate evidence; do not renew the policy or rerun gates without explicit authorization.'
        : ownerNeeded.length ? 'Obtain a terminating owner disposition; no third substantive round'
        : retained.length ? 'Wait for actual host worker completion, inspect owned files, import output and result, then admit the independent next role'
        : sourceComplete ? 'Prove source publication independently and obtain accepted live observations under the owner contract'
        : 'Continue independent role admission and required gates through source acceptance; surface unavailable instruments explicitly',
    };
  });
  return { revision: state.revision, deadlineExpired, complete: items.every(item => !item.pending), items,
    limitation: 'A snapshot assertion cannot wake a chat, observe host workers, or supply a completion callback. A launch or worker report is not delivery.' };
}

export async function checkManualHandoff(args: string[]) {
  const targetIndex = args.indexOf('--target');
  if (targetIndex < 0 || targetIndex !== args.length - 2) {
    throw new Error('Usage: manual-handoff.ts STORE ITEM [ITEM ...] --target origin/main');
  }
  const [directory, ...items] = args.slice(0, targetIndex);
  const target = args[targetIndex + 1];
  if (!directory || !items.length || args.some((value, index) => index !== targetIndex && index !== targetIndex + 1 && value.startsWith('--'))) {
    throw new Error('Usage: manual-handoff.ts STORE ITEM [ITEM ...] --target origin/main');
  }
  mainDeliveryRemote(target);
  const state = await new LoopStore(directory).load();
  const local = assessManualHandoff(state, items);
  if (local.items.some(item => !item.sourceComplete)) return { ...local, gitDelivery: { complete: false, target, reason: 'Source acceptance is still pending' } };
  try {
    const deliveries = items.map(id => {
      const starts = state.events.filter(event => event.type === 'assignment.start' && event.payload.item === id);
      const first = starts[0] && state.assignments[String(starts[0].payload.id)];
      const final = Object.entries(state.finalReports).map(([artifactId, report]) => ({ artifactId, report, artifact: state.artifacts[artifactId] }))
        .filter(entry => sourceAccepted(state,state.items[id],entry.artifactId) && (!state.liveContracts?.[id] || state.liveContracts[id].source.artifact === entry.artifactId))
        .sort((a, b) => b.artifact.version - a.artifact.version)[0];
      if (!first || !final) throw new Error(`Accepted final candidate or admitted baseline is missing for ${id}`);
      return { item: state.items[id], baselineFiles: first.baseline.files, finalFiles: final.report.candidate.files };
    });
    const gitDelivery = assessMainDelivery(deliveries, state.policy.workspace, target);
    return { ...local, gitDelivery };
  } catch (error) {
    if (!(error instanceof PendingMainDelivery)) throw error;
    const reason = error.message;
    return {
      ...local,
      complete: false,
      items: local.items.map(item => ({ ...item, pending: true, handoffState: 'pending-main' as const, action: `Source publication to ${target} is pending. ${reason}` })),
      gitDelivery: { complete: false, target, reason },
    };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkManualHandoff(process.argv.slice(2)).then(report => {
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.exitCode = report.complete ? 0 : 2;
  }).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Manual handoff unproven: ${JSON.stringify(reason)}\n`);
    process.exitCode = 1;
  });
}
