import { createHash } from "node:crypto";
/** Identify opaque submitted files without treating a signature as correctness. */
export function genericArtifactInventory(files: readonly {path:string;bytes:Uint8Array}[]) {
  const artifacts=files.flatMap<{path:string;sha256:string;kind:string;status:"unexamined"|"unsupported"}>(file=>{
    const b=file.bytes;
    let invalidUtf8=false;
    try { new TextDecoder("utf-8", {fatal:true}).decode(b); } catch { invalidUtf8=true; }
    const kind=b.length>=8 && b[0]===0 && b[1]===0x61 && b[2]===0x73 && b[3]===0x6d && b[4]===1 && b[5]===0 && b[6]===0 && b[7]===0 ? "wasm"
      : b.length>=4 && b[0]===0x7f && b[1]===0x45 && b[2]===0x4c && b[3]===0x46 ? "elf"
      : b.length>=4 && b[0]===0xca && b[1]===0xfe && b[2]===0xba && b[3]===0xbe ? "java-class"
        : b.length>=2 && b[0]===0x4d && b[1]===0x5a ? "pe"
          : /\.pyc$/i.test(file.path) ? "python-bytecode"
            : b.length>=4 && b[0]===0x50 && b[1]===0x4b && [3,5,7].includes(b[2]) && [4,6,8].includes(b[3]) ? "archive"
              : b.includes(0) || invalidUtf8 ? "binary" : null;
    const basename=file.path.split("/").at(-1) ?? "";
    const extension=basename.includes(".") ? basename.split(".").at(-1)!.toLowerCase() : "";
    // Unknown files are retained as unsupported rather than silently
    // assuming they are data or that their behavior was exercised.
    const knownText=new Set(["py","js","mjs","cjs","java","c","cpp","cc","cxx","h","hpp","sql","txt","csv","tsv","json","dat","md","xml","yaml","yml","ini","toml","in"]);
    const knownProjectFile=/^(readme|dockerfile|makefile|license|licence|procfile|rakefile|gemfile|vagrantfile|jenkinsfile|changelog|notice|authors|contributors)$/i.test(basename);
    const projectText=new TextDecoder().decode(b);
    const unsafeProjectText=!extension && knownProjectFile && (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(projectText) || (projectText.slice(0,1024).includes("%PDF-") || projectText.startsWith("%!PS-Adobe-")));
    const unsupportedSource=!knownText.has(extension) && !knownProjectFile;
    return kind ? [{path:file.path,sha256:createHash("sha256").update(b).digest("hex"),kind,status:"unexamined" as const}]
      : (unsupportedSource || unsafeProjectText) ? [{path:file.path,sha256:createHash("sha256").update(b).digest("hex"),kind:"unsupported-source",status:"unsupported" as const}] : [];
  });
  if(artifacts.length>40)throw new Error("Artifact inventory exceeds supported bounds");
  return artifacts;
}
