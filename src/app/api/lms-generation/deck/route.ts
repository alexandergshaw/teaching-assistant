import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveLmsCourseRowAction, resolveLmsCourseRowByIdAction } from "@/app/actions/lms-syllabus-buttons";
import { getPageAction, previewFileAction } from "@/app/actions/canvas-files-bulk";
import { fetchCanvasMetaAction } from "@/app/actions/grading";
import { listCourseContentAction } from "@/app/actions/canvas-modules";
import { getDeckTemplateAction, generateDeckFromTemplateAction } from "@/app/actions/media";
import { saveGeneratedArtifactVersion } from "@/lib/supabase/generated-artifacts";
import type { Json } from "@/lib/supabase/types";
import {
  gatherSelectionMaterials,
  expandModuleSelection,
  type MaterialsFetchers,
} from "@/lib/lms-generation/materials";
import { GENERATION_KIND_CONFIGS } from "@/lib/lms-generation/kinds";
import { resolveDeckTemplateSelection, buildDeckGenContext, type DeckGenerationRequest } from "@/lib/lms-generation/deck";
import { normalizeCanvasAcronymInput } from "@/lib/course-canvas-url-match";
import { isCourseNotLinkedMessage } from "@/lib/lms-generation/course-not-linked";
import { DEFAULT_MODULE_LABEL } from "@/lib/lms-generation/default-module-label";
import type { LlmProvider } from "@/lib/llm";

// Deck generation (LMS generation chunk 3a's third kind - see
// src/lib/lms-generation/kinds.ts's own header comment for the registry this
// serves) runs behind a Route Handler, not the generateFromSelectionAction
// Server Action every other kind uses, because generateDeckFromTemplate
// (src/lib/decks/generate.ts) can run SEVERAL sequential LLM calls: a
// breadth-enumeration and a sequencing pass per loop group with more than one
// item, then up to two attempts at the final structured-JSON deck itself.
// That routinely exceeds what a Server Action can spend on this page - Next
// only honours `maxDuration` at the PAGE level, and src/app/page.tsx (a
// client component) sets none, so every Server Action reachable from it is
// capped by the platform default. api/accessibility/route.ts's own header
// comment records the identical constraint and the identical fix: a Route
// Handler with an explicit ceiling; its shape (including how it
// authenticates - requireOwner(), the same as every Server Action here) is
// copied below.
//
// Requesting 300s does not, by itself, GRANT 300s: this repo's own
// deployment note records prod as Vercel Hobby, whose real hard ceiling is
// 60s regardless of what a route requests. If generation is still running
// when that ceiling hits, the platform kills the function outright - no
// response ever reaches the client's fetch (see useLmsGeneration.ts's
// generateDeckApi, which treats a non-JSON response, e.g. a platform timeout
// page, as a clean error rather than letting JSON.parse throw). Because
// saveGeneratedArtifactVersion below is the LAST line of this handler's
// success path - reached only after a COMPLETE, successful generation -
// nothing is ever written to generated_artifacts on a timeout. A timeout
// therefore fails clean: the instructor sees an error and can retry with a
// smaller selection or a simpler template, never a truncated deck silently
// saved as a real version.
export const runtime = "nodejs";
export const maxDuration = 300;

// The live-Canvas reads gatherSelectionMaterials needs, wired to the app's
// own existing actions - mirrors LIVE_FETCHERS in src/app/actions/
// lms-generation.ts EXACTLY. Not shared from there: a "use server" module may
// export only async functions (src/lib/use-server-exports.test.ts), so this
// plain object literal cannot be imported from it, and a new shared module
// for three lines of wiring used by exactly two call sites was judged not
// worth the indirection - matches materials.ts's own precedent for a similar
// tradeoff (see its expandModuleSelection doc comment).
const LIVE_FETCHERS: MaterialsFetchers = {
  getPage: (courseUrl, pageUrl, institution) => getPageAction(courseUrl, pageUrl, institution),
  previewFile: (courseUrl, contentId, institution) => previewFileAction(courseUrl, contentId, institution),
  fetchMeta: (contentUrl) => fetchCanvasMetaAction(contentUrl),
};

export async function POST(req: NextRequest) {
  try {
    const user = await requireOwner();
    // M12 (docs/module-intro-video-script-acceptance-criteria.md, finding
    // 15): `acronym` is not part of DeckGenerationRequest (deck.ts) yet - a
    // separate, minimal widening here rather than growing that shared
    // request/response type, since this route is the only known caller ready
    // to read it today. See the resolution below for why it is needed.
    const body = (await req.json()) as Partial<DeckGenerationRequest> & { acronym?: string };

    const courseUrl = body.courseUrl ?? "";
    const courseId = body.courseId;
    const items = body.items ?? [];
    const moduleIds = body.moduleIds ?? [];
    if (items.length === 0 && moduleIds.length === 0) {
      return NextResponse.json({ error: "Select at least one item to generate from." });
    }

    // Refused before any Canvas/database call, same ordering
    // generateFromSelectionAction uses for its own early refusals.
    const templateResolution = resolveDeckTemplateSelection(body.templateId);
    if (!templateResolution.ok) {
      return NextResponse.json({ error: templateResolution.reason });
    }

    // Source-aware resolution (docs/REGRESSION.md entry recording this fix):
    // `courseId` present means an export selection - ContentTab.tsx blanks
    // `courseUrl` to "" for one of those, so resolveLmsCourseRowAction could
    // never match it - resolved by its course_hub row id instead
    // (resolveLmsCourseRowByIdAction), mirroring generateFromSelectionAction's
    // own resolveGenerationCourseRow (src/app/actions/lms-generation.ts).
    // Absent means a live selection, resolved by Canvas URL exactly as
    // before - byte-identical for every existing caller.
    //
    // M12 (finding 15): `body.acronym`, when the client sends one, is
    // threaded into the URL-matching branch so a host-less `courseUrl` (the
    // shape CoursePicker.tsx/LmsCell.tsx actually emit) still resolves to the
    // right row instead of colliding with another institution's course
    // sharing the same numeric id (course-canvas-url-match.ts's own doc
    // comment). Omitted entirely when absent, so a request that predates this
    // field keeps calling resolveLmsCourseRowAction with exactly one
    // argument - byte-identical to before.
    //
    // DEFECT 3 (M14 review): `body.acronym` is UNVALIDATED JSON - a literal
    // `"   "` string is truthy, so the ternary below would otherwise treat it
    // as "present" and thread whitespace through as a scope key.
    // normalizeCanvasAcronymInput collapses that to `undefined` at this
    // boundary, matching findCourseForCanvasUrl's own internal normalization
    // (course-canvas-url-match.ts) so a route request and a direct unit call
    // can never disagree about what counts as "no acronym".
    const acronym = normalizeCanvasAcronymInput(body.acronym);
    const resolved = courseId
      ? await resolveLmsCourseRowByIdAction(courseId)
      : acronym
        ? await resolveLmsCourseRowAction(courseUrl, acronym)
        : await resolveLmsCourseRowAction(courseUrl);
    if ("error" in resolved) {
      return NextResponse.json(
        isCourseNotLinkedMessage(resolved.error)
          ? { error: resolved.error, courseNotLinked: true }
          : { error: resolved.error }
      );
    }
    const course = resolved.course;

    // A whole-module selection is expanded against a FRESH module tree,
    // never the caller's - mirrors generateFromSelectionAction's identical
    // handling (src/app/actions/lms-generation.ts) exactly, including
    // staying LIVE-only: an export-sourced module selection has no
    // server-side fetch path at all and is already expanded into concrete
    // `items` by the client before this route is ever called.
    let resolvedItems = items;
    if (moduleIds.length > 0) {
      const content = await listCourseContentAction(course.canvasUrl ?? "", course.institution ?? undefined);
      if ("error" in content) return NextResponse.json({ error: content.error });
      resolvedItems = expandModuleSelection(
        items,
        moduleIds.map((id) => `live:${id}`),
        content.modules
      );
    }

    const materials = await gatherSelectionMaterials(resolvedItems, {
      canvasUrl: course.canvasUrl ?? "",
      institution: course.institution ?? undefined,
      fetchers: LIVE_FETCHERS,
    });
    if (!materials.materialsText.trim()) {
      return NextResponse.json({ error: "The selected item(s) had no usable material to ground generation on." });
    }

    const tplRes = await getDeckTemplateAction(templateResolution.templateId);
    if ("error" in tplRes) return NextResponse.json({ error: tplRes.error });

    const provider: LlmProvider = body.provider ?? "gemini";
    // WAVE 11B DEFECT 3 fix: this used to hand-spell "the selected material"
    // rather than importing the shared constant every other fallback in this
    // kind's pipeline already sources from - see default-module-label.ts's
    // own header comment for why that mattered.
    const moduleLabel = (body.moduleLabel ?? "").trim() || DEFAULT_MODULE_LABEL;
    const config = GENERATION_KIND_CONFIGS.decks;

    const ctx = buildDeckGenContext(tplRes.template, moduleLabel, materials.materialsText);
    const deck = await generateDeckFromTemplateAction(tplRes.template, ctx, provider);
    if ("error" in deck) return NextResponse.json({ error: deck.error });
    if (config.isEmpty(deck)) return NextResponse.json({ error: config.emptyMessage });

    const supabase = createServiceClient();
    const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
      courseId: course.id,
      kind: config.artifactKind,
      title: deck.presentationTitle,
      text: config.render(deck),
      structured: config.renderStructured!(deck) as Json,
      prompt: config.buildPrompt(materials.materialsText, {
        courseName: course.name,
        moduleLabel,
        templateName: tplRes.template.name,
      }),
    });

    return NextResponse.json({ artifact, notes: materials.notes });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not generate the deck." }, { status: 500 });
  }
}
