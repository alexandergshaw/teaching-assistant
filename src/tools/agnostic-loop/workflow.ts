import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { canonical, digest } from './json';
import { safePath, requireThat } from './engine';
import type { AcceptedBody, ActionContext, BacklogSelection, DispatchRole, PlanProposal, RoutingConfig, TaskSpec } from './dispatch-types';
import type { LoopState } from './types';
import type { LoopStore } from './store';
import { validateScopeProposal, validateCriteriaProposal, validatePlanProposal } from './routing-validation';

export const stageRoles: Record<string, DispatchRole> = {scope:'specialist',criteria:'criteria',design:'architect',plan:'planner','test-design':'test-designer',implementation:'implementer',verification:'verifier','whole-change-review':'specialist','final-report':'finalizer'};
export function artifactPath(config: RoutingConfig, item: string, kind: string, version: number): string {
  const filename = `${encodeURIComponent(item)}-${encodeURIComponent(kind)}-${version}.json`;
  const result = `${config.grant.artifactDirectory}/${filename}`; safePath(result); return result;
}
export function activityId(item: string, kind: string): string { return `${item}:${kind}`; }
export async function acceptedBodies(store: LoopStore, state: LoopState): Promise<Record<string,AcceptedBody>> {
  const result: Record<string,AcceptedBody> = Object.create(null);
  const current = await store.context(state);
  for (const a of Object.values(state.artifacts)) {
    if (a.acceptedHash !== a.hash || !current.artifacts[a.id]) continue;
    const kind = state.activities[a.activity].kind;
    if (!['scope','criteria','plan'].includes(kind)) continue;
    const value: unknown = JSON.parse((await store.verifiedBlob(path.join(store.directory,'blobs',a.hash),a.hash)).toString('utf8'));
    if (kind === 'scope') result[a.id] = {id:a.id,hash:a.hash,kind,value:validateScopeProposal(value)};
    else if (kind === 'criteria') result[a.id] = {id:a.id,hash:a.hash,kind,value:validateCriteriaProposal(value)};
    else result[a.id] = {id:a.id,hash:a.hash,kind:'plan',value:validatePlanProposal(value)};
  }
  return result;
}
export function checkedPlan(context: ActionContext, item: string): PlanProposal | null {
  const body = Object.values(context.acceptedBodies).find(b => b.kind === 'plan' && b.value.item === item);
  return body?.kind === 'plan' ? body.value : null;
}
export function validatePlanScope(plan: PlanProposal, state: LoopState, config: RoutingConfig): void {
  const item = state.items[plan.item]; requireThat(item,'plan item missing');
  const ids = new Set(plan.waves.map(w => w.id)); requireThat(ids.size === plan.waves.length && ids.size > 0,'plan needs unique nonempty waves');
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id:string):void { if (visited.has(id)) return; requireThat(!visiting.has(id),'plan wave cycle'); const wave = plan.waves.find(w => w.id === id); requireThat(wave,'unknown plan wave dependency'); visiting.add(id); wave!.dependencies.forEach(visit); visiting.delete(id); visited.add(id); }
  for (const wave of plan.waves) {
    requireThat(wave.requirements.length && wave.requirements.every(id => item.criteria.includes(id)),'wave requirements outside criteria');
    requireThat(wave.writePaths.every(p => wave.affectedPaths.includes(p)) && wave.affectedPaths.every(p => item.affectedPaths.includes(p)),'wave source scope outside accepted item');
    [...wave.affectedPaths,...wave.writePaths].forEach(safePath);
    requireThat(wave.gateNames.every(g => item.requiredGates.includes(g) && config.grant.gateNames.includes(g)),'wave gates outside configured grant'); visit(wave.id);
  }
}
export function taskFor(state:LoopState, context:ActionContext, kind:string, purpose:TaskSpec['purpose']='author', wave:string|null=null): TaskSpec {
  const item = state.items[context.selection.id], activity = activityId(item.id,kind), a = state.activities[activity];
  const versions = Object.values(state.artifacts).filter(x => x.activity === activity);
  const version = versions.length ? Math.max(...versions.map(x => x.version)) + (purpose === 'review' ? 0 : 1) : 1;
  const id = `${activity}:v${version}`;
  const artifactIds = purpose === 'review' || purpose === 'transcription' ? [] : [id];
  const files = artifactIds.map(() => artifactPath(context.config,item.id,kind,version));
  const inputs: Record<string,string> = Object.create(null);
  for (const artifact of Object.values(state.artifacts)) if (artifact.acceptedHash === artifact.hash && state.activities[artifact.activity].item === item.id && artifact.activity !== activity) inputs[artifact.id] = artifact.hash;
  const plan = checkedPlan(context,item.id), build = wave ? plan?.waves.find(w => w.id === wave) : null;
  const sourceAffected = purpose === 'review' || purpose === 'transcription' ? [] : build?.affectedPaths ?? [];
  const sourceWrites = purpose === 'review' || purpose === 'transcription' ? [] : build?.writePaths ?? [];
  const gateNames = purpose === 'review' ? [] : kind === 'verification' || kind === 'final-report' ? item.requiredGates : build?.gateNames ?? [];
  return { id:`${activity}:${purpose}:${version}:round${a?.rounds ?? 0}`,item:item.id,activity,kind,role:purpose === 'review' ? 'checker' : purpose === 'transcription' ? 'transcriber' : kind.startsWith('implementation-wave:') ? 'implementer' : stageRoles[kind] ?? 'specialist',purpose,requirementIds:build?.requirements ?? item.criteria,acceptedInputs:inputs,affectedPaths:[...sourceAffected,...files],writePaths:[...sourceWrites,...files],resources:[...new Set(['dispatch-workspace',...gateNames.flatMap(g => state.policy.gates[g]?.resources ?? [])])],artifactIds,gateNames,wave,instructions:`Perform ${purpose} for ${kind}. Return the exact structured outcome. Preserve accepted inputs, role independence, source ownership and the substantive review budget.` };
}
export async function verifySelection(selection:BacklogSelection):Promise<void> {
  requireThat(digest(await readFile(selection.sourcePath)) === selection.sourceHash,'selection source changed');
}
export function actionKey(value:unknown,config:RoutingConfig):string { return digest(canonical({value,configHash:digest(canonical(config))})); }
