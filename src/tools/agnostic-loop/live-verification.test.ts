import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { exportPacket } from './adapter';
import { demoPolicy, demoWorker } from './demo';
import { liveActivity, matchesLiveContract, qualifyingLiveArtifact } from './live-verification';
import { assessManualHandoff } from './manual-handoff';
import { importArtifact } from './observed';
import { LoopStore } from './store';
import type { FinalReport, LiveContract, LiveObservation, LiveReport, LoopState } from './types';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root,{recursive:true,force:true}))); });

async function fixture(legacy = false, expired = false, options: { fixedArtifactDirectory?: boolean; stateInWorkspace?: boolean } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(),'synthetic-live-loop-'));
  roots.push(root);
  const workspace = path.join(root,'project');
  await mkdir(path.join(workspace,'artifacts'),{recursive:true});
  const store = new LoopStore(path.join(options.stateInWorkspace ? workspace : root,'store'));
  const policy = demoPolicy(workspace);
  policy.gates = {};
  policy.candidateExclusions.push('secrets','.git','store');
  if (options.fixedArtifactDirectory) policy.artifactDirectory = 'artifacts';
  if (expired) policy.deadline = Date.now() - 1;
  const state = await store.init(policy);
  const {candidate} = await store.context(state);
  const worker = demoWorker('historical-finalizer');
  const final: FinalReport = {candidate,verificationArtifact:'historical-verification',regressionEvidence:[],wholeChangeReviewArtifact:'historical-review',residuals:[],delivery:'local'};
  const {hash} = await store.blob(Buffer.from(JSON.stringify(final)));
  state.items.feature = {id:'feature',owner:policy.owner,objective:'Exercise synthetic evidence',criteria:['works'],affectedPaths:['artifacts/live.json','artifacts/retry.json'],dependencies:[],requiredArtifacts:{},requiredGates:[],triage:{},status:legacy?'shipped':'regression-passed',needs:[],escalation:null};
  state.items.dependent = {...state.items.feature,id:'dependent',status:'queued',dependencies:['feature'],affectedPaths:[]};
  state.activities.final = {id:'final',item:'feature',kind:'final-report',requirements:['works'],dependencies:[],status:'accepted',rounds:0,authors:[worker],reviews:[]};
  state.activities.dependent = {id:'dependent',item:'dependent',kind:'scope',requirements:['works'],dependencies:[],status:'open',rounds:0,authors:[],reviews:[]};
  state.assignments.finalizer = {id:'finalizer',item:'feature',activity:'final',role:'finalizer',worker,inputs:{},writePaths:[],affectedPaths:[],resources:[],allowedActions:[],deadline:policy.deadline,deliverables:['final'],baseline:candidate,policyHash:candidate.policyHash,publicationToken:'historical',status:'finished',reconciled:true,reason:null};
  state.artifacts.final = {id:'final',activity:'final',version:1,hash,path:'artifacts/missing-historical-final.json',author:worker,inputs:[],assignment:'finalizer',acceptedHash:hash,candidate};
  state.finalReports.final = final;
  for (const status of legacy ? ['regression-passed','shipped'] : ['regression-passed']) {
    state.events.push({id:status,expectedRevision:state.revision++,actor:policy.owner,type:'item.advance',payload:{item:'feature',status,artifacts:['final'],evidence:[]}});
  }
  await store.save(state);
  const contract: LiveContract = {source:{artifact:'final',hash,candidate,revision:'synthetic-build-source'},target:'synthetic application',environment:'synthetic preview',deployment:'synthetic deployment ID',reportDirectory:'artifacts',requirements:{works:'synthetic output'},smoke:'synthetic app reached',persistence:null};
  const pass = (expected: string): LiveObservation => ({expected,observed:expected,instrument:'synthetic test instrument',outcome:'pass',followUp:null});
  const report: LiveReport = {item:'feature',source:contract.source,target:contract.target,environment:contract.environment,deployment:contract.deployment,sourceLink:'synthetic deployment provenance',observedSourceRevision:contract.source.revision,observedSourceCandidate:candidate.digest,observedAt:Date.now(),criteria:{works:pass(contract.requirements.works)},smoke:pass(contract.smoke),persistence:null,cleanup:{outcome:'not-needed',evidence:'synthetic read-only fixture',followUp:null},limitations:['Synthetic data, no deployment accessed']};
  let eventId = 0;
  const event = async (type: string,payload: Record<string, unknown>,actor = policy.owner) =>
    ({id:`test-${++eventId}`,expectedRevision:(await store.load()).revision,type,payload,actor});
  const apply = async (type: string,payload: Record<string, unknown>,actor?: string) => store.transact(await event(type,payload,actor));
  const configure = () => apply('live.configure',{item:'feature',contract});
  const start = async (id: string,role: string) => apply('assignment.start',{
    id,item:'feature',activity:'feature:live-verification',role,worker:demoWorker(id),inputs:{final:hash},
    writePaths:role==='verifier'?['artifacts/live.json']:[],affectedPaths:role==='verifier'?['artifacts/live.json']:[],
    resources:[],allowedActions:role==='verifier'?['write']:['review'],
    deadline:(await store.load()).policy.deadline,deliverables:role==='verifier'?['live']:[],
  });
  const ship = (artifacts: string[]) => apply('item.advance',{item:'feature',status:'shipped',artifacts,evidence:[]});
  return {root,workspace,store,contract,report,apply,configure,start,ship};
}

it('recovers the legacy source after authorized expiry continuation and fences live allocation', async () => {
  const f = await fixture(true,true);
  const old = await f.store.load();
  expect(assessManualHandoff(old,['feature'])).toMatchObject({complete:false,items:[{sourceComplete:true,liveComplete:false,handoffState:'pending-expired'}]});
  await expect(f.configure()).rejects.toThrow('authorized policy window');
  await f.apply('policy.continue',{priorPolicyHash:f.contract.source.candidate.policyHash,deadline:Date.now()+60000,maxExtensionMs:60000,authorization:'explicit test authorization',reason:'Synthetic expiry recovery',gateArgumentCorrections:[]});
  await expect(f.apply('live.configure',{item:'feature',contract:f.contract},'not-owner')).rejects.toThrow('Owner authority');
  await f.configure();
  await expect(f.configure()).rejects.toThrow('already exists');
  const configured = await f.store.load();

  for (const role of ['verifier','checker']) {
    await expect(f.start(role,role)).rejects.toThrow('Manual live-report allocation is disabled pending alias-safety verification');
  }
  await expect(exportPacket(f.store,'verifier',path.join(f.root,'packet.json'))).rejects.toThrow('Packet requires running assignment');
  const filename = path.join(f.workspace,'artifacts','live.json');
  await writeFile(filename,JSON.stringify(f.report));
  await expect(importArtifact(f.store,'verifier','live',filename,configured.policy.owner)).rejects.toThrow('Unknown assignment');
  await expect(f.ship(['final','live'])).rejects.toThrow('missing artifact live');
  await expect(f.ship(['final'])).rejects.toThrow('passing live verification');

  const pending = await f.store.load();
  expect(pending).toEqual(configured);
  expect(assessManualHandoff(pending,['feature'])).toMatchObject({complete:false,items:[{liveComplete:false,sourceComplete:true,handoffState:'pending-live'}]});
  expect(pending.events.slice(0,old.revision)).toEqual(old.events);
  expect(pending.finalReports.final).toEqual(old.finalReports.final);
  expect(pending.policy.maxAssignments).toBe(old.policy.maxAssignments);
  const bytes = path.join(f.store.directory,'blobs',f.contract.source.hash);
  expect(JSON.parse(await readFile(bytes,'utf8'))).toEqual(old.finalReports.final);
  await writeFile(bytes,'tampered');
  await expect(f.store.load()).rejects.toThrow('Immutable blob integrity mismatch');
});

it('keeps dependent work blocked when live allocation is disabled', async () => {
  const f = await fixture(true);
  const dependent = {id:'dependent-author',item:'dependent',activity:'dependent',role:'specialist',worker:demoWorker('dependent'),
    inputs:{},writePaths:[],affectedPaths:[],resources:[],allowedActions:[],deadline:Date.now()+60000,deliverables:[]};
  await expect(f.apply('assignment.start',dependent)).rejects.toThrow('dependencies unsettled');
  await f.configure();
  await expect(f.start('observer','verifier')).rejects.toThrow('Manual live-report allocation is disabled');
  await expect(f.apply('assignment.start',dependent)).rejects.toThrow('dependencies unsettled');
});

it.each(['item','deployment','source','omission'] as const)('rejects synthetic reports with a wrong %s binding', async failure => {
  const f = await fixture();
  const item = (await f.store.load()).items.feature;
  const report: LiveReport = structuredClone(f.report);
  if (failure === 'item') report.item = 'dependent';
  if (failure === 'deployment') report.deployment = 'different deployment';
  if (failure === 'source') report.observedSourceCandidate = '0'.repeat(64);
  if (failure === 'omission') report.criteria = {};
  expect(matchesLiveContract(item,f.contract,f.report)).toBe(true);
  expect(matchesLiveContract(item,f.contract,report)).toBe(false);
});

// Use in-memory observations to exercise qualification independently of manual allocation.
async function reviewedFixture() {
  const f = await fixture();
  await f.configure();
  const state = await f.store.load();
  const activity = liveActivity('feature');
  state.activities[activity].status = 'accepted';
  for (const role of ['verifier','checker']) {
    state.assignments[role] = {...state.assignments.finalizer,id:role,activity,role,worker:demoWorker(role)};
  }
  state.artifacts.live = {...state.artifacts.final,id:'live',activity,assignment:'verifier',author:state.assignments.verifier.worker};
  state.liveReports = {live:f.report};
  const review = (artifact: string): LoopState['events'][number] => ({
    id:`review-${artifact}`,expectedRevision:state.events.length,actor:state.policy.owner,type:'review.record',
    payload:{assignment:'checker',artifact,hash:state.artifacts[artifact].hash,verdict:'clean',findings:[]},
  });
  state.events.push(review('live'));
  return {state,review};
}

it('requires a finished, independent checker for live qualification', async () => {
  const {state} = await reviewedFixture();
  const qualifies = () => qualifyingLiveArtifact(state,state.items.feature);
  expect(qualifies()).toBe('live');
  const checker = state.assignments.checker;
  checker.status = 'running';
  expect(qualifies()).toBeNull();
  checker.status = 'finished';
  for (const field of ['instance','context'] as const) {
    const original = checker.worker[field];
    checker.worker[field] = state.assignments.verifier.worker[field];
    expect(qualifies()).toBeNull();
    checker.worker[field] = original;
  }
  expect(qualifies()).toBe('live');
});

it('requires the newest live report to be reviewed', async () => {
  const {state,review} = await reviewedFixture();
  const qualifies = () => qualifyingLiveArtifact(state,state.items.feature);
  expect(qualifies()).toBe('live');
  state.artifacts.retry = {...state.artifacts.live,id:'retry',version:2,acceptedHash:null};
  state.liveReports!.retry = state.liveReports!.live;
  expect(qualifies()).toBeNull();
  state.artifacts.retry.acceptedHash = state.artifacts.retry.hash;
  expect(qualifies()).toBeNull();
  state.events.push(review('retry'));
  expect(qualifies()).toBe('retry');
});

it.each(['unknown','unavailable','fail','cleanup'] as const)('keeps independently checked synthetic %s evidence pending', async outcome => {
  const {state} = await reviewedFixture();
  expect(qualifyingLiveArtifact(state,state.items.feature)).toBe('live');
  const report = state.liveReports!.live;
  const followUp = {owner:'synthetic owner',measurement:'synthetic next measurement'};
  if (outcome === 'cleanup') report.cleanup = {outcome:'pending',evidence:'synthetic uncertainty',followUp};
  else report.criteria.works = {...report.criteria.works,outcome,followUp};
  expect(matchesLiveContract(state.items.feature,state.liveContracts!.feature,report)).toBe(true);
  expect(qualifyingLiveArtifact(state,state.items.feature)).toBeNull();
});

it('fences native state without authorizing live recovery or changing the fixed grant', async () => {
  const f = await fixture();
  const marker = path.join(f.store.directory,'dispatch-config.json');
  await writeFile(marker,'fixed native marker');
  await expect(f.configure()).rejects.toThrow('native dispatch grant');
  expect(await readFile(marker,'utf8')).toBe('fixed native marker');
  await expect(f.apply('item.advance',{item:'feature',status:'shipped',artifacts:[],evidence:[]})).rejects.toThrow('passing live verification');
});

it('binds the live directory to the fixed manual allocation and fences owner and non-owner allocation', async () => {
  const f = await fixture(false,false,{fixedArtifactDirectory:true});
  await expect(f.apply('live.configure',{item:'feature',contract:{...f.contract,reportDirectory:'secrets'}})).rejects.toThrow('outside the fixed manual artifact directory');
  await f.configure();
  const assignment = {id:'untrusted-observer',item:'feature',activity:'feature:live-verification',role:'verifier',worker:demoWorker('untrusted'),
    inputs:{final:f.contract.source.hash},writePaths:['artifacts/live.json'],affectedPaths:['artifacts/live.json'],resources:[],
    allowedActions:['write'],deadline:(await f.store.load()).policy.deadline,deliverables:['live']};
  await expect(f.apply('assignment.start',assignment)).rejects.toThrow('Manual generated-artifact allocation is disabled');
  await expect(f.apply('assignment.start',assignment,'not-owner')).rejects.toThrow('Manual live-report allocation is disabled');
});

it('rejects Git metadata and the loop store as legacy live report directories', async () => {
  const f = await fixture(true,false,{stateInWorkspace:true});
  await expect(f.apply('live.configure',{item:'feature',contract:{...f.contract,reportDirectory:'.git'}})).rejects.toThrow('Git metadata');
  await expect(f.apply('live.configure',{item:'feature',contract:{...f.contract,reportDirectory:'store/future/reports'}})).rejects.toThrow('separate from loop state');
  await f.configure();
});
