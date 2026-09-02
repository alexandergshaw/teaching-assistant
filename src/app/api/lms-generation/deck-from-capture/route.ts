import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveLmsCourseRowAction, resolveLmsCourseRowByIdAction } from "@/app/actions/lms-syllabus-buttons";
import { getDeckTemplateAction, generateDeckFromTemplateAction } from "@/app/actions/media";
import { saveGeneratedArtifactVersion } from "@/lib/supabase/generated-artifacts";
import type { Json } from "@/lib/supabase/types";
import { GENERATION_KIND_CONFIGS } from "@/lib/lms-generation/kinds";
import { resolveDeckTemplateSelection, buildDeckGenContext } from "@/lib/lms-generation/deck";
import { normalizeCanvasAcronymInput } from "@/lib/course-canvas-url-match";
import { isCourseNotLinkedMessage } from "@/lib/lms-generation/course-not-linked";
import { DEFAULT_MODULE_LABEL } from "@/lib/lms-generation/default-module-label";
import type { LlmProvider } from "@/lib/llm";
import type { DeckFromCaptureRequest } from "@/app/components/module-deck-capture/deck-from-capture-client";

// Deck-from-capture generation - see
// docs/module-walkthrough-deck-acceptance-criteria.md AC7/AM-J for the full
// rationale. This is a SIBLING of src/app/api/lms-generation/deck/route.ts
// (read in full before writing this file), not a widening of it: that
// route's contract is "a selection becomes materials" - it refuses on an
// empty selection and resolves a course by courseUrl/courseId/acronym. This
// route's caller (the module-deck-capture panel, via
// deck-from-capture-client.ts) already HAS its materials text - extracted
// live from screen-captured frames, never a Canvas selection - so the one
// thing that differs is exactly that: `materialsText` replaces
// `gatherSelectionMaterials`'s `items`/`moduleIds` inputs. Every other step
// (template resolution, course resolution, template lookup, context build,
// generation, empty-deck check, save) is copied verbatim from that route,
// because AM-J's rejection of widening applies just as much here: giving one
// handler two mutually exclusive grounding modes (a selection vs. raw text)
// would put that risk in a file three OTHER features already share.
//
// A Route Handler rather than a Server Action for the identical reason
// deck/route.ts is one: generateDeckFromTemplateAction
// (src/app/actions/media.ts -> src/lib/decks/generate.ts) can run several
// sequential LLM calls (a breadth-enumeration and a sequencing pass per loop
// group with more than one item, then up to two attempts at the final
// structured-JSON deck itself) that routinely exceed what a Server Action can
// spend on this page - see that route's own header comment for the full
// argument, unchanged here.
//
// Requesting 300s does not, by itself, GRANT 300s: prod is Vercel Hobby,
// whose real hard ceiling is 60s regardless of what a route requests. If
// generation is still running when that ceiling hits, the platform kills the
// function outright - no response ever reaches the client's fetch (see
// deck-from-capture-client.ts's own guard, which treats a non-JSON response,
// e.g. a platform timeout page, as a clean error rather than letting
// JSON.parse throw). Because saveGeneratedArtifactVersion below is the LAST
// statement of this handler's success path - reached only after a COMPLETE,
// successful generation - nothing is ever written to generated_artifacts on
// a timeout. A timeout therefore fails clean: the instructor sees an error
// and can retry with a shorter capture or a simpler template, never a
// truncated deck silently saved as a real version.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const user = await requireOwner();
    // DeckFromCaptureRequest (deck-from-capture-client.ts) is this route's
    // ONLY caller's request type - imported type-only (erased at compile
    // time, so this adds no runtime coupling to that client module) rather
    // than declared a second time here, so the two ends of this fetch can
    // never silently drift out of shape. `Partial<...>` because the body is
    // untrusted JSON - every required field is still explicitly checked
    // below before use, exactly as deck/route.ts treats its own
    // `Partial<DeckGenerationRequest>`.
    const body = (await req.json()) as Partial<DeckFromCaptureRequest>;

    const courseUrl = body.courseUrl ?? "";
    const courseId = body.courseId;

    // Refused before any Canvas/database call, same ordering deck/route.ts
    // uses for its own early refusal.
    const templateResolution = resolveDeckTemplateSelection(body.templateId);
    if (!templateResolution.ok) {
      return NextResponse.json({ error: templateResolution.reason });
    }

    // Source-aware resolution, copied verbatim from deck/route.ts (see that
    // file's own comment for the full rationale): `courseId` present means
    // an export selection, resolved by its course_hub row id
    // (resolveLmsCourseRowByIdAction) because ContentTab.tsx blanks
    // `courseUrl` to "" for one of those. Absent means a live selection,
    // resolved by Canvas URL exactly as before. `acronym`, when the client
    // sends one, is normalized first (a literal "   " string is truthy JSON,
    // so normalizeCanvasAcronymInput collapses that to `undefined` at this
    // boundary before it can be threaded through as a scope key) then
    // threaded into the URL-matching branch so a host-less `courseUrl`
    // still resolves to the right row instead of colliding with another
    // institution's course sharing the same numeric id.
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

    // The one real difference from deck/route.ts: there is no selection to
    // gather materials from, so the refusal is a direct blank check on the
    // body field itself rather than gatherSelectionMaterials's own
    // post-fetch emptiness check. Same user-facing shape either way: a
    // named reason, refused before the template is even looked up.
    const materialsText = typeof body.materialsText === "string" ? body.materialsText : "";
    if (!materialsText.trim()) {
      return NextResponse.json({ error: "The capture had no usable material to ground generation on." });
    }

    const tplRes = await getDeckTemplateAction(templateResolution.templateId);
    if ("error" in tplRes) return NextResponse.json({ error: tplRes.error });

    const provider: LlmProvider = body.provider ?? "gemini";
    const moduleLabel = (body.moduleLabel ?? "").trim() || DEFAULT_MODULE_LABEL;
    const config = GENERATION_KIND_CONFIGS.decks;

    const ctx = buildDeckGenContext(tplRes.template, moduleLabel, materialsText);
    const deck = await generateDeckFromTemplateAction(tplRes.template, ctx, provider);
    if ("error" in deck) return NextResponse.json({ error: deck.error });
    if (config.isEmpty(deck)) return NextResponse.json({ error: config.emptyMessage });

    // AM-A (VERIFIED): artifactDownloadFormats
    // (lib/lms-generation/artifact-download.ts) offers the .pptx download
    // ONLY when parseDeckSlidesFromStructured(artifact.structured) parses at
    // least one slide - gated on the PARSED RESULT, never on a kind string.
    // `structured: config.renderStructured!(deck)` below is therefore not
    // optional decoration: saving without it (a Files-tab blob, or
    // `structured: null`) makes the PowerPoint button silently vanish with
    // every other gate green. This call is also, deliberately, the LAST
    // statement of the success path - see this file's own header comment for
    // why that ordering is what makes a platform timeout fail clean.
    const supabase = createServiceClient();
    const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
      courseId: course.id,
      kind: config.artifactKind,
      title: deck.presentationTitle,
      text: config.render(deck),
      structured: config.renderStructured!(deck) as Json,
      prompt: config.buildPrompt(materialsText, {
        courseName: course.name,
        moduleLabel,
        templateName: tplRes.template.name,
      }),
    });

    return NextResponse.json({ artifact });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not generate the deck." }, { status: 500 });
  }
}
