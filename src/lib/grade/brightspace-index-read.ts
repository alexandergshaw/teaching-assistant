import { verifyMember, type RecoverableGroup } from "./large-zip-subset";
import { inferArchiveNames } from "./recoverable-zip-names";
import { parseBrightspaceIndexEvidence, type BrightspaceIndexEvidence } from "./brightspace-index-evidence";

/** The caller must durably preserve sourceBytes and forward matched rows to grading. */
export async function readBrightspaceIndexEvidence(source: Blob, groups: readonly RecoverableGroup[]): Promise<{ ok: true; sourceBytes: Uint8Array; evidence: BrightspaceIndexEvidence } | { ok: false; reason: string }> {
  const indexes = groups.filter((group) => group.reason === "unassigned index");
  const member = indexes[0]?.members[0];
  if (indexes.length !== 1 || indexes[0].members.length !== 1 || !member || member.path.toLowerCase() !== "index.html") return { ok: false, reason: "No unique Brightspace index was found." };
  if (member.declaredBytes > 1024 * 1024 || member.compressedBytes > 1024 * 1024) return { ok: false, reason: "The Brightspace index exceeds the safe inspection limit." };
  if (!await verifyMember(source, member)) return { ok: false, reason: "The Brightspace index failed integrity verification." };
  try {
    let stream = source.slice(member.dataOffset, member.dataOffset + member.compressedBytes).stream();
    if (member.method === 8) stream = stream.pipeThrough(new DecompressionStream("deflate-raw"));
    const sourceBytes = new Uint8Array(await new Response(stream).arrayBuffer());
    if (sourceBytes.length !== member.declaredBytes) return { ok: false, reason: "The Brightspace index changed during inspection." };
    const html = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
    const names = await inferArchiveNames(source, groups);
    return { ok: true, sourceBytes, evidence: parseBrightspaceIndexEvidence(html, names) };
  } catch { return { ok: false, reason: "The Brightspace index could not be decoded safely." }; }
}
