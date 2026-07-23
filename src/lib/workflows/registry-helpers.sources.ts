// Material-source resolution for the lecture-building steps: gatherModuleMaterials
// and its per-source gatherers, split out of registry-helpers.ts to keep that
// file under 1000 lines (see AGENTS.md gates). registry-helpers.ts re-exports
// gatherModuleMaterials so every existing importer is unchanged.
//
// gatherModuleMaterials dispatches SourcePolicy.order through runSourcePolicy
// (source-policy.ts, pure), applying the chosen strategy. DEFAULT_SOURCE_POLICY
// ("live-lms" -> "course-export" -> "tile-meta", first-success) reproduces
// EXACTLY the pre-policy hard-coded chain: the "live-lms" gatherer below keeps
// today's internal on-failure fallback to the course export (same note
// wording), so under the default policy "course-export" as a standalone policy
// entry is a no-op (it only runs a fresh, independent export lookup when
// "live-lms" was never dispatched - i.e. a customized policy that omits it).

import {
  listCourseContentAction,
  getPageAction,
  previewFileAction,
  fetchCanvasMetaAction,
  ingestRepoAction,
  extractZipMaterialsTextAction,
} from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import type { CartridgeCourseData } from "@/lib/cartridge-import";
import { moduleItemContentUrl } from "@/lib/canvas-url";
import { parseLmsModuleValue } from "@/lib/workflows/module-value";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import {
  DEFAULT_SOURCE_POLICY,
  runSourcePolicy,
  type SourceGatherOutcome,
  type SourceGatherer,
  type SourceKind,
  type SourcePolicy,
} from "@/lib/workflows/source-policy";

// Materials cap at ~20000 chars so the deck prompt stays inside the action's
// own truncation budget; going over surfaces as a note. Matches the
// pre-policy MATERIALS_CAP exactly.
const MATERIALS_CAP = 20000;
const DESCRIPTION_FETCH_LIMIT = 6;
// A materials zip above this is skipped for text extraction (server actions
// invoked from the browser serialize their payload as base64 over the
// network) and falls back to a file-name/size listing instead.
const MATERIALS_ZIP_EXTRACT_MAX_BYTES = 8 * 1024 * 1024;

// Isomorphic Blob -> base64, duplicated from registry-helpers.ts's
// blobToBase64 to avoid a runtime import cycle (registry-helpers.ts
// re-exports this module's gatherModuleMaterials).
async function blobToBase64Local(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  if (typeof btoa !== "undefined") {
    const chunkSize = 8192;
    let binaryStr = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binaryStr += String.fromCharCode(...chunk);
    }
    return btoa(binaryStr);
  }
  throw new Error("Neither Buffer nor btoa available for base64 encoding");
}

async function listZipMemberNames(blob: Blob): Promise<string[]> {
  try {
    const buffer = await blob.arrayBuffer();
    const { default: JSZipMod } = await import("jszip");
    const zip = await JSZipMod.loadAsync(buffer);
    const names: string[] = [];
    zip.forEach((path, file) => {
      if (!file.dir) names.push(path);
    });
    return names;
  } catch {
    return [];
  }
}

// Gather the text a lecture-shaped step feeds the model, per `policy` (default:
// the pre-policy hard-coded chain - see the module comment for the exact
// equivalence). Content gathering never hard-fails the step: every per-source
// gatherer below fails forward into a note.
export async function gatherModuleMaterials(
  tile: Course,
  moduleIdRaw: string,
  helpers: StepRunHelpers,
  onProgress: (text: string) => void,
  policy: SourcePolicy = DEFAULT_SOURCE_POLICY
): Promise<{ moduleName: string; materialsText: string; notes: string[]; materialsSource: string }> {
  const canvasUrl = (tile.canvasUrl ?? "").trim();
  const inst = helpers.activeInstitution || undefined;
  const picked = parseLmsModuleValue(moduleIdRaw);

  let moduleName = "Upcoming module";
  let materialsSource = "";
  let liveLmsRan = false;

  // Pull item titles + syllabus text from the course's newest LMS export,
  // matched by module name. Pure (returns instead of mutating shared state)
  // so both the live-LMS fallback below and a standalone "course-export"
  // policy entry can call it.
  const tryExport = async (
    matchName: string | null
  ): Promise<{ ok: true; text: string; name: string } | { ok: false; note: string | null }> => {
    if (!helpers.loadCourseExport || !matchName) return { ok: false, note: null };
    onProgress("Reading the course export...");
    let data: CartridgeCourseData | null = null;
    try {
      data = await helpers.loadCourseExport(tile.id);
    } catch (err) {
      return { ok: false, note: `course export: ${err instanceof Error ? err.message : "could not read"}` };
    }
    if (!data || data.modules.length === 0) return { ok: false, note: null };
    const target =
      data.modules.find((m) => m.name === matchName) ??
      data.modules.find((m) => m.name.toLowerCase() === matchName.toLowerCase());
    if (!target) return { ok: false, note: null };
    const chunks: string[] = [];
    for (const item of target.items) chunks.push(`${item.type}: ${item.title}\n`);
    if (data.syllabusHtml) {
      const syllabusText = data.syllabusHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (syllabusText) chunks.push(`\n# Course syllabus (context)\n${syllabusText}\n`);
    }
    return { ok: true, text: chunks.join(""), name: target.name };
  };

  const liveLmsGatherer = async (): Promise<SourceGatherOutcome> => {
    liveLmsRan = true;
    const notes: string[] = [];

    if (picked.fromExport) {
      const r = await tryExport(picked.name);
      if (r.ok) {
        moduleName = r.name;
        materialsSource = `Materials from the course export module "${r.name}" (item titles + syllabus)`;
        return { text: r.text, notes, ok: true };
      }
      if (r.note) notes.push(r.note);
      notes.push(`module "${picked.name ?? ""}" not found in the course export`);
      return { text: "", notes, ok: false };
    }

    if (canvasUrl && picked.liveId) {
      onProgress("Loading module materials...");
      try {
        const content = await listCourseContentAction(canvasUrl, inst);
        if ("error" in content) throw new Error(content.error);
        const courseModule = content.modules.find((m) => String(m.id) === picked.liveId);
        if (!courseModule) throw new Error("the chosen module was not found in the LMS course");
        moduleName = courseModule.name;
        materialsSource = `Materials read from LMS module "${courseModule.name}"`;

        const chunks: string[] = [];
        const push = (t: string) => {
          if (t) chunks.push(t);
        };

        let descriptionsFetched = 0;
        const assignmentLikeItems = courseModule.items.filter(
          (item) => (item.type === "Assignment" || item.type === "Discussion") && item.htmlUrl
        );
        const hasMoreDescriptions = assignmentLikeItems.length > DESCRIPTION_FETCH_LIMIT;

        for (const item of courseModule.items) {
          // Fail-forward per item: unreadable materials become notes.
          try {
            if (item.type === "Page" && item.pageUrl) {
              const p = await getPageAction(canvasUrl, item.pageUrl, inst);
              if ("error" in p) throw new Error(p.error);
              const bodyText = p.page.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
              push(`# ${p.page.title}\n${bodyText}\n\n`);
            } else if (item.type === "File" && item.contentId !== null) {
              const f = await previewFileAction(canvasUrl, item.contentId, inst);
              if ("error" in f) throw new Error(f.error);
              if (f.preview.text.trim()) push(`# ${item.title}\n${f.preview.text}\n\n`);
            } else if (
              (item.type === "Assignment" || item.type === "Discussion") &&
              moduleItemContentUrl(canvasUrl, item.type, item.contentId, item.htmlUrl) &&
              descriptionsFetched < DESCRIPTION_FETCH_LIMIT
            ) {
              descriptionsFetched++;
              const meta = await fetchCanvasMetaAction(
                moduleItemContentUrl(canvasUrl, item.type, item.contentId, item.htmlUrl)!
              );
              if ("error" in meta) throw new Error(meta.error);
              const description = meta.description.trim();

              let headerLine = `${item.type}: ${item.title}`;
              const suffixes: string[] = [];
              if (typeof item.pointsPossible === "number" && item.pointsPossible > 0) {
                suffixes.push(`${item.pointsPossible} point${item.pointsPossible === 1 ? "" : "s"}`);
              }
              if (item.dueAt) {
                const dueDate = new Date(item.dueAt);
                const dateStr = dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                suffixes.push(`due ${dateStr}`);
              }
              if (suffixes.length > 0) headerLine += ` (${suffixes.join(", ")})`;
              push(`${headerLine}\n`);
              if (description) push(`${description}\n\n`);
            } else if (item.type === "Assignment" || item.type === "Quiz" || item.type === "Discussion") {
              let headerLine = `${item.type}: ${item.title}`;
              const suffixes: string[] = [];
              if (typeof item.pointsPossible === "number" && item.pointsPossible > 0) {
                suffixes.push(`${item.pointsPossible} point${item.pointsPossible === 1 ? "" : "s"}`);
              }
              if (item.dueAt) {
                const dueDate = new Date(item.dueAt);
                const dateStr = dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                suffixes.push(`due ${dateStr}`);
              }
              if (suffixes.length > 0) headerLine += ` (${suffixes.join(", ")})`;
              push(`${headerLine}\n`);
            }
          } catch (err) {
            notes.push(`${item.title}: ${err instanceof Error ? err.message : "could not read"}`);
          }
        }

        if (hasMoreDescriptions) {
          notes.push(
            `further assignment descriptions omitted (${assignmentLikeItems.length - DESCRIPTION_FETCH_LIMIT} more)`
          );
        }

        return { text: chunks.join(""), notes, ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : "could not read the LMS course";
        const r = await tryExport(picked.name);
        if (r.ok) {
          moduleName = r.name;
          materialsSource = `Materials from the course export module "${r.name}" (item titles + syllabus)`;
          notes.push(`live LMS failed (${message}) - used the course export instead`);
          return { text: r.text, notes, ok: true };
        }
        if (r.note) notes.push(r.note);
        notes.push(`live LMS failed (${message}) and the course export had no matching module`);
        return { text: "", notes, ok: false };
      }
    }

    return { text: "", notes, ok: false };
  };

  // Standalone "course-export" policy entry: a no-op when "live-lms" already
  // ran (it already tried this, coupled, above) - a genuine independent
  // attempt only when the policy omits "live-lms" entirely.
  const courseExportGatherer = async (): Promise<SourceGatherOutcome> => {
    if (liveLmsRan) return { text: "", notes: [], ok: false };
    const r = await tryExport(picked.name);
    if (r.ok) {
      moduleName = r.name;
      materialsSource = `Materials from the course export module "${r.name}" (item titles + syllabus)`;
      return { text: r.text, notes: [], ok: true };
    }
    const notes: string[] = [];
    if (r.note) notes.push(r.note);
    else if (picked.name) notes.push(`module "${picked.name}" not found in the course export`);
    return { text: "", notes, ok: false };
  };

  const tileMetaGatherer = async (): Promise<SourceGatherOutcome> => {
    const text = [tile.topics ?? "", tile.description ?? ""].filter(Boolean).join("\n\n");
    materialsSource = "Materials from the tile's topics/description";
    return {
      text,
      notes: ["no live LMS module or export module - using tile topics/description"],
      ok: true,
    };
  };

  // "materials-zip": the tile's uploaded course-materials zip (not an LMS
  // export). Best-effort text extraction (extractZipMaterialsTextAction,
  // server-safe - see that action's doc comment); falls back to a
  // names/sizes listing when extraction is unavailable or the archive is too
  // large to ship over the action boundary.
  const materialsZipGatherer = async (): Promise<SourceGatherOutcome> => {
    if (!helpers.loadCourseMaterials) {
      return { text: "", notes: ["materials zip: not available in this run context"], ok: false };
    }
    onProgress("Reading the course materials zip...");
    let file: { name: string; blob: Blob } | null;
    try {
      file = await helpers.loadCourseMaterials(tile.id);
    } catch (err) {
      return {
        text: "",
        notes: [`materials zip: ${err instanceof Error ? err.message : "could not read"}`],
        ok: false,
        error: true,
      };
    }
    if (!file) {
      return { text: "", notes: ["materials zip: none uploaded on this course tile"], ok: false };
    }

    if (file.blob.size > MATERIALS_ZIP_EXTRACT_MAX_BYTES) {
      const names = await listZipMemberNames(file.blob);
      return {
        text:
          names.length > 0
            ? `Materials zip "${file.name}" contents (too large for text extraction, names only):\n${names.join("\n")}`
            : "",
        notes: [
          `materials zip "${file.name}": too large for text extraction (${(file.blob.size / 1048576).toFixed(1)} MB) - listed file names only`,
        ],
        ok: names.length > 0,
      };
    }

    try {
      const base64 = await blobToBase64Local(file.blob);
      const extracted = await extractZipMaterialsTextAction(base64);
      if ("error" in extracted) {
        const names = await listZipMemberNames(file.blob);
        return {
          text:
            names.length > 0
              ? `Materials zip "${file.name}" contents (text extraction unavailable):\n${names.join("\n")}`
              : "",
          notes: [`materials zip "${file.name}": text extraction unavailable (${extracted.error}) - listed file names only`],
          ok: names.length > 0,
        };
      }
      const withText = extracted.entries.filter((e) => e.text.trim());
      if (withText.length > 0) {
        const text = withText.map((e) => `# ${e.name}\n${e.text}\n`).join("\n");
        return {
          text,
          notes: [
            `materials zip "${file.name}": extracted text from ${withText.length}/${extracted.entries.length} file(s)`,
          ],
          ok: true,
        };
      }
      const names = extracted.entries.map((e) => `${e.name} (${(e.size / 1024).toFixed(1)} KB)`);
      return {
        text:
          names.length > 0
            ? `Materials zip "${file.name}" contents (names + sizes only, no extractable text):\n${names.join("\n")}`
            : "",
        notes: [
          names.length > 0
            ? `materials zip "${file.name}": no extractable text - listed file names and sizes`
            : `materials zip "${file.name}": empty`,
        ],
        ok: names.length > 0,
      };
    } catch (err) {
      return {
        text: "",
        notes: [`materials zip: ${err instanceof Error ? err.message : "could not process"}`],
        ok: false,
        error: true,
      };
    }
  };

  // "repo": the course tile's first linked repository, digested (README +
  // selected source files) via the same ingestRepo helper the grading and
  // rubric flows use - already a compact, bounded text digest, so no zip
  // download/text-extraction step is needed for this kind.
  const repoGatherer = async (): Promise<SourceGatherOutcome> => {
    const repoRef = tile.repos?.[0]?.repo?.trim();
    if (!repoRef) {
      return { text: "", notes: ["repo: no repository linked to this course tile"], ok: false };
    }
    onProgress("Reading the linked repository...");
    try {
      const branch = tile.repos?.[0]?.branch?.trim() || undefined;
      const r = await ingestRepoAction(repoRef, branch);
      if ("error" in r) {
        return { text: "", notes: [`repo: ${r.error}`], ok: false, error: true };
      }
      return {
        text: r.digest.text,
        notes: [
          `repo "${r.digest.fullName}": digested ${r.digest.fileCount} file(s)${r.digest.truncated ? " (truncated)" : ""}`,
        ],
        ok: r.digest.text.trim().length > 0,
      };
    } catch (err) {
      return {
        text: "",
        notes: [`repo: ${err instanceof Error ? err.message : "could not read the repository"}`],
        ok: false,
        error: true,
      };
    }
  };

  const gather: SourceGatherer = (kind: SourceKind) => {
    switch (kind) {
      case "live-lms":
        return liveLmsGatherer();
      case "course-export":
        return courseExportGatherer();
      case "tile-meta":
        return tileMetaGatherer();
      case "materials-zip":
        return materialsZipGatherer();
      case "repo":
        return repoGatherer();
    }
  };

  const result = await runSourcePolicy(policy, gather, MATERIALS_CAP);
  const notes = [...result.notes];
  if (result.truncated) notes.push(`materials truncated to ~${MATERIALS_CAP} characters`);

  return { moduleName, materialsText: result.text, notes, materialsSource };
}
