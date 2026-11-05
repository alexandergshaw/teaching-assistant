import { canonical } from './json';
import type { Item, LiveContract, LiveObservation, LiveReport, LiveSource, LoopState } from './types';

export const liveKind = 'live-verification';
export const liveActivity = (item: string) => `${item}:${liveKind}`;

export function sourceAccepted(state: LoopState, item: Item, artifactId: string) {
  if (item.status !== 'regression-passed' && item.status !== 'shipped') return false;
  const artifact = state.artifacts[artifactId], report = state.finalReports[artifactId];
  const activity = artifact && state.activities[artifact.activity];
  const transition = state.events.findLast(event => event.type === 'item.advance' &&
    event.payload.item === item.id && event.payload.status === 'regression-passed');
  return Boolean(artifact && report && activity?.item === item.id && activity.kind === 'final-report' &&
    activity.status === 'accepted' && artifact.acceptedHash === artifact.hash &&
    state.assignments[artifact.assignment]?.status === 'finished' &&
    canonical(artifact.candidate) === canonical(report.candidate) &&
    (transition?.payload.artifacts as string[] | undefined)?.includes(artifactId));
}

export function sourceMatches(state: LoopState, item: Item, source: LiveSource) {
  return sourceAccepted(state, item, source.artifact) &&
    state.artifacts[source.artifact].hash === source.hash &&
    canonical(state.finalReports[source.artifact].candidate) === canonical(source.candidate);
}

function observationMatches(observation: LiveObservation, expected: string) {
  const needsFollowUp = observation.outcome === 'unknown' || observation.outcome === 'unavailable';
  return observation.expected === expected && (!needsFollowUp || Boolean(observation.followUp));
}

export function matchesLiveContract(item: Item, contract: LiveContract, report: LiveReport) {
  return report.item === item.id && canonical(report.source) === canonical(contract.source) &&
    report.target === contract.target && report.environment === contract.environment &&
    report.deployment === contract.deployment && report.observedSourceRevision === contract.source.revision &&
    report.observedSourceCandidate === contract.source.candidate.digest && report.observedAt > 0 &&
    Object.keys(report.criteria).length === Object.keys(contract.requirements).length &&
    Object.entries(contract.requirements).every(([id, expected]) =>
      Object.hasOwn(report.criteria,id) && observationMatches(report.criteria[id], expected)) &&
    observationMatches(report.smoke, contract.smoke) &&
    (contract.persistence === null ? report.persistence === null :
      report.persistence !== null && observationMatches(report.persistence, contract.persistence)) &&
    (report.cleanup.outcome !== 'pending' || Boolean(report.cleanup.followUp));
}

export function qualifyingLiveArtifact(state: LoopState, item: Item): string | null {
  const contract = state.liveContracts?.[item.id], activity = state.activities[liveActivity(item.id)];
  if (!contract || activity?.status !== 'accepted' || !sourceMatches(state,item,contract.source)) return null;
  const latest = Object.values(state.artifacts).filter(a => a.activity === activity.id).sort((a,b) => b.version-a.version)[0];
  if (!latest || latest.acceptedHash !== latest.hash) return null;
  const report = state.liveReports?.[latest.id];
  if (!report || !matchesLiveContract(item,contract,report)) return null;
  if (report.smoke.outcome !== 'pass' || Object.values(report.criteria).some(o => o.outcome !== 'pass') ||
      (report.persistence && report.persistence.outcome !== 'pass') || report.cleanup.outcome === 'pending') return null;
  const observer = state.assignments[latest.assignment];
  if (observer?.role !== 'verifier' || observer.status !== 'finished' || observer.activity !== activity.id) return null;
  const review = state.events.findLast(event => event.type === 'review.record' && event.payload.artifact === latest.id &&
    event.payload.hash === latest.hash && event.payload.verdict === 'clean');
  const checker = review && state.assignments[String(review.payload.assignment)];
  if (checker?.role !== 'checker' || checker.status !== 'finished' || checker.activity !== activity.id ||
      checker.worker.instance === observer.worker.instance || checker.worker.context === observer.worker.context) return null;
  const assignments = Object.values(state.assignments).filter(a => a.item === item.id);
  if (assignments.some(a => a.status !== 'finished' && !a.reconciled) ||
      Object.values(state.operations).some(o => state.assignments[o.assignment]?.item === item.id && (o.status !== 'terminated' || !o.reconciled)) ||
      item.needs.length || Object.values(state.activities).some(a => a.item === item.id && a.status === 'owner-needed')) return null;
  return latest.id;
}

export function isLiveComplete(state: LoopState, item: Item): boolean {
  if (item.status !== 'shipped') return false;
  const artifact = qualifyingLiveArtifact(state,item);
  const transition = state.events.findLast(event => event.type === 'item.advance' &&
    event.payload.item === item.id && event.payload.status === 'shipped');
  return Boolean(artifact && (transition?.payload.artifacts as string[] | undefined)?.includes(artifact));
}
