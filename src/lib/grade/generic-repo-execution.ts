import { createHash } from "node:crypto";
import { genericArtifactInventory } from "./generic-artifact-inventory";
import { planGenericRepoExecution } from "./generic-repo-execution-plan";
import { runGenericRepoSandbox } from "./generic-repo-sandbox";
import { isSupportedWindowsPe, runGenericWindowsArtifact } from "./generic-windows-sandbox";
import { MAX_WINDOWS_EXECUTABLE_BYTES, MAX_WINDOWS_INVENTORY_BYTES } from "./generic-execution-limits";
import { ArtifactRuntimeUnavailableError, isSupportedNativeArtifact, resolveJavaClass, runGenericNativeArtifact } from "./generic-native-artifact";
import type { RepoGradeClaim } from "@/lib/repo-grades-dashboard/state";
import { artifactManifestDigest, findArtifactResume } from "@/lib/repo-grades-dashboard/artifact-dispatch";
import { ArtifactBudgetDeferredError, runCheckpointedArtifact } from "@/lib/repo-grades-dashboard/artifact-checkpoint";
import { runCheckpointedSource, sourcePlanDigest } from "@/lib/repo-grades-dashboard/source-checkpoint";
import { validGeneralExecutionEvidence, type GeneralExecutionEvidence } from "./general-execution-evidence";
import { assertGenericEvidenceCapacity } from "./generic-evidence-capacity";

/** Collect evidence without guessing around unexecutable or ambiguous languages. */
export async function executeGenericPinnedInventory(input:{folder:string;files:readonly {path:string;bytes:Uint8Array}[];repoCommit:string;signal:AbortSignal;beforeDispatch:(signal:AbortSignal)=>Promise<void>;deadlineMs?:number;artifactExecutionContext?:{claim:RepoGradeClaim;run:{runId:string;lease:string};recovery:boolean}}) {
  const plan=planGenericRepoExecution(input.files);
  if(plan.runs.length>5)throw new Error("Execution plan exceeds supported bounds");
  const manifest=input.files.map(f=>({path:f.path,sha256:createHash('sha256').update(f.bytes).digest('hex')}));
  const originalArtifacts=genericArtifactInventory(input.files);
  assertGenericEvidenceCapacity({manifest,plan,artifacts:originalArtifacts});
  const windowsInventoryFits=input.files.reduce((total,file)=>total+file.bytes.length,0)<=MAX_WINDOWS_INVENTORY_BYTES;
  const supported=input.files.flatMap<{file:{path:string;bytes:Uint8Array};kind:'pe'|'elf'|'java-class'|'python-bytecode'|'wasm'}>(file=>{
    const artifact=originalArtifacts.find(a=>a.path===file.path);
    if(!artifact) return [];
    if(artifact.kind==='pe') return windowsInventoryFits && file.bytes.length <= MAX_WINDOWS_EXECUTABLE_BYTES && isSupportedWindowsPe(file.bytes) ? [{file,kind:'pe' as const}] : [];
    if(artifact.kind==='elf'||artifact.kind==='java-class'||artifact.kind==='python-bytecode'||artifact.kind==='wasm') return isSupportedNativeArtifact(artifact.kind,file.bytes)
      && (artifact.kind!=='java-class' || !!resolveJavaClass(file.bytes,file.path.slice(input.folder ? input.folder.length+1 : 0))) ? [{file,kind:artifact.kind as 'elf'|'java-class'|'python-bytecode'|'wasm'}] : [];
    return [];
  });
  const controller=new AbortController(),signal=AbortSignal.any([input.signal,controller.signal]);let failure:unknown;
  let resumeGeneration:number|null=null;
  if(input.artifactExecutionContext?.recovery){
    await input.beforeDispatch(signal);
    resumeGeneration=await findArtifactResume({claim:input.artifactExecutionContext.claim,run:input.artifactExecutionContext.run,manifestSha256:artifactManifestDigest(manifest)});
    signal.throwIfAborted();
    if(resumeGeneration===null)throw new Error("Artifact continuation could not be authorized");
  }
  const deferredSources: typeof plan.runs = [];
  const pending=plan.runs.map(async run=>{
    try {
      const context=input.artifactExecutionContext;
      const execute=async(onSandboxCreated?:(id:string)=>Promise<void>)=>{
        const result=await runGenericRepoSandbox({...input,plan:run,signal,onSandboxCreated});
        if(result.repoCommit!==input.repoCommit || JSON.stringify(result.inputManifest)!==JSON.stringify(manifest) || result.runs.length!==1 || result.runs[0].entryPoint!==run.entryPoint || result.runs[0].language!==run.language)throw new Error("Execution receipt does not match pinned inventory");
        return result.runs[0];
      };
      const receipt=context ? await runCheckpointedSource<GeneralExecutionEvidence['runs'][number]>({identity:{claim:context.claim,run:context.run,sourceSha:input.repoCommit,plan:run,manifest,allowStart:input.deadlineMs === undefined || input.deadlineMs - Date.now() >= 210_000,...(resumeGeneration !== null && {resumeGeneration})},signal,beforeDispatch:input.beforeDispatch,
        validateReceipt:(value:unknown):value is GeneralExecutionEvidence['runs'][number] => !!value && typeof value==='object' && 'entryPoint' in value && value.entryPoint===run.entryPoint && 'language' in value && value.language===run.language && 'status' in value && value.status==='observed' && validGeneralExecutionEvidence({repoCommit:input.repoCommit,inputManifest:manifest,runs:[value],held:[],coverage:{status:'unverified'},artifacts:[]}),
        execute:onSandboxCreated=>execute(onSandboxCreated)}) : await execute();
      return receipt;
    }catch(error){if(error instanceof ArtifactBudgetDeferredError && !signal.aborted){deferredSources.push(run);return null;}if(failure===undefined)failure=error;controller.abort(error);throw error;}
  });
  let next=0;const deferred=new Set<string>();
  const pendingArtifacts=Array.from({length:Math.min(2,supported.length)},async()=>{
    const observed=[];
    while(next<supported.length){
    // Preserve enough time for the worst-case VM setup/run and model review.
    // Remaining artifacts stay explicitly unexamined instead of starting work
    // that is likely to be cut off by the enclosing worker deadline.
    const allowStart=input.deadlineMs === undefined || input.deadlineMs - Date.now() >= 210_000;
    if(!allowStart && !input.artifactExecutionContext) break;
    const {file,kind}=supported[next++];
    try { const common={...file,folder:input.folder,files:input.files,repoCommit:input.repoCommit,signal,beforeDispatch:input.beforeDispatch};
      const execute=async(onSandboxCreated?:(id:string)=>Promise<void>)=>{
      const result=kind==='pe' ? await runGenericWindowsArtifact({...common,onSandboxCreated}) : await runGenericNativeArtifact({...common,kind,onSandboxCreated});
      if(result.path!==file.path || result.repoCommit!==input.repoCommit || result.sha256!==createHash('sha256').update(file.bytes).digest('hex') || JSON.stringify(result.inputManifest)!==JSON.stringify(manifest))throw new Error("Windows observation does not match pinned artifact");
      const { inputManifest: _verifiedManifest, ...observation }=result;
      void _verifiedManifest;
      return observation;
      };
      const context=input.artifactExecutionContext;
      const observation=context ? await runCheckpointedArtifact<GeneralExecutionEvidence['artifacts'][number]>({identity:{claim:context.claim,run:context.run,sourceSha:input.repoCommit,path:file.path,artifactSha256:createHash('sha256').update(file.bytes).digest('hex'),allowStart,...(resumeGeneration !== null && {resumeGeneration})},manifest,signal,beforeDispatch:input.beforeDispatch,
        validateReceipt:(value:unknown):value is GeneralExecutionEvidence['artifacts'][number] => !!value && typeof value === 'object' && 'path' in value && value.path === file.path && 'kind' in value && value.kind === kind && 'sha256' in value && value.sha256 === createHash('sha256').update(file.bytes).digest('hex') && validGeneralExecutionEvidence({repoCommit:input.repoCommit,inputManifest:manifest,runs:[],held:[],coverage:{status:'unverified'},artifacts:[value]}),
        execute:onSandboxCreated=>execute(onSandboxCreated),
        unavailableReceipt:error=>kind!=='pe' && error instanceof ArtifactRuntimeUnavailableError
          ? {path:file.path,repoCommit:input.repoCommit,sha256:createHash('sha256').update(file.bytes).digest('hex'),kind,status:'unexamined',reason:'runtime-unavailable'} : undefined}) : await execute();
      observed.push(observation);
    }catch(error){if(error instanceof ArtifactBudgetDeferredError && !signal.aborted){deferred.add(file.path);continue;}if(error instanceof ArtifactRuntimeUnavailableError && !input.artifactExecutionContext && !signal.aborted)continue;if(failure===undefined)failure=error;controller.abort(error);throw error;}
    }
    return observed;
  });
  const [settled,artifactSettled]=await Promise.all([Promise.allSettled(pending),Promise.allSettled(pendingArtifacts)]);if(failure!==undefined)throw failure;input.signal.throwIfAborted();
  const results=settled.map(value=>{if(value.status==='rejected')throw value.reason;return value.value;});

  const completedRuns=results.filter((value):value is NonNullable<typeof value> => value !== null);
  const observations=artifactSettled.flatMap(value=>{if(value.status==='rejected')throw value.reason;return value.value;});
  const artifacts=originalArtifacts.map(item=>observations.find(value=>value.path===item.path) ?? item);
  const remaining=supported.filter((item,index)=>index>=next || deferred.has(item.file.path)).map(item=>item.file.path);
  return {repoCommit:input.repoCommit,inputManifest:manifest,runs:completedRuns,coverage:{status:'unverified' as const},artifacts,held:plan.held,
    ...((remaining.length || deferredSources.length) && input.artifactExecutionContext ? {continuation:{manifestSha256:artifactManifestDigest(manifest),paths:remaining,sources:deferredSources.sort((a,b)=>a.language < b.language ? -1 : a.language > b.language ? 1 : a.entryPoint < b.entryPoint ? -1 : a.entryPoint > b.entryPoint ? 1 : 0).map(run=>({entryPoint:run.entryPoint,language:run.language,planSha256:sourcePlanDigest(run)}))}} : {})};
}
