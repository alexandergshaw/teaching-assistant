"use server";

// Server actions for the per-institution knowledge base. Thin owner-scoped
// wrappers over src/lib/knowledge-base.ts - all persistence and the
// self-ancestor move guard live there so they stay unit-testable without a
// live Supabase session; this file only adds the auth gate, institution
// normalization, and existence checks that produce a clean {error} instead
// of a raw Supabase failure.

import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  listInstitutionPages,
  listInstitutionPageSummaries,
  getInstitutionPage,
  getInstitutionPagesByIds,
  createInstitutionPage,
  updateInstitutionPage,
  moveInstitutionPage,
  normalizeInstitution,
  type InstitutionPage,
  type InstitutionPageSummary,
} from "@/lib/knowledge-base";
import { deleteInstitutionPageAndAttachments } from "@/lib/institution-page-attachments";

/** List every page recorded for one institution, owner-scoped. */
export async function listInstitutionPagesAction(
  institution: string
): Promise<{ pages: InstitutionPage[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const pages = await listInstitutionPages(supabase, user.id, normalizeInstitution(institution));
    return { pages };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list pages." };
  }
}

/**
 * List every page recorded for one institution, WITHOUT bodies - owner-
 * scoped. Powers the Recording tab's knowledge picker (a title tree only),
 * so it never pulls a page body the picker will not render. See
 * listInstitutionPageSummaries in src/lib/knowledge-base.ts for the exact
 * field list and why it exists alongside listInstitutionPagesAction rather
 * than replacing it - that action keeps serving the Knowledge tab's own
 * full-row read unchanged.
 */
export async function listInstitutionPageSummariesAction(
  institution: string
): Promise<{ pages: InstitutionPageSummary[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const pages = await listInstitutionPageSummaries(supabase, user.id, normalizeInstitution(institution));
    return { pages };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list pages." };
  }
}

/**
 * Fetch the full bodies for a set of page ids, owner-scoped - the on-demand
 * counterpart to listInstitutionPageSummariesAction: the picker adds a page
 * (or several, via multi-select) by id, and only then needs its body pulled
 * into the run's context. A missing or foreign id is silently absent from
 * the result rather than an error - see getInstitutionPagesByIds's docstring
 * in src/lib/knowledge-base.ts.
 */
export async function getInstitutionPagesByIdsAction(
  ids: string[]
): Promise<{ pages: InstitutionPage[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const pages = await getInstitutionPagesByIds(supabase, user.id, ids);
    return { pages };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not fetch pages." };
  }
}

export interface CreateInstitutionPageActionInput {
  institution: string;
  parentId?: string | null;
  title?: string;
  body?: string;
  tags?: string[];
}

/** Create a new page (root, or nested under parentId). */
export async function createInstitutionPageAction(
  input: CreateInstitutionPageActionInput
): Promise<{ page: InstitutionPage } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    // A parentId must resolve to a page this owner actually has, else a
    // typo'd or foreign id would silently create an unreachable page.
    if (input.parentId) {
      const parent = await getInstitutionPage(supabase, user.id, input.parentId);
      if (!parent) return { error: "The parent page was not found." };
    }

    const page = await createInstitutionPage(supabase, user.id, {
      ...input,
      institution: normalizeInstitution(input.institution),
    });
    return { page };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the page." };
  }
}

export interface UpdateInstitutionPageActionInput {
  title?: string;
  body?: string;
  tags?: string[];
}

/** Update a page's title/body/tags. Never touches another owner's row. */
export async function updateInstitutionPageAction(
  id: string,
  updates: UpdateInstitutionPageActionInput
): Promise<{ page: InstitutionPage } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const existing = await getInstitutionPage(supabase, user.id, id);
    if (!existing) return { error: "Page not found." };

    const page = await updateInstitutionPage(supabase, user.id, id, updates);
    return { page };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the page." };
  }
}

export interface MoveInstitutionPageActionInput {
  parentId?: string | null;
  position?: number;
}

/**
 * Move a page to a new parent and/or position. moveInstitutionPage itself
 * rejects a move that would make the page its own ancestor - see
 * src/lib/knowledge-base.ts's wouldCreateCycle.
 */
export async function moveInstitutionPageAction(
  id: string,
  target: MoveInstitutionPageActionInput
): Promise<{ page: InstitutionPage } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const existing = await getInstitutionPage(supabase, user.id, id);
    if (!existing) return { error: "Page not found." };

    const page = await moveInstitutionPage(supabase, user.id, id, target);
    return { page };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not move the page." };
  }
}

/**
 * Delete a page. This cascades to the page's whole subtree at the database
 * level (see the institution_pages migration) - callers must warn before
 * invoking this. Before the delete runs, deleteInstitutionPageAndAttachments
 * removes the Storage objects for every attachment on this page AND its
 * whole subtree (the cascade takes the subtree too), since the database
 * cascade only ever removes ROWS, never a Storage object - see that
 * function's docstring in src/lib/institution-page-attachments.ts. A failed
 * object removal does not block the delete (the page is still gone either
 * way) but is not silent either: it comes back as `storageCleanupError`
 * rather than being swallowed.
 */
export async function deleteInstitutionPageAction(
  id: string
): Promise<{ ok: true; storageCleanupError?: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const existing = await getInstitutionPage(supabase, user.id, id);
    if (!existing) return { error: "Page not found." };

    const { storageCleanupError } = await deleteInstitutionPageAndAttachments(supabase, user.id, existing);
    return storageCleanupError ? { ok: true, storageCleanupError } : { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the page." };
  }
}
