import { createHash } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import { genericArtifactInventory } from "./generic-artifact-inventory";
import { isSafeGenericExecutionComponent } from "./generic-execution-path";
import { createGenericOutputCapture } from "./generic-output-capture";
import { MAX_GENERIC_EXECUTION_FILES } from "./generic-execution-limits";
import { resolveJavaSourceEntry, type GenericRunPlan } from "./generic-repo-execution-plan";
const IMAGE="vercel/sandbox/universal@sha256:9b2669397f26336812ec6835c2f67db6a546074cbabb05db93bf5e669f71ec5d";
type Stage = {command:string;exitCode:number|null;signal:string|null;timedOut:boolean;stdout:string;stderr:string;stdoutTruncated:boolean;stderrTruncated:boolean};

/** Run one conservative entry point in a fresh deny-egress VM. No shell is
 * used for student-derived paths; nonzero exits are observations, not grades. */
export async function runGenericRepoSandbox(input:{plan:GenericRunPlan;folder:string;files:readonly {path:string;bytes:Uint8Array}[];repoCommit:string;signal:AbortSignal;beforeDispatch:(signal:AbortSignal)=>Promise<void>;onSandboxCreated?:(id:string)=>Promise<void>}) {
  const prefix=input.folder ? `${input.folder}/` : "";
  if(!/^[a-f0-9]{40}$/.test(input.repoCommit) || !input.files.length || input.files.length>MAX_GENERIC_EXECUTION_FILES || !input.files.some(f=>f.path===input.plan.entryPoint))throw new Error("Invalid pinned execution input");
  const seen=new Set<string>(); let size=0;
  const mapped=input.files.map(file=>{
    if(!file.path.startsWith(prefix))throw new Error("Execution path outside assignment");
    const relative=file.path.slice(prefix.length), parts=relative.split("/");
    if(!relative || relative.length>600 || parts.some(part=>!isSafeGenericExecutionComponent(part)) || seen.has(relative.toLowerCase()))throw new Error("Unsafe execution path");
    seen.add(relative.toLowerCase());size+=file.bytes.length;return {path:relative,content:Buffer.from(file.bytes)};
  });
  if(size>4_000_000)throw new Error("Execution inventory exceeds supported bounds");
  const artifacts=genericArtifactInventory(input.files);
  const entry=input.plan.entryPoint.slice(prefix.length);
  const source=input.files.find(file=>file.path===input.plan.entryPoint)!;
  let javaEntry: ReturnType<typeof resolveJavaSourceEntry> = null;
  if(input.plan.language==='java') {
    try { javaEntry=resolveJavaSourceEntry(entry,new TextDecoder('utf-8',{fatal:true}).decode(source.bytes)); } catch { /* Invalid source is not executable. */ }
  }
  const commands={
    python:{package:'python3',version:'python3',compile:null,run:['python3',[`./${entry}`]]},
    javascript:{package:'nodejs',version:'node',compile:null,run:['node',[`./${entry}`]]},
    java:{package:'default-jdk-headless',version:'java',compile:['javac',[`./${entry}`]],run:['java',['-ea','-cp',javaEntry?.classpath ?? '.',javaEntry?.className ?? '']]},
    c:{package:'gcc',version:'gcc',compile:['gcc',[`./${entry}`,'-o','__grade_program']],run:['./__grade_program',[]]},
    'c++':{package:'g++',version:'g++',compile:['g++',[`./${entry}`,'-o','__grade_program']],run:['./__grade_program',[]]},
  } as const;
  const selected=commands[input.plan.language];
  if(!Object.hasOwn(commands,input.plan.language) || !selected || input.plan.selection!=="heuristic" || (input.plan.language==='java' && !javaEntry) || seen.has('__grade_program'))throw new Error("Unsupported execution plan");
  input.signal.throwIfAborted();await input.beforeDispatch(input.signal);
  const sandbox=await Sandbox.create({image:IMAGE,persistent:false,resources:{vcpus:1},timeout:180_000,signal:input.signal});
  const stop=()=>{void sandbox.stop().catch(()=>{});};input.signal.addEventListener('abort',stop,{once:true});
  try {
    if(input.onSandboxCreated)await input.onSandboxCreated(sandbox.currentSession().sessionId);
    const setup=await sandbox.runCommand({cmd:'bash',args:['-c',`apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ${selected.package} >/dev/null 2>&1`],sudo:true,timeoutMs:100_000,signal:input.signal});
    if(setup.exitCode!==0)throw new Error("Sandbox toolchain setup failed");
    const version=await sandbox.runCommand({cmd:selected.version,args:['--version'],timeoutMs:5000,signal:input.signal});
    const toolVersion=((await version.stdout({signal:input.signal}))||(await version.stderr({signal:input.signal}))).split('\n')[0].replace(/[\x00-\x1f\x7f]/g,'').toWellFormed().slice(0,512).toWellFormed();
    if(version.exitCode!==0 || !toolVersion)throw new Error("Sandbox tool version unavailable");
    await sandbox.update({networkPolicy:'deny-all'},{signal:input.signal});input.signal.throwIfAborted();
    const dirs=new Set<string>();for(const file of mapped){const p=file.path.split('/');p.pop();for(let i=1;i<=p.length;i++)dirs.add(p.slice(0,i).join('/'));}
    for(const d of [...dirs].sort((a,b)=>a.length-b.length))await sandbox.mkDir(d,{signal:input.signal});
    await input.beforeDispatch(input.signal);input.signal.throwIfAborted();
    await sandbox.writeFiles(mapped,{signal:input.signal});
    const stage=async(command:readonly [string,readonly string[]]):Promise<Stage>=>{
      const stdout=createGenericOutputCapture(),stderr=createGenericOutputCapture();
      await input.beforeDispatch(input.signal);input.signal.throwIfAborted();
      const result=await sandbox.runCommand({cmd:command[0],args:[...command[1]],timeoutMs:15_000,signal:input.signal,stdout:stdout.stream,stderr:stderr.stream});
      const out=stdout.result(),err=stderr.result();
      return {command:[command[0],...command[1]].join(' '),exitCode:result.exitCode,signal:result.exitCode>=128?'unknown termination':null,timedOut:false,stdout:out.text,stderr:err.text,stdoutTruncated:out.truncated,stderrTruncated:err.truncated};
    };
    const compile=selected.compile?await stage(selected.compile):null;
    const run=compile && (compile.exitCode!==0 || compile.signal)?null:await stage(selected.run);
    return {repoCommit:input.repoCommit,inputManifest:input.files.map(f=>({path:f.path,sha256:createHash('sha256').update(f.bytes).digest('hex')})),runs:[{...input.plan,image:IMAGE,toolVersion,networkPolicy:'deny-all' as const,compile,run,status:'observed' as const}],coverage:{status:'unverified' as const},artifacts};
  } finally {input.signal.removeEventListener('abort',stop);await sandbox.stop().catch(()=>{});}
}
