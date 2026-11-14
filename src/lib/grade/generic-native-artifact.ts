import { createHash } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import { isSafeGenericExecutionComponent } from "./generic-execution-path";
import { createGenericOutputCapture } from "./generic-output-capture";
import { MAX_GENERIC_EXECUTION_FILES } from "./generic-execution-limits";

const IMAGE = "vercel/sandbox/universal@sha256:9b2669397f26336812ec6835c2f67db6a546074cbabb05db93bf5e669f71ec5d";
type Kind = "elf" | "java-class" | "python-bytecode" | "wasm";
export class ArtifactRuntimeUnavailableError extends Error {}

/** Resolve a class's binary name from its own constant pool. Do not guess a
 * package from its filename: mismatches remain unexamined. */
export function resolveJavaClass(b:Uint8Array,relativePath:string):{className:string;classpath:string}|null {
  try {
    if(b.length<10 || b[0]!==0xca || b[1]!==0xfe || b[2]!==0xba || b[3]!==0xbe)return null;
    const v=new DataView(b.buffer,b.byteOffset,b.byteLength),count=v.getUint16(8,false);
    if(count<2 || count>8192)return null;
    const pool:Array<string|number|undefined>=new Array(count);let at=10;
    const need=(n:number)=>{if(at+n>b.length)throw new Error("short class");};
    for(let i=1;i<count;i++){
      need(1);const tag=b[at++];
      if(tag===1){need(2);const n=v.getUint16(at,false);at+=2;need(n);pool[i]=new TextDecoder("utf-8",{fatal:true}).decode(b.subarray(at,at+n));at+=n;}
      else if(tag===7){need(2);pool[i]=v.getUint16(at,false);at+=2;}
      else if(tag===3||tag===4){need(4);at+=4;}
      else if(tag===5||tag===6){need(8);at+=8;i++;}
      else if(tag===8||tag===16||tag===19||tag===20){need(2);at+=2;}
      else if(tag===9||tag===10||tag===11||tag===12||tag===17||tag===18){need(4);at+=4;}
      else if(tag===15){need(3);at+=3;}else return null;
    }
    need(4);const classIndex=v.getUint16(at+2,false),nameIndex=pool[classIndex];
    if(typeof nameIndex!=="number")return null;
    const internal=pool[nameIndex];
    if(typeof internal!=="string" || !/^[A-Za-z_$][A-Za-z0-9_$]*(?:\/[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(internal))return null;
    const suffix=`${internal}.class`;
    if(relativePath!==suffix && !relativePath.endsWith(`/${suffix}`))return null;
    const base=relativePath.slice(0,-suffix.length).replace(/\/$/,"");
    return {className:internal.replaceAll("/","."),classpath:base||"."};
  }catch{return null;}
}

/** The current sandbox image is amd64 Linux. Do not try to start other ELF
 * architectures or libraries as if an OS execution error were a student defect. */
export function isSupportedNativeArtifact(kind: Kind, b: Uint8Array): boolean {
  if (kind === "wasm") return b.length >= 8 && b[0] === 0 && b[1] === 0x61 && b[2] === 0x73 && b[3] === 0x6d && b[4] === 1 && b[5] === 0 && b[6] === 0 && b[7] === 0;
  if (kind === "elf") {
    if (b.length < 20 || b[0] !== 0x7f || b[1] !== 0x45 || b[2] !== 0x4c || b[3] !== 0x46 || b[4] !== 2 || b[5] !== 1) return false;
    const v = new DataView(b.buffer,b.byteOffset,b.byteLength), type = v.getUint16(16,true);
    if (v.getUint16(18,true) !== 62) return false;
    if (type === 2) return true;
    // Position-independent executables use ET_DYN, as do shared libraries.
    // Only attempt ET_DYN when its bounded program header has PT_INTERP.
    if (type !== 3 || b.length < 64) return false;
    const offset = v.getBigUint64(32,true), width = v.getUint16(54,true), count = v.getUint16(56,true);
    if (width < 56 || count === 0 || count > 1024 || offset > BigInt(b.length) || offset + BigInt(width) * BigInt(count) > BigInt(b.length)) return false;
    for (let i=0; i<count; i++) if (v.getUint32(Number(offset) + i * width,true) === 3) return true;
    return false;
  }
  if (kind === "java-class") return b.length >= 8 && b[0] === 0xca && b[1] === 0xfe && b[2] === 0xba && b[3] === 0xbe;
  return b.length >= 16 && b[2] === 13 && b[3] === 10 && [0,1,3].includes(b[4]) && b[5] === 0 && b[6] === 0 && b[7] === 0;
}

/** Run one submitted artifact in a fresh, deny-egress VM. An observed exit is
 * not evidence of source equivalence, test coverage, or native compatibility. */
export async function runGenericNativeArtifact(input: {
  path: string; bytes: Uint8Array; folder: string; files: readonly {path:string;bytes:Uint8Array}[];
  kind: Kind; repoCommit: string; signal: AbortSignal; beforeDispatch: (signal: AbortSignal) => Promise<void>;
  onSandboxCreated?: (sessionId:string) => Promise<void>;
}) {
  const b = input.bytes;
  const valid = isSupportedNativeArtifact(input.kind,b);
  if (!valid || !/^[a-f0-9]{40}$/.test(input.repoCommit) || b.length > 400_000) throw new Error("Invalid artifact input");
  const prefix = input.folder ? `${input.folder}/` : "", seen = new Set<string>(); let total = 0;
  const files = input.files.map(file => {
    if (!file.path.startsWith(prefix)) throw new Error("Artifact input outside assignment");
    const relative = file.path.slice(prefix.length), parts = relative.split("/");
    if (!relative || parts.some(p => !isSafeGenericExecutionComponent(p)) || seen.has(relative.toLowerCase())) throw new Error("Unsafe artifact path");
    seen.add(relative.toLowerCase()); total += file.bytes.length;
    return {path:relative,content:Buffer.from(file.bytes)};
  });
  if (!files.length || files.length > MAX_GENERIC_EXECUTION_FILES || total > 4_000_000 || input.files.filter(f => f.path === input.path && Buffer.from(f.bytes).equals(Buffer.from(b))).length !== 1) throw new Error("Artifact inventory mismatch");
  const entry = input.path.slice(prefix.length), slash = entry.lastIndexOf("/"), dir = slash < 0 ? "" : entry.slice(0, slash), name = slash < 0 ? entry : entry.slice(slash + 1);
  const javaClass=input.kind === "java-class" ? resolveJavaClass(b,entry) : null;
  if (input.kind === "java-class" && !javaClass) throw new Error("Unsupported class name");
  input.signal.throwIfAborted(); await input.beforeDispatch(input.signal);
  const sandbox = await Sandbox.create({image:IMAGE,persistent:false,resources:{vcpus:1},timeout:180_000,signal:input.signal});
  const stop = () => { void sandbox.stop().catch(() => {}); }; input.signal.addEventListener("abort", stop, {once:true});
  try {
    if (input.onSandboxCreated) await input.onSandboxCreated(sandbox.currentSession().sessionId);
    input.signal.throwIfAborted();
    if (input.kind === "java-class") {
      const install = await sandbox.runCommand({cmd:"bash",args:["-c","apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq default-jre-headless >/dev/null 2>&1"],sudo:true,timeoutMs:100_000,signal:input.signal});
      if (install.exitCode !== 0) throw new ArtifactRuntimeUnavailableError("Artifact runtime unavailable");
    }
    const runtime = input.kind === "java-class" ? "java" : input.kind === "python-bytecode" ? "python3" : input.kind === "wasm" ? "node" : "uname";
    const ver = await sandbox.runCommand({cmd:runtime,args:[input.kind === "elf" ? "-sm" : "--version"],timeoutMs:5000,signal:input.signal});
    const runtimeVersion = ((await ver.stdout({signal:input.signal})) || (await ver.stderr({signal:input.signal}))).split("\n")[0].replace(/[\x00-\x1f\x7f]/g,"").toWellFormed().slice(0,512).toWellFormed();
    if (ver.exitCode !== 0 || !runtimeVersion) throw new ArtifactRuntimeUnavailableError("Artifact runtime version unavailable");
    await sandbox.update({networkPolicy:"deny-all"},{signal:input.signal}); input.signal.throwIfAborted();
    const dirs = new Set<string>(); for (const f of files) { const p=f.path.split("/");p.pop();for(let i=1;i<=p.length;i++)dirs.add(p.slice(0,i).join("/")); }
    for (const d of [...dirs].sort((a,b)=>a.length-b.length)) await sandbox.mkDir(d,{signal:input.signal});
    await input.beforeDispatch(input.signal); await sandbox.writeFiles(files,{signal:input.signal});
    if (input.kind === "elf") {
      await input.beforeDispatch(input.signal);
      const permission = await sandbox.runCommand({cmd:"chmod",args:["u+x","--",entry],timeoutMs:5000,signal:input.signal});
      if (permission.exitCode !== 0) throw new ArtifactRuntimeUnavailableError("Artifact could not be started");
    }
    const stdout=createGenericOutputCapture(),stderr=createGenericOutputCapture();
    const cmd = input.kind === "java-class" ? "java" : input.kind === "python-bytecode" ? "python3" : input.kind === "wasm" ? "node" : `./${name}`;
    // WASI is an execution adapter, not the isolation boundary: the VM is
    // ephemeral and has deny-all networking before any submission is copied.
    const wasiRunner = 'const fs=require("node:fs");const {WASI}=require("node:wasi");const wasi=new WASI({version:"preview1",args:[process.argv[1]],env:{},preopens:{".":"."},returnOnExit:false});const moduleBytes=fs.readFileSync(process.argv[1]);WebAssembly.instantiate(moduleBytes,wasi.getImportObject()).then(({instance})=>{try{wasi.start(instance)}catch(e){if(e instanceof WebAssembly.RuntimeError){console.error("WASI program trapped");process.exitCode=1}else{console.error("WASI execution unavailable");process.exitCode=125}}},()=>{console.error("WASI execution unavailable");process.exitCode=125})';
    const args = input.kind === "java-class" ? ["-ea","-cp",javaClass!.classpath,javaClass!.className] : input.kind === "python-bytecode" ? [`./${name}`] : input.kind === "wasm" ? ["--experimental-wasi-unstable-preview1","-e",wasiRunner,`./${name}`] : [];
    await input.beforeDispatch(input.signal); input.signal.throwIfAborted();
    const runDir=input.kind === "java-class" ? "" : dir;
    if (input.kind === "wasm") {
      // Compile and inspect without instantiating: start sections can execute
      // student code. Only WASI command modules supported by this runtime may
      // produce an observed result; libraries and unresolved imports cannot.
      const preflight='try{const fs=require("node:fs"),{WASI}=require("node:wasi"),w=new WASI({version:"preview1",args:[],env:{},preopens:{}}),m=new WebAssembly.Module(fs.readFileSync(process.argv[1])),i=w.getImportObject(),e=WebAssembly.Module.exports(m);if(!e.some(x=>x.name==="_start"&&x.kind==="function")||!e.some(x=>x.name==="memory"&&x.kind==="memory")||e.some(x=>x.name==="_initialize")||WebAssembly.Module.imports(m).some(x=>x.kind!=="function"||x.module!=="wasi_snapshot_preview1"||typeof i[x.module]?.[x.name]!=="function"))process.exitCode=1}catch{process.exitCode=1}';
      const check=await sandbox.runCommand({cmd:"node",args:["--experimental-wasi-unstable-preview1","-e",preflight,`./${name}`],...(runDir && {cwd:`/vercel/${runDir}`}),timeoutMs:5000,signal:input.signal});
      if(check.exitCode!==0)throw new ArtifactRuntimeUnavailableError("Unsupported WASI command or runtime");
    }
    const result = await sandbox.runCommand({cmd,args,...(runDir && {cwd:`/vercel/${runDir}`}),timeoutMs:15_000,signal:input.signal,stdout:stdout.stream,stderr:stderr.stream});
    // Reserve 125 conservatively: a student program intentionally returning it
    // is also held for review instead of being misrepresented as an adapter error.
    if (input.kind === "wasm" && result.exitCode === 125) throw new ArtifactRuntimeUnavailableError("WASI instantiation unavailable");
    const out=stdout.result(),err=stderr.result();
    return {path:input.path,repoCommit:input.repoCommit,sha256:createHash("sha256").update(b).digest("hex"),inputManifest:input.files.map(f=>({path:f.path,sha256:createHash("sha256").update(f.bytes).digest("hex")})),kind:input.kind,status:"observed" as const,architecture:"unknown" as const,image:IMAGE,runtime:input.kind === "java-class" ? "java" as const : input.kind === "python-bytecode" ? "python" as const : input.kind === "wasm" ? "wasi" as const : "native" as const,runtimeVersion,networkPolicy:"deny-all" as const,execution:{command:input.kind === "wasm" ? `cwd=/vercel${runDir?`/${runDir}`:""}; node WASI preview1 ./${name}` : `cwd=/vercel${runDir?`/${runDir}`:""}; ${cmd} ${args.join(" ")}`.trim(),exitCode:result.exitCode,signal:result.exitCode>=128?"unknown termination":null,timedOut:false,stdout:out.text,stderr:err.text,stdoutTruncated:out.truncated,stderrTruncated:err.truncated},sourceEquivalence:"unverified" as const,coverage:"unverified" as const};
  } finally { input.signal.removeEventListener("abort",stop); await sandbox.stop().catch(()=>{}); }
}
