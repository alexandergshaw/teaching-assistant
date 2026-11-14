import "server-only";
import { createHash } from "node:crypto";
import { requireAppOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { artifactManifestDigest, type ArtifactManifestEntry } from "./artifact-dispatch";
import { ArtifactBudgetDeferredError, ArtifactDispatchUncertainError } from "./artifact-checkpoint";
import type { RepoGradeClaim } from "./state";
import type { GenericRunPlan } from "@/lib/grade/generic-repo-execution-plan";

type SourceIdentity = { claim: RepoGradeClaim; run: {runId:string;lease:string}; sourceSha:string; plan:GenericRunPlan; manifest:readonly ArtifactManifestEntry[]; resumeGeneration?:number; allowStart:boolean };
export function sourcePlanDigest(plan: GenericRunPlan): string {
  return createHash("sha256").update(JSON.stringify({language:plan.language,entryPoint:plan.entryPoint,selection:plan.selection}),"utf8").digest("hex");
}
async function rpc(name:string,args:Record<string,unknown>):Promise<unknown> {
  const owner=await requireAppOwner();
  const {data,error}=await createServiceClient().rpc(name,{p_user_id:owner.id,...args}).retry(false);
  if(error)throw new Error("Source dispatch storage is unavailable");
  return data;
}
const keys=(i:SourceIdentity)=>({p_generation:i.claim.generation,p_token:i.claim.token,p_run_id:i.run.runId,p_lease:i.run.lease,p_entry_path:i.plan.entryPoint,p_language:i.plan.language});
export async function runCheckpointedSource<T>(input:{identity:SourceIdentity;signal:AbortSignal;beforeDispatch:(signal:AbortSignal)=>Promise<void>;validateReceipt:(value:unknown)=>value is T;execute:(onSandboxCreated:(id:string)=>Promise<void>)=>Promise<T>}):Promise<T>{
  const i=input.identity;
  if(!i.manifest.some(file=>file.path===i.plan.entryPoint))throw new Error("Source plan is absent from pinned manifest");
  input.signal.throwIfAborted();await input.beforeDispatch(input.signal);input.signal.throwIfAborted();
  const admission=await rpc("repo_grade_begin_source_dispatch",{...keys(i),p_plan_sha256:sourcePlanDigest(i.plan),p_source_sha:i.sourceSha,p_manifest_sha256:artifactManifestDigest(i.manifest),p_resume_generation:i.resumeGeneration??null,p_allow_start:i.allowStart});
  input.signal.throwIfAborted();
  if(!admission || typeof admission!=="object" || !("status" in admission))throw new Error("Invalid source dispatch response");
  if(admission.status==="completed" && "receipt" in admission){if(!input.validateReceipt(admission.receipt))throw new Error("Invalid saved source receipt");return admission.receipt;}
  if(admission.status==="deferred")throw new ArtifactBudgetDeferredError("Source execution deferred before dispatch");
  if(admission.status==="unknown")throw new ArtifactDispatchUncertainError("An earlier source dispatch is unresolved");
  if(admission.status!=="started")throw new Error("Source dispatch denied");
  let recorded=false;
  const result=await input.execute(async id=>{input.signal.throwIfAborted();if(recorded || await rpc("repo_grade_record_source_sandbox",{...keys(i),p_sandbox_id:id})!==true)throw new ArtifactDispatchUncertainError("Source sandbox identity could not be retained");recorded=true;input.signal.throwIfAborted();});
  input.signal.throwIfAborted();
  if(!recorded || !input.validateReceipt(result))throw new ArtifactDispatchUncertainError("Source result could not be verified");
  if(await rpc("repo_grade_finish_source_dispatch",{...keys(i),p_receipt:result})!==true)throw new ArtifactDispatchUncertainError("Source result could not be retained");
  return result;
}
