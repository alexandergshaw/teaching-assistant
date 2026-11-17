import { createHash } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import { isSafeGenericExecutionComponent } from "./generic-execution-path";
import { createGenericOutputCapture } from "./generic-output-capture";
import { MAX_GENERIC_EXECUTION_FILES } from "./generic-execution-limits";
const IMAGE="vercel/sandbox/universal@sha256:9b2669397f26336812ec6835c2f67db6a546074cbabb05db93bf5e669f71ec5d";

export function isSupportedWindowsPe(b: Uint8Array): boolean {
  if (b.length < 88 || b[0] !== 0x4d || b[1] !== 0x5a) return false;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength), offset = view.getUint32(60, true);
  return offset >= 64 && offset + 26 <= b.length && b[offset] === 0x50 && b[offset + 1] === 0x45
    && b[offset + 2] === 0 && b[offset + 3] === 0 && view.getUint16(offset + 4, true) === 0x8664 && view.getUint16(offset + 24, true) === 0x20b;
}

/** Experimental, unintegrated Windows runner. A Wine result is not proof of
 * native Windows compatibility, source equivalence or test coverage. */
export async function runGenericWindowsArtifact(input:{path:string;bytes:Uint8Array;folder:string;files:readonly {path:string;bytes:Uint8Array}[];repoCommit:string;signal:AbortSignal;beforeDispatch:(signal:AbortSignal)=>Promise<void>;onSandboxCreated?:(sessionId:string)=>Promise<void>}) {
  const b=input.bytes;
  if(!/^[a-f0-9]{40}$/.test(input.repoCommit) || !input.path || input.path.length>600 || input.path.split('/').some(p=>!isSafeGenericExecutionComponent(p)) || b.length<88 || b.length>400_000 || b[0]!==0x4d || b[1]!==0x5a)throw new Error("Invalid Windows artifact");
  const offset=new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(60,true);
  if(offset<64 || offset+26>b.length || b[offset]!==0x50 || b[offset+1]!==0x45 || b[offset+2]!==0 || b[offset+3]!==0)throw new Error("Invalid PE header");
  const machine=new DataView(b.buffer,b.byteOffset,b.byteLength).getUint16(offset+4,true), magic=new DataView(b.buffer,b.byteOffset,b.byteLength).getUint16(offset+24,true);
  if(machine!==0x8664 || magic!==0x20b)throw new Error("Unsupported Windows architecture");
  const prefix=input.folder ? `${input.folder}/` : "", seen=new Set<string>(); let total=0;
  const files=input.files.map(file=>{
    if(!file.path.startsWith(prefix))throw new Error("Windows input outside assignment");
    const relative=file.path.slice(prefix.length),parts=relative.split('/');
    if(!relative || parts.some(p=>!isSafeGenericExecutionComponent(p))
      || parts[0].toLowerCase()==='wineprobe' || seen.has(relative.toLowerCase()))throw new Error("Unsafe Windows input path");
    seen.add(relative.toLowerCase());total+=file.bytes.length;return {path:relative,content:Buffer.from(file.bytes)};
  });
  if(!files.length || files.length>MAX_GENERIC_EXECUTION_FILES || total>4_000_000 || input.files.filter(file=>file.path===input.path && Buffer.from(file.bytes).equals(Buffer.from(b))).length!==1)throw new Error("Windows inventory does not match artifact");
  const entry=input.path.slice(prefix.length);
  const slash=entry.lastIndexOf('/');
  const entryDirectory=slash<0?'':entry.slice(0,slash);
  const entryName=slash<0?entry:entry.slice(slash+1);
  input.signal.throwIfAborted();await input.beforeDispatch(input.signal);
  const sandbox=await Sandbox.create({image:IMAGE,persistent:false,resources:{vcpus:1},timeout:240_000,signal:input.signal});
  const stop=()=>{void sandbox.stop().catch(()=>{});};input.signal.addEventListener('abort',stop,{once:true});
  try {
    if(input.onSandboxCreated)await input.onSandboxCreated(sandbox.currentSession().sessionId);
    input.signal.throwIfAborted();
    // Package install happens before any student bytes enter the environment.
    const setup=await sandbox.runCommand({cmd:'bash',args:['-c','apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wine64 >/dev/null 2>&1'],sudo:true,timeoutMs:150_000,signal:input.signal});
    if(setup.exitCode!==0)throw new Error("Windows runtime unavailable");
    const version=await sandbox.runCommand({cmd:'wine',args:['--version'],timeoutMs:5000,signal:input.signal});
    const runtimeVersion=((await version.stdout({signal:input.signal}))||(await version.stderr({signal:input.signal}))).split('\n')[0].replace(/[\x00-\x1f\x7f]/g,'').toWellFormed().slice(0,512).toWellFormed();
    if(version.exitCode!==0 || !runtimeVersion)throw new Error("Windows runtime version unavailable");
    await sandbox.update({networkPolicy:'deny-all'},{signal:input.signal});input.signal.throwIfAborted();
    await sandbox.mkDir('wineprobe',{signal:input.signal});
    const dirs=new Set<string>();for(const file of files){const parts=file.path.split('/');parts.pop();for(let i=1;i<=parts.length;i++)dirs.add(parts.slice(0,i).join('/'));}
    for(const dir of [...dirs].sort((a,b)=>a.length-b.length))await sandbox.mkDir(dir,{signal:input.signal});
    await input.beforeDispatch(input.signal);input.signal.throwIfAborted();
    await sandbox.writeFiles(files,{signal:input.signal});
    const stdout=createGenericOutputCapture(),stderr=createGenericOutputCapture();
    await input.beforeDispatch(input.signal);input.signal.throwIfAborted();
    const command=await sandbox.runCommand({cmd:'wine',args:[`./${entryName}`],...(entryDirectory && {cwd:`/vercel/${entryDirectory}`}),env:{WINEDEBUG:'-all,err+module',WINEPREFIX:'/vercel/wineprobe'},timeoutMs:40_000,signal:input.signal,stdout:stdout.stream,stderr:stderr.stream});
    const out=stdout.result(),err=stderr.result();
    // A loader failure is an environment limitation, not observed student
    // behavior. Save an unexamined receipt so the dispatch is not repeated:
    // the loader message does not prove whether any code has already run.
    if (command.exitCode !== 0 && (err.truncated || /err:module:import_dll.*(?:not found|could not be loaded)/i.test(err.text) || /err:module:LdrInitializeThunk.*(?:Importing dlls|status c0000135)/i.test(err.text))) {
      return {path:input.path,repoCommit:input.repoCommit,sha256:createHash('sha256').update(b).digest('hex'),inputManifest:input.files.map(file=>({path:file.path,sha256:createHash('sha256').update(file.bytes).digest('hex')})),kind:'pe' as const,status:'unexamined' as const,reason:err.truncated ? 'diagnostics-truncated' as const : 'runtime-dependency-unavailable' as const,image:IMAGE,runtimeVersion};
    }
    return {path:input.path,repoCommit:input.repoCommit,sha256:createHash('sha256').update(b).digest('hex'),inputManifest:input.files.map(file=>({path:file.path,sha256:createHash('sha256').update(file.bytes).digest('hex')})),kind:'pe' as const,status:'observed' as const,architecture:'x86_64' as const,image:IMAGE,runtime:'wine' as const,runtimeVersion,networkPolicy:'deny-all' as const,execution:{command:`cwd=/vercel${entryDirectory?`/${entryDirectory}`:''}; wine ./${entryName}`,exitCode:command.exitCode,signal:command.exitCode>=128?'unknown termination':null,timedOut:false,stdout:out.text,stderr:err.text,stdoutTruncated:out.truncated,stderrTruncated:err.truncated},sourceEquivalence:'unverified' as const,coverage:'unverified' as const};
  } finally {input.signal.removeEventListener('abort',stop);await sandbox.stop().catch(()=>{});}
}
