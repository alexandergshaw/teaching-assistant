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
  getInstitutionPage,
  createInstitutionPage,
  updateInstitutionPage,
  moveInstitutionPage,
  deleteInstitutionPage,
  normalizeInstitution,
  type InstitutionPage,
} from "@/lib/knowledge-base";

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
 * invoking this.
 */
export async function deleteInstitutionPageAction(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const existing = await getInstitutionPage(supabase, user.id, id);
    if (!existing) return { error: "Page not found." };

    await deleteInstitutionPage(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the page." };
  }
}
