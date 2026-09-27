"use server";

// A43-T (docs/a43-scope.md section 11.3): the PORT of
// generateCourseSyllabusAction (src/app/actions/syllabus-templates.ts)
// generalised over OfficeKind for an owner-uploaded .pptx template.
// Upload/list/delete follow the syllabus_templates CRUD shape; the fill call
// is new - it maps an ALREADY-GENERATED deck (the same
// {presentationTitle, slides} shape generateDeckFromTemplateAction returns,
// docs/a43-scope.md section 2.1) onto the uploaded template's own paragraphs
// by slide position, through src/lib/decks/office-template-fill.ts. No
// second model call: the content was already generated as shape (a) JSON
// (src/lib/decks/generate.ts), so this action is only the deterministic
// writer half - the same split Q2 already draws for every deck path.
//
// requireUser, not the deprecated requireOwner alias (docs/backlog.yml:648,
// row R2): requireOwner is literally `return requireUser()`
// (src/lib/supabase/auth.ts:451-453) now, and an uploaded deck template is a
// per-user resource, not an owner-only one.
//
// CRUD lives directly in this file rather than in a separate
// src/lib/supabase/deck-template-files.ts module (the shape
// src/lib/supabase/syllabus-templates.ts uses): wave T1's write set
// (docs/a43-scope.md section 11.3) names only this action file for the
// server-side surface, not a second lib module.

import { createHash } from "crypto";
import { requireUser } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { checkWireBudget } from "@/lib/upload-budget";
import { parseOfficeParagraphs } from "@/lib/office-edit";
import {
  fillOfficeTemplate,
  groupOfficeTemplateParagraphsBySlide,
  planSlideTemplateFill,
} from "@/lib/decks/office-template-fill";
import { describeFitReport } from "@/lib/decks/fit-report";

type DeckTemplateFilesTable = Database["public"]["Tables"]["deck_template_files"];

/** A saved deck template file without its (potentially large) base64 body. */
export interface DeckTemplateFileMeta {
  id: string;
  name: string;
  fileName: string;
  updatedAt: string;
}

// A typed select over a Supabase table collapses to `never` in this repo
// (this-repo convention: map rows through an explicit mapper, never rely on
// the generated Row type flowing through .select() unassisted); each
// function below reads through a local, hand-written row shape instead.
function table() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createServiceClient() as any).from("deck_template_files");
}

/** List the owner's uploaded deck template files (metadata only), newest first. */
export async function listDeckTemplateFilesAction(): Promise<
  { templates: DeckTemplateFileMeta[] } | { error: string }
> {
  try {
    const user = await requireUser();
    const { data, error } = await table()
      .select("id, name, file_name, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) return { error: error.message };
    const rows = (data ?? []) as Array<{ id: string; name: string; file_name: string; updated_at: string }>;
    return {
      templates: rows.map((r) => ({ id: r.id, name: r.name, fileName: r.file_name, updatedAt: r.updated_at })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list your uploaded templates." };
  }
}

/** Upload a new deck template from a .pptx file (base64). */
export async function uploadDeckTemplateFileAction(
  name: string,
  fileName: string,
  base64: string
): Promise<{ template: DeckTemplateFileMeta } | { error: string }> {
  try {
    const user = await requireUser();
    if (!name.trim()) return { error: "Enter a template name." };
    if (!/\.pptx$/i.test(fileName.trim())) return { error: "The template must be a PowerPoint .pptx file." };
    if (!base64) return { error: "Upload a .pptx file." };
    const sizeCheck = checkWireBudget(base64.length, "That template");
    if (!sizeCheck.ok) return { error: sizeCheck.error ?? "That template is too large to upload in one request." };

    const buffer = Buffer.from(base64, "base64");
    const paragraphs = await parseOfficeParagraphs("pptx", buffer);
    if (paragraphs.length === 0) {
      return {
        error: "Could not read any slide text from that file. Upload a PowerPoint .pptx with at least one slide of text.",
      };
    }

    const templateSha256 = createHash("sha256").update(buffer).digest("hex");
    const row: DeckTemplateFilesTable["Insert"] = {
      user_id: user.id,
      name: name.trim(),
      file_name: fileName.trim(),
      content: base64,
      template_sha256: templateSha256,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await table().insert(row).select("id, name, file_name, updated_at").single();
    if (error) return { error: `Could not save the template: ${error.message}` };
    const r = data as { id: string; name: string; file_name: string; updated_at: string };
    return { template: { id: r.id, name: r.name, fileName: r.file_name, updatedAt: r.updated_at } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the template." };
  }
}

/** Delete an uploaded deck template file. */
export async function deleteDeckTemplateFileAction(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireUser();
    if (!id.trim()) return { error: "Choose a template." };
    const { error } = await table().delete().eq("user_id", user.id).eq("id", id);
    if (error) return { error: `Could not delete the template: ${error.message}` };
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the template." };
  }
}

/**
 * Fill an uploaded .pptx template from an already-generated deck, mapping
 * each generated slide onto the template's corresponding slide by position:
 * a slide's first paragraph becomes the title, its remaining paragraphs
 * become bullets in order. The mapping and the slide-count refusal both live
 * in planSlideTemplateFill (src/lib/decks/office-template-fill.ts, wave T2,
 * docs/a43-scope.md section 11.4) - this action is only the I/O wrapper.
 *
 * Wave T2 (this call): when the deck needs more slides than the template
 * has, planSlideTemplateFill REFUSES rather than silently mapping only the
 * first N generated slides and discarding the rest - that silent discard
 * was this action's wave-T1 behaviour and is the exact defect this wave
 * closes. Wave T3's clone path is what removes the limit itself.
 */
export async function fillDeckTemplateFileAction(
  templateFileId: string,
  deck: { presentationTitle: string; slides: Array<{ title: string; bullets: string[] }> }
): Promise<{ base64: string; name: string } | { error: string }> {
  try {
    const user = await requireUser();
    if (!templateFileId.trim()) return { error: "Choose an uploaded template." };

    const { data, error } = await table()
      .select("id, name, file_name, content, updated_at")
      .eq("user_id", user.id)
      .eq("id", templateFileId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: "That template no longer exists." };
    const row = data as { id: string; name: string; file_name: string; content: string; updated_at: string };

    const buffer = Buffer.from(row.content, "base64");
    const groups = await groupOfficeTemplateParagraphsBySlide("pptx", buffer);
    if (groups.length === 0) {
      return { error: "Could not read any slides from that template." };
    }

    const plan = planSlideTemplateFill(groups, deck.slides);
    if (!plan.ok) {
      return { error: describeFitReport(plan.fitReport).join(" ") };
    }

    const out = await fillOfficeTemplate("pptx", buffer, plan.replacements);
    return { base64: out.toString("base64"), name: deck.presentationTitle.trim() || row.name };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not fill the template." };
  }
}
